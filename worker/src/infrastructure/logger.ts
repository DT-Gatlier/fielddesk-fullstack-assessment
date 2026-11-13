import { AsyncLocalStorage } from 'async_hooks';
import pino from 'pino';
import { config } from './config.js';

export interface LogContext {
  correlationId?: string;
  organisationId?: string;
  userId?: string;
  jobId?: string;
  [key: string]: any;
}

const asyncLocalStorage = new AsyncLocalStorage<LogContext>();

export function getLogContext(): LogContext | undefined {
  return asyncLocalStorage.getStore();
}

export function runWithLogContext<T>(context: LogContext, fn: () => T): T {
  return asyncLocalStorage.run(context, fn);
}

export const logger = pino({
  level: config.LOG_LEVEL,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  mixin() {
    const ctx = getLogContext();
    return ctx ? { ...ctx } : {};
  },
  redact: {
    paths: ['password', 'token', 'authorization'],
    censor: '[REDACTED]',
  },
});

