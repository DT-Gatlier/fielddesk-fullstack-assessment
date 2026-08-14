import type { NextFunction, Request, Response } from "express";
import crypto from "node:crypto";

export const requestId = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const incomingRequestId = req.header("X-Request-ID");

  const id = incomingRequestId || crypto.randomUUID();

  res.setHeader("X-Request-ID", id);

  req.requestId = id;

  next();
};