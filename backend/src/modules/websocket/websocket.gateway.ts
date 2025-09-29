import {
  WebSocketGateway as WSGateway,
  SubscribeMessage,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

export interface ProgressEvent {
  jobId: string;
  stage: 'queue' | 'download' | 'merge' | 'transcode' | 'finalize';
  progress: number; // 0-100
  speed?: string;
  eta?: number;
  totalBytes?: number;
}

export interface LogEvent {
  jobId: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
}

export interface CompletedEvent {
  jobId: string;
  filename: string;
  size: number;
  outputPath: string;
}

export interface FailedEvent {
  jobId: string;
  errorCode: string;
  message: string;
}

@WSGateway({
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'],
    credentials: true,
  },
  transports: ['websocket'],
})
export class WebSocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private connectedClients = new Map<string, Socket>();

  private readonly logger = new Logger(WebSocketGateway.name);

  constructor() {}

  handleConnection(client: Socket) {
    this.connectedClients.set(client.id, client);
    this.logger.debug(`WebSocket client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.connectedClients.delete(client.id);
    this.logger.debug(`WebSocket client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join-job')
  handleJoinJob(@MessageBody() data: { jobId: string }, client: Socket) {
    const room = `job:${data.jobId}`;
    client.join(room);
    this.logger.debug(`Client ${client.id} joined room ${room}`);
    return { success: true, room };
  }

  @SubscribeMessage('leave-job')
  handleLeaveJob(@MessageBody() data: { jobId: string }, client: Socket) {
    const room = `job:${data.jobId}`;
    client.leave(room);
    this.logger.debug(`Client ${client.id} left room ${room}`);
    return { success: true, room };
  }

  // Server-side methods to emit events to clients

  emitProgress(event: ProgressEvent) {
    const room = `job:${event.jobId}`;
    this.server.to(room).emit('progress', event);
    this.logger.debug(`Emitted progress for job ${event.jobId}: ${event.progress}%`);
  }

  emitLog(event: LogEvent) {
    const room = `job:${event.jobId}`;
    this.server.to(room).emit('log', event);
  }

  emitCompleted(event: CompletedEvent) {
    const room = `job:${event.jobId}`;
    this.server.to(room).emit('completed', event);
    this.logger.info(`Job ${event.jobId} completed: ${event.filename}`);
  }

  emitFailed(event: FailedEvent) {
    const room = `job:${event.jobId}`;
    this.server.to(room).emit('failed', event);
    this.logger.error(`Job ${event.jobId} failed: ${event.message}`);
  }

  emitJobUpdate(jobId: string, update: Partial<{ status: string; stage: string; progress: number }>) {
    const room = `job:${jobId}`;
    this.server.to(room).emit('job-update', { jobId, ...update });
  }

  // Broadcast to all connected clients
  broadcast(event: string, data: any) {
    this.server.emit(event, data);
  }

  // Get connection statistics
  getStats() {
    return {
      connectedClients: this.connectedClients.size,
      rooms: this.server.sockets.adapter.rooms,
    };
  }
}