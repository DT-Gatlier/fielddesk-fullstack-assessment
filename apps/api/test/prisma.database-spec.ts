import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { createDatabaseClient } from '@fielddesk/database';
import { DatabaseModule } from '../src/database/database.module';
import { PrismaService } from '../src/database/prisma.service';

describe('Prisma provider with real PostgreSQL', () => {
  it('connects during initialization and releases its connection on close', async () => {
    const observer = createDatabaseClient(process.env.TEST_DATABASE_URL!);
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        DatabaseModule,
      ],
    }).compile();
    try {
      await module.init();
      const service = module.get(PrismaService);
      const [{ pid }] = await service.client.$queryRaw<
        { pid: number }[]
      >`SELECT pg_backend_pid() AS pid`;
      expect(await service.client.user.count()).toBeGreaterThan(0);
      await module.close();
      const [{ active }] = await observer.$queryRaw<
        { active: boolean }[]
      >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid = ${pid}) AS active`;
      expect(active).toBe(false);
    } finally {
      await module.close();
      await observer.$disconnect();
    }
  });

  it('rejects unreachable PostgreSQL with a safe error within a finite bound', async () => {
    const started = Date.now();
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          skipProcessEnv: true,
          load: [
            () => ({
              DATABASE_URL:
                'postgresql://user:secret_marker@127.0.0.1:1/fielddesk_test',
            }),
          ],
        }),
        DatabaseModule,
      ],
    }).compile();
    try {
      await expect(module.init()).rejects.toThrow(
        /^PostgreSQL initialization failed; check database availability and configuration$/,
      );
      expect(Date.now() - started).toBeLessThan(8000);
    } finally {
      await module.get(PrismaService).onModuleDestroy();
    }
  });
});
