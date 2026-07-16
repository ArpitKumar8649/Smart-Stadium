import { Router } from 'express';
import { alertStore } from '../services/alerts/store.js';

export const alertsRouter: Router = Router();
const MAX_ALERT_STREAMS = 100;
let activeAlertStreams = 0;

/**
 * GET /api/alerts/stream
 *
 * SSE endpoint for fans to receive real-time proactive nudges (incidents,
 * crowd warnings, gate changes). Replay buffer sends recent active alerts
 * immediately upon connection.
 */
alertsRouter.get('/alerts/stream', (req, res) => {
  if (activeAlertStreams >= MAX_ALERT_STREAMS) {
    res.status(503).json({
      error: { code: 'capacity_reached', message: 'Live alerts are temporarily at capacity. Please retry shortly.' },
    });
    return;
  }
  activeAlertStreams += 1;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const send = (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // 1. Send recent active alerts from the replay buffer
  const recent = alertStore.recentAlerts(10);
  if (recent.length > 0) {
    send({ type: 'sync', alerts: recent });
  }

  // 2. Subscribe to new live alerts
  const unsubscribe = alertStore.subscribe((alert) => {
    send({ type: 'alert', alert });
  });

  // 3. Heartbeat to keep the proxy connection alive
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 20_000);

  let closed = false;
  res.on('close', () => {
    if (closed) return;
    closed = true;
    activeAlertStreams = Math.max(0, activeAlertStreams - 1);
    unsubscribe();
    clearInterval(heartbeat);
    res.end();
  });
});
