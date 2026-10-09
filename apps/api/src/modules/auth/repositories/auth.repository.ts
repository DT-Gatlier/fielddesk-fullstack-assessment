import type { Prisma } from '@fielddesk/database';
import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { PrismaService } from '../../../database/prisma.service';
import type { Identity } from '../interfaces/auth-identity.interface';
import type {
  AuthRepositoryPort,
  Credentials,
  IssueSessionInput,
  ResolvedSession,
  TenantUserInput,
} from '../interfaces/auth-repository.interface';

const identitySelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  organisation: { select: { id: true, name: true } },
} as const;
const sessionUserSelect = { ...identitySelect, authVersion: true } as const;
@Injectable()
export class AuthRepository implements AuthRepositoryPort {
  constructor(private readonly database: PrismaService) {}

  findCredentials(email: string): Promise<Credentials | null> {
    return this.database.client.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true, authVersion: true },
    });
  }

  findSession(tokenHash: string): Promise<ResolvedSession | null> {
    return this.database.client.session.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        csrfToken: true,
        expiresAt: true,
        revokedAt: true,
        authVersion: true,
        user: { select: sessionUserSelect },
      },
    });
  }

  async issueSession(input: IssueSessionInput): Promise<Identity> {
    const { verified, tokenHash, csrfToken, expiresAt, previousSessionId } =
      input;
    return this.database.client.$transaction(async (transaction) => {
      await this.lockUser(transaction, verified.id);
      const current = await transaction.user.findUnique({
        where: { id: verified.id },
        select: { id: true, passwordHash: true, authVersion: true },
      });
      if (
        !current ||
        current.passwordHash !== verified.passwordHash ||
        current.authVersion !== verified.authVersion
      ) {
        throw new UnauthorizedException('Invalid email or password');
      }
      if (previousSessionId) {
        await transaction.session.updateMany({
          where: { id: previousSessionId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await transaction.session.create({
        data: {
          userId: current.id,
          tokenHash,
          csrfToken,
          expiresAt,
          authVersion: current.authVersion,
        },
      });
      return transaction.user.findUniqueOrThrow({
        where: { id: current.id },
        select: identitySelect,
      });
    });
  }

  private async lockUser(
    transaction: Prisma.TransactionClient,
    userId: string,
  ): Promise<void> {
    await transaction.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
  }

  async revokeAll(
    userId: string,
    transaction?: Prisma.TransactionClient,
  ): Promise<void> {
    const revoke = async (client: Prisma.TransactionClient): Promise<void> => {
      await this.lockUser(client, userId);
      await client.user.update({
        where: { id: userId },
        data: { authVersion: { increment: 1 } },
      });
      await client.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    };
    if (transaction) {
      await revoke(transaction);
    } else {
      await this.database.client.$transaction(revoke);
    }
  }

  async revoke(sessionId: string): Promise<void> {
    await this.database.client.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  // Reused by owner management later; never accepts an organisation from HTTP input.
  async tenantUser(input: TenantUserInput): Promise<Identity> {
    const user = await this.database.client.user.findFirst({
      where: { id: input.userId, organisationId: input.organisationId },
      select: identitySelect,
    });
    if (!user) {
      throw new NotFoundException('Resource not found');
    }
    return user;
  }
}
