import { IoAdapter } from '@nestjs/platform-socket.io';
import type { INestApplicationContext } from '@nestjs/common';
import type { ServerOptions } from 'socket.io';

type SocketTransport = 'polling' | 'websocket';

export class SocketIOAdapter extends IoAdapter {
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

    return server;
  }
}
