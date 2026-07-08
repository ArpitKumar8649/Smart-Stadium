import express from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { logger } from './middleware/logger.js';
import { errorHandler } from './middleware/error.js';
import { healthRouter } from './routes/health.js';

const app = express();

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

app.use('/api', healthRouter);

app.use('*', (_req, res) => {
  res.status(404).json({
    error: { code: 'not_found', message: 'Route not found' },
  });
});

app.use(errorHandler);

const port = env.PORT;
app.listen(port, () => {
  logger.info(
    { port, env: env.NODE_ENV, allowedOrigins: env.allowedOrigins },
    `🏟  Concourse backend listening on :${port}`,
  );
});
