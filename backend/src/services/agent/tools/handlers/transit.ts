import { z } from 'zod';
import { env } from '../../../../config/env.js';
import { formatDuration } from '../../../transit/routes.js';
import { fail, ok, zodMessage } from '../formatters.js';
import type { ToolResult } from '../index.js';

const TransitHandoffArgs = z.object({
  priority: z.enum(['time', 'carbon', 'balanced']).default('balanced'),
});

export async function handleTransitHandoff(args: unknown, context?: { location?: { lat: number, lng: number } }): Promise<ToolResult> {
  const parsed = TransitHandoffArgs.safeParse(args);
  if (!parsed.success) return fail(`Invalid transit_handoff arguments: ${zodMessage(parsed.error)}`);
  const { priority } = parsed.data;

  if (!context?.location) {
    return fail(
      "Cannot hand off to Transit Agent: I don't know the user's location. Ask them to click 'Share Location'.",
      "Missing GPS location"
    );
  }

  if (!env.GOOGLE_ROUTES_API_KEY) {
    return fail(
      "Outdoor routing is not configured on this server (missing GOOGLE_ROUTES_API_KEY). Indoor navigation still works.",
      "Outdoor routing unavailable"
    );
  }

  // Lazy import avoids a startup cycle between concierge tools and the Transit Agent.
  const { runTransitHandoff } = await import('../../transit.js');
  let plan: Awaited<ReturnType<typeof runTransitHandoff>>;
  try {
    plan = await runTransitHandoff({ origin: context.location, priority });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(message, 'Transit Agent could not plan a route');
  }

  const rec = plan.recommendation;
  const recOption = plan.options.find((o) => o.mode === rec.recommended_mode);
  const summary = recOption
    ? `Transit Agent: ${recOption.label}, ${formatDuration(recOption.duration_seconds)}, ~${Math.round(recOption.co2_grams / 10) / 100} kg CO₂`
    : 'Transit Agent produced a plan';

  return ok(plan as unknown as Record<string, unknown>, summary);
}