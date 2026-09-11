import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "SCHEDULING_CONFLICT"
  | "STORAGE_QUOTA_EXCEEDED"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number,
    public readonly details?: unknown[],
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function sendError(
  reply: FastifyReply,
  request: FastifyRequest,
  code: ErrorCode,
  message: string,
  statusCode: number,
  details?: unknown[],
) {
  return reply.status(statusCode).send({
    error: {
      code,
      message,
      details: details ?? [],
      correlationId: request.id,
    },
  });
}

export function registerErrorHandler(app: {
  setErrorHandler: (
    handler: (
      error: FastifyError | AppError,
      request: FastifyRequest,
      reply: FastifyReply,
    ) => void | Promise<void>,
  ) => void;
}): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      void sendError(
        reply,
        request,
        error.code,
        error.message,
        error.statusCode,
        error.details,
      );
      return;
    }

    if (error instanceof ZodError) {
      void sendError(
        reply,
        request,
        "VALIDATION_ERROR",
        "Request validation failed",
        400,
        error.issues,
      );
      return;
    }

    if (error.validation) {
      void sendError(
        reply,
        request,
        "VALIDATION_ERROR",
        "Request validation failed",
        400,
        error.validation,
      );
      return;
    }

    if (error.code === "FST_REQ_FILE_TOO_LARGE") {
      void sendError(
        reply,
        request,
        "VALIDATION_ERROR",
        "Uploaded file exceeds the maximum allowed size",
        400,
      );
      return;
    }

    if (error.code === "FST_ERR_CTP_EMPTY_JSON_BODY") {
      void sendError(
        reply,
        request,
        "VALIDATION_ERROR",
        "Request body cannot be empty when Content-Type is application/json",
        400,
      );
      return;
    }

    request.log.error({ err: error }, "Unhandled error");
    void sendError(
      reply,
      request,
      "INTERNAL_ERROR",
      "An unexpected error occurred",
      500,
    );
  });
}
