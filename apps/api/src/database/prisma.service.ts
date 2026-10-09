import { createDatabaseClient, PrismaClient } from '@fielddesk/database';
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { ApiEnvironment } from '../config/environment';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client: PrismaClient;

  constructor(config: ConfigService<ApiEnvironment, true>) {
    this.client = createDatabaseClient(
      config.get('DATABASE_URL', { infer: true }),
    );
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.$connect();
      // The adapter's pool may be lazy; prove a connection before serving HTTP.
      await this.client.$queryRaw`SELECT 1`;
    } catch {
      await this.client.$disconnect();
      throw new Error(
        'PostgreSQL initialization failed; check database availability and configuration',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
