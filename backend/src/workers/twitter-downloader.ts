import { execa } from 'execa';
import type { ExecaError } from 'execa';
import type pino from 'pino';
import * as path from 'path';
import * as fs from 'fs/promises';
import archiver from 'archiver';
import { createWriteStream } from 'fs';
import type { WebSocketClient } from './websocket-client.js';

export interface TwitterOptions {
  url: string;
  outputDir: string;
  jobId: string;
  tweetId?: string;
  username?: string;
  mediaType?: 'images' | 'videos' | 'all';
  includeRetweets?: boolean;
  maxTweets?: number;
  cookiesPath?: string;
  proxy?: string;
}

/**
 * Parse Twitter downloader progress output
 * twmd output is less structured, so we estimate based on file count
 */
export function parseTwitterProgressLine(line: string): { filesDownloaded?: number; currentFile?: string } | null {
  // Look for patterns like "Downloading: filename.jpg"
  const downloadingMatch = line.match(/Downloading[:\s]+(.+)/i);
  if (downloadingMatch) {
    return { currentFile: downloadingMatch[1].trim() };
  }

  // Look for patterns like "Downloaded X files" or "Saved: filename.jpg"
  const savedMatch = line.match(/(?:Saved|Downloaded)[:\s]+(.+)/i);
  if (savedMatch) {
    return { currentFile: savedMatch[1].trim() };
  }

  return null;
}

type TwitterErrorCode = 'TWEET_UNAVAILABLE' | 'USER_NOT_FOUND' | 'NETWORK_ERROR' | 'AUTH_REQUIRED';

interface TwitterError extends Error {
  code: TwitterErrorCode;
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

export function parseTwitterErrorCode(stderr: string): TwitterErrorCode | undefined {
  if (stderr.includes('Tweet not found') || stderr.includes('unavailable')) {
    return 'TWEET_UNAVAILABLE';
  }
  if (stderr.includes('User not found') || stderr.includes('doesn\'t exist')) {
    return 'USER_NOT_FOUND';
  }
  if (stderr.includes('Login') || stderr.includes('authentication') || stderr.includes('NSFW')) {
    return 'AUTH_REQUIRED';
  }
  if (stderr.includes('network') || stderr.includes('timeout')) {
    return 'NETWORK_ERROR';
  }
  return undefined;
}

function createTwitterError(error: ExecaError<string>, code: TwitterErrorCode): TwitterError {
  const customError = new Error(error.message) as TwitterError;
  customError.name = error.name;
  customError.stack = error.stack;
  customError.stderr = error.stderr ?? undefined;
  customError.code = code;
  return customError;
}

/**
 * Extract tweet ID from Twitter/X URL
 */
export function extractTweetId(url: string): string | null {
  const match = url.match(/(?:twitter\.com|x\.com)\/[^/]+\/status\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Extract username from Twitter/X URL
 */
export function extractUsername(url: string): string | null {
  // Match twitter.com/username or x.com/username (but not /status/ URLs)
  const match = url.match(/(?:twitter\.com|x\.com)\/([^/]+)(?:\/)?$/);
  return match ? match[1] : null;
}

export class TwitterDownloader {
  private twmdPath: string;

  constructor(
    private logger: pino.Logger,
    private wsClient: WebSocketClient,
  ) {
    this.twmdPath = process.env.TWMD_PATH || './bin/twitter-media-downloader';
  }

  async download(options: TwitterOptions): Promise<{ filename: string; filepath: string; size?: number }> {
    const {
      url,
      outputDir,
      jobId,
      tweetId,
      username,
      mediaType = 'all',
      includeRetweets = false,
      maxTweets = 50,
      cookiesPath,
      proxy,
    } = options;

    // Extract tweet ID or username from URL if not provided
    const extractedTweetId = tweetId || extractTweetId(url);
    const extractedUsername = username || extractUsername(url);

    if (!extractedTweetId && !extractedUsername) {
      throw new Error('Invalid Twitter URL: could not extract tweet ID or username');
    }

    // Build twmd command
    const args: string[] = ['-B']; // No banner

    // Tweet or user mode
    if (extractedTweetId) {
      args.push('-t', extractedTweetId);
    } else if (extractedUsername) {
      args.push('-u', extractedUsername);
      args.push('-n', String(maxTweets));
      if (includeRetweets) {
        args.push('-r');
      }
    }

    // Media type filter
    switch (mediaType) {
      case 'images':
        args.push('-i');
        break;
      case 'videos':
        args.push('-v');
        break;
      case 'all':
        args.push('-a');
        break;
    }

    // Output directory
    args.push('-o', outputDir);

    // Optional: cookies for NSFW content
    if (cookiesPath) {
      args.push('-C');
    }

    // Optional: proxy
    if (proxy) {
      args.push('-p', proxy);
    }

    // Format filename with tweet ID and date
    args.push('-f', '{DATE} {USERNAME} {ID}');

    this.logger.info(`Starting Twitter download: ${this.twmdPath} ${args.join(' ')}`);

    let filesDownloaded = 0;
    let lastProgress = 0;

    const subprocess = execa(this.twmdPath, args, {
      cwd: outputDir,
      env: {
        ...process.env,
      },
    });

    // Parse stdout for progress
    subprocess.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        this.logger.debug(`[twmd stdout] ${line}`);

        const parsed = parseTwitterProgressLine(line);
        if (parsed) {
          if (parsed.currentFile) {
            filesDownloaded++;
            // Emit progress based on file count (rough estimation)
            // For single tweet: estimate 1-5 files, progress in chunks
            // For user: use maxTweets as reference
            const estimatedTotal = extractedTweetId ? 5 : maxTweets * 2;
            const progress = Math.min(95, Math.floor((filesDownloaded / estimatedTotal) * 100));

            if (progress > lastProgress) {
              this.wsClient.emitProgress({
                jobId,
                stage: 'download',
                progress,
              });
              lastProgress = progress;
            }
          }
        }
      }
    });

    // Parse stderr for errors
    subprocess.stderr?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        this.logger.warn(`[twmd stderr] ${line}`);
      }
    });

    try {
      await subprocess;

      // List downloaded files
      const files = await fs.readdir(outputDir);
      if (files.length === 0) {
        throw new Error('No media files downloaded');
      }

      this.logger.info(`Downloaded ${files.length} file(s) from Twitter`);

      // For single file, return it directly
      if (files.length === 1) {
        const filename = files[0];
        const filepath = path.join(outputDir, filename);
        const stats = await fs.stat(filepath);
        return { filename, filepath, size: stats.size };
      }

      // For multiple files, create a zip archive
      this.logger.info(`Zipping ${files.length} files into archive...`);
      const zipFilename = `twitter-media-${extractedTweetId || extractedUsername || 'archive'}.zip`;
      const zipPath = path.join(outputDir, zipFilename);

      await this.zipFiles(outputDir, files, zipPath);

      // Get zip file stats
      const stats = await fs.stat(zipPath);

      this.logger.info(`Created zip archive: ${zipFilename} (${stats.size} bytes)`);

      return { filename: zipFilename, filepath: zipPath, size: stats.size };

    } catch (error) {
      if (isExecaError(error)) {
        const stderr = error.stderr || '';
        const errorCode = parseTwitterErrorCode(stderr) || 'NETWORK_ERROR';
        throw createTwitterError(error, errorCode);
      }
      throw error;
    }
  }

  /**
   * Zip multiple files into a single archive
   */
  private async zipFiles(baseDir: string, files: string[], outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = createWriteStream(outputPath);
      const archive = archiver('zip', {
        zlib: { level: 9 } // Maximum compression
      });

      output.on('close', () => {
        this.logger.info(`Archive created: ${archive.pointer()} total bytes`);
        resolve();
      });

      archive.on('error', (err) => {
        reject(err);
      });

      archive.on('warning', (err) => {
        if (err.code === 'ENOENT') {
          this.logger.warn(`Archive warning: ${err.message}`);
        } else {
          reject(err);
        }
      });

      archive.pipe(output);

      // Add all files to the archive
      for (const file of files) {
        const filePath = path.join(baseDir, file);
        archive.file(filePath, { name: file });
      }

      archive.finalize();
    });
  }
}
