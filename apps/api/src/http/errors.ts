import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import type { Response } from 'express';

import type { SecurityRequest } from './interfaces/security-request.interface';

export function sendError(
  error: unknown,
  request: SecurityRequest,
  response: Response,
): void {
  const status = errorStatus(error);
  const codes: Record<number, string> = {
    400: 'VALIDATION_ERROR',
    401: 'UNAUTHENTICATED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    413: 'PAYLOAD_TOO_LARGE',
    415: 'UNSUPPORTED_MEDIA_TYPE',
    429: 'RATE_LIMITED',
    503: 'SERVICE_UNAVAILABLE',
  };
  let message = defaultMessage(status);
  let details: string[] | undefined;
  if (error instanceof HttpException) {
    const body = error.getResponse();
    if (typeof body === 'string') {
      message = body;
    } else if ('message' in body) {
      if (typeof body.message === 'string') {
        message = body.message;
      } else if (
        Array.isArray(body.message) &&
        body.message.every((item: unknown) => typeof item === 'string')
      ) {
        message = 'Invalid request';
        details = body.message;
      }
    }
  } else if (isMulterError(error)) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      message = 'File size exceeds maximum allowed limit of 10MB';
    } else {
      message = error.message || 'File upload error';
    }
  } else {
    // Log unexpected non-HttpException 500 internal errors for debugging
    process.stderr.write(
      `[Unhandled Exception] [${request.requestId ?? 'unknown'}] ${
        error instanceof Error ? error.stack || error.message : String(error)
      }\n`,
    );
  }
  response.status(status).json({
    code: codes[status] ?? 'INTERNAL_ERROR',
    message,
    requestId: request.requestId,
    ...(details ? { details } : {}),
  });
}

function isMulterError(error: unknown): error is { name: string; code: string; message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'MulterError' &&
    'code' in error
  );
}

function errorStatus(error: unknown): number {
  if (error instanceof HttpException) {
    return error.getStatus();
  }
  if (typeof error !== 'object' || error === null) {
    return 500;
  }
  if (isMulterError(error)) {
    return error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
  }
  if ('status' in error && error.status === 413) {
    return 413;
  }
  if ('type' in error && error.type === 'entity.parse.failed') {
    return 400;
  }
  return 500;
}

function defaultMessage(status: number): string {
  if (status === 413) {
    return 'Payload exceeds size limit';
  }
  if (status === 400) {
    return 'Invalid request';
  }
  return 'Internal server error';
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    sendError(
      error,
      http.getRequest<SecurityRequest>(),
      http.getResponse<Response>(),
    );
  }
}
