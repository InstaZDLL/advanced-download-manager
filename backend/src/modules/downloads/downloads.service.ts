import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../shared/database.service.js';
import { QueueService } from '../../shared/queue.service.js';
import { Logger } from '../../shared/logger.service.js';
import { CreateDownloadDto } from '../../shared/dto/download.dto.js';
import { randomUUID } from 'crypto';
import sanitizeFilename from 'sanitize-filename';

@Injectable()
export class DownloadsService {
  constructor(
    private database: DatabaseService,
    private queue: QueueService,
    private logger: Logger,
  ) {}

  async createDownload(dto: CreateDownloadDto) {
    const jobId = randomUUID();

    // Validate and sanitize filename hint
    let sanitizedFilename: string | undefined;
    if (dto.filenameHint) {
      sanitizedFilename = sanitizeFilename(dto.filenameHint);
      if (!sanitizedFilename || sanitizedFilename.length === 0) {
        throw new BadRequestException('Invalid filename hint');
      }
    }

    // Validate headers if provided
    if (dto.headers?.extra) {
      const allowedHeaderKeys = ['user-agent', 'referer', 'authorization', 'cookie', 'accept'];
      for (const key of Object.keys(dto.headers.extra)) {
        if (!allowedHeaderKeys.includes(key.toLowerCase())) {
          throw new BadRequestException(`Header '${key}' is not allowed`);
        }
      }
    }

    // Create job record in database
    const job = await this.database.job.create({
      data: {
        id: jobId,
        url: dto.url,
        type: dto.type,
        status: 'queued',
        meta: dto.transcode ? JSON.stringify(dto.transcode) : null,
        headers: dto.headers ? JSON.stringify(dto.headers) : null,
        filename: sanitizedFilename,
      },
    });

    // Add job to queue
    await this.queue.addDownloadJob({
      jobId,
      url: dto.url,
      type: dto.type,
      headers: dto.headers,
      transcode: dto.transcode,
      filenameHint: sanitizedFilename,
    });

    this.logger.info(`Created download job ${jobId} for URL: ${dto.url}`);

    return { jobId };
  }

  async getDownload(jobId: string) {
    const job = await this.database.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    return {
      jobId: job.id,
      url: job.url,
      type: job.type,
      status: job.status,
      stage: job.stage,
      progress: job.progress,
      speed: job.speed,
      eta: job.eta,
      totalBytes: job.totalBytes?.toString(),
      filename: job.filename,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      errorCode: job.errorCode,
      errorMessage: job.errorMessage,
    };
  }

  async listDownloads(page = 1, limit = 20, status?: string, type?: string, search?: string) {
    const skip = (page - 1) * limit;

    const where: any = {};

    if (status) where.status = status;
    if (type) where.type = type;
    if (search) {
      where.OR = [
        { url: { contains: search } },
        { filename: { contains: search } },
      ];
    }

    const [jobs, total] = await Promise.all([
      this.database.job.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.database.job.count({ where }),
    ]);

    return {
      jobs: jobs.map(job => ({
        jobId: job.id,
        url: job.url,
        type: job.type,
        status: job.status,
        stage: job.stage,
        progress: job.progress,
        speed: job.speed,
        eta: job.eta,
        totalBytes: job.totalBytes?.toString(),
        filename: job.filename,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        errorCode: job.errorCode,
        errorMessage: job.errorMessage,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async cancelDownload(jobId: string) {
    const job = await this.database.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    if (job.status === 'completed') {
      throw new BadRequestException('Cannot cancel completed job');
    }

    // Remove from queue
    await this.queue.removeJob(jobId);

    // Update database
    await this.database.job.update({
      where: { id: jobId },
      data: {
        status: 'cancelled',
        stage: null,
      },
    });

    this.logger.info(`Cancelled job ${jobId}`);
  }

  async pauseDownload(jobId: string) {
    const job = await this.database.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    if (job.status !== 'running') {
      throw new BadRequestException('Can only pause running jobs');
    }

    await this.queue.pauseJob(jobId);

    await this.database.job.update({
      where: { id: jobId },
      data: { status: 'paused' },
    });

    this.logger.info(`Paused job ${jobId}`);
  }

  async resumeDownload(jobId: string) {
    const job = await this.database.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    if (job.status !== 'paused') {
      throw new BadRequestException('Can only resume paused jobs');
    }

    await this.queue.resumeJob(jobId);

    await this.database.job.update({
      where: { id: jobId },
      data: { status: 'queued' },
    });

    this.logger.info(`Resumed job ${jobId}`);
  }

  async retryDownload(jobId: string) {
    const job = await this.database.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    if (job.status !== 'failed' && job.status !== 'cancelled') {
      throw new BadRequestException('Can only retry failed or cancelled jobs');
    }

    // Parse stored metadata
    const transcode = job.meta ? JSON.parse(job.meta) : undefined;
    const headers = job.headers ? JSON.parse(job.headers) : undefined;

    // Reset job status in database
    await this.database.job.update({
      where: { id: jobId },
      data: {
        status: 'queued',
        progress: 0,
        stage: null,
        speed: null,
        eta: null,
        errorCode: null,
        errorMessage: null,
        updatedAt: new Date(),
      },
    });

    // Re-add job to queue
    await this.queue.addDownloadJob({
      jobId,
      url: job.url,
      type: job.type as any,
      headers,
      transcode,
      filenameHint: job.filename || undefined,
    });

    this.logger.info(`Retrying job ${jobId}`);
  }

  async updateJobProgress(
    jobId: string,
    progress: number,
    stage?: string,
    speed?: string,
    eta?: number,
    totalBytes?: bigint,
  ) {
    await this.database.job.update({
      where: { id: jobId },
      data: {
        progress,
        stage,
        speed,
        eta,
        totalBytes,
        updatedAt: new Date(),
      },
    });
  }

  async updateJobStatus(jobId: string, status: string, errorCode?: string, errorMessage?: string) {
    await this.database.job.update({
      where: { id: jobId },
      data: {
        status,
        errorCode,
        errorMessage,
        updatedAt: new Date(),
      },
    });
  }

  async setJobCompleted(jobId: string, filename: string, outputPath: string, fileSize?: number) {
    await this.database.job.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        filename,
        outputPath,
        totalBytes: fileSize ? BigInt(fileSize) : undefined,
        progress: 100,
        stage: 'completed',
        updatedAt: new Date(),
      },
    });
  }
}