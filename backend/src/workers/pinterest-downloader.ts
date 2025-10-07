import { execa } from 'execa';
import type { ExecaError } from 'execa';
import type pino from 'pino';
import * as path from 'path';
import * as fs from 'fs/promises';
import archiver from 'archiver';
import { createWriteStream } from 'fs';
import type { RmOptions } from 'fs';
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
export function parsePinterestProgressLine(line: string): { downloaded?: number; total?: number; percent?: number } | null {
  // Normalize whitespace
  const s = line.trim();

  // Common explicit patterns
  const patterns: RegExp[] = [
    /(?:Downloaded|Downloading)\s+(?:image|pin)?\s*(\d+)\s*(?:\/|of)\s*(\d+)/i, // Downloading image 5 of 20 / Downloaded 5/20
    /(?:Saving|Saved|Scraping|Scraped)\s+(?:image|pin)?\s*(\d+)\s*(?:\/|of)\s*(\d+)/i, // Saved 3/10, Scraped pin 4 of 12
    /\b(?:image|pin)\s*(\d+)\s*(?:\/|of)\s*(\d+)/i, // image 7/21
    /\[(\d+)\s*\/\s*(\d+)\]/, // [5/20]
    /\((\d+)\s*\/\s*(\d+)\)/, // (5/20)
    /\bDownloading\s+Media:.*?\b(\d+)\s*\/\s*(\d+)\b/i, // Downloading Media: ... 15/100
    /\b(\d+)\s*\/\s*(\d+)\b/, // bare 15/100 (fallback; keep after specific patterns)
  ];

  for (const re of patterns) {
    const m = s.match(re);
    if (m) {
      return { downloaded: parseInt(m[1], 10), total: parseInt(m[2], 10) };
    }
  }

  // Completion messages like: "Downloaded 20 images", "Completed 8 files"
  const completeMatch = s.match(/(?:Downloaded|Completed)\s+(\d+)\s+(?:image|images|file|files|pin|pins)\b/i);
  if (completeMatch) {
    const n = parseInt(completeMatch[1], 10);
    return { downloaded: n, total: n };
  }

  // TQDM percentage pattern: "xx%|" seen in pinterest-dl output
  const percentMatch = s.match(/\b(\d{1,3})%\|/);
  if (percentMatch) {
    const percent = Math.max(0, Math.min(100, parseInt(percentMatch[1], 10)));
    return { percent };
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

export function parsePinterestErrorCode(stderr: string, contextUrl?: string): PinterestErrorCode | undefined {
  if (stderr.includes('Invalid URL') || stderr.includes('not found')) {
    return 'INVALID_URL';
  }
  if (
    stderr.includes('login') ||
    stderr.includes('authentication') ||
    stderr.includes('private') ||
    stderr.includes('EmptyResponseError') ||
    (contextUrl && /(invite_code=|\b(sent)\b)/i.test(contextUrl))
  ) {
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

  /** Canonicalize Pinterest URLs to stable forms (non-authoritative; may drop invite tokens). */
  private canonicalizePinterestUrl(url: string): string | null {
    try {
      const u = new URL(url);
      if (!/(^|\.)pinterest\./.test(u.hostname)) return null;
      // Canonicalize pin URLs: /pin/<id>/
      const pinMatch = u.pathname.match(/\/pin\/(\d+)/);
      if (pinMatch) {
        const id = pinMatch[1];
        const canonical = `https://www.pinterest.com/pin/${id}/`;
        this.logger.info(`Canonicalized Pinterest pin URL: ${canonical}`);
        return canonical;
      }
      // For board URLs, strip query and trailing segments beyond username/board
      const boardMatch = u.pathname.match(/^\/([^/]+)\/([^/]+)\/?/);
      if (boardMatch && !u.pathname.includes('/pin/')) {
        const canonical = `https://www.pinterest.com/${boardMatch[1]}/${boardMatch[2]}/`;
        this.logger.info(`Normalized Pinterest board URL: ${canonical}`);
        return canonical;
      }
      return null;
    } catch {
      return null;
    }
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
    const resolved = await this.resolveUrl(options.url);
    const canonical = this.canonicalizePinterestUrl(resolved);

    const looksShared = /invite_code=|\b(sent)\b/i.test(resolved);
    const candidates = Array.from(new Set<string>([
      // Prefer share URL first if it contains invite token (worked for user before patch)
      ...(looksShared ? [resolved] : []),
      // Try canonical form
      ...(canonical ? [canonical] : []),
      // Fallback to resolved/original if different from canonical
      ...(!looksShared && resolved && canonical !== resolved ? [resolved] : []),
    ].filter(Boolean) as string[]));

    let lastError: unknown = null;
    for (const url of candidates) {
      // Build pinterest-dl command per attempt
      const args: string[] = ['scrape', url];
      args.push('-o', outputDir);
      args.push('-n', String(maxImages));
      if (includeVideos) args.push('--video');
      if (resolution) args.push('-r', resolution);
      if (cookiesPath) args.push('--cookies', cookiesPath);
      args.push('--verbose');

      this.logger.info(`Starting Pinterest download: ${this.pinterestDlPath} ${args.join(' ')}`);

      let lastProgress = 0;
      let totalImages = maxImages;

      const subprocess = execa(this.pinterestDlPath, args, { env: { ...process.env } });

      subprocess.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          this.logger.debug(`[pinterest-dl stdout] ${line}`);
          const parsed = parsePinterestProgressLine(line);
          if (parsed) {
            if (parsed.total) totalImages = parsed.total;
            let progress: number | null = null;
            if (parsed.downloaded !== undefined && totalImages > 0) {
              progress = Math.floor((parsed.downloaded / totalImages) * 100);
            } else if (parsed.percent !== undefined) {
              progress = parsed.percent;
            }
            if (progress != null) {
              progress = Math.max(0, Math.min(95, progress));
              if (progress > lastProgress) {
                this.wsClient.emitProgress({ jobId, stage: 'download', progress });
                lastProgress = progress;
              }
            }
          }
        }
      });

      subprocess.stderr?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          this.logger.warn(`[pinterest-dl stderr] ${line}`);
        }
      });

      try {
        await subprocess;
        const files = await fs.readdir(outputDir);
        if (files.length === 0) {
          // No files produced, consider retrying next candidate
          const err = new Error('No images downloaded from Pinterest') as PinterestError;
          err.code = looksShared ? 'AUTH_REQUIRED' : 'NO_IMAGES_FOUND';
          throw err;
        }

        this.logger.info(`Downloaded ${files.length} file(s) from Pinterest`);
        if (files.length === 1) {
          const filename = files[0];
          const filepath = path.join(outputDir, filename);
          const stats = await fs.stat(filepath);
          return { filename, filepath, size: stats.size };
        }

        // Create zip for multiple files
        const pinterestId = extractPinterestId(url) || 'pinterest';
        const zipFilename = `pinterest-${pinterestId}.zip`;
        const zipPath = path.join(outputDir, zipFilename);
        await this.zipFiles(outputDir, files, zipPath);
        const stats = await fs.stat(zipPath);
        this.logger.info(`Created zip archive: ${zipFilename} (${stats.size} bytes)`);
        return { filename: zipFilename, filepath: zipPath, size: stats.size };
      } catch (error) {
        lastError = error;
        // If process error, map code for diagnostics and try next candidate if any
        if (isExecaError(error)) {
          const stderr = error.stderr || '';
          const errorCode = parsePinterestErrorCode(stderr, url) || 'NETWORK_ERROR';
          this.logger.warn(`Pinterest attempt failed for URL ${url} with code ${errorCode}`);
        } else if (error && typeof error === 'object' && 'code' in error) {
          const code = (error as PinterestError).code;
          this.logger.warn(`Pinterest attempt failed for URL ${url} with code ${(code as string) || 'UNKNOWN'}`);
        } else {
          this.logger.warn(`Pinterest attempt failed for URL ${url}: ${error instanceof Error ? error.message : String(error)}`);
        }
        // Clean directory between attempts to avoid mixing files
        try {
          const files = await fs.readdir(outputDir);
          await Promise.all(files.map(f => fs.rm(path.join(outputDir, f), { force: true } as RmOptions)));
        } catch {
          // ignore cleanup errors
        }
        // Try next candidate
      }
    }

    // If all attempts failed, throw the last error
    if (lastError) {
      if (isExecaError(lastError)) {
        const stderr = lastError.stderr || '';
        const errorCode = parsePinterestErrorCode(stderr, resolved) || 'NETWORK_ERROR';
        throw createPinterestError(lastError, errorCode);
      }
      throw lastError;
    }

    // Should not reach here
    throw new Error('Pinterest download failed with no error');
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
