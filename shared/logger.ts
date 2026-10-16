import pino from 'pino';
import { config } from './config';

/** Structured JSON logger. Secrets and credentials are redacted at the source. */
export const logger = pino({
  level: config.LOG_LEVEL,
  base: { service: process.env.SERVICE_NAME ?? 'fielddesk' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      'password',
    ],
    censor: '[redacted]',
  },
});

export type Logger = typeof logger;
