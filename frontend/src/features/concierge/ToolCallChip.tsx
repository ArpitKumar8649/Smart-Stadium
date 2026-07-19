import { type ToolChip } from './useConcierge.ts';

const TOOL_LABELS: Record<string, string> = {
  find_route: 'Finding route',
  find_nearest: 'Finding nearest',
  get_venue_info: 'Checking venue info',
  list_facilities: 'Listing facilities',
  resolve_place: 'Locating place',
};

export function ToolCallChip({ chip }: Readonly<{ chip: ToolChip }>) {
  const pending = chip.ok === undefined;
  const label = TOOL_LABELS[chip.name] ?? chip.name;

  let bgClass = 'bg-red-950 text-red-300';
  let dotClass = 'bg-red-400';

  if (pending) {
    bgClass = 'bg-surface-800 text-surface-300';
    dotClass = 'animate-pulse bg-accent';
  } else if (chip.ok) {
    bgClass = 'bg-primary-900 text-primary-200';
    dotClass = 'bg-primary';
  }

  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-medium',
        bgClass,
      ].join(' ')}
    >
      <span
        className={[
          'h-1.5 w-1.5 rounded-full',
          dotClass,
        ].join(' ')}
      />
      {chip.summary ?? label}
    </span>
  );
}
