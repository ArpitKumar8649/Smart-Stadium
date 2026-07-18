import React, { useMemo } from 'react';
import { LimelightNav, type NavItem } from '../../../components/ui/LimelightNav.tsx';
import { CONNECTION_STYLE, type FloorInfo, type SectionInfo, type ConnectionKind, type RoutePoint } from '../floorData.ts';

const GlobeIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" /></svg>
);
const LayersIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" /><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" /><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" /></svg>
);

const viewNavItems: NavItem[] = [
  { id: 'photo', icon: <GlobeIcon />, label: 'Photorealistic' },
  { id: 'structure', icon: <LayersIcon />, label: 'Structure' },
];

export const ModeToggle = ({ mode, setMode }: { mode: 'photo' | 'structure'; setMode: (m: 'photo' | 'structure') => void }) => (
  <div className="absolute left-3 top-3 z-10 flex items-center gap-2">
    <LimelightNav
      className="h-11 rounded-xl px-1"
      iconContainerClassName="!p-3"
      iconClassName="w-5 h-5"
      items={viewNavItems}
      activeIndex={mode === 'photo' ? 0 : 1}
      onTabChange={(i) => setMode(i === 0 ? 'photo' : 'structure')}
    />
    <span className="rounded-full bg-surface-900/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-surface-300 backdrop-blur">
      {mode === 'photo' ? 'Photorealistic' : 'Structure'}
    </span>
  </div>
);

export const SectionSearchControl = ({
  sections,
  query,
  setQuery,
  activateSection,
}: {
  sections: SectionInfo[];
  query: string;
  setQuery: (q: string) => void;
  activateSection: (name: string) => void;
}) => {
  const searchMatches = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return [];
    return sections
      .filter((s) => s.name.toUpperCase().includes(q))
      .sort((a, b) => {
        const ap = a.name.toUpperCase().startsWith(q) ? 0 : 1;
        const bp = b.name.toUpperCase().startsWith(q) ? 0 : 1;
        if (ap !== bp) return ap - bp;
        return a.name.localeCompare(b.name, undefined, { numeric: true });
      })
      .slice(0, 12);
  }, [query, sections]);

  return (
    <div className="absolute left-1/2 top-3 z-20 w-60 -translate-x-1/2">
      <div className="rounded-2xl border border-surface-700 bg-surface-900/90 p-2 backdrop-blur">
        <p className="mb-1.5 flex items-center justify-center gap-1 text-[10px] font-mono uppercase tracking-wider text-surface-400">
          <span aria-hidden>🎟️</span> Find my seat
        </p>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && searchMatches[0]) activateSection(searchMatches[0].name);
            if (e.key === 'Escape') setQuery('');
          }}
          type="text"
          autoComplete="off"
          placeholder="Section or suite from your ticket…"
          className="w-full rounded-full border border-surface-700 bg-surface-950/80 px-3 py-1.5 text-center text-xs text-surface-100 placeholder:text-surface-500 focus:border-primary focus:outline-none"
        />
        {searchMatches.length > 0 && (
          <div className="mt-1.5 flex max-h-56 flex-col gap-1 overflow-y-auto">
            {searchMatches.map((s) => (
              <button
                key={s.name}
                onClick={() => activateSection(s.name)}
                className="flex items-center justify-between gap-2 rounded-lg bg-surface-800 px-2.5 py-1.5 text-left text-[11px] font-semibold text-surface-100 transition hover:bg-primary hover:text-surface-950"
              >
                <span className="truncate">{s.name}</span>
                <span className="shrink-0 rounded bg-surface-950/50 px-1.5 py-0.5 text-[9px] font-normal opacity-70">
                  Lvl {s.elevation}
                </span>
              </button>
            ))}
          </div>
        )}
        {query.trim() && searchMatches.length === 0 && (
          <p className="mt-1.5 text-center text-[10px] text-surface-500">No match — try a number or "suite".</p>
        )}
      </div>
    </div>
  );
};

export const FloorSelectorControl = ({ floors, selectedFloor, setSelectedFloor }: { floors: FloorInfo[]; selectedFloor: string | null; setSelectedFloor: (id: string | null) => void }) => (
  <div className="absolute bottom-3 left-3 z-10 flex max-h-[70%] flex-col-reverse gap-1 overflow-y-auto rounded-xl border border-surface-700 bg-surface-900/85 p-1.5 backdrop-blur">
    <button
      onClick={() => setSelectedFloor(null)}
      className={`rounded-lg px-2.5 py-1 text-left text-[11px] transition ${selectedFloor === null ? 'bg-primary text-surface-950' : 'text-surface-300 hover:bg-surface-800'}`}
    >
      All levels
    </button>
    {floors.map((f) => (
      <button
        key={f.id}
        onClick={() => setSelectedFloor(f.id)}
        className={`rounded-lg px-2.5 py-1 text-left text-[11px] transition ${selectedFloor === f.id ? 'bg-primary text-surface-950' : 'text-surface-300 hover:bg-surface-800'}`}
      >
        {f.name}
      </button>
    ))}
  </div>
);

export const ConnectionsLegendControl = ({
  connFilter,
  setConnFilter,
  accessibleOnly,
  setAccessibleOnly,
  connectionCount,
  visibleConnCount,
  selectedElevation,
  selectedFloorName,
}: {
  connFilter: Record<ConnectionKind, boolean>;
  setConnFilter: React.Dispatch<React.SetStateAction<Record<ConnectionKind, boolean>>>;
  accessibleOnly: boolean;
  setAccessibleOnly: (v: boolean) => void;
  connectionCount: (kind: ConnectionKind) => number;
  visibleConnCount: number;
  selectedElevation: number | null;
  selectedFloorName: string;
}) => (
  <div className="absolute right-3 top-14 z-10 w-[168px] rounded-xl border border-surface-700 bg-surface-900/85 p-2 backdrop-blur">
    <p className="mb-1.5 text-[10px] font-mono uppercase tracking-wider text-surface-400">Getting around</p>
    <div className="flex flex-col gap-1">
      {(Object.keys(CONNECTION_STYLE) as ConnectionKind[]).map((kind) => {
        const style = CONNECTION_STYLE[kind];
        const on = connFilter[kind];
        const count = connectionCount(kind);
        return (
          <button
            key={kind}
            onClick={() => setConnFilter((prev) => ({ ...prev, [kind]: !prev[kind] }))}
            className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-left text-[11px] transition ${on ? 'bg-surface-800 text-surface-50' : 'text-surface-500 hover:bg-surface-800/50'}`}
          >
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: on ? style.color : 'transparent', border: `1px solid ${style.color}` }}
              />
              {style.icon} {style.label}
            </span>
            <span className="text-[9px] opacity-60">{count}</span>
          </button>
        );
      })}
    </div>
    <label className="mt-1.5 flex cursor-pointer items-center gap-1.5 border-t border-surface-800 pt-1.5 text-[10px] text-surface-300">
      <input
        type="checkbox"
        checked={accessibleOnly}
        onChange={(e) => setAccessibleOnly(e.target.checked)}
        className="h-3 w-3 accent-primary"
      />
      ♿ Step-free only
    </label>
    <p className="mt-1 text-[9px] text-surface-500">
      {selectedElevation === null
        ? `${visibleConnCount} shown · all levels`
        : `${visibleConnCount} on ${selectedFloorName || 'this level'}`}
    </p>
  </div>
);

export const ActiveSectionCard = ({
  activeSectionObj,
  floors,
  setActiveSection,
  routePts,
  setRoutePts,
  showRouteToActive,
  routing,
}: {
  activeSectionObj: SectionInfo;
  floors: FloorInfo[];
  setActiveSection: (s: string | null) => void;
  routePts: RoutePoint[] | null;
  setRoutePts: (r: RoutePoint[] | null) => void;
  showRouteToActive: (stepFree: boolean) => void;
  routing: boolean;
}) => (
  <div className="absolute bottom-3 right-3 z-10 w-[230px] rounded-xl border border-amber-500/40 bg-surface-900/92 p-3 backdrop-blur">
    <button
      onClick={() => setActiveSection(null)}
      className="absolute right-2 top-2 text-surface-500 hover:text-surface-200"
      aria-label="Clear section"
    >
      ×
    </button>
    <p className="text-[10px] font-mono uppercase tracking-wider text-amber-400">Seating section</p>
    <p className="pr-4 text-lg font-bold text-surface-50">
      {/^\d/.test(activeSectionObj.name) ? `Section ${activeSectionObj.name}` : activeSectionObj.name}
    </p>
    <p className="mt-0.5 text-[11px] text-surface-400">
      {floors.find((f) => f.id === activeSectionObj.floorId)?.name ?? 'Seating bowl'}
    </p>
    <div className="mt-2.5 flex items-center gap-1.5">
      {routePts ? (
        <button
          onClick={() => setRoutePts(null)}
          className="flex-1 rounded-lg border border-surface-600 px-2 py-1.5 text-[11px] font-semibold text-surface-200 transition hover:bg-surface-800"
        >
          Hide path
        </button>
      ) : (
        <button
          onClick={() => showRouteToActive(false)}
          disabled={routing}
          className="flex-1 rounded-lg bg-amber-500 px-2 py-1.5 text-[11px] font-bold text-surface-950 transition hover:bg-amber-400 disabled:opacity-50"
        >
          {routing ? 'Routing…' : 'Walk me there'}
        </button>
      )}
    </div>
    {routePts && (
      <p className="mt-1.5 text-[10px] text-surface-500">
        Path from {routePts[0]?.label ?? 'gate'} · {routePts.length} steps
      </p>
    )}
  </div>
);

export const ClickedRoomPopup = ({ picked, setPicked }: { picked: { name: string; floorName: string }; setPicked: (p: null) => void }) => (
  <div className="absolute bottom-3 right-3 z-10 max-w-[220px] rounded-xl border border-surface-700 bg-surface-900/90 p-3 backdrop-blur">
    <button
      onClick={() => setPicked(null)}
      className="absolute right-2 top-2 text-surface-500 hover:text-surface-200"
      aria-label="Close"
    >
      ×
    </button>
    <p className="pr-4 text-sm font-semibold text-surface-100">{picked.name}</p>
    <p className="mt-0.5 text-[11px] text-surface-400">{picked.floorName}</p>
  </div>
);
