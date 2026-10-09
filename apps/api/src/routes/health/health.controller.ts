import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Public } from '../../http/decorators/auth.decorators';
import { ReadinessService } from './services/readiness.service';

@Public()
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly readiness: ReadinessService) {}

  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): Promise<{ status: 'ok' }> {
    await this.readiness.check();
    return { status: 'ok' };
  }
}
