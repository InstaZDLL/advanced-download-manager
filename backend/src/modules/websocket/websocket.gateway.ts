import {
  WebSocketGateway as WSGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { DownloadsService } from '../downloads/downloads.service.js';

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

@WSGateway()  // Configuration centralisée dans SocketIOAdapter (namespace par défaut pour les clients UI)
export class WebSocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private connectedClients = new Map<string, Socket>();

  private readonly logger = new Logger(WebSocketGateway.name);

  constructor(private downloads: DownloadsService) {}

  handleConnection(client: Socket) {
    this.connectedClients.set(client.id, client);
    this.logger.debug(`WebSocket client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.connectedClients.delete(client.id);
    this.logger.debug(`WebSocket client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join-job')
  handleJoinJob(
    @MessageBody() data: { jobId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const room = `job:${data.jobId}`;
    client.join(room);
    this.logger.debug(`Client ${client.id} joined room ${room}`);
    return { success: true, room };
  }

  @SubscribeMessage('leave-job')
  handleLeaveJob(
    @MessageBody() data: { jobId: string },
    @ConnectedSocket() client: Socket,
  ) {
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
    this.logger.log(`Job ${event.jobId} completed: ${event.filename}`);
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
  broadcast(event: string, data: unknown) {
    this.server.emit(event, data as never);
  }

  // Get connection statistics
  getStats() {
    return {
      connectedClients: this.connectedClients.size,
      rooms: this.server.sockets.adapter.rooms,
    };
  }
}

// Incoming events from worker (bridge to rooms + persist in DB)
@WSGateway({ namespace: '/worker' })
export class WorkerEventsGateway {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger('WorkerEventsGateway');

  // Throttle DB writes for progress events
  private progressBuffer = new Map<string, ProgressEvent>();
  private progressTimers = new Map<string, NodeJS.Timeout>();
  private throttleMs = parseInt(process.env.PROGRESS_THROTTLE_MS || '300', 10);

  constructor(
    private downloads: DownloadsService,
    private uiGateway: WebSocketGateway, // emit to default namespace for UI clients
  ) {}

  // Authenticate worker connections via token
  handleConnection(client: Socket) {
    const auth = client.handshake.auth as { token?: string } | undefined;
    const token = auth?.token ?? (client.handshake.headers['x-worker-token'] as string | undefined);
    const expected = process.env.WORKER_TOKEN;
    if (expected && token !== expected) {
      this.logger.warn(`Unauthorized worker connection: ${client.id}`);
      client.disconnect(true);
      return;
    }
    this.logger.debug(`Worker connected: ${client.id}`);
  }

  @SubscribeMessage('progress')
  async handleProgress(@MessageBody() event: ProgressEvent) {
    // Relay to UI namespace immediately for live updates
    this.uiGateway.emitProgress(event);

    // Buffer last event per job and throttle DB writes
    this.progressBuffer.set(event.jobId, event);
    if (this.progressTimers.has(event.jobId)) return;
    const timer = setTimeout(async () => {
      this.progressTimers.delete(event.jobId);
      const buffered = this.progressBuffer.get(event.jobId);
      if (!buffered) return;
      try {
        await this.downloads.updateJobProgress(
          buffered.jobId,
          buffered.progress,
          buffered.stage,
          buffered.speed,
          buffered.eta,
          buffered.totalBytes != null ? BigInt(buffered.totalBytes) : undefined,
        );
      } catch (e) {
        this.logger.warn(`DB update failed for progress ${buffered.jobId}: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        this.progressBuffer.delete(event.jobId);
      }
    }, this.throttleMs);
    this.progressTimers.set(event.jobId, timer);
  }

  @SubscribeMessage('completed')
  async handleCompleted(@MessageBody() event: CompletedEvent) {
    // Flush any buffered progress for this job
    const t = this.progressTimers.get(event.jobId);
    if (t) clearTimeout(t);
    this.progressTimers.delete(event.jobId);
    this.progressBuffer.delete(event.jobId);
    try {
      await this.downloads.setJobCompleted(event.jobId, event.filename, event.outputPath, event.size);
    } catch (e) {
      this.logger.warn(`DB update failed for completed ${event.jobId}: ${e instanceof Error ? e.message : String(e)}`);
    }
    // Relay to UI namespace
    this.uiGateway.emitCompleted(event);
  }

  @SubscribeMessage('failed')
  async handleFailed(@MessageBody() event: FailedEvent) {
    // Flush any buffered progress for this job
    const t = this.progressTimers.get(event.jobId);
    if (t) clearTimeout(t);
    this.progressTimers.delete(event.jobId);
    this.progressBuffer.delete(event.jobId);
    try {
      await this.downloads.updateJobStatus(event.jobId, 'failed', event.errorCode, event.message);
    } catch (e) {
      this.logger.warn(`DB update failed for failed ${event.jobId}: ${e instanceof Error ? e.message : String(e)}`);
    }
    // Relay to UI namespace
    this.uiGateway.emitFailed(event);
  }

  @SubscribeMessage('job-update')
  async handleJobUpdate(@MessageBody() data: { jobId: string; status?: string; stage?: string; progress?: number }) {
    try {
      if (data.status) {
        await this.downloads.updateJobStatus(data.jobId, data.status);
      }
      if (data.stage != null || data.progress != null) {
        await this.downloads.updateJobProgress(
          data.jobId,
          data.progress ?? 0,
          data.stage,
        );
      }
    } catch (e) {
      this.logger.warn(`DB update failed for job-update ${data.jobId}: ${e instanceof Error ? e.message : String(e)}`);
    }
    // Relay to UI namespace
    this.uiGateway.emitJobUpdate(data.jobId, { status: data.status, stage: data.stage, progress: data.progress });
  }
}
