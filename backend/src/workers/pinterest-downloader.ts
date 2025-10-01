import { execa } from 'execa';
import type { ExecaError } from 'execa';
import type pino from 'pino';
import * as path from 'path';
import * as fs from 'fs/promises';
import archiver from 'archiver';
import { createWriteStream } from 'fs';
import type { WebSocketClient } from './websocket-client.js';

export interface PinterestOptions {
  url: string;
  outputDir: string;
  jobId: string;
  maxImages?: number;
  includeVideos?: boolean;
  resolution?: string; // Format: "WIDTHxHEIGHT" (e.g., "1920x1080")
  cookiesPath?: string;
}

/**
 * Parse Pinterest downloader progress output
 * pinterest-dl shows progress via download counter
 */
export function parsePinterestProgressLine(line: string): { downloaded?: number; total?: number } | null {
  // Look for patterns like "Downloaded 5/20" or "Downloading image 5 of 20"
  const progressMatch = line.match(/(?:Downloaded|Downloading)\s+(?:image\s+)?(\d+)\s*(?:\/|of)\s*(\d+)/i);
  if (progressMatch) {
    return {
      downloaded: parseInt(progressMatch[1]),
      total: parseInt(progressMatch[2])
    };
  }

  // Look for completion messages
  const completeMatch = line.match(/(?:Downloaded|Completed)\s+(\d+)\s+(?:image|file)/i);
  if (completeMatch) {
    return {
      downloaded: parseInt(completeMatch[1]),
      total: parseInt(completeMatch[1])
    };
  }

  return null;
}

type PinterestErrorCode = 'INVALID_URL' | 'NETWORK_ERROR' | 'AUTH_REQUIRED' | 'NO_IMAGES_FOUND';

interface PinterestError extends Error {
  code: PinterestErrorCode;
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

export function parsePinterestErrorCode(stderr: string): PinterestErrorCode | undefined {
  if (stderr.includes('Invalid URL') || stderr.includes('not found')) {
    return 'INVALID_URL';
  }
  if (stderr.includes('login') || stderr.includes('authentication') || stderr.includes('private')) {
    return 'AUTH_REQUIRED';
  }
  if (stderr.includes('No images found') || stderr.includes('no results')) {
    return 'NO_IMAGES_FOUND';
  }
  if (stderr.includes('network') || stderr.includes('timeout') || stderr.includes('connection')) {
    return 'NETWORK_ERROR';
  }
  return undefined;
}

function createPinterestError(error: ExecaError<string>, code: PinterestErrorCode): PinterestError {
  const customError = new Error(error.message) as PinterestError;
  customError.name = error.name;
  customError.stack = error.stack;
  customError.stderr = error.stderr ?? undefined;
  customError.code = code;
  return customError;
}

/**
 * Extract Pinterest ID from URL for naming
 */
export function extractPinterestId(url: string): string | null {
  // Match pin ID: pinterest.com/pin/123456789/
  const pinMatch = url.match(/\/pin\/(\d+)/);
  if (pinMatch) return pinMatch[1];

  // Match board: pinterest.com/username/board-name/
  const boardMatch = url.match(/pinterest\.com\/([^/]+)\/([^/]+)/);
  if (boardMatch) return `${boardMatch[1]}-${boardMatch[2]}`;

  return null;
}

export class PinterestDownloader {
  private pinterestDlPath: string;

  constructor(
    private logger: pino.Logger,
    private wsClient: WebSocketClient,
  ) {
    // pinterest-dl is a Python package, typically available globally after pip install
    this.pinterestDlPath = process.env.PINTEREST_DL_PATH || 'pinterest-dl';
  }

  /**
   * Resolve shortened Pinterest URLs (pin.it) to full URLs
   */
  private async resolveUrl(url: string): Promise<string> {
    // Check if it's a shortened URL
    if (url.includes('pin.it')) {
      this.logger.info(`Resolving shortened URL: ${url}`);
      try {
        const result = await execa('curl', ['-Ls', '-o', '/dev/null', '-w', '%{url_effective}', url]);
        const resolvedUrl = result.stdout.trim();
        this.logger.info(`Resolved to: ${resolvedUrl}`);
        return resolvedUrl;
      } catch (error) {
        this.logger.warn(`Failed to resolve URL, using original: ${error}`);
        return url;
      }
    }
    return url;
  }

  async download(options: PinterestOptions): Promise<{ filename: string; filepath: string; size?: number }> {
    const {
      outputDir,
      jobId,
      maxImages = 100,
      includeVideos = false,
      resolution,
      cookiesPath,
    } = options;

    // Resolve shortened URLs
    const url = await this.resolveUrl(options.url);

    // Build pinterest-dl command
    const args: string[] = ['scrape', url];

    // Output directory
    args.push('-o', outputDir);

    // Maximum number of images
    args.push('-n', String(maxImages));

    // Include videos
    if (includeVideos) {
      args.push('--video');
    }

    // Minimum resolution
    if (resolution) {
      args.push('-r', resolution);
    }

    // Cookies for authentication
    if (cookiesPath) {
      args.push('--cookies', cookiesPath);
    }

    // Verbose output for progress tracking
    args.push('--verbose');

    this.logger.info(`Starting Pinterest download: ${this.pinterestDlPath} ${args.join(' ')}`);

    let lastProgress = 0;
    let totalImages = maxImages;

    const subprocess = execa(this.pinterestDlPath, args, {
      env: {
        ...process.env,
      },
    });

    // Parse stdout for progress
    subprocess.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        this.logger.debug(`[pinterest-dl stdout] ${line}`);

        const parsed = parsePinterestProgressLine(line);
        if (parsed) {
          if (parsed.total) {
            totalImages = parsed.total;
          }

          if (parsed.downloaded !== undefined) {
            const progress = Math.min(95, Math.floor((parsed.downloaded / totalImages) * 100));

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
        this.logger.warn(`[pinterest-dl stderr] ${line}`);
      }
    });

    try {
      await subprocess;

      // List downloaded files
      const files = await fs.readdir(outputDir);
      if (files.length === 0) {
        throw new Error('No images downloaded from Pinterest');
      }

      this.logger.info(`Downloaded ${files.length} file(s) from Pinterest`);

      // For single file, return it directly
      if (files.length === 1) {
        const filename = files[0];
        const filepath = path.join(outputDir, filename);
        const stats = await fs.stat(filepath);
        return { filename, filepath, size: stats.size };
      }

      // For multiple files, create a zip archive
      this.logger.info(`Zipping ${files.length} files into archive...`);
      const pinterestId = extractPinterestId(url) || 'pinterest';
      const zipFilename = `pinterest-${pinterestId}.zip`;
      const zipPath = path.join(outputDir, zipFilename);

      await this.zipFiles(outputDir, files, zipPath);

      // Get zip file stats
      const stats = await fs.stat(zipPath);

      this.logger.info(`Created zip archive: ${zipFilename} (${stats.size} bytes)`);

      return { filename: zipFilename, filepath: zipPath, size: stats.size };

    } catch (error) {
      if (isExecaError(error)) {
        const stderr = error.stderr || '';
        const errorCode = parsePinterestErrorCode(stderr) || 'NETWORK_ERROR';
        throw createPinterestError(error, errorCode);
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
