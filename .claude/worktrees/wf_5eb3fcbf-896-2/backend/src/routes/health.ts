import { Router } from 'express';

export const healthRouter: Router = Router();

const startedAt = new Date().toISOString();

healthRouter.get('/health', (_req, res) => {
  res.json({
    ok: true,
    startedAt,
    uptimeSeconds: Math.round(process.uptime()),
  });
});

healthRouter.get('/version', (_req, res) => {
  res.json({
    app: 'concourse-backend',
    version: process.env.npm_package_version ?? '0.1.0',
    node: process.version,
    startedAt,
  });
});
