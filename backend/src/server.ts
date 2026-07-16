import { env } from './config/env.js';
import { logger } from './middleware/logger.js';
import { getCrowdSimulator } from './services/crowd/simulator.js';
import { attachAsrWebSocket } from './services/audio/asr.js';
import { createApp } from './app.js';

const app = createApp();

const port = env.PORT;
// Bind to all interfaces so App Service (and Docker locally) can reach the
// process through the container/network boundary.
const host = '0.0.0.0';
const server = app.listen(port, host, () => {
  logger.info(
    { host, port, env: env.NODE_ENV, allowedOrigins: env.allowedOrigins },
    `🏟  Concourse backend listening on ${host}:${port}`,
  );
  // Boot the crowd simulator so /api/crowd and the low_crowd routing mode are live.
  if (env.CROWD_SIM_ENABLED) {
    getCrowdSimulator().start();
  }
});

// Live speech-to-text bridge for the accessibility caption feature. Shares the
// HTTP server so it rides the same port and CORS origin as the REST API.
attachAsrWebSocket(server);
