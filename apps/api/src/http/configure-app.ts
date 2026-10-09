import type { INestApplication } from '@nestjs/common';
import { ForbiddenException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import type { Express, NextFunction, Response } from 'express';

import type { ApiEnvironment } from '../config/environment';
import { RedisService } from '../infrastructure/redis/redis.service';
import { AuthService } from '../modules/auth/services/auth.service';
import { ApiExceptionFilter, sendError } from './errors';
import type { SecurityRequest } from './interfaces/security-request.interface';
import { requestContextMiddleware } from './middleware/request-context.middleware';
import { securityMiddleware } from './middleware/security.middleware';
import { configureSwagger } from './swagger';

export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService<ApiEnvironment, true>);
  const server = app.getHttpAdapter().getInstance() as Express;
  server.disable('x-powered-by');
  server.set('trust proxy', false);
  app.use(requestContextMiddleware());
  app.enableCors({
    credentials: true,
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allowed?: boolean) => void,
    ) => {
      if (
        !origin ||
        config.get('ALLOWED_ORIGINS', { infer: true }).includes(origin)
      ) {
        callback(null, true);
      } else {
        callback(new ForbiddenException('Origin not allowed'));
      }
    },
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
    exposedHeaders: ['X-Request-ID', 'Retry-After'],
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.use(json({ limit: '16kb' }));
  app.use(cookieParser());

  app.use(
    securityMiddleware(app.get(AuthService), app.get(RedisService), config),
  );
  app.use(
    (
      error: unknown,
      request: SecurityRequest,
      response: Response,
      _next: NextFunction,
    ) => {
      void _next;
      sendError(error, request, response);
    },
  );
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      validationError: { target: false, value: false },
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  configureSwagger(app);
}
