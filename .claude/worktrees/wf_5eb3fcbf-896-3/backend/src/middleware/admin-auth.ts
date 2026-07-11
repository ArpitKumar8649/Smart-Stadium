import type { RequestHandler } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

function safeTokenMatch(actual: string, expected: string): boolean {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Protects the local/demo admin console. It intentionally fails closed: no
 * configured secret means no mutation endpoints. Firebase UID verification can
 * replace this middleware later without changing the admin route contracts.
 */
export const requireAdmin: RequestHandler = (req, res, next) => {
  const header = req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  const expected = env.ADMIN_DEMO_TOKEN;

  if (!expected || !token || !safeTokenMatch(token, expected)) {
    res.status(401).json({
      error: {
        code: 'unauthorized',
        message: 'Admin access required or invalid token.',
      },
    });
    return;
  }

  next();
};
