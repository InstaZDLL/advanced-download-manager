import { execa } from 'execa';
import pino from 'pino';
import * as path from 'path';
import * as fs from 'fs/promises';
import { WebSocketClient } from './websocket-client.js';

export interface TranscodeOptions {
  inputPath: string;
  outputDir: string;
  options: {
    to?: string;
    codec?: string;
    crf?: number;
  };
}

export class FfmpegTranscoder {
  private ffmpegPath: string;

  constructor(
    private logger: pino.Logger,
    private wsClient: WebSocketClient,
  ) {
    this.ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
  }

  async transcode(options: TranscodeOptions): Promise<{ filename: string; filepath: string; size?: number }> {
    const { inputPath, outputDir, options: transcodeOptions } = options;

    const inputFilename = path.basename(inputPath, path.extname(inputPath));
    const outputExt = transcodeOptions.to || 'mp4';
    const outputFilename = `${inputFilename}_transcoded.${outputExt}`;
    const outputPath = path.join(outputDir, outputFilename);

    // Build ffmpeg command
    const args = [
      '-i', inputPath,
      '-progress', 'pipe:2',
      '-nostats',
      '-loglevel', 'error',
    ];

    // Video codec
    const codec = transcodeOptions.codec || 'h264';
    if (codec === 'h264') {
      args.push('-c:v', 'libx264');
      args.push('-crf', (transcodeOptions.crf || 23).toString());
      args.push('-preset', 'medium');
    } else if (codec === 'h265') {
      args.push('-c:v', 'libx265');
      args.push('-crf', (transcodeOptions.crf || 28).toString());
      args.push('-preset', 'medium');
    }

    // Audio codec
    args.push('-c:a', 'aac');
    args.push('-b:a', '128k');

    // Output
    args.push('-y', outputPath);

    this.logger.info(`Starting ffmpeg transcode: ${this.ffmpegPath} ${args.join(' ')}`);

    try {
      // Get input duration first
      const duration = await this.getVideoDuration(inputPath);

      const subprocess = execa(this.ffmpegPath, args, {
        timeout: parseInt(process.env.JOB_TIMEOUT || '7200000'), // 2 hours
      });

      // Parse progress from stderr
      let jobId: string | undefined;
      subprocess.stderr?.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          this.parseProgress(line.trim(), duration, jobId);
        }
      });

      await subprocess;

      // Verify output file exists and get stats
      const stats = await fs.stat(outputPath);

      this.logger.info(`ffmpeg transcode completed: ${outputFilename} (${stats.size} bytes)`);

      return {
        filename: outputFilename,
        filepath: outputPath,
        size: stats.size,
      };

    } catch (error) {
      this.logger.error('ffmpeg transcode failed:', error);

      // Clean up partial output file
      try {
        await fs.unlink(outputPath);
      } catch {
        // Ignore cleanup errors
      }

      throw error;
    }
  }

  private async getVideoDuration(inputPath: string): Promise<number> {
    try {
      const result = await execa(this.ffmpegPath, [
        '-i', inputPath,
        '-f', 'null', '-',
      ], {
        reject: false,
        timeout: 30000,
      });

      // Parse duration from stderr
      const durationMatch = result.stderr.match(/Duration: (\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
      if (durationMatch) {
        const [, hours, minutes, seconds, centiseconds] = durationMatch;
        return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds) + parseInt(centiseconds) / 100;
      }

      return 0;
    } catch {
      return 0;
    }
  }

  private parseProgress(line: string, totalDuration: number, jobId?: string) {
    if (!jobId || !line.startsWith('out_time_ms=')) return;

    // Parse ffmpeg progress
    // Example: "out_time_ms=12345678"
    const timeMatch = line.match(/out_time_ms=(\d+)/);
    if (timeMatch && totalDuration > 0) {
      const currentTimeMs = parseInt(timeMatch[1]);
      const currentTimeSeconds = currentTimeMs / 1000000; // microseconds to seconds
      const progress = Math.min((currentTimeSeconds / totalDuration) * 100, 100);

      this.wsClient.emitProgress({
        jobId,
        stage: 'transcode',
        progress,
      });
    }
  }
}