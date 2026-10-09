import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { SESSION_COOKIE } from './cookie-policy';

export function configureSwagger(app: INestApplication): void {
  const document = new DocumentBuilder()
    .setTitle('FieldDesk API')
    .setVersion('1')
    .setDescription(
      'Cookie sessions. Bootstrap /api/v1/auth/csrf, login, then fetch fresh session-bound CSRF before mutations. Errors: { code, message, requestId, details? }.',
    )
    .addCookieAuth(SESSION_COOKIE, { type: 'apiKey', in: 'cookie' }, 'session')
    .build();
  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(app, document),
    { jsonDocumentUrl: 'docs-json' },
  );
}
