import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service.js';
import { Public } from '../../shared/guards/api-key.guard.js';

@Controller('health')
export class HealthController {
  constructor(private healthService: HealthService) {}

  @Get()
  @Public()
  async getHealth() {
    return this.healthService.getHealthStatus();
  }
}