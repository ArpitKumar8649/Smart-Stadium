import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import {
  AdminCrowdOverrideRequestSchema,
  AdminIncidentRequestSchema,
  BriefingRequestSchema,
  type Incident,
  type Briefing,
} from '@concourse/shared';
import { requireAdmin } from '../middleware/admin-auth.js';
import { getCrowdSimulator } from '../services/crowd/simulator.js';
import { alertStore } from '../services/alerts/store.js';
import { getLlm } from '../services/llm/qwen.js';
import { logger } from '../middleware/logger.js';

export const adminRouter: Router = Router();

// Every route here requires the admin token
adminRouter.use('/admin', requireAdmin);

/**
 * POST /api/admin/crowd/override
 * Admin forces a specific density reading on a zone. This proves real-time
 * decision support without waiting for the simulation curve.
 */
adminRouter.post('/admin/crowd/override', (req, res) => {
  const parsed = AdminCrowdOverrideRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: { code: 'validation_error', message: 'Invalid override request', details: parsed.error.flatten() },
    });
    return;
  }

  const { zone_id, density, wait_seconds, ttl_seconds } = parsed.data;
  const sim = getCrowdSimulator();

  const ok = sim.override(zone_id, density, wait_seconds, ttl_seconds);
  if (!ok) {
    res.status(404).json({ error: { code: 'not_found', message: `Zone ${zone_id} not found.` } });
    return;
  }

  res.json({ ok: true, zone_id, density, source: 'injected' });
});

/**
 * POST /api/admin/incident
 * Admin logs an operational incident. It goes to the event bus, triggering
 * SSE alerts for fans.
 */
adminRouter.post('/admin/incident', (req, res) => {
  const parsed = AdminIncidentRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: { code: 'validation_error', message: 'Invalid incident request', details: parsed.error.flatten() },
    });
    return;
  }

  const { venue_id, kind, severity, title, body, affected_zone_id, affected_gate_id, expires_in_minutes } = parsed.data;

  const incident: Incident = {
    id: `inc_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    venue_id,
    kind,
    severity,
    title,
    body,
    affected_zone_id,
    affected_gate_id,
    created_at: new Date().toISOString(),
    created_by: 'demo_admin',
  };

  alertStore.addIncident(incident);

  // Instantly emit a fan alert from the incident.
  const expiresAt = expires_in_minutes
    ? new Date(Date.now() + expires_in_minutes * 60000).toISOString()
    : undefined;

  alertStore.emit({
    kind,
    severity,
    title,
    body,
    expires_at: expiresAt,
    affected_zone_id,
    affected_gate_id,
  });

  res.json(incident);
});

/**
 * POST /api/admin/demo/enable
 * Enables ?demo=1 deterministic mode. Locks the simulation clock to minute 40
 * (just before the halftime surge) so the heatmap is busy and incidents are impactful.
 */
adminRouter.post('/admin/demo/enable', (req, res) => {
  const sim = getCrowdSimulator();
  // Pin the clock to minute 40 and stop time passing
  sim.setSpeed(0);
  sim.setSimMinute(40);

  // Clear any old overrides/briefings
  for (const zone of sim.getZones()) {
    sim.clearOverride(zone.id);
  }
  cachedBriefing = null;

  res.json({ ok: true, message: 'Demo mode enabled. Simulation clock pinned to minute 40.' });
});

/**
 * POST /api/admin/demo/disable
 * Returns the simulator to normal time progression.
 */
adminRouter.post('/admin/demo/disable', (req, res) => {
  const sim = getCrowdSimulator();
  sim.setSpeed(1);
  res.json({ ok: true, message: 'Demo mode disabled. Time is running normally.' });
});

// Cache for the AI briefing so we don't spam the LLM API on reload
let cachedBriefing: Briefing | null = null;

/**
 * POST /api/admin/briefing
 * Generates the AI Operational Briefing (ADR 0009). The LLM is provided the
 * raw JSON state of the stadium (heatmap, incidents) and requested to output
 * a structured Briefing JSON containing natural language analysis.
 */
adminRouter.post('/admin/briefing', async (req, res) => {
  const parsed = BriefingRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: { code: 'validation_error', message: 'Invalid briefing request', details: parsed.error.flatten() },
    });
    return;
  }

  const { lang, force_refresh } = parsed.data;

  // Simple 5 min cache
  if (!force_refresh && cachedBriefing && (Date.now() - Date.parse(cachedBriefing.generated_at) < 300_000) && cachedBriefing.lang === lang) {
    res.json(cachedBriefing);
    return;
  }

  const sim = getCrowdSimulator();
  const heatmap = sim.getHeatmap();
  const incidents = alertStore.recentIncidents(10);

  // Fake top fan questions (for the demo, since we don't persist real ones yet)
  const topQuestions = [
    "24 fans asked about halal food locations.",
    "15 fans asked for step-free routes to Section 100 level.",
    "8 fans asked when the gates open."
  ];

  // Calculate total stadium occupancy based on seating + concourse zones
  let totalCap = 0;
  let usedCap = 0;
  for (const zone of heatmap.zones) {
    totalCap += 1.0;
    usedCap += zone.density;
  }
  const occupancy_pct = Math.round((usedCap / totalCap) * 100) || 0;

  const systemPrompt = `You are the Chief of Staff AI for the MetLife Stadium operations center.
You must synthesize the raw stadium data provided into a sharp, actionable JSON briefing for the operations chief.
Respond ONLY with a raw JSON object matching this schema exactly (no markdown wrapping, no \`\`\`json):
{
  "headline": "string, max 160 chars. One line status.",
  "summary": "string, max 1200 chars. 2-4 sentences of situational read.",
  "concerns": [{"zone_id": "string", "concern": "string", "severity": "info|warn|critical", "eta_minutes": number}],
  "recommendations": [{"action": "string", "affected_zone_id": "string", "suggested_alert_kind": "string", "reversible": boolean}]
}
Write the human-readable text in this language: ${lang}. Do not invent numbers; use only the data provided.`;

  const userData = JSON.stringify({
    phase: sim.phase(),
    occupancy_pct,
    heatmap: heatmap.zones.map(z => ({
      zone: z.zone_id,
      density: z.density,
      wait: z.wait_seconds,
      source: z.source,
      pred_15: z.predictions?.find(p => p.offset_minutes === 15)?.density
    })),
    incidents,
    top_questions: topQuestions
  });

  try {
    const llm = getLlm();
    const result = await llm.chat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userData }
      ],
      // Force JSON mode on models that support it
      // Using standard parsing since Qwen handles JSON instruction well
    });

    const content = result.message.content || '{}';
    // Clean up potential markdown formatting if the model leaked it
    const cleanContent = content.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();

    let parsedLlm: any;
    try {
      parsedLlm = JSON.parse(cleanContent);
    } catch (e) {
      logger.error({ err: e, content }, 'Failed to parse LLM briefing response');
      res.status(500).json({ error: { code: 'llm_error', message: 'Failed to generate briefing structure.' } });
      return;
    }

    const briefing: Briefing = {
      id: `brf_${randomUUID().slice(0, 8)}`,
      venue_id: 'metlife',
      generated_at: new Date().toISOString(),
      window_start: new Date().toISOString(),
      window_end: new Date(Date.now() + 300_000).toISOString(),
      occupancy_pct,
      headline: parsedLlm.headline || 'Briefing generated with warnings.',
      summary: parsedLlm.summary || 'Summary unavailable.',
      concerns: parsedLlm.concerns || [],
      recommendations: parsedLlm.recommendations || [],
      top_fan_questions: topQuestions,
      model: 'qwen-plus',
      lang,
    };

    cachedBriefing = briefing;
    res.json(briefing);

  } catch (err) {
    logger.error({ err }, 'Briefing generation failed');
    res.status(500).json({ error: { code: 'internal', message: 'Failed to generate briefing.' } });
  }
});
