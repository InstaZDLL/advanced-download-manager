import { execa } from 'execa';
import type { ExecaChildProcess, ExecaError } from 'execa';
import type pino from 'pino';
import * as path from 'path';
import * as fs from 'fs/promises';
import sanitizeFilename from 'sanitize-filename';
import type { WebSocketClient } from './websocket-client.js';

export interface YtDlpOptions {
  url: string;
  outputDir: string;
  headers?: {
    ua?: string;
    referer?: string;
    extra?: Record<string, string>;
  };
  filenameHint?: string;
  format?: string;
}

type YtDlpErrorCode = 'VIDEO_UNAVAILABLE' | 'NETWORK_ERROR' | 'FORMAT_ERROR';

interface YtDlpError extends Error {
  code: YtDlpErrorCode;
  stderr?: string;
}

function isExecaError(error: unknown): error is ExecaError<string> {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'stderr' in error &&
    'failed' in error
  );
}

function parseYtDlpErrorCode(stderr: string): YtDlpErrorCode | undefined {
  if (stderr.includes('Video unavailable')) {
    return 'VIDEO_UNAVAILABLE';
  }
  if (stderr.includes('network')) {
    return 'NETWORK_ERROR';
  }
  if (stderr.includes('format')) {
    return 'FORMAT_ERROR';
  }
  return undefined;
}

function createYtDlpError(error: ExecaError<string>, code: YtDlpErrorCode): YtDlpError {
  const customError = new Error(error.message) as YtDlpError;
  customError.name = error.name;
  customError.stack = error.stack;
  customError.stderr = error.stderr ?? undefined;
  customError.code = code;
  return customError;
}

export class YtDlpDownloader {
  private ytdlpPath: string;

  constructor(
    private logger: pino.Logger,
    private wsClient: WebSocketClient,
  ) {
    this.ytdlpPath = process.env.YTDLP_PATH || 'yt-dlp';
  }

  async download(options: YtDlpOptions): Promise<{ filename: string; filepath: string; size?: number }> {
    const { url, outputDir, headers, filenameHint, format } = options;

    // Build yt-dlp command
    const args = [
      '--newline',
      '--no-part',
      '--concurrent-fragments', '5',
      '--progress',
      '--no-playlist',
    ];

    // Set output template
    let outputTemplate = '%(title)s.%(ext)s';
    if (filenameHint) {
      const sanitized = sanitizeFilename(filenameHint);
      outputTemplate = `${sanitized}.%(ext)s`;
    }
    args.push('-o', path.join(outputDir, outputTemplate));

    // Set format if specified
    if (format) {
      args.push('-f', format);
    } else {
      args.push('-f', 'best[height<=1080]/best');
    }

    // Add headers
    if (headers?.ua) {
      args.push('--user-agent', headers.ua);
    }
    if (headers?.referer) {
      args.push('--referer', headers.referer);
    }
    if (headers?.extra) {
      for (const [key, value] of Object.entries(headers.extra)) {
        if (!value) continue;
        args.push('--add-header', `${key}:${value}`);
      }
    }

    args.push(url);

    this.logger.info(`Starting yt-dlp download: ${this.ytdlpPath} ${args.join(' ')}`);

    try {
      const subprocess: ExecaChildProcess<string> = execa(this.ytdlpPath, args, {
        cwd: outputDir,
        timeout: parseInt(process.env.JOB_TIMEOUT || '7200000'), // 2 hours
      });

      // Parse progress from stderr
      const jobId = `yt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      subprocess.stderr?.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          this.parseProgress(line.trim(), jobId);
        }
      });

      await subprocess;

      // Find the downloaded file
      const files = await fs.readdir(outputDir);
      const downloadedFile = files.find(f => !f.startsWith('.'));

      if (!downloadedFile) {
        throw new Error('Downloaded file not found');
      }

      const filepath = path.join(outputDir, downloadedFile);
      const stats = await fs.stat(filepath);

      this.logger.info(`yt-dlp download completed: ${downloadedFile} (${stats.size} bytes)`);

      return {
        filename: downloadedFile,
        filepath,
        size: stats.size,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`yt-dlp download failed: ${errorMessage}`);

      if (isExecaError(error)) {
        const stderr = error.stderr ?? '';
        const code = parseYtDlpErrorCode(stderr);
        if (code) {
          throw createYtDlpError(error, code);
        }
      }

      throw error;
    }
  }

  private parseProgress(line: string, jobId?: string) {
    if (!jobId) return;

    // Parse yt-dlp progress line
    // Example: "[download]  15.2% of 234.56MiB at 1.23MiB/s ETA 02:34"
    const progressMatch = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%.*?at\s+([^\s]+)\s+ETA\s+(\d+:\d+)/);
    if (progressMatch) {
      const progress = parseFloat(progressMatch[1]);
      const speed = progressMatch[2];
      const etaStr = progressMatch[3];

      // Convert ETA to seconds
      const [minutes, seconds] = etaStr.split(':').map(Number);
      const eta = minutes * 60 + seconds;

      this.wsClient.emitProgress({
        jobId,
        stage: 'download',
        progress,
        speed,
        eta,
      });
    }

    // Parse size info
    const sizeMatch = line.match(/of\s+([0-9.]+)([KMGT]?)iB/);
    if (sizeMatch && jobId) {
      const size = parseFloat(sizeMatch[1]);
      const unit = sizeMatch[2] || '';

      let bytes = size;
      switch (unit) {
        case 'K': bytes *= 1024; break;
        case 'M': bytes *= 1024 * 1024; break;
        case 'G': bytes *= 1024 * 1024 * 1024; break;
        case 'T': bytes *= 1024 * 1024 * 1024 * 1024; break;
      }

      this.wsClient.emitProgress({
        jobId,
        stage: 'download',
        progress: 0,
        totalBytes: Math.floor(bytes),
      });
    }
  }
}