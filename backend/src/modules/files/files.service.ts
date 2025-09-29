import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../shared/database.service.js';
import { Logger } from '../../shared/logger.service.js';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class FilesService {
  private dataDir: string;

  constructor(
    private database: DatabaseService,
    private logger: Logger,
  ) {
    this.dataDir = process.env.DATA_DIR || './data';
  }

  async getFileMetadata(jobId: string) {
    const job = await this.database.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    if (job.status !== 'completed' || !job.outputPath) {
      throw new BadRequestException('File not ready for download');
    }

    try {
      const stats = await fs.stat(job.outputPath);

      return {
        filename: job.filename || path.basename(job.outputPath),
        size: stats.size,
        mimeType: this.getMimeType(job.outputPath),
        createdAt: job.createdAt,
        completedAt: job.updatedAt,
      };
    } catch (error) {
      this.logger.error(`Failed to get file metadata for job ${jobId}`, error);
      throw new NotFoundException('File not found on disk');
    }
  }

  async getFileStream(jobId: string) {
    const job = await this.database.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    if (job.status !== 'completed' || !job.outputPath) {
      throw new BadRequestException('File not ready for download');
    }

    try {
      // Verify file exists
      await fs.access(job.outputPath);

      const stats = await fs.stat(job.outputPath);
      const filename = job.filename || path.basename(job.outputPath);

      return {
        filepath: job.outputPath,
        filename,
        size: stats.size,
        mimeType: this.getMimeType(job.outputPath),
      };
    } catch (error) {
      this.logger.error(`Failed to access file for job ${jobId}`, error);
      throw new NotFoundException('File not found on disk');
    }
  }

  private getMimeType(filepath: string): string {
    const ext = path.extname(filepath).toLowerCase();

    const mimeTypes: Record<string, string> = {
      '.mp4': 'video/mp4',
      '.mkv': 'video/x-matroska',
      '.avi': 'video/x-msvideo',
      '.mov': 'video/quicktime',
      '.webm': 'video/webm',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.flac': 'audio/flac',
      '.m4a': 'audio/mp4',
      '.zip': 'application/zip',
      '.rar': 'application/x-rar-compressed',
      '.7z': 'application/x-7z-compressed',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.json': 'application/json',
    };

    return mimeTypes[ext] || 'application/octet-stream';
  }

  async cleanupOldFiles() {
    const retentionDays = parseInt(process.env.RETENTION_DAYS || '7');
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    try {
      // Find old completed jobs
      const oldJobs = await this.database.job.findMany({
        where: {
          status: 'completed',
          createdAt: { lt: cutoffDate },
          outputPath: { not: null },
        },
      });

      let deletedCount = 0;
      let deletedBytes = 0;

      for (const job of oldJobs) {
        if (job.outputPath) {
          try {
            const stats = await fs.stat(job.outputPath);
            await fs.unlink(job.outputPath);
            deletedBytes += stats.size;
            deletedCount++;

            // Also try to remove the job directory if it's empty
            const jobDir = path.dirname(job.outputPath);
            try {
              await fs.rmdir(jobDir);
            } catch {
              // Directory not empty or doesn't exist, ignore
            }

            this.logger.debug(`Deleted old file: ${job.outputPath}`);
          } catch (error) {
            this.logger.warn(`Failed to delete file ${job.outputPath}:`, error);
          }
        }
      }

      // Update job records to mark files as deleted
      if (oldJobs.length > 0) {
        await this.database.job.updateMany({
          where: { id: { in: oldJobs.map(j => j.id) } },
          data: { outputPath: null },
        });
      }

      this.logger.info(`Cleanup completed: ${deletedCount} files deleted, ${(deletedBytes / 1024 / 1024).toFixed(2)} MB freed`);

      return {
        deletedCount,
        deletedBytes,
        cleanedJobs: oldJobs.length,
      };
    } catch (error) {
      this.logger.error('File cleanup failed', error);
      throw error;
    }
  }
}