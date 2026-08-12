import type { ErrorRequestHandler, RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import multer from 'multer';
import { AppError } from './errors.js';

export const requestContext: RequestHandler = (request, response, next) => {
  const incoming = request.header('x-request-id');
  request.requestId = incoming && incoming.length <= 128 ? incoming : randomUUID();
  response.setHeader('x-request-id', request.requestId);
  next();
};

export const notFoundHandler: RequestHandler = (_request, _response, next) => {
  next(new AppError(404, 'NOT_FOUND', 'Route not found'));
};

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  void _next;
  if (error instanceof ZodError) {
    response.status(422).json({
      error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: error.flatten() },
      requestId: request.requestId
    });
    return;
  }

  if (error instanceof multer.MulterError) {
    response.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
      error: { code: 'UPLOAD_ERROR', message: error.code === 'LIMIT_FILE_SIZE' ? 'File exceeds the configured size limit' : error.message },
      requestId: request.requestId
    });
    return;
  }

  if (error instanceof AppError) {
    response.status(error.status).json({
      error: { code: error.code, message: error.message, ...(error.details === undefined ? {} : { details: error.details }) },
      requestId: request.requestId
    });
    return;
  }

  const databaseError = error as { code?: string; constraint?: string; detail?: string };
  if (databaseError.code === '23505') {
    response.status(409).json({ error: { code: 'CONFLICT', message: 'A record with this value already exists', details: { constraint: databaseError.constraint } }, requestId: request.requestId });
    return;
  }
  if (databaseError.code === '23503' || databaseError.code === '23514' || databaseError.code === '22P02') {
    response.status(422).json({ error: { code: 'DATABASE_VALIDATION_ERROR', message: 'The request violates a data constraint', details: { constraint: databaseError.constraint } }, requestId: request.requestId });
    return;
  }

  request.log?.error({ err: error, requestId: request.requestId }, 'unhandled request error');
  response.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    requestId: request.requestId
  });
};
