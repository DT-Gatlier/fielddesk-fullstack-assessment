import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { pinoHttp } from 'pino-http';
import { logger } from '../../../shared/logger';

const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * Correlation IDs + structured access logs.
 * An incoming X-Request-Id is reused when well-formed (so IDs flow from a
 * gateway or the frontend), otherwise a new UUID is generated. The ID is
 * echoed in the X-Request-Id response header, included in every log line for
 * the request, in every error body, stored on audit entries, and passed to
 * background jobs created by the request.
 */
export const requestContext = pinoHttp({
  logger,
  genReqId(req: IncomingMessage, res: ServerResponse) {
    const incoming = req.headers['x-request-id'];
    const id = typeof incoming === 'string' && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },
  customProps: (req) => ({ requestId: String(req.id) }),
  // Health probes would drown out useful logs.
  autoLogging: { ignore: (req) => req.url === '/healthz' || req.url === '/readyz' },
  customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
  serializers: {
    req: (req) => ({ method: req.method, url: req.url, userAgent: req.headers?.['user-agent'] }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});
