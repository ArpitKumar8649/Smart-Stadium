import { type TransitMode, type TransitPriority, type TransitRecommendation } from '@concourse/shared';
import type { CarbonAttachedOption } from '../../transit/carbon.js';

export const MODE_LABELS: Record<TransitMode, string> = {
  DRIVE: 'Driving',
  TWO_WHEELER: 'Two-wheeler',
  TRANSIT: 'Public transit',
  BICYCLE: 'Cycling',
  WALK: 'Walking',
};

/**
 * Balanced score: normalises time and carbon to [0, 1] across the option set,
 * then combines them 50/50. Lower is better. This is a Pareto-aware compromise
 * — the fastest option only wins when its carbon is also competitive.
 */
function balancedScore(option: CarbonAttachedOption, minT: number, maxT: number, minC: number, maxC: number): number {
  const tRange = maxT - minT || 1;
  const cRange = maxC - minC || 1;
  const t = (option.duration_seconds - minT) / tRange;
  const c = (option.co2_grams - minC) / cRange;
  return 0.5 * t + 0.5 * c;
}

export function recommendMode(
  options: CarbonAttachedOption[],
  priority: TransitPriority,
): TransitRecommendation {
  if (options.length === 0) {
    throw new Error('recommend_best_mode called with no options');
  }

  const fastest = [...options].sort((a, b) => a.duration_seconds - b.duration_seconds)[0]!;
  const greenest = [...options].sort((a, b) => a.co2_grams - b.co2_grams)[0]!;
  const drive = options.find((o) => o.mode === 'DRIVE');

  let recommended: CarbonAttachedOption;
  let reason: string;
  if (priority === 'time') {
    recommended = fastest;
    reason = `${MODE_LABELS[recommended.mode]} is fastest at this origin.`;
  } else if (priority === 'carbon') {
    recommended = greenest;
    reason = `${MODE_LABELS[recommended.mode]} has the lowest carbon footprint at this origin.`;
  } else {
    const minT = Math.min(...options.map((o) => o.duration_seconds));
    const maxT = Math.max(...options.map((o) => o.duration_seconds));
    const minC = Math.min(...options.map((o) => o.co2_grams));
    const maxC = Math.max(...options.map((o) => o.co2_grams));
    recommended = [...options].sort(
      (a, b) => balancedScore(a, minT, maxT, minC, maxC) - balancedScore(b, minT, maxT, minC, maxC),
    )[0]!;
    reason =
      recommended.mode === fastest.mode
        ? `${MODE_LABELS[recommended.mode]} is both fast and low-carbon at this origin.`
        : `${MODE_LABELS[recommended.mode]} is the best trade-off between time and CO₂ at this origin.`;
  }

  const co2SavedVsDrive = drive ? Math.round(drive.co2_grams - recommended.co2_grams) : 0;
  const timeCostVsFastest = Math.max(0, recommended.duration_seconds - fastest.duration_seconds);

  return {
    fastest_mode: fastest.mode,
    greenest_mode: greenest.mode,
    recommended_mode: recommended.mode,
    reason,
    co2_saved_vs_drive_grams: co2SavedVsDrive,
    time_cost_vs_fastest_seconds: timeCostVsFastest,
  };
}