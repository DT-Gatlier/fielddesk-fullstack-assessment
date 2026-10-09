import { Injectable, ServiceUnavailableException } from '@nestjs/common';

import { PrismaService } from '../../../database/prisma.service';
import { RedisService } from '../../../infrastructure/redis/redis.service';

@Injectable()
export class ReadinessService {
  constructor(
    private readonly database: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async check(): Promise<void> {
    // PostgreSQL has finite connection/statement timeouts; Redis has a command timeout.
    try {
      await Promise.all([
        this.database.client.$queryRaw`SELECT 1`,
        this.redis.ping(),
      ]);
    } catch {
      throw new ServiceUnavailableException('Dependencies unavailable');
    }
  }
}
