import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { Logger } from './shared/logger.service.js';
import { SocketIOAdapter } from './shared/socket-io.adapter.js';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false })
  );

  const logger = app.get(Logger);
  app.useLogger(logger);

  // Configure Socket.IO adapter
  const socketIOAdapter = new SocketIOAdapter(app);
  // Skip Redis connection for now to avoid dependency issues
  // await socketIOAdapter.connectToRedis();
  app.useWebSocketAdapter(socketIOAdapter);

  // Global validation pipe with Zod
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }));

  // Enable CORS
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'];
  await app.register(import('@fastify/cors'), {
    origin: allowedOrigins,
    credentials: true,
  });

  // Security headers
  await app.register(import('@fastify/helmet'), {
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  });

  // Rate limiting
  await app.register(import('@fastify/rate-limit'), {
    max: parseInt(process.env.RATE_LIMIT_MAX || '200'),
    timeWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '900000'),
  });

  const port = parseInt(process.env.PORT || '3000');
  await app.listen(port, '0.0.0.0');

  logger.info(`🚀 ADM Backend running on port ${port}`);
}

bootstrap().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});