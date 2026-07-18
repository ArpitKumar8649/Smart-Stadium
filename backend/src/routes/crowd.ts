import { Router } from 'express';
import { getCrowdSimulator } from '../services/crowd/simulator.js';

export const crowdRouter: Router = Router();

/** GET /api/crowd/:venueId/heatmap — all zones with density + projections. */
crowdRouter.get('/crowd/:venueId/heatmap', (req, res) => {
  if (req.params.venueId !== 'metlife') {
    res.status(400).json({ error: { code: 'bad_request', message: 'This API is currently restricted to MetLife Stadium only.' } });
    return;
  }
  const sim = getCrowdSimulator();
  const zones = new Map(sim.getZones().map((z) => [z.id, z]));
  const heatmap = sim.getHeatmap();
  res.json({
    ...heatmap,
    phase: sim.phase(),
    sim_minute: Math.round(sim.getSimMinute()),
    // Enrich each reading with its zone label/level/centroid for rendering.
    zones: heatmap.zones.map((z) => {
      const meta = zones.get(z.zone_id);
      return {
        ...z,
        label: meta?.label ?? z.zone_id,
        level: meta?.level ?? 0,
        kind: meta?.kind ?? 'concourse',
        centroid: meta?.centroid ?? [0, 0],
      };
    }),
  });
});

/** GET /api/crowd/:venueId/zone/:zoneId — one zone's reading. */
crowdRouter.get('/crowd/:venueId/zone/:zoneId', (req, res) => {
  if (req.params.venueId !== 'metlife') {
    res.status(400).json({ error: { code: 'bad_request', message: 'This API is currently restricted to MetLife Stadium only.' } });
    return;
  }
  const level = getCrowdSimulator().getZone(req.params.zoneId);
  if (!level) {
    res.status(404).json({ error: { code: 'not_found', message: 'Unknown zone' } });
    return;
  }
  res.json(level);
});
