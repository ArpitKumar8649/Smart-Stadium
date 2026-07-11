import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { logger } from './logger.js';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = (req as { id?: string }).id ?? 'unknown';

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'validation_error',
        message: 'Request validation failed',
        details: err.flatten(),
        requestId,
      },
    });
    return;
  }

  const status = typeof (err as { statusCode?: number }).statusCode === 'number'
    ? (err as { statusCode: number }).statusCode
    : 500;
  const message = err instanceof Error ? err.message : 'Internal server error';

  logger.error({ err, requestId, path: req.path }, 'Unhandled error');

  res.status(status).json({
    error: {
      code: status === 500 ? 'internal_error' : 'request_error',
      message: status === 500 ? 'Internal server error' : message,
      requestId,
    },
  });
};
