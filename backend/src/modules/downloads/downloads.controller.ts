import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  UsePipes,
} from '@nestjs/common';
import { DownloadsService } from './downloads.service.js';
import { ApiKeyGuard } from '../../shared/guards/api-key.guard.js';
import { CreateDownloadDto, CreateDownloadSchema, JobActionDto, JobActionSchema } from '../../shared/dto/download.dto.js';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe.js';

@Controller('downloads')
// @UseGuards(ApiKeyGuard) // Temporarily disabled for testing
export class DownloadsController {
  constructor(private downloadsService: DownloadsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe(CreateDownloadSchema))
  async createDownload(@Body() dto: CreateDownloadDto) {
    // Temporary test response
    const jobId = `test-${Date.now()}`;
    console.log('Create download request:', dto);
    return { jobId };
    // return this.downloadsService.createDownload(dto);
  }

  @Get()
  async listDownloads(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('search') search?: string,
  ) {
    // Temporary test response
    return {
      jobs: [],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: 0,
        pages: 0,
      },
    };
    // return this.downloadsService.listDownloads(
    //   parseInt(page),
    //   parseInt(limit),
    //   status,
    //   type,
    //   search,
    // );
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
}