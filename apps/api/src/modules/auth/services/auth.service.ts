import {
  Inject,
  Injectable,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash, verify, argon2id } from 'argon2';

import type { TenantContext } from '../../../common/interfaces/tenant-context.interface';
import type { ApiEnvironment } from '../../../config/environment';
import { RedisService } from '../../../infrastructure/redis/redis.service';
import type { Identity } from '../interfaces/auth-identity.interface';
import type {
  LoginInput,
  LoginResult,
} from '../interfaces/auth-login.interface';
import { AUTH_REPOSITORY } from '../interfaces/auth-repository.interface';
import type {
  AuthRepositoryPort,
  Credentials,
  ResolvedSession,
} from '../interfaces/auth-repository.interface';
import type {
  SecurityState,
  CsrfBootstrapResult,
} from '../interfaces/auth-security-state.interface';
import { toIdentity } from '../mappers/identity.mapper';
import { isActiveSession, sessionExpiry } from '../utils/session.util';
import { digest, randomToken, isOpaqueToken } from '../utils/token.util';

@Injectable()
export class AuthService implements OnModuleInit {
  private dummyHash!: string;

  constructor(
    @Inject(AUTH_REPOSITORY) private readonly repository: AuthRepositoryPort,
    private readonly redis: RedisService,
    private readonly config: ConfigService<ApiEnvironment, true>,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await hash(randomToken(), {
      type: argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  async resolveSecurityState(
    sessionToken?: string,
    anonymousToken?: string,
  ): Promise<SecurityState> {
    const state: SecurityState = { staleSession: Boolean(sessionToken) };
    if (isOpaqueToken(sessionToken)) {
      let session: ResolvedSession | null;
      try {
        session = await this.repository.findSession(digest(sessionToken));
      } catch {
        throw new ServiceUnavailableException(
          'Authentication service unavailable',
        );
      }
      if (isActiveSession(session)) {
        const user = session.user;
        return {
          sessionId: session.id,
          csrfToken: session.csrfToken,
          identity: toIdentity(user),
        };
      }
    }
    if (isOpaqueToken(anonymousToken)) {
      state.anonymousHash = digest(anonymousToken);
      state.csrfToken =
        (await this.redis.getAnonymous(state.anonymousHash)) ?? undefined;
    }
    return state;
  }

  async bootstrapCsrf(state: SecurityState): Promise<CsrfBootstrapResult> {
    if (state.csrfToken) {
      return { csrfToken: state.csrfToken };
    }
    const anonymousToken = randomToken();
    const csrfToken = randomToken();
    await this.redis.setAnonymous(digest(anonymousToken), csrfToken);
    return { anonymousToken, csrfToken };
  }

  async login(input: LoginInput, state: SecurityState): Promise<LoginResult> {
    try {
      const credentials = await this.repository.findCredentials(input.email);
      const user = await this.verifyCredentials(credentials, input.password);
      const token = randomToken();
      const expiresAt = sessionExpiry(
        this.config.get('SESSION_TTL_SECONDS', { infer: true }),
      );
      // Fail before issuing a session if anonymous-state invalidation is unavailable.
      if (state.anonymousHash) {
        await this.redis.deleteAnonymous(state.anonymousHash);
      }
      const identity = await this.repository.issueSession({
        verified: user,
        tokenHash: digest(token),
        csrfToken: randomToken(),
        expiresAt,
        previousSessionId: state.sessionId,
      });
      return { identity, token, expiresAt };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }
      throw new ServiceUnavailableException(
        'Authentication service unavailable',
      );
    }
  }

  async revokeAllSessions(userId: string): Promise<void> {
    try {
      await this.repository.revokeAll(userId);
    } catch {
      throw new ServiceUnavailableException(
        'Authentication service unavailable',
      );
    }
  }

  findTenantUser(context: TenantContext, userId: string): Promise<Identity> {
    return this.repository.tenantUser({
      organisationId: context.organisationId,
      userId,
    });
  }

  async logout(state: SecurityState): Promise<void> {
    try {
      if (state.sessionId) {
        await this.repository.revoke(state.sessionId);
      }
      if (state.anonymousHash) {
        await this.redis.deleteAnonymous(state.anonymousHash);
      }
    } catch {
      throw new ServiceUnavailableException(
        'Authentication service unavailable',
      );
    }
  }

  private async verifyCredentials(
    user: Credentials | null,
    password: string,
  ): Promise<Credentials> {
    const valid = await verify(user?.passwordHash ?? this.dummyHash, password);
    if (!user || !valid) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return user;
  }
}
