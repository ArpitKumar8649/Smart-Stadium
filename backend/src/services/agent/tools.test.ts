import { describe, expect, it } from 'vitest';
import { TOOL_DEFINITIONS, handleToolCall } from './tools/index.js';

/**
 * Exercises the real agent surface — the handlers the LLM invokes — against the
 * live MetLife graph + crowd simulator. These assert grounding (real labels,
 * never node ids leaking out) and graceful failure, not exact distances.
 */
describe('agent tools', () => {
  it('exposes well-formed tool definitions', () => {
    expect(TOOL_DEFINITIONS.length).toBeGreaterThanOrEqual(6);
    for (const t of TOOL_DEFINITIONS) {
      expect(t.name).toMatch(/^[a-z_]+$/);
      expect(t.description.length).toBeGreaterThan(20);
      expect(t.parameters).toHaveProperty('type', 'object');
    }
    expect(TOOL_DEFINITIONS.map((t) => t.name)).toContain('get_crowd');
  });

  it('find_route returns a grounded route between real places', async () => {
    const r = await handleToolCall('find_route', {
      from_label: 'Section 144',
      to_label: 'Section 108',
      mode: 'fastest',
    });
    console.log("find_route error:", r.error);
    expect(r.ok).toBe(true);
    expect(r.summary).toContain('Section 144');
    // No raw node ids should appear in the human summary.
    expect(r.summary).not.toMatch(/n_[0-9a-f]{6}/);
  });

  it('find_route fails helpfully on an unknown place', async () => {
    const r = await handleToolCall('find_route', {
      from_label: 'xylophone teleporter lounge',
      to_label: 'Section 108',
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it('find_nearest locates a step-free restroom with a route', async () => {
    const r = await handleToolCall('find_nearest', {
      from_label: 'Section 144',
      facility_type: 'restroom',
      step_free: true,
    });
    console.log("find_route error:", r.error);
    expect(r.ok).toBe(true);
    expect(r.summary.toLowerCase()).toContain('restroom');
  });

  it('find_nearest honors the halal dietary filter', async () => {
    const r = await handleToolCall('find_nearest', {
      from_label: 'Section 108',
      facility_type: 'concession',
      dietary: 'halal',
    });
    // Either finds a halal outlet, or fails cleanly saying none is tagged nearby.
    if (r.ok) {
      expect(r.summary.toLowerCase()).toContain('halal');
    } else {
      expect(r.error?.toLowerCase()).toContain('halal');
    }
  });

  it('get_crowd reports a density band and marks data simulated', async () => {
    const r = await handleToolCall('get_crowd', { place: 'Section 144' });
    console.log("find_route error:", r.error);
    expect(r.ok).toBe(true);
    const data = r.data as { simulated?: boolean; level?: string };
    expect(data.simulated).toBe(true);
    expect(['quiet', 'moderate', 'busy', 'packed']).toContain(data.level);
  });

  it('get_crowd with no place summarises the busiest zones', async () => {
    const r = await handleToolCall('get_crowd', {});
    console.log("find_route error:", r.error);
    expect(r.ok).toBe(true);
    const data = r.data as { busiest?: unknown[] };
    expect(Array.isArray(data.busiest)).toBe(true);
    expect(data.busiest!.length).toBeGreaterThan(0);
  });

  it('resolve_place returns ranked candidates for a fuzzy query', async () => {
    const r = await handleToolCall('resolve_place', { query: '144' });
    console.log("find_route error:", r.error);
    expect(r.ok).toBe(true);
    const data = r.data as { candidates?: Array<{ label: string }> };
    expect(data.candidates?.some((c) => c.label.includes('144'))).toBe(true);
  });

  it('rejects an unknown tool without throwing', async () => {
    const r = await handleToolCall('launch_rockets', { x: 1 });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Unknown tool');
  });

  it('rejects malformed arguments without throwing', async () => {
    const r = await handleToolCall('find_route', { from_label: 123 });
    expect(r.ok).toBe(false);
  });
});
