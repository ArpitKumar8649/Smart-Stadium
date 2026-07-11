import { type ToolChip } from './useConcierge.ts';

const TOOL_LABELS: Record<string, string> = {
  find_route: 'Finding route',
  find_nearest: 'Finding nearest',
  get_venue_info: 'Checking venue info',
  list_facilities: 'Listing facilities',
  resolve_place: 'Locating place',
};

export function ToolCallChip({ chip }: { chip: ToolChip }) {
  const pending = chip.ok === undefined;
  const label = TOOL_LABELS[chip.name] ?? chip.name;
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-medium',
        pending
          ? 'bg-surface-800 text-surface-300'
          : chip.ok
            ? 'bg-primary-900 text-primary-200'
            : 'bg-red-950 text-red-300',
      ].join(' ')}
    >
      <span
        className={[
          'h-1.5 w-1.5 rounded-full',
          pending ? 'animate-pulse bg-accent' : chip.ok ? 'bg-primary' : 'bg-red-400',
        ].join(' ')}
      />
      {chip.summary ?? label}
    </span>
  );
}
