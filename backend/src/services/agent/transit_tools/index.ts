import { z } from 'zod';
import type { ToolDefinition } from '../../llm/provider.js';
import { TransitPrioritySchema, type TransitRecommendation, type TransitPriority } from '@concourse/shared';
import { planGroundRoutes, type OutdoorModeResult } from '../../transit/routes.js';
import { estimateCarbonForOptions, type CarbonEstimateInput, type CarbonAttachedOption } from '../../transit/carbon.js';
import { recommendMode, MODE_LABELS } from './scorer.js';

export const TRANSIT_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'plan_ground_routes',
    description:
      'Query Google Routes v2 for every ground-travel mode (driving, two-wheeler, public transit, ' +
      'cycling, walking) from the fan\'s origin to MetLife Stadium, returning distance and duration ' +
      'for every mode that has a route. Always call this first — it is the ground truth for travel ' +
      'times. Never answer a routing question without calling this. Never invent a distance or duration.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'estimate_carbon_footprint',
    description:
      'Attach a CO₂ estimate (in grams) to each option produced by plan_ground_routes, using either a ' +
      'bundled emissions-factor table or a live carbon-aware API for electric modes. Returns the ' +
      'emission factor used and its source for every option, so the fan can be told honestly where ' +
      'the number came from. Call this after plan_ground_routes and before recommend_best_mode.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'recommend_best_mode',
    description:
      'Score every carbon-attached option against the fan\'s stated priority (time, carbon, or ' +
      'balanced) and return a single deterministic recommendation with the CO₂ saved vs. driving and ' +
      'the time trade-off. Call this last, then narrate the recommendation verbatim.',
    parameters: {
      type: 'object',
      properties: {
        priority: {
          type: 'string',
          enum: ['time', 'carbon', 'balanced'],
          description:
            'Priority the fan asked for. `time` picks the fastest option, `carbon` picks the lowest-CO₂ ' +
            'option, `balanced` picks the Pareto-aware compromise (default).',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
];

export interface TransitTurnState {
  origin: { lat: number; lng: number; label?: string };
  priority: TransitPriority;
  raw?: OutdoorModeResult[];
  withCarbon?: (OutdoorModeResult & {
    co2_grams: number;
    emission_factor_g_per_km: number;
    carbon_source: 'emissions_factor_table' | 'carbon_aware_api';
  })[];
  recommendation?: TransitRecommendation;
}

export interface TransitToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  summary: string;
}

async function handlePlanGroundRoutes(state: TransitTurnState): Promise<TransitToolResult> {
  const raw = await planGroundRoutes(state.origin);
  if (raw.length === 0) {
    return {
      ok: false,
      error: 'No ground route exists from that origin to MetLife Stadium.',
      summary: 'No ground route found',
    };
  }
  state.raw = raw;
  return {
    ok: true,
    data: {
      options: raw.map((r) => ({
        mode: r.mode,
        label: r.label,
        distance_meters: r.distance_meters,
        duration_seconds: r.duration_seconds,
      })),
    },
    summary: `Planned ${raw.length} ground-travel mode${raw.length === 1 ? '' : 's'} to MetLife`,
  };
}

async function handleEstimateCarbon(state: TransitTurnState): Promise<TransitToolResult> {
  if (!state.raw) {
    return {
      ok: false,
      error: 'Call plan_ground_routes before estimate_carbon_footprint.',
      summary: 'plan_ground_routes not called yet',
    };
  }
  const attached = await estimateCarbonForOptions(
    state.raw.map<CarbonEstimateInput>((r) => ({
      mode: r.mode,
      distance_meters: r.distance_meters,
      duration_seconds: r.duration_seconds,
    })),
  );
  state.withCarbon = state.raw.map((r, i) => ({
    ...r,
    co2_grams: attached[i]!.co2_grams,
    emission_factor_g_per_km: attached[i]!.emission_factor_g_per_km,
    carbon_source: attached[i]!.carbon_source,
  }));
  return {
    ok: true,
    data: {
      options: state.withCarbon.map((o) => ({
        mode: o.mode,
        label: o.label,
        co2_grams: o.co2_grams,
        emission_factor_g_per_km: o.emission_factor_g_per_km,
        carbon_source: o.carbon_source,
      })),
    },
    summary: `Attached CO₂ estimates to ${state.withCarbon.length} option${state.withCarbon.length === 1 ? '' : 's'}`,
  };
}

const RecommendArgs = z.object({
  priority: TransitPrioritySchema.optional(),
});

function handleRecommend(state: TransitTurnState, args: unknown): TransitToolResult {
  if (!state.withCarbon) {
    return {
      ok: false,
      error: 'Call estimate_carbon_footprint before recommend_best_mode.',
      summary: 'estimate_carbon_footprint not called yet',
    };
  }
  const parsed = RecommendArgs.safeParse(args);
  const priority = parsed.success ? parsed.data.priority ?? state.priority : state.priority;
  const scored: CarbonAttachedOption[] = state.withCarbon.map((o) => ({
    mode: o.mode,
    duration_seconds: o.duration_seconds,
    co2_grams: o.co2_grams,
  }));
  const rec = recommendMode(scored, priority);
  state.recommendation = rec;
  return {
    ok: true,
    data: rec,
    summary: `Recommended ${MODE_LABELS[rec.recommended_mode]}`,
  };
}

export async function dispatchTransitTool(
  name: string,
  args: unknown,
  state: TransitTurnState,
): Promise<TransitToolResult> {
  try {
    switch (name) {
      case 'plan_ground_routes':
        return await handlePlanGroundRoutes(state);
      case 'estimate_carbon_footprint':
        return await handleEstimateCarbon(state);
      case 'recommend_best_mode':
        return handleRecommend(state, args);
      default:
        return { ok: false, error: `Unknown tool: ${name}`, summary: `Unknown tool: ${name}` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg, summary: `Tool "${name}" failed` };
  }
}
