import jwt from "jsonwebtoken";
import type { UserRole } from "@prisma/client";
import { env } from "../../config/env";

export interface JwtPayload {
  sub: string;
  organisationId: string;
  role: UserRole;
}

export function generateAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn,
  });
}

export function verifyAccessToken(token: string): JwtPayload {
  const payload = jwt.verify(token, env.jwt.secret, {
    algorithms: ["HS256"],
  });

  if (typeof payload === "string") {
    throw new Error("Invalid JWT payload");
  }

  if (
    !payload.sub ||
    !payload.organisationId ||
    !payload.role
  ) {
    throw new Error("Invalid JWT payload");
  }

  return {
    sub: payload.sub,
    organisationId: payload.organisationId,
    role: payload.role,
  };
}