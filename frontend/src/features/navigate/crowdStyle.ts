import type { CrowdMapZone } from '@concourse/shared';

export function densityColor(density: number): string {
  if (density >= 0.8) return '#EF4444';
  if (density >= 0.6) return '#F97316';
  if (density >= 0.4) return '#FFC300';
  if (density >= 0.2) return '#00B67A';
  return '#5B6672';
}

export function densityLabel(density: number): string {
  if (density >= 0.8) return 'Packed';
  if (density >= 0.6) return 'Busy';
  if (density >= 0.4) return 'Moderate';
  if (density >= 0.2) return 'Light';
  return 'Quiet';
}

export function zoneForecast(zone: CrowdMapZone, offset: 0 | 15 | 30): number {
  if (offset === 0) return zone.density;
  return zone.predictions?.find((prediction) => prediction.offset_minutes === offset)?.density ?? zone.density;
}
