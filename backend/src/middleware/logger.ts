import pino, { type LoggerOptions } from 'pino';
import { env } from '../config/env.js';

const baseOptions: LoggerOptions = {
  level: env.LOG_LEVEL,
  base: { app: 'concourse-backend' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.image_b64',
      'req.body.imageBase64',
      'GEMINI_API_KEY',
      'FIREBASE_SERVICE_ACCOUNT_JSON',
    ],
    censor: '[REDACTED]',
  },
};

const options: LoggerOptions = env.isDev
  ? {
      ...baseOptions,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss' },
      },
    }
  : baseOptions;

export const logger = pino(options);
