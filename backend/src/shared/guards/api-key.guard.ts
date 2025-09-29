import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];
    const expectedApiKey = process.env.API_KEY;

    // If no API key is configured, allow all requests
    if (!expectedApiKey) {
      return true;
    }

    // If API key is configured but not provided, only allow read operations
    if (!apiKey) {
      const method = request.method.toUpperCase();
      const isReadOperation = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';

      if (!isReadOperation) {
        throw new UnauthorizedException('API key required for write operations');
      }

      return true;
    }

    // Validate API key
    if (apiKey !== expectedApiKey) {
      throw new UnauthorizedException('Invalid API key');
    }

    return true;
  }
}