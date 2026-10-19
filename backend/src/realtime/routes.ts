import type { FastifyInstance } from 'fastify';
import { authenticate, SESSION_COOKIE } from '../auth/guards.js';
import { resolveSession } from '../auth/sessions.js';
import { forbidden } from '../http/errors.js';
import type { RealtimeClient } from './hub.js';

export async function realtimeRoutes(app: FastifyInstance, options: { heartbeatMs: number }): Promise<void> {
  app.get(
    '/api/realtime',
    {
      websocket: true,
      preHandler: [
        // Browsers attach cookies to cross-site WebSocket handshakes and CORS does not apply, so the
        // Origin check is what prevents cross-site WebSocket hijacking.
        async (request) => {
          const origin = request.headers.origin;
          if (origin && origin !== app.config.WEB_ORIGIN) throw forbidden('Cross-origin WebSocket rejected.');
        },
        authenticate,
      ],
    },
    (socket, request) => {
      const token = request.cookies[SESSION_COOKIE]!;
      const client: RealtimeClient = { socket, auth: request.auth!, alive: true };
      const log = request.log.child({ realtime: true });

      app.realtime.add(client);
      log.info({ connections: app.realtime.connectionCount }, 'real-time client connected');
      socket.send(JSON.stringify({ type: 'connected', at: new Date().toISOString() }));

      socket.on('pong', () => {
        client.alive = true;
      });
      // The channel is server-to-client only.
      socket.on('message', () => undefined);

      // Heartbeat: drop dead connections, and re-check the session so logout, expiry, deactivation and
      // role changes apply to open sockets too.
      const heartbeat = setInterval(() => {
        if (!client.alive) {
          socket.terminate();
          return;
        }
        client.alive = false;
        socket.ping();
        resolveSession(app.pg, token)
          .then((current) => {
            if (!current || current.orgId !== client.auth.orgId) socket.close(4401, 'session ended');
            else client.auth = current;
          })
          .catch((error) => log.warn({ err: error }, 'session re-check failed'));
      }, options.heartbeatMs);

      socket.on('close', () => {
        clearInterval(heartbeat);
        app.realtime.remove(client);
        log.info({ connections: app.realtime.connectionCount }, 'real-time client disconnected');
      });
    },
  );
}
