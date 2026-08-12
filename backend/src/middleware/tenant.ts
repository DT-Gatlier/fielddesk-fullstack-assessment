import type { NextFunction, Request, Response } from "express";

export const requireTenant = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!req.user?.organisationId) {
    return res.status(401).json({
      error: {
        code: "TENANT_CONTEXT_MISSING",
        message: "Organisation context is missing",
      },
    });
  }

  return next();
};
