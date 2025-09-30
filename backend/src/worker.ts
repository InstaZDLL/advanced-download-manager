import 'reflect-metadata';
import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import pino from 'pino';
import type { DownloadJobData } from './shared/queue.service.js';
import { YtDlpDownloader } from './workers/ytdlp-downloader.js';
import { Aria2Downloader } from './workers/aria2-downloader.js';
import { FfmpegTranscoder } from './workers/ffmpeg-transcoder.js';
import { WebSocketClient } from './workers/websocket-client.js';
import * as fs from 'fs/promises';
import * as path from 'path';

class DownloadWorker {
  private worker!: Worker;
  private redis: Redis;
  private db: PrismaClient;
  private logger: pino.Logger;
  private wsClient: WebSocketClient;
  private ytdlp: YtDlpDownloader;
  private aria2: Aria2Downloader;
  private ffmpeg: FfmpegTranscoder;

  constructor() {
    const pinoLogger = (pino as any).default || pino;
    this.logger = pinoLogger({
      level: process.env.LOG_LEVEL || 'info',
      transport: process.env.NODE_ENV !== 'production' ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname'
        }
      } : undefined,
    });

    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
    });

    this.db = new PrismaClient();
    this.wsClient = new WebSocketClient(this.logger);
    this.ytdlp = new YtDlpDownloader(this.logger, this.wsClient);
    this.aria2 = new Aria2Downloader(this.logger, this.wsClient);
    this.ffmpeg = new FfmpegTranscoder(this.logger, this.wsClient);
  }

  async start() {
    await this.db.$connect();
    this.logger.info('🔗 Worker database connected');

    // Create worker with concurrency limit
    this.worker = new Worker(
      'downloads',
      this.processJob.bind(this),
      {
        connection: this.redis,
        concurrency: parseInt(process.env.MAX_CONCURRENT_JOBS || '3'),
        limiter: {
          max: parseInt(process.env.MAX_CONCURRENT_JOBS || '3'),
          duration: 1000,
        },
        stalledInterval: 30000,
        maxStalledCount: 1,
      }
    );

    this.worker.on('completed', (job) => {
      this.logger.info(`✅ Job ${job.id} completed successfully`);
    });

    this.worker.on('failed', (job, err) => {
      this.logger.error(`❌ Job ${job?.id} failed: ${err.message}`);
    });

    this.worker.on('stalled', (jobId) => {
      this.logger.warn(`⚠️  Job ${jobId} stalled`);
    });

    // Ensure directories exist
    await this.ensureDirectories();

    this.logger.info(`🚀 Download worker started with concurrency: ${process.env.MAX_CONCURRENT_JOBS || '3'}`);
  }

  private async ensureDirectories() {
    const dataDir = path.resolve(process.env.DATA_DIR || './data');
    const tempDir = path.resolve(process.env.TEMP_DIR || './tmp');

    await fs.mkdir(dataDir, { recursive: true });
    await fs.mkdir(tempDir, { recursive: true });

    this.logger.info(`📁 Directories ensured: ${dataDir}, ${tempDir}`);
  }

  private async processJob(job: Job<DownloadJobData>) {
    const { jobId, url, type, headers, transcode, filenameHint } = job.data;

    try {
      // Update job status to running
      await this.updateJobStatus(jobId, 'running');

      this.logger.info(`🎬 Processing job ${jobId}: ${url} (type: ${type})`);

      // Create job-specific directories (use absolute paths for aria2 compatibility)
      const tempDir = path.resolve(process.env.TEMP_DIR || './tmp');
      const dataDir = path.resolve(process.env.DATA_DIR || './data');

      const tempJobDir = path.join(tempDir, jobId);
      const dataJobDir = path.join(dataDir, jobId);

      await fs.mkdir(tempJobDir, { recursive: true });
      await fs.mkdir(dataJobDir, { recursive: true });

      let downloadResult: { filename: string; filepath: string; size?: number };

      // Stage 1: Download
      this.wsClient.emitProgress({
        jobId,
        stage: 'download',
        progress: 0,
      });
      // Persist stage start
      await this.db.job.update({
        where: { id: jobId },
        data: { stage: 'download', progress: 0, updatedAt: new Date() },
      });

      switch (type) {
        case 'youtube':
          downloadResult = await this.ytdlp.download({
            url,
            outputDir: tempJobDir,
            jobId,
            headers,
            filenameHint,
            onProgress: async ({ progress, stage, speed, eta, totalBytes }) => {
              await this.db.job.update({
                where: { id: jobId },
                data: {
                  progress,
                  stage,
                  speed,
                  eta,
                  totalBytes: totalBytes != null ? BigInt(totalBytes) : undefined,
                  updatedAt: new Date(),
                },
              });
            },
          });
          break;

        case 'm3u8':
          downloadResult = await this.ytdlp.download({
            url,
            outputDir: tempJobDir,
            jobId,
            headers,
            filenameHint,
            format: 'best[ext=mp4]',
            onProgress: async ({ progress, stage, speed, eta, totalBytes }) => {
              await this.db.job.update({
                where: { id: jobId },
                data: {
                  progress,
                  stage,
                  speed,
                  eta,
                  totalBytes: totalBytes != null ? BigInt(totalBytes) : undefined,
                  updatedAt: new Date(),
                },
              });
            },
          });
          break;

        case 'file':
        case 'auto':
        default:
          downloadResult = await this.aria2.download({
            url,
            outputDir: tempJobDir,
            jobId,
            headers,
            filenameHint,
            onProgress: async ({ progress, stage, speed, eta, totalBytes }) => {
              await this.db.job.update({
                where: { id: jobId },
                data: {
                  progress,
                  stage,
                  speed,
                  eta,
                  totalBytes: totalBytes != null ? BigInt(totalBytes) : undefined,
                  updatedAt: new Date(),
                },
              });
            },
          });
          break;
      }

      // Stage 2: Transcode (if needed)
      let finalFile = downloadResult;
      if (transcode && transcode.to) {
        this.wsClient.emitProgress({
          jobId,
          stage: 'transcode',
          progress: 0,
        });

        finalFile = await this.ffmpeg.transcode({
          inputPath: downloadResult.filepath,
          outputDir: tempJobDir,
          jobId,
          options: transcode,
          onProgress: async ({ progress, stage }) => {
            await this.db.job.update({
              where: { id: jobId },
              data: { progress, stage, updatedAt: new Date() },
            });
          },
        });
      }

      // Stage 3: Finalize - Move to final location
      this.wsClient.emitProgress({
        jobId,
        stage: 'finalize',
        progress: 90,
      });

      const finalPath = path.join(dataJobDir, finalFile.filename);
      await fs.rename(finalFile.filepath, finalPath);

      // Get final file stats
      const stats = await fs.stat(finalPath);

      // Update database
      await this.db.job.update({
        where: { id: jobId },
        data: {
          status: 'completed',
          filename: finalFile.filename,
          outputPath: finalPath,
          totalBytes: BigInt(stats.size),
          progress: 100,
          stage: 'completed',
          updatedAt: new Date(),
        },
      });

      // Emit completion event
      this.wsClient.emitCompleted({
        jobId,
        filename: finalFile.filename,
        size: stats.size,
        outputPath: finalPath,
      });

      // Clean up temp directory
      await fs.rm(tempJobDir, { recursive: true, force: true });

      this.logger.info(`✅ Job ${jobId} completed: ${finalFile.filename} (${stats.size} bytes)`);

    } catch (error) {
      this.logger.error(`❌ Job ${jobId} failed:`, error instanceof Error ? error.message : String(error));

      const errorCode = error instanceof Error && 'code' in error ? (error as any).code : 'UNKNOWN_ERROR';
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.updateJobStatus(jobId, 'failed', errorCode, errorMessage);

      this.wsClient.emitFailed({
        jobId,
        errorCode,
        message: errorMessage,
      });

      throw error; // Let BullMQ handle retry logic
    }
  }

  private async updateJobStatus(
    jobId: string,
    status: string,
    errorCode?: string,
    errorMessage?: string,
  ) {
    await this.db.job.update({
      where: { id: jobId },
      data: {
        status,
        errorCode,
        errorMessage,
        updatedAt: new Date(),
      },
    });

    this.wsClient.emitJobUpdate(jobId, { status });
  }

  async stop() {
    await this.worker?.close();
    await this.redis?.disconnect();
    await this.db?.$disconnect();
    this.logger.info('🛑 Worker stopped');
  }
}

// Start the worker
const worker = new DownloadWorker();

worker.start().catch((error) => {
  console.error('Failed to start worker:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully...');
  await worker.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  await worker.stop();
  process.exit(0);
});
