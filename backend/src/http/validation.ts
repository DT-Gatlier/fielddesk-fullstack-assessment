import type { z } from 'zod';
import { validationError } from './errors.js';

/**
 * Central request validation. Every route passes its body, params and query through a zod
 * schema here, so invalid input always produces the same 400 VALIDATION_FAILED response.
 */
export function parse<S extends z.ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw validationError(
      result.error.issues.map((issue) => ({
        path: issue.path.join('.') || undefined,
        message: issue.message,
      })),
    );
  }
  return result.data;
}
