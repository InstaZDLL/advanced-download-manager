import {
  Controller,
  Get,
  Param,
  Res,
  UseGuards,
  Header,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { FilesService } from './files.service.js';
import { ApiKeyGuard, Public } from '../../shared/guards/api-key.guard.js';
import * as fs from 'fs';

@Controller('files')
@UseGuards(ApiKeyGuard)
export class FilesController {
  constructor(private filesService: FilesService) {}

  @Get(':jobId')
  @Public()
  async getFileMetadata(@Param('jobId') jobId: string) {
    return this.filesService.getFileMetadata(jobId);
  }

  @Get(':jobId/download')
  @Public()
  @Header('Cache-Control', 'no-cache')
  async downloadFile(
    @Param('jobId') jobId: string,
    @Res() reply: FastifyReply,
  ) {
    const fileInfo = await this.filesService.getFileStream(jobId);

    reply.header('Content-Type', fileInfo.mimeType);
    reply.header('Content-Length', fileInfo.size.toString());
    reply.header('Content-Disposition', `attachment; filename="${fileInfo.filename}"`);

    const stream = fs.createReadStream(fileInfo.filepath);

    stream.on('error', (_err: NodeJS.ErrnoException | Error) => {
      reply.code(500).send({ error: 'Failed to stream file' });
    });

    reply.send(stream);
  }
}