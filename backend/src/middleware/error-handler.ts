import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { logger } from "../config/logger";

export const errorHandler = (
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  logger.error(
    { 
        err: error,
        requestId: req.requestId,
        method: req.method,
        url: req.originalUrl, 
    }, 
    "Unhandled application error"
);

  if (res.headersSent) {
    return;
  }

  // Zod validation error
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request data",
        details: error.flatten(),
      },
    });
  }

  // Prisma known request errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // Unique constraint violation
    if (error.code === "P2002") {
      return res.status(409).json({
        error: {
          code: "CONFLICT",
          message: "A record with the same value already exists",
        },
      });
    }

    // Foreign key violation
    if (error.code === "P2003") {
      return res.status(400).json({
        error: {
          code: "INVALID_REFERENCE",
          message: "The referenced resource does not exist",
        },
      });
    }

    // Record not found
    if (error.code === "P2025") {
      return res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: "The requested resource was not found",
        },
      });
    }

    // Other known Prisma errors
    return res.status(500).json({
      error: {
        code: "DATABASE_ERROR",
        message: "A database error occurred",
      },
    });
  }

  // Prisma validation errors
  if (error instanceof Prisma.PrismaClientValidationError) {
    return res.status(500).json({
      error: {
        code: "DATABASE_VALIDATION_ERROR",
        message: "A database validation error occurred",
      },
    });
  }

  // Generic unexpected error
  return res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred",
    },
  });
};