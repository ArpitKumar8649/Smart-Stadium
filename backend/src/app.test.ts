import { createServer } from 'node:http';
import type { Request, Response, Router } from 'express';
import { describe, expect, it } from 'vitest';
import {
  ChatEventSchema,
  ChatRequestSchema,
  NavigationRouteRequestSchema,
  NavigationRouteResponseSchema,
  RouteRequestSchema,
} from '@concourse/shared';
import { createApp } from './app.js';
import { healthRouter } from './routes/health.js';
import { navigationRouter } from './routes/navigation.js';
import { adminRouter } from './routes/admin.js';
import { audioRouter } from './routes/audio.js';
import { alertStore } from './services/alerts/store.js';
import { getGraph } from './services/graph/loader.js';
import { route } from './services/graph/astar.js';

type RouteCall = {
  method: string;
  url: string;
  body?: unknown;
  headers?: Record<string, string>;
};

type RouteResult = { status: number; body: unknown };

/** Exercise Express route handlers in-process. This avoids a network listener
 * while retaining each route's real validation and middleware chain. */
function callRouter(router: Router, call: RouteCall): Promise<RouteResult> {
  const headers = Object.fromEntries(
    Object.entries(call.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]),
  );

  return new Promise((resolve, reject) => {
    let status = 200;
    const req = {
      method: call.method,
      url: call.url,
      originalUrl: call.url,
      baseUrl: '',
      headers,
      body: call.body,
      header: (name: string) => headers[name.toLowerCase()],
    } as unknown as Request;
    const res = {
      status: (code: number) => {
        status = code;
        return res;
      },
      json: (body: unknown) => resolve({ status, body }),
    } as unknown as Response;

    (router as unknown as {
      handle: (request: Request, response: Response, next: (error?: unknown) => void) => void;
    }).handle(req, res, (error?: unknown) => {
      reject(error instanceof Error ? error : new Error('Route did not produce a response.'));
    });
  });
}

describe('public API contracts', () => {
  it('creates the complete Express app without binding a network port', () => {
    const app = createApp();
    expect(typeof (app as unknown as { handle: unknown }).handle).toBe('function');
  });

  it('mounts the complete app stack for real HTTP requests', async () => {
    const server = createServer(createApp());
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected a TCP listener.');

    try {
      const health = await fetch(`http://127.0.0.1:${address.port}/api/health`);
      expect(health.status).toBe(200);
      expect(await health.json()).toMatchObject({ ok: true });

      const missing = await fetch(`http://127.0.0.1:${address.port}/api/does-not-exist`);
      expect(missing.status).toBe(404);
      expect(await missing.json()).toMatchObject({ error: { code: 'not_found' } });
      expect(missing.headers.get('x-content-type-options')).toBe('nosniff');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('keeps legacy graph routing and public label routing distinct', () => {
    expect(RouteRequestSchema.safeParse({
      from_node_id: 'gate-a',
      to_node_id: 'section-144',
      mode: 'fastest',
      avoid_crowded: false,
    }).success).toBe(true);

    const parsed = NavigationRouteRequestSchema.safeParse({
      from_label: '  Section 144  ',
      to_label: ' Section 108 ',
      mode: 'step_free',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.from_label).toBe('Section 144');
  });

  it('rejects invalid retained chat-history entries', () => {
    expect(ChatRequestSchema.safeParse({
      session_id: 'test-session',
      message: 'Where is Gate A?',
      history: [{ role: 'assistant', content: '' }],
    }).success).toBe(false);

    expect(ChatRequestSchema.safeParse({
      session_id: 'test-session',
      message: 'Where is Gate A?',
      history: [{ role: 'assistant', content: 'x'.repeat(2_001) }],
    }).success).toBe(false);
  });

  it('serves a health payload', async () => {
    const response = await callRouter(healthRouter, { method: 'GET', url: '/health' });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ok: true });
  });

  it('returns a schema-valid, map-ready route for real venue labels', async () => {
    const response = await callRouter(navigationRouter, {
      method: 'POST',
      url: '/navigation/route',
      body: {
        from_label: 'Section 144',
        to_label: 'Section 108',
        mode: 'step_free',
      },
    });

    expect(response.status).toBe(200);
    const parsed = NavigationRouteResponseSchema.safeParse(response.body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.points.length).toBeGreaterThan(1);
      expect(parsed.data.mode).toBe('step_free');
    }
  });

  it('re-routes around an active operational advisory', () => {
    const graph = getGraph();
    const from = graph.allNodes.find((node) => node.label === 'Section 144');
    const to = graph.allNodes.find((node) => node.label === 'Section 108');
    const blockedNodeId = 'n_611e7c60150a2c2324000035';
    if (!from || !to) throw new Error('Expected the default demo route endpoints.');

    const baseline = route(
      { nodes: graph.nodeById, edgesFrom: graph.adjacency },
      from.id,
      to.id,
      'fastest',
    );
    expect(baseline?.path).toContain(blockedNodeId);

    const advisory = alertStore.emit({
      kind: 'facility_closure',
      severity: 'warn',
      title: '100 Concourse route advisory',
      body: 'Use the alternate path.',
      affected_node_id: blockedNodeId,
    });
    expect(alertStore.activeAffectedNodeIds()).toContain(blockedNodeId);

    const rerouted = route(
      { nodes: graph.nodeById, edgesFrom: graph.adjacency },
      from.id,
      to.id,
      'fastest',
      () => 0,
      (nodeId) => alertStore.activeAffectedNodeIds().has(nodeId),
    );
    expect(rerouted?.path).not.toContain(blockedNodeId);
    expect(rerouted?.total_seconds).toBeGreaterThan(baseline?.total_seconds ?? 0);
    expect(advisory.affected_node_id).toBe(blockedNodeId);
  });

  it('rejects malformed navigation input before it reaches routing', async () => {
    const response = await callRouter(navigationRouter, {
      method: 'POST',
      url: '/navigation/route',
      body: { from_label: '', to_label: 42 },
    });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'validation_error' } });
  });

  it('fails closed when an admin credential is missing', async () => {
    const response = await callRouter(adminRouter, { method: 'GET', url: '/admin/session' });
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: { code: 'unauthorized' } });
  });

  it('does not expose paid PA speech generation to anonymous callers', async () => {
    const response = await callRouter(audioRouter, {
      method: 'POST',
      url: '/audio/tts',
      body: { text: 'Gate C is closing.', lang: 'es' },
    });
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: { code: 'unauthorized' } });
  });

  it('bounds chat context and accepts the emitted SSE event contract', () => {
    const oversizedHistory = Array.from({ length: 11 }, () => ({ role: 'user', content: 'hello' }));
    expect(ChatRequestSchema.safeParse({
      session_id: 'test-session',
      message: 'Where is Gate A?',
      history: oversizedHistory,
    }).success).toBe(false);

    expect(ChatRequestSchema.safeParse({
      session_id: 'test-session',
      message: 'Where is Gate A?',
      context: { location: { lat: 91, lng: 0 } },
    }).success).toBe(false);

    expect(ChatEventSchema.safeParse({ type: 'token', text: 'Gate ', index: 0 }).success).toBe(true);
    expect(ChatEventSchema.safeParse({
      type: 'done',
      usage: { input_tokens: 12, output_tokens: 4 },
    }).success).toBe(true);
  });
});
