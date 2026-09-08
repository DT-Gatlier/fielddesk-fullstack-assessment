import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import { AppError } from "../lib/errors.js";
import type { UserRole } from "../types/auth.js";

const ACCESS_TOKEN_COOKIE = "access_token";

export function getAccessTokenCookieName(): string {
  return ACCESS_TOKEN_COOKIE;
}

export const authenticate: preHandlerHookHandler = async (request, reply) => {
  const token = request.cookies[ACCESS_TOKEN_COOKIE];

  if (!token) {
    throw new AppError("UNAUTHORIZED", "Authentication required", 401);
  }

  try {
    const payload = await request.server.jwt.verify<{
      sub: string;
      org: string;
      role: UserRole;
      email: string;
    }>(token);

    request.auth = {
      userId: payload.sub,
      organisationId: payload.org,
      role: payload.role,
      email: payload.email,
    };
  } catch {
    throw new AppError("UNAUTHORIZED", "Invalid or expired session", 401);
  }

  if (reply.sent) {
    return;
  }
};

export function requireRole(...roles: UserRole[]): preHandlerHookHandler {
  return async (request) => {
    if (!request.auth) {
      throw new AppError("UNAUTHORIZED", "Authentication required", 401);
    }

    if (!roles.includes(request.auth.role)) {
      throw new AppError("FORBIDDEN", "Insufficient permissions", 403);
    }
  };
}

export function setAuthCookie(
  reply: FastifyReply,
  token: string,
  secure: boolean,
): void {
  reply.setCookie(ACCESS_TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
  });
}

export function clearAuthCookie(reply: FastifyReply): void {
  reply.clearCookie(ACCESS_TOKEN_COOKIE, { path: "/" });
}
