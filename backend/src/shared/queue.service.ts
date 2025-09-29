import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';

export interface DownloadJobData {
  jobId: string;
  url: string;
  type: 'auto' | 'm3u8' | 'file' | 'youtube';
  headers?: {
    ua?: string;
    referer?: string;
    extra?: Record<string, string>;
  };
  transcode?: {
    to?: string;
    codec?: string;
    crf?: number;
  };
  filenameHint?: string;
}

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private downloadQueue!: Queue<DownloadJobData>;
  private redis!: Redis;
  private readonly logger = new Logger(QueueService.name);

  constructor() {}

  async onModuleInit() {
    // Initialize Redis connection
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
    });

    // Initialize download queue
    this.downloadQueue = new Queue('downloads', {
      connection: this.redis,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    });

    // Add event listeners
    this.downloadQueue.on('error', (err) => {
      this.logger.error('Download queue error', err);
    });

    this.downloadQueue.on('waiting', (jobId) => {
      this.logger.debug(`Job ${jobId} is waiting`);
    });

    (this.downloadQueue as any).on('active', (job: Job<DownloadJobData>) => {
      this.logger.log(`Job ${job.id} started processing`);
    });

    (this.downloadQueue as any).on('completed', (job: Job<DownloadJobData>) => {
      this.logger.log(`Job ${job.id} completed`);
    });

    (this.downloadQueue as any).on('failed', (job: Job<DownloadJobData> | undefined, err: Error) => {
      this.logger.error(`Job ${job?.id} failed: ${err.message}`);
    });

    this.logger.log('✅ Queue service initialized');
  }

  async onModuleDestroy() {
    await this.downloadQueue?.close();
    await this.redis?.disconnect();
    this.logger.log('🔌 Queue service disconnected');
  }

  async addDownloadJob(data: DownloadJobData, priority = 3): Promise<Job<DownloadJobData>> {
    const jobOptions = {
      jobId: data.jobId,
      priority,
      delay: 0,
    };

    // Set priority based on type
    if (data.type === 'youtube') {
      jobOptions.priority = 5; // Higher priority for YouTube
    }

    const job = await this.downloadQueue.add('download', data, jobOptions);
    this.logger.log(`Added download job ${data.jobId} to queue`);
    return job;
  }

  async getJob(jobId: string): Promise<Job<DownloadJobData> | undefined> {
    return this.downloadQueue.getJob(jobId);
  }

  async removeJob(jobId: string): Promise<void> {
    const job = await this.getJob(jobId);
    if (job) {
      await job.remove();
      this.logger.log(`Removed job ${jobId} from queue`);
    }
  }

  async pauseJob(jobId: string): Promise<void> {
    // Note: BullMQ doesn't support pausing individual jobs
    // This would need to be implemented at the worker level
    this.logger.warn(`Pause job ${jobId} not implemented yet`);
  }

  async resumeJob(jobId: string): Promise<void> {
    // Note: BullMQ doesn't support resuming individual jobs
    // This would need to be implemented at the worker level
    this.logger.warn(`Resume job ${jobId} not implemented yet`);
  }

  async getQueueStatus() {
    const [waiting, active, completed, failed] = await Promise.all([
      this.downloadQueue.getWaiting(),
      this.downloadQueue.getActive(),
      this.downloadQueue.getCompleted(),
      this.downloadQueue.getFailed(),
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      total: waiting.length + active.length + completed.length + failed.length,
    };
  }

  getQueue(): Queue<DownloadJobData> {
    return this.downloadQueue;
  }

  getRedis(): Redis {
    return this.redis;
  }
}