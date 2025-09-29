import { Module } from '@nestjs/common';
import { WebSocketGateway } from './websocket.gateway.js';

@Module({
  providers: [WebSocketGateway],
  exports: [WebSocketGateway],
})
export class WebSocketModule {}