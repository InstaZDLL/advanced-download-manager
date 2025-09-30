import { Module } from '@nestjs/common';
import { WebSocketGateway, WorkerEventsGateway } from './websocket.gateway.js';
import { DownloadsModule } from '../downloads/downloads.module.js';

@Module({
  imports: [DownloadsModule],
  providers: [WebSocketGateway, WorkerEventsGateway],
  exports: [WebSocketGateway],
})
export class WebSocketModule {}
