import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export const validate = (schema: ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      
      if (parsed.body !== undefined) req.body = parsed.body;
      if (parsed.query !== undefined) {
        Object.defineProperty(req, 'query', {
          value: parsed.query,
          enumerable: true,
          configurable: true,
          writable: true
        });
      }
      if (parsed.params !== undefined) {
        Object.defineProperty(req, 'params', {
          value: parsed.params,
          enumerable: true,
          configurable: true,
          writable: true
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
