import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authOf, requireRole, SESSION_COOKIE } from '../auth/guards.js';
import { hashToken } from '../auth/sessions.js';
import { validationError } from '../http/errors.js';
import { parse } from '../http/validation.js';
import { toWorkOrder } from '../work-orders/model.js';
import { submitProgressEvent, type ProgressEvent } from './service.js';

const MAX_FUTURE_SKEW_MS = 5 * 60_000;
const MAX_AGE_MS = 30 * 24 * 3_600_000;

const base = {
  eventId: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9._:-]+$/, 'May contain only letters, digits and . _ : -'),
  workOrderId: z.string().uuid(),
  occurredAt: z.string().datetime({ offset: true, message: 'Must be an ISO 8601 date-time with a timezone.' }),
};

const note = z.string().trim().max(2000);

// The whole request is untrusted: unknown types, unknown fields and malformed payloads are rejected.
const eventSchema = z.discriminatedUnion('type', [
  z
    .object({
      ...base,
      type: z.literal('status_changed'),
      payload: z.object({ status: z.enum(['in_progress', 'on_hold', 'completed']), note: note.optional() }).strict(),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal('note_added'),
      payload: z.object({ note: note.min(1) }).strict(),
    })
    .strict(),
]);

export async function progressEventRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/api/progress-events',
    {
      preHandler: requireRole('technician'),
      config: {
        rateLimit: {
          max: app.config.EVENT_RATE_LIMIT_MAX,
          timeWindow: app.config.EVENT_RATE_LIMIT_WINDOW,
          // Per session where possible (several technicians can share an office IP), else per IP.
          keyGenerator: (request) => {
            const token = request.cookies[SESSION_COOKIE];
            return token ? `events:s:${hashToken(token).toString('hex').slice(0, 32)}` : `events:ip:${request.ip}`;
          },
        },
      },
    },
    async (request, reply) => {
      const auth = authOf(request);
      const event = parse(eventSchema, request.body) as ProgressEvent;

      const occurredAt = Date.parse(event.occurredAt);
      if (occurredAt > Date.now() + MAX_FUTURE_SKEW_MS || occurredAt < Date.now() - MAX_AGE_MS) {
        throw validationError([{ path: 'occurredAt', message: 'Must be within the last 30 days and not in the future.' }]);
      }

      const { outcome, row, effects } = await submitProgressEvent(app.pg, auth, event, request.id);
      if (outcome !== 'duplicate') {
        await effects.dispatch({ queue: app.notificationQueue, redis: app.redis, log: request.log });
      }

      request.log.info({ eventId: event.eventId, workOrderId: row.id, outcome }, 'progress event processed');
      return reply
        .status(outcome === 'duplicate' ? 200 : 201)
        .header('idempotent-replayed', outcome === 'duplicate' ? 'true' : 'false')
        .send({ data: { eventId: event.eventId, outcome, workOrder: toWorkOrder(row) } });
    },
  );
}
