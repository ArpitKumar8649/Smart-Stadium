import express from 'express';
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
import { getCrowdSimulator } from './services/crowd/simulator.js';
import { attachAsrWebSocket } from './services/audio/asr.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// Security headers. contentSecurityPolicy off here because the API serves JSON/SSE
// only; the frontend (Firebase Hosting) sets its own CSP.
app.use(helmet({ contentSecurityPolicy: false }));

// gzip responses (JSON heatmap/route payloads compress well). SSE is skipped
// automatically by compression when it sees text/event-stream.
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

// Rate limits. A generous global limit protects the instance; the chat endpoint
// (which fans out to the LLM) gets a tighter per-IP budget to guard the free tier.
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
app.use('/api', globalLimiter);
app.use('/api/chat', chatLimiter);

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

const port = env.PORT;
const server = app.listen(port, () => {
  logger.info(
    { port, env: env.NODE_ENV, allowedOrigins: env.allowedOrigins },
    `🏟  Concourse backend listening on :${port}`,
  );
  // Boot the crowd simulator so /api/crowd and the low_crowd routing mode are live.
  if (env.CROWD_SIM_ENABLED) {
    getCrowdSimulator().start();
  }
});

// Live speech-to-text bridge for the accessibility caption feature. Shares the
// HTTP server so it rides the same port and CORS origin as the REST API.
attachAsrWebSocket(server);
