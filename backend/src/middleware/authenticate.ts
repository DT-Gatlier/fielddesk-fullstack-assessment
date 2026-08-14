import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { verifyAccessToken } from "../modules/auth/jwt";

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const authorization = req.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
      return res.status(401).json({
        error: {
          code: "UNAUTHENTICATED",
          message: "Authentication required",
        },
      });
    }

    const token = authorization.substring("Bearer ".length);

    const payload = verifyAccessToken(token);

    if (!payload.sub) {
      return res.status(401).json({
        error: {
          code: "INVALID_TOKEN",
          message: "Invalid authentication token",
        },
      });
    }

    const user = await prisma.user.findUnique({
      where: {
        id: payload.sub as string,
        organisationId: payload.organisationId,
      },
    });

    if (!user) {
      return res.status(401).json({
        error: {
          code: "USER_NOT_FOUND",
          message: "Authenticated user no longer exists",
        },
      });
    }

    req.user = {
      id: user.id,
      organisationId: user.organisationId,
      role: user.role,
      email: user.email,
      name: user.name,
    };

    return next();
  } catch {
    return res.status(401).json({
      error: {
        code: "INVALID_TOKEN",
        message: "Invalid or expired authentication token",
      },
    });
  }
};
