import { Router } from 'express';
import { ChatRequestSchema } from '@concourse/shared';
import { findNodeByLabel } from '../services/graph/loader.js';
import { runConciergeTurn } from '../services/agent/concierge.js';
import { logger } from '../middleware/logger.js';

export const chatRouter: Router = Router();

/**
 * POST /api/chat — one concierge turn, streamed as Server-Sent Events.
 * Each SSE frame is `data: <ConciergeEvent JSON>\n\n`.
 */
chatRouter.post('/chat', async (req, res) => {
  const parsed = ChatRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: { code: 'validation_error', message: 'Invalid chat request', details: parsed.error.flatten() },
    });
    return;
  }
  const { message, history, lang, accessibility, location_node_id, context } = parsed.data;
  const conciergeContext = context?.location ? { location: context.location } : undefined;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const send = (event: unknown) => res.write(`data: ${JSON.stringify(event)}\n\n`);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 20_000);

  const ac = new AbortController();
  // Abort only when the *response* connection closes early (client went away),
  // not when the request body stream ends (which happens immediately after
  // express.json() consumes the POST body).
  res.on('close', () => {
    if (!res.writableFinished) ac.abort();
  });

  // Resolve the user's current location label, if any.
  let locationLabel: string | undefined;
  if (location_node_id) {
    const node = findNodeByLabel(location_node_id);
    if (node) locationLabel = node.label;
  }

  try {
    for await (const ev of runConciergeTurn({
      message,
      ...(history ? { history } : {}),
      ...(lang ? { lang } : {}),
      ...(accessibility ? { accessibility } : {}),
      ...(locationLabel ? { locationLabel } : {}),
      ...(conciergeContext ? { context: conciergeContext } : {}),
      signal: ac.signal,
    })) {
      send(ev);
    }
  } catch (err) {
    logger.error({ err }, 'chat turn failed');
    send({ type: 'error', code: 'internal', message: 'Concourse is unavailable right now.' });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});
