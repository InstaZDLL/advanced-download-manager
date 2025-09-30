import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UsePipes,
} from '@nestjs/common';
import { DownloadsService } from './downloads.service.js';
import type { CreateDownloadDto } from '../../shared/dto/download.dto.js';
import { CreateDownloadSchema } from '../../shared/dto/download.dto.js';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe.js';

@Controller('downloads')
// @UseGuards(ApiKeyGuard) // Temporarily disabled for testing
export class DownloadsController {
  constructor(private downloadsService: DownloadsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe(CreateDownloadSchema))
  async createDownload(@Body() dto: CreateDownloadDto) {
    return this.downloadsService.createDownload(dto);
  }

  @Get()
  async listDownloads(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('search') search?: string,
  ) {
    return this.downloadsService.listDownloads(
      parseInt(page),
      parseInt(limit),
      status,
      type,
      search,
    );
  }

  @Get(':jobId')
  async getDownload(@Param('jobId') jobId: string) {
    return this.downloadsService.getDownload(jobId);
  }

  @Post(':jobId/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelDownload(@Param('jobId') jobId: string) {
    await this.downloadsService.cancelDownload(jobId);
    return { success: true };
  }

  @Post(':jobId/pause')
  @HttpCode(HttpStatus.OK)
  async pauseDownload(@Param('jobId') jobId: string) {
    await this.downloadsService.pauseDownload(jobId);
    return { success: true };
  }

  @Post(':jobId/resume')
  @HttpCode(HttpStatus.OK)
  async resumeDownload(@Param('jobId') jobId: string) {
    await this.downloadsService.resumeDownload(jobId);
    return { success: true };
  }

  @Post(':jobId/retry')
  @HttpCode(HttpStatus.OK)
  async retryDownload(@Param('jobId') jobId: string) {
    await this.downloadsService.retryDownload(jobId);
    return { success: true };
  }
}