import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../config/prisma";

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error("JWT_SECRET is not configured");
  return secret;
};

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const token = req.cookies?.fielddesk_session;

    if (!token) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    const decoded = jwt.verify(token, getJwtSecret()) as {
      sub: string;
      organisationId: string;
      role: "OWNER" | "DISPATCHER" | "TECHNICIAN";
    };

    if (
      !decoded ||
      !decoded.sub ||
      !decoded.organisationId ||
      !["OWNER", "DISPATCHER", "TECHNICIAN"].includes(decoded.role)
    ) {
      res.status(401).json({
        success: false,
        message: "Invalid authentication token",
      });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.sub }, select: { id: true, organisationId: true, role: true } });
    if (!user || user.organisationId !== decoded.organisationId || user.role !== decoded.role) {
      res.status(401).json({ success: false, message: "Session is no longer valid" });
      return;
    }
    req.auth = { userId: user.id, organisationId: user.organisationId, role: user.role };

    next();
  } catch {
    res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
}

