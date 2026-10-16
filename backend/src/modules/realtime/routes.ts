import { Router } from 'express';
import { pool } from '../../../../shared/db';
import type { AppDeps } from '../../deps';
import { resolveSession, SESSION_COOKIE } from '../../lib/session';
import { authOf } from '../../middleware/auth';

const HEARTBEAT_MS = Number(process.env.SSE_HEARTBEAT_MS ?? 25_000);

/**
 * GET /api/realtime/stream — Server-Sent Events.
 * Authenticated by the same httpOnly session cookie as the rest of the API
 * (EventSource sends cookies for same-origin requests). The organisation and
 * technician filter come from the session, never from the URL.
 */
export function realtimeRouter(deps: AppDeps): Router {
  const router = Router();

  router.get('/stream', (req, res) => {
    const auth = authOf(req);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // disable proxy buffering (nginx)
    });
    res.flushHeaders();
    // Browser EventSource reconnects automatically after this delay.
    res.write('retry: 3000\n\n');

    let closed = false;
    const conn = deps.realtime.add({
      orgId: auth.orgId,
      technicianId: auth.role === 'technician' ? auth.userId : null,
      send(event, data) {
        if (!closed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      },
      close() {
        cleanup();
        res.end();
      },
    });
    conn.send('ready', { connectionId: conn.id, realtime: deps.realtime.isHealthy ? 'ok' : 'degraded' });
    req.log.info({ connectionId: conn.id }, 'realtime connection opened');

    // Heartbeat keeps proxies from timing the stream out, and re-validates the
    // session so a logged-out or deactivated user stops receiving events.
    const heartbeat = setInterval(async () => {
      const token = req.cookies?.[SESSION_COOKIE];
      const still = typeof token === 'string' ? await resolveSession(pool, token).catch(() => null) : null;
      if (!still || still.orgId !== auth.orgId) {
        conn.send('session_expired', {});
        conn.close();
        return;
      }
      if (!closed) res.write(': heartbeat\n\n');
    }, HEARTBEAT_MS);
    heartbeat.unref();

    function cleanup() {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      deps.realtime.remove(conn);
    }
    req.on('close', () => {
      cleanup();
      req.log.info({ connectionId: conn.id }, 'realtime connection closed');
    });
  });

  return router;
}
