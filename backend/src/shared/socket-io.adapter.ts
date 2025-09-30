import { IoAdapter } from '@nestjs/platform-socket.io';
import type { INestApplicationContext } from '@nestjs/common';
import type { ServerOptions } from 'socket.io';
import type { Server } from 'socket.io';

type SocketTransport = 'polling' | 'websocket';

export class SocketIOAdapter extends IoAdapter {
  private redisAdapterFactory: ((nsp: Server) => unknown) | null = null;

  constructor(app?: INestApplicationContext) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions) {
    const origins = (process.env.ALLOWED_ORIGINS ??
      'http://localhost:5173,http://127.0.0.1:5173')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const envTransports = process.env.SIO_TRANSPORTS
      ?.split(',')
      .map(transport => transport.trim())
      .filter((transport): transport is SocketTransport => transport === 'websocket' || transport === 'polling');

    const defaultOptions: Partial<ServerOptions> = {
      path: process.env.SOCKET_IO_PATH ?? '/socket.io',
      cors: {
        origin: origins,
        credentials: true,
        methods: ['GET', 'POST', 'OPTIONS'],
      },
      // Mets seulement 'websocket' si tu veux éviter le fallback long-polling
      transports: envTransports ?? ['websocket', 'polling'],
      allowEIO3: false,          // passe à true uniquement si tu dois supporter Socket.IO v2
      serveClient: false,
      connectionStateRecovery: { maxDisconnectionDuration: 120_000 },
    };

    const server = super.createIOServer(port, {
      ...defaultOptions,
      ...options,                // <-- permettre l'override
    });

    // Activer l'adapter Redis si préparé via connectToRedis()
    if (this.redisAdapterFactory) {
      server.adapter(this.redisAdapterFactory as unknown as any);
    }

    return server;
  }

  async connectToRedis() {
    // Active uniquement si demandé
    const useRedis = (process.env.SIO_USE_REDIS || '').toLowerCase();
    if (!(useRedis === '1' || useRedis === 'true' || useRedis === 'yes' )) {
      return;
    }

    // Import dynamiques non-résolus à la compilation (optionnels)
    const dynImport = new Function('m', 'return import(m)') as unknown as (m: string) => Promise<unknown>;
    let createAdapter: unknown;
    let IORedis: unknown;
    try {
      ({ createAdapter } = (await dynImport('@socket.io/redis-adapter')) as { createAdapter: unknown });
      IORedis = (await dynImport('ioredis') as { default: unknown }).default;
    } catch (e) {
      // Module non installé: on journalise et on désactive l'usage Redis
      console.warn('[Socket.IO] Redis adapter not available, falling back to in-memory adapter:', e);
      return;
    }

    const host = process.env.REDIS_HOST || 'localhost';
    const port = parseInt(process.env.REDIS_PORT || '6379', 10);
    const password = process.env.REDIS_PASSWORD || undefined;

    const RedisCtor = IORedis as new (opts: { host: string; port: number; password?: string; maxRetriesPerRequest: number | null }) => { duplicate: () => unknown };
    const pubClient = new RedisCtor({ host, port, password, maxRetriesPerRequest: null });
    const subClient = pubClient.duplicate() as unknown;

    const createAdapterFn = createAdapter as (pub: unknown, sub: unknown) => (nsp: Server) => unknown;
    this.redisAdapterFactory = createAdapterFn(pubClient, subClient);
  }
}
