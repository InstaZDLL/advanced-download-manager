import pino from 'pino';
import * as path from 'path';
import * as fs from 'fs/promises';
import sanitizeFilename from 'sanitize-filename';
import { WebSocketClient } from './websocket-client.js';

export interface Aria2Options {
  url: string;
  outputDir: string;
  headers?: {
    ua?: string;
    referer?: string;
    extra?: Record<string, string>;
  };
  filenameHint?: string;
}

export class Aria2Downloader {
  private aria2Url: string;
  private aria2Secret: string | undefined;

  constructor(
    private logger: pino.Logger,
    private wsClient: WebSocketClient,
  ) {
    this.aria2Url = process.env.ARIA2_RPC_URL || 'http://localhost:6800/jsonrpc';
    this.aria2Secret = process.env.ARIA2_SECRET;
  }

  async download(options: Aria2Options): Promise<{ filename: string; filepath: string; size?: number }> {
    const { url, outputDir, headers, filenameHint } = options;

    // Prepare aria2 options
    const aria2Options: Record<string, string> = {
      'dir': outputDir,
      'max-connection-per-server': '5',
      'split': '5',
      'continue': 'true',
      'max-tries': '3',
      'retry-wait': '5',
    };

    // Set custom filename if provided
    if (filenameHint) {
      const sanitized = sanitizeFilename(filenameHint);
      // Try to extract extension from URL
      const urlPath = new URL(url).pathname;
      const ext = path.extname(urlPath) || '.bin';
      aria2Options['out'] = `${sanitized}${ext}`;
    }

    // Add headers
    if (headers?.ua) {
      aria2Options['user-agent'] = headers.ua;
    }
    if (headers?.referer) {
      aria2Options['referer'] = headers.referer;
    }
    if (headers?.extra) {
      for (const [key, value] of Object.entries(headers.extra)) {
        aria2Options['header'] = `${key}: ${value}`;
      }
    }

    try {
      // Start download
      const gid = await this.addDownload(url, aria2Options);
      this.logger.info(`Started aria2 download with GID: ${gid}`);

      // Monitor progress
      const result = await this.monitorDownload(gid);

      this.logger.info(`aria2 download completed: ${result.filename} (${result.size} bytes)`);
      return result;

    } catch (error) {
      this.logger.error('aria2 download failed:', error);
      throw error;
    }
  }

  private async addDownload(url: string, options: Record<string, string>): Promise<string> {
    const params = this.aria2Secret ? [`token:${this.aria2Secret}`, [url], options] : [[url], options];

    const response = await this.rpcCall('aria2.addUri', params);
    return response.result;
  }

  private async monitorDownload(gid: string): Promise<{ filename: string; filepath: string; size: number }> {
    const pollInterval = 2000; // 2 seconds
    const timeout = parseInt(process.env.JOB_TIMEOUT || '7200000'); // 2 hours
    const startTime = Date.now();

    while (true) {
      if (Date.now() - startTime > timeout) {
        throw new Error('Download timeout');
      }

      const status = await this.getDownloadStatus(gid);

      // Update progress
      const totalLength = parseInt(status.totalLength || '0');
      const completedLength = parseInt(status.completedLength || '0');
      const downloadSpeed = parseInt(status.downloadSpeed || '0');

      if (totalLength > 0) {
        const progress = (completedLength / totalLength) * 100;
        const eta = downloadSpeed > 0 ? Math.floor((totalLength - completedLength) / downloadSpeed) : undefined;

        this.wsClient.emitProgress({
          jobId: gid, // Using GID as jobId for now
          stage: 'download',
          progress,
          speed: downloadSpeed > 0 ? `${(downloadSpeed / 1024 / 1024).toFixed(2)}MB/s` : undefined,
          eta,
          totalBytes: totalLength,
        });
      }

      // Check status
      if (status.status === 'complete') {
        const filename = path.basename(status.files[0].path);
        const filepath = status.files[0].path;
        const size = parseInt(status.totalLength);

        return { filename, filepath, size };
      } else if (status.status === 'error') {
        throw new Error(`Download failed: ${status.errorMessage || 'Unknown error'}`);
      } else if (status.status === 'removed') {
        throw new Error('Download was cancelled');
      }

      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  private async getDownloadStatus(gid: string) {
    const params = this.aria2Secret ? [`token:${this.aria2Secret}`, gid] : [gid];
    const response = await this.rpcCall('aria2.tellStatus', params);
    return response.result;
  }

  private async rpcCall(method: string, params: any[]): Promise<any> {
    const payload = {
      jsonrpc: '2.0',
      method,
      params,
      id: Date.now().toString(),
    };

    const response = await fetch(this.aria2Url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`aria2 RPC error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    if (result.error) {
      throw new Error(`aria2 RPC error: ${result.error.message}`);
    }

    return result;
  }

  async getGlobalStat() {
    const params = this.aria2Secret ? [`token:${this.aria2Secret}`] : [];
    const response = await this.rpcCall('aria2.getGlobalStat', params);
    return response.result;
  }
}