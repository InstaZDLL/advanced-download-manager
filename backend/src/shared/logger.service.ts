import { Injectable, LoggerService } from '@nestjs/common';
import pino from 'pino';

@Injectable()
export class Logger implements LoggerService {
  private readonly pino: pino.Logger;

  constructor() {
    this.pino = pino({
      level: process.env.LOG_LEVEL || 'info',
      transport: process.env.NODE_ENV !== 'production' ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname'
        }
      } : undefined,
    });
  }

  log(message: any, context?: string) {
    this.pino.info({ context }, message);
  }

  error(message: any, trace?: string, context?: string) {
    this.pino.error({ context, trace }, message);
  }

  warn(message: any, context?: string) {
    this.pino.warn({ context }, message);
  }

  debug(message: any, context?: string) {
    this.pino.debug({ context }, message);
  }

  verbose(message: any, context?: string) {
    this.pino.trace({ context }, message);
  }

  info(message: any, context?: string) {
    this.pino.info({ context }, message);
  }

  child(bindings: Record<string, any>) {
    return this.pino.child(bindings);
  }
}