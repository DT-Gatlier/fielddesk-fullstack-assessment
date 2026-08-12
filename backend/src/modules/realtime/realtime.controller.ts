import type { RequestHandler } from 'express';
import type { RuntimeServices } from '../../infrastructure/runtime.js';
import { getIdentity } from '../auth/auth.middleware.js';

export function eventStream(runtime: RuntimeServices): RequestHandler {
  return (request, response) => {
    const identity = getIdentity(request.identity);
    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();
    response.write(`event: connected\ndata: ${JSON.stringify({ organisationId: identity.organisationId, retry: 3000 })}\n\n`);
    const detach = runtime.attachEventStream(identity.organisationId, response);
    const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), 20_000);
    request.on('close', () => { clearInterval(heartbeat); detach(); });
  };
}
