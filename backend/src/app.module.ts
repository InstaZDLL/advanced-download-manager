import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SharedModule } from './shared/shared.module.js';
import { DownloadsModule } from './modules/downloads/downloads.module.js';
import { FilesModule } from './modules/files/files.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { WebSocketModule } from './modules/websocket/websocket.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    SharedModule,
    DownloadsModule,
    FilesModule,
    HealthModule,
    WebSocketModule,
  ],
})
export class AppModule {}