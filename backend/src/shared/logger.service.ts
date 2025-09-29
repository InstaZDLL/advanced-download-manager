import { Injectable, LoggerService } from '@nestjs/common';
import { pino } from 'pino';
import type { Bindings, Logger as PinoLogger, LoggerOptions } from 'pino';

@Injectable()
export class Logger implements LoggerService {
  private readonly pino: PinoLogger;

  constructor() {
    const options: LoggerOptions = {
      level: process.env.LOG_LEVEL || 'info',
      transport: process.env.NODE_ENV !== 'production' ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname'
        }
      } : undefined,
    };

    this.pino = pino(options);
  }

  log(message: unknown, context?: string) {
    this.pino.info({ context, payload: message });
  }

  error(message: unknown, trace?: string, context?: string) {
    this.pino.error({ context, trace, payload: message, err: message instanceof Error ? message : undefined });
  }

  warn(message: unknown, context?: string) {
    this.pino.warn({ context, payload: message });
  }

  debug(message: unknown, context?: string) {
    this.pino.debug({ context, payload: message });
  }

  verbose(message: unknown, context?: string) {
    this.pino.trace({ context, payload: message });
  }

  info(message: unknown, context?: string) {
    this.pino.info({ context, payload: message });
  }

  child(bindings: Bindings) {
    return this.pino.child(bindings);
  }
}