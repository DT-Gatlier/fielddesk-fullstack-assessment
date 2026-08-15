import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof AppError) {
    logger.warn({ err, reqId: req.correlationId }, err.message);
    return res.status(err.statusCode).json({
      error: {
        message: err.message,
      },
    });
  }

  // Handle Zod validation errors (we'll implement the validate middleware soon)
  if (err.name === 'ZodError') {
    return res.status(400).json({
      error: {
        message: 'Validation failed',
        details: (err as any).errors,
      },
    });
  }

  // Unhandled errors
  logger.error({ err, reqId: req.correlationId }, 'Unhandled exception');
  res.status(500).json({
    error: {
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    },
  });
};
