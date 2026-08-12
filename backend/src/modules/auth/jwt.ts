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
  const payload = jwt.verify(token, env.jwt.secret);

  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof payload.sub !== "string" ||
    typeof payload.organisationId !== "string" ||
    typeof payload.role !== "string"
  ) {
    throw new Error("Invalid JWT payload");
  }

  return {
    sub: payload.sub,
    organisationId: payload.organisationId,
    role: payload.role as UserRole,
  };
}