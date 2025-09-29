import { Module, Global } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DatabaseService } from './database.service.js';
import { Logger } from './logger.service.js';
import { QueueService } from './queue.service.js';
import { ApiKeyGuard } from './guards/api-key.guard.js';

@Global()
@Module({
  providers: [DatabaseService, Logger, QueueService, ApiKeyGuard, Reflector],
  exports: [DatabaseService, Logger, QueueService, ApiKeyGuard, Reflector],
})
export class SharedModule {}