import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../shared/database.service.js';
import { QueueService } from '../../shared/queue.service.js';
import { Logger } from '../../shared/logger.service.js';
import { execa } from 'execa';

@Injectable()
export class HealthService {
  constructor(
    private database: DatabaseService,
    private queue: QueueService,
    private logger: Logger,
  ) {}

  async getHealthStatus() {
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkExternalTools(),
      this.checkDiskSpace(),
    ]);

    const results = {
      status: 'healthy' as 'healthy' | 'degraded' | 'unhealthy',
      timestamp: new Date().toISOString(),
      checks: {
        database: this.getCheckResult(checks[0]),
        redis: this.getCheckResult(checks[1]),
        externalTools: this.getCheckResult(checks[2]),
        diskSpace: this.getCheckResult(checks[3]),
      },
      queue: await this.getQueueStats(),
    };

    // Determine overall status
    const failedChecks = Object.values(results.checks).filter(check => !check.healthy).length;
    if (failedChecks === 0) {
      results.status = 'healthy';
    } else if (failedChecks <= 1) {
      results.status = 'degraded';
    } else {
      results.status = 'unhealthy';
    }

    return results;
  }

  private async checkDatabase() {
    try {
      await this.database.$queryRaw`SELECT 1`;
      return { healthy: true, message: 'Database connection successful' };
    } catch (error) {
      this.logger.error('Database health check failed', error instanceof Error ? error.message : String(error));
      return { healthy: false, message: `Database error: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  private async checkRedis() {
    try {
      const redis = this.queue.getRedis();
      await redis.ping();
      return { healthy: true, message: 'Redis connection successful' };
    } catch (error) {
      this.logger.error('Redis health check failed', error instanceof Error ? error.message : String(error));
      return { healthy: false, message: `Redis error: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  private async checkExternalTools() {
    const results = {
      ytdlp: false,
      ffmpeg: false,
      aria2: false,
    };

    const messages: string[] = [];

    // Check yt-dlp
    try {
      const ytdlpPath = process.env.YTDLP_PATH || 'yt-dlp';
      await execa(ytdlpPath, ['--version'], { timeout: 5000 });
      results.ytdlp = true;
      messages.push('yt-dlp: OK');
    } catch {
      messages.push('yt-dlp: NOT FOUND');
    }

    // Check ffmpeg
    try {
      const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
      await execa(ffmpegPath, ['-version'], { timeout: 5000 });
      results.ffmpeg = true;
      messages.push('ffmpeg: OK');
    } catch {
      messages.push('ffmpeg: NOT FOUND');
    }

    // Check aria2 RPC
    try {
      const aria2Url = process.env.ARIA2_RPC_URL || 'http://localhost:6800/jsonrpc';
      const response = await fetch(aria2Url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'aria2.getVersion',
          id: 'health-check',
          params: process.env.ARIA2_SECRET ? [`token:${process.env.ARIA2_SECRET}`] : [],
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        results.aria2 = true;
        messages.push('aria2: OK');
      } else {
        messages.push('aria2: ERROR');
      }
    } catch {
      messages.push('aria2: NOT AVAILABLE');
    }

    const allHealthy = results.ytdlp && results.ffmpeg && results.aria2;

    return {
      healthy: allHealthy,
      message: messages.join(', '),
      details: results,
    };
  }

  private async checkDiskSpace() {
    try {
      const { execSync } = await import('child_process');
      const dataDir = process.env.DATA_DIR || './data';

      // Get disk usage for data directory
      const output = execSync(`df -k "${dataDir}" | tail -1`, { encoding: 'utf8' });
      const [, , used, available] = output.trim().split(/\s+/);

      const usedGB = parseInt(used) / 1024 / 1024;
      const availableGB = parseInt(available) / 1024 / 1024;
      const totalGB = usedGB + availableGB;
      const usagePercent = (usedGB / totalGB) * 100;

      const healthy = usagePercent < 90 && availableGB > 1; // At least 1GB free and < 90% used

      return {
        healthy,
        message: `${usagePercent.toFixed(1)}% used, ${availableGB.toFixed(2)}GB available`,
        details: {
          usedGB: Math.round(usedGB * 100) / 100,
          availableGB: Math.round(availableGB * 100) / 100,
          totalGB: Math.round(totalGB * 100) / 100,
          usagePercent: Math.round(usagePercent * 100) / 100,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Disk space check failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async getQueueStats() {
    try {
      const stats = await this.queue.getQueueStatus();
      return {
        ...stats,
        healthy: stats.active <= 3, // Should not exceed max concurrent jobs
      };
    } catch (error) {
      this.logger.error('Queue stats check failed', error instanceof Error ? error.message : String(error));
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private getCheckResult(settledResult: PromiseSettledResult<any>) {
    if (settledResult.status === 'fulfilled') {
      return settledResult.value;
    } else {
      return {
        healthy: false,
        message: `Check failed: ${settledResult.reason?.message || settledResult.reason}`,
      };
    }
  }
}