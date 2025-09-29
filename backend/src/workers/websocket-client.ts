import pino from 'pino';
import { io, Socket } from 'socket.io-client';
import { ProgressEvent, LogEvent, CompletedEvent, FailedEvent } from '../modules/websocket/websocket.gateway.js';

export class WebSocketClient {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(private logger: pino.Logger) {
    this.connect();
  }

  private connect() {
    const wsUrl = process.env.WS_URL || 'http://localhost:3000';

    this.socket = io(wsUrl, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      this.logger.info(`🔌 WebSocket connected to ${wsUrl}`);
      this.reconnectAttempts = 0;
    });

    this.socket.on('disconnect', (reason) => {
      this.logger.warn(`🔌 WebSocket disconnected: ${reason}`);
    });

    this.socket.on('connect_error', (error) => {
      this.reconnectAttempts++;
      this.logger.error(`🔌 WebSocket connection error (attempt ${this.reconnectAttempts}):`, error);

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.logger.error('🔌 Max WebSocket reconnection attempts reached, giving up');
        this.socket?.disconnect();
      }
    });
  }

  emitProgress(event: ProgressEvent) {
    if (this.socket?.connected) {
      this.socket.emit('progress', event);
    } else {
      this.logger.warn(`Cannot emit progress for job ${event.jobId}: WebSocket not connected`);
    }
  }

  emitLog(event: LogEvent) {
    if (this.socket?.connected) {
      this.socket.emit('log', event);
    }
  }

  emitCompleted(event: CompletedEvent) {
    if (this.socket?.connected) {
      this.socket.emit('completed', event);
    } else {
      this.logger.warn(`Cannot emit completed for job ${event.jobId}: WebSocket not connected`);
    }
  }

  emitFailed(event: FailedEvent) {
    if (this.socket?.connected) {
      this.socket.emit('failed', event);
    } else {
      this.logger.warn(`Cannot emit failed for job ${event.jobId}: WebSocket not connected`);
    }
  }

  emitJobUpdate(jobId: string, update: Partial<{ status: string; stage: string; progress: number }>) {
    if (this.socket?.connected) {
      this.socket.emit('job-update', { jobId, ...update });
    }
  }

  disconnect() {
    this.socket?.disconnect();
  }
}