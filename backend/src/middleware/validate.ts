import type { Request } from 'express';
import { z, type ZodTypeAny } from 'zod';

/**
 * Centralised input validation. Handlers call these instead of touching
 * req.body/req.query/req.params directly; a ZodError is turned into a
 * 400 VALIDATION_FAILED response by the error handler.
 */
export const parseBody = <S extends ZodTypeAny>(req: Request, schema: S): z.infer<S> => schema.parse(req.body ?? {});
export const parseQuery = <S extends ZodTypeAny>(req: Request, schema: S): z.infer<S> => schema.parse(req.query);
export const parseParams = <S extends ZodTypeAny>(req: Request, schema: S): z.infer<S> => schema.parse(req.params);

export const uuidParam = z.object({ id: z.string().uuid({ message: 'must be a valid UUID' }) });

/** ISO-8601 timestamp that must include a timezone offset (e.g. "Z" or "+05:30"). */
export const isoDateTime = z
  .string()
  .datetime({ offset: true, message: 'must be an ISO-8601 timestamp with timezone' })
  .transform((s) => new Date(s));
