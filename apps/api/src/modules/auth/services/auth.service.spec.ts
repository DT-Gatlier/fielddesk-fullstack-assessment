import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';

import { RedisService } from '../../../infrastructure/redis/redis.service';
import { AUTH_REPOSITORY } from '../interfaces/auth-repository.interface';
import type { AuthRepositoryPort } from '../interfaces/auth-repository.interface';
import { randomToken } from '../utils/token.util';
import { AuthService } from './auth.service';

describe('Security state resolution', () => {
  const repository: jest.Mocked<AuthRepositoryPort> = {
    findCredentials: jest.fn(),
    findSession: jest.fn(),
    issueSession: jest.fn(),
    revokeAll: jest.fn(),
    revoke: jest.fn(),
    tenantUser: jest.fn(),
  };
  const redis: jest.Mocked<
    Pick<RedisService, 'getAnonymous' | 'setAnonymous'>
  > = {
    getAnonymous: jest.fn(),
    setAnonymous: jest.fn(),
  };
  let module: TestingModule;
  let service: AuthService;
  beforeEach(async () => {
    jest.resetAllMocks();
    module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: AUTH_REPOSITORY, useValue: repository },
        { provide: RedisService, useValue: redis },
        { provide: ConfigService, useValue: new ConfigService() },
      ],
    }).compile();
    service = module.get(AuthService);
  });
  afterEach(async () => {
    await module.close();
  });
  it('never converts a database error into anonymous authentication', async () => {
    repository.findSession.mockRejectedValue(
      new Error('private_connection_password'),
    );
    await expect(service.resolveSecurityState(randomToken())).rejects.toThrow(
      'Authentication service unavailable',
    );
  });
  it('never converts Redis failure into fresh anonymous state', async () => {
    redis.getAnonymous.mockRejectedValue(
      new ServiceUnavailableException('Security service unavailable'),
    );
    await expect(
      service.resolveSecurityState(undefined, randomToken()),
    ).rejects.toThrow('Security service unavailable');
  });
  it('reuses existing state without replacing the token across tabs', async () => {
    expect(
      await service.bootstrapCsrf({
        csrfToken: 'existing-token',
        sessionId: 'session',
      }),
    ).toEqual({ csrfToken: 'existing-token' });
  });
});
