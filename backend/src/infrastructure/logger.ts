import { AsyncLocalStorage } from 'async_hooks';
import pino, { DestinationStream, Logger } from 'pino';
import { config } from './config.js';

export interface LogContext {
  correlationId?: string;
  organisationId?: string;
  userId?: string;
  jobId?: string;
}

export const LOGGER_REDACT_PATHS = [
  'password',
  'token',
  'refreshToken',
  'accessToken',
  'authorization',
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.password',
  'req.body.token',
  'req.body.refreshToken',
  '*.password',
  '*.token',
  '*.refreshToken',
  '*.accessToken',
  '*.authorization',
];

const logContextStorage = new AsyncLocalStorage<LogContext>();

/**
 * Run an operation within an isolated AsyncLocalStorage log context.
 */
export function runWithLogContext<T>(ctx: LogContext, fn: () => T): T {
  const current = logContextStorage.getStore() || {};
  return logContextStorage.run({ ...current, ...ctx }, fn);
}

/**
 * Enrich the active log context (e.g., once authenticate middleware resolves JWT claims).
 */
export function updateLogContext(partial: Partial<LogContext>): void {
  const store = logContextStorage.getStore();
  if (store) {
    Object.assign(store, partial);
  }
}

/**
 * Read active context metadata merged into every Pino log line.
 */
export function getLogContext(): LogContext {
  return logContextStorage.getStore() || {};
}

export function createAppLogger(options?: {
  level?: string;
  destination?: DestinationStream;
}): Logger {
  const pinoOptions: pino.LoggerOptions = {
    level: options?.level ?? (config.NODE_ENV === 'test' ? 'silent' : config.LOG_LEVEL),
    redact: {
      paths: LOGGER_REDACT_PATHS,
      censor: '[REDACTED]',
    },
    formatters: {
      level: (label) => ({ level: label }),
    },
    mixin: () => {
      const ctx = logContextStorage.getStore();
      if (!ctx) return {};
      const fields: Record<string, string> = {};
      if (ctx.correlationId) fields.correlationId = ctx.correlationId;
      if (ctx.organisationId) fields.organisationId = ctx.organisationId;
      if (ctx.userId) fields.userId = ctx.userId;
      if (ctx.jobId) fields.jobId = ctx.jobId;
      return fields;
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  return options?.destination ? pino(pinoOptions, options.destination) : pino(pinoOptions);
}

export const logger = createAppLogger();
