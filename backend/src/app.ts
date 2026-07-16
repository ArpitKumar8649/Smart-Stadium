import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { logger } from './middleware/logger.js';
import { errorHandler } from './middleware/error.js';
import { healthRouter } from './routes/health.js';
import { chatRouter } from './routes/chat.js';
import { crowdRouter } from './routes/crowd.js';
import { navigationRouter } from './routes/navigation.js';
import { visionRouter } from './routes/vision.js';
import { adminRouter } from './routes/admin.js';
import { alertsRouter } from './routes/alerts.js';
import { audioRouter } from './routes/audio.js';

/**
 * Build the HTTP application without binding a port. Keeping this separate from
 * server startup makes the public API straightforward to validate in-process.
 */
export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // Security headers. contentSecurityPolicy is off here because the API serves
  // JSON/SSE only; Firebase Hosting owns frontend browser headers.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(compression());

  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req.headers['x-request-id'] as string | undefined) ?? crypto.randomUUID(),
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    }),
  );

  app.use(
    cors({
      origin: env.allowedOrigins,
      credentials: true,
    }),
  );

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: false }));

  const globalLimiter = rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  });
  const chatLimiter = rateLimit({
    windowMs: 60_000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'rate_limited', message: 'Too many requests — give Concourse a moment.' } },
  });
  // These endpoints both consume paid/quota-limited upstream AI resources.
  const mediaAiLimiter = rateLimit({
    windowMs: 60_000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'rate_limited', message: 'Too many media requests — please try again shortly.' } },
  });
  const ttsLimiter = rateLimit({
    windowMs: 60_000,
    limit: 12,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'rate_limited', message: 'Too many operator speech requests — please try again shortly.' } },
  });
  const adminAuthLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 5,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'rate_limited', message: 'Too many passcode attempts. Please wait before trying again.' } },
  });
  app.use('/api', globalLimiter);
  app.use('/api/chat', chatLimiter);
  app.use('/api/vision', mediaAiLimiter);
  app.use('/api/audio/tts', ttsLimiter);
  // Apply the failed-credential budget before every requireAdmin boundary;
  // limiting only the UI preflight leaves protected mutations guessable.
  app.use('/api/admin', adminAuthLimiter);
  app.use('/api/audio/tts', adminAuthLimiter);

  app.use('/api', healthRouter);
  app.use('/api', chatRouter);
  app.use('/api', crowdRouter);
  app.use('/api', navigationRouter);
  app.use('/api', visionRouter);
  app.use('/api', adminRouter);
  app.use('/api', alertsRouter);
  app.use('/api', audioRouter);

  app.use('*', (_req, res) => {
    res.status(404).json({
      error: { code: 'not_found', message: 'Route not found' },
    });
  });

  app.use(errorHandler);
  return app;
}
