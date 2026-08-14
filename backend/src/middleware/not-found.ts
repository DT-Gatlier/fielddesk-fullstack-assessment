import type { Request, Response } from "express";

export const notFoundHandler = (
  req: Request,
  res: Response,
) => {
  return res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `Route ${req.method} ${req.originalUrl} not found`,
    },
  });
};