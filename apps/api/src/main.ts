import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import type { ApiEnvironment } from './config/environment';
import { configureApp } from './http/configure-app';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  configureApp(app);
  app.enableShutdownHooks();
  const config = app.get(ConfigService<ApiEnvironment, true>);
  await app.listen(config.get('PORT', { infer: true }));
}
void bootstrap();
