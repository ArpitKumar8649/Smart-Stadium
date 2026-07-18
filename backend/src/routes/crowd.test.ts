import { describe, expect, it } from 'vitest';
import express from 'express';
import { crowdRouter } from './crowd.js';

describe('crowdRouter', () => {
  it('rejects venues other than metlife for heatmap', async () => {
    // using fetch against a real express app to properly test the route parameters
    const app = express();
    app.use('/', crowdRouter);
    const server = app.listen(0);
    const port = (server.address() as { port: number }).port;

    const response = await fetch(`http://localhost:${port}/crowd/other-venue/heatmap`);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'bad_request', message: 'This API is currently restricted to MetLife Stadium only.' }
    });

    server.close();
  });

  it('rejects venues other than metlife for zone', async () => {
    const app = express();
    app.use('/', crowdRouter);
    const server = app.listen(0);
    const port = (server.address() as { port: number }).port;

    const response = await fetch(`http://localhost:${port}/crowd/other-venue/zone/123`);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'bad_request', message: 'This API is currently restricted to MetLife Stadium only.' }
    });

    server.close();
  });
});
