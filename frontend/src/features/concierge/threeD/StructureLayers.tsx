import { useMemo } from 'react';
import { Entity, PolygonGraphics, PointGraphics, PolylineGraphics, CylinderGraphics } from 'resium';
import { Cartesian3, Color, Cartesian2, PolygonHierarchy, PolylineGlowMaterialProperty, PolylineDashMaterialProperty } from 'cesium';
import {
  floorHeights,
  floorColor,
  matchFacility,
  FACILITY_STYLE,
  CONNECTION_STYLE,
  type FloorInfo,
  type RoomShape,
  type SectionInfo,
  type FacilityKind,
  type ConnectionInfo,
  type ConnectionKind,
} from '../floorData.ts';

const METLIFE = { lat: 40.8128, lng: -74.0742 };

export const StructureFloorLayer = ({ floors, selectedFloor }: { floors: FloorInfo[]; selectedFloor: string | null }) => {
  return (
    <>
      {floors.map((floor) => {
        const { base, top } = floorHeights(floor.elevation);
        const isSel = floor.id === selectedFloor;
        const dimmed = selectedFloor !== null && !isSel;
        const alpha = dimmed ? 0.1 : 0.42;
        return floor.geometry.type === 'Polygon'
          ? renderSlab(floor.id, floor.geometry.coordinates, base, top, floorColor(floor.elevation, floors.length, alpha), isSel)
          : floor.geometry.coordinates.map((rings, i) =>
              renderSlab(`${floor.id}-${i}`, rings, base, top, floorColor(floor.elevation, floors.length, alpha), isSel),
            );
      })}
      {floors.map((floor) => {
        const { base } = floorHeights(floor.elevation);
        const isSel = floor.id === selectedFloor;
        return (
          <Entity
            key={`lbl-${floor.id}`}
            position={Cartesian3.fromDegrees(METLIFE.lng - 0.0026, METLIFE.lat + 0.0022, base + 2)}
            label={{
              text: floor.name,
              font: isSel ? 'bold 13px sans-serif' : '12px sans-serif',
              fillColor: isSel ? Color.fromCssColorString('#7dd3fc') : Color.fromCssColorString('#cbd5e1'),
              outlineColor: Color.BLACK,
              outlineWidth: 3,
              showBackground: true,
              backgroundColor: Color.fromCssColorString('#0f172a').withAlpha(0.6),
              pixelOffset: new Cartesian2(0, 0),
            }}
          />
        );
      })}
    </>
  );
};

export const StructureRoomsLayer = ({
  rooms,
  sections,
  selectedFloor,
  selectedElevation,
  selectedFloorName,
  activeSection,
  activateSection,
  setPicked,
}: {
  rooms: RoomShape[];
  sections: SectionInfo[];
  selectedFloor: string | null;
  selectedElevation: number | null;
  selectedFloorName: string;
  activeSection: string | null;
  activateSection: (name: string) => void;
  setPicked: (p: { name: string; floorName: string } | null) => void;
}) => {
  const sectionByPolygon = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sections) {
      if (s.floorId === selectedFloor) m.set(s.polygonId, s.name);
    }
    return m;
  }, [sections, selectedFloor]);

  if (selectedElevation === null) return null;

  return (
    <>
      {rooms.map((room) => {
        const { top } = floorHeights(selectedElevation);
        const sectionName = sectionByPolygon.get(room.id) ?? null;
        const isActive = sectionName !== null && sectionName === activeSection;
        const onClick = sectionName
          ? () => activateSection(sectionName)
          : () => room.name && setPicked({ name: room.name, floorName: selectedFloorName });
        return room.hierarchies.map((h, i) => (
          <Entity key={`${room.id}-${i}`} {...(room.name ? { name: room.name } : {})} onClick={onClick}>
            <PolygonGraphics
              hierarchy={h}
              height={top}
              extrudedHeight={isActive ? top + 20 : top + 4}
              material={isActive ? Color.fromCssColorString('#f59e0b').withAlpha(0.92) : Color.fromCssColorString('#cbd5e1').withAlpha(0.82)}
              outline
              outlineColor={isActive ? Color.fromCssColorString('#fde68a') : Color.fromCssColorString('#334155')}
            />
          </Entity>
        ));
      })}
    </>
  );
};

export const FacilityPinsLayer = ({
  rooms,
  selectedElevation,
  selectedFloorName,
  setPicked,
}: {
  rooms: RoomShape[];
  selectedElevation: number | null;
  selectedFloorName: string;
  setPicked: (p: { name: string; floorName: string } | null) => void;
}) => {
  const facilityPins = useMemo(() => {
    if (selectedElevation === null) return [];
    const { top } = floorHeights(selectedElevation);
    return rooms
      .filter((r) => r.center && r.name)
      .map((r) => ({ room: r, kind: matchFacility(r.name) }))
      .filter((x): x is { room: typeof x.room; kind: FacilityKind } => x.kind !== null)
      .map((x) => {
        const style = FACILITY_STYLE[x.kind];
        const c = x.room.center as [number, number];
        return {
          id: x.room.id,
          name: x.room.name,
          label: `${style.icon} ${style.label}`,
          color: style.color,
          position: Cartesian3.fromDegrees(c[0], c[1], top + 6),
        };
      });
  }, [rooms, selectedElevation]);

  return (
    <>
      {facilityPins.map((pin) => (
        <Entity
          key={`fac-${pin.id}`}
          position={pin.position}
          onClick={() => setPicked({ name: pin.name, floorName: selectedFloorName })}
          point={{ pixelSize: 10, color: Color.fromCssColorString(pin.color), outlineColor: Color.WHITE, outlineWidth: 2 }}
          label={{
            text: pin.label,
            font: '11px sans-serif',
            fillColor: Color.WHITE,
            outlineColor: Color.BLACK,
            outlineWidth: 2,
            pixelOffset: new Cartesian2(0, -16),
            showBackground: true,
            backgroundColor: Color.fromCssColorString(pin.color).withAlpha(0.35),
          }}
        />
      ))}
    </>
  );
};

export const VerticalConnectionsLayer = ({
  connections,
  connFilter,
  accessibleOnly,
  selectedElevation,
  setPicked,
}: {
  connections: ConnectionInfo[];
  connFilter: Record<ConnectionKind, boolean>;
  accessibleOnly: boolean;
  selectedElevation: number | null;
  setPicked: (p: { name: string; floorName: string } | null) => void;
}) => {
  const connectionColumns = useMemo(() => {
    if (connections.length === 0) return [];
    return connections
      .filter((c) => connFilter[c.type] && (!accessibleOnly || c.accessible))
      .filter((c) => selectedElevation === null || c.points.some((p) => p.elevation === selectedElevation))
      .flatMap((c) => {
        const stops = [...c.points].sort((a, b) => a.elevation - b.elevation);
        if (stops.length < 2) return [];
        const hi = stops[stops.length - 1];
        const lo = stops[0];
        if (!hi || !lo) return [];
        const style = CONNECTION_STYLE[c.type];
        const coords = stops.flatMap((p) => [p.coords[0], p.coords[1], floorHeights(p.elevation).base + 1]);
        const color = Color.fromCssColorString(style.color);
        const stopDiscs = stops.map((p) => ({
          id: `${c.id}-${p.elevation}`,
          position: Cartesian3.fromDegrees(p.coords[0], p.coords[1], floorHeights(p.elevation).base + 1),
          onSelectedFloor: p.elevation === selectedElevation,
        }));
        const shaftBase = floorHeights(lo.elevation).base;
        const shaftTop = floorHeights(hi.elevation).top;
        const shaftLength = Math.max(shaftTop - shaftBase, 1);
        return [{
          id: c.id,
          name: c.name,
          type: c.type,
          accessible: c.accessible,
          color,
          icon: style.icon,
          label: style.label,
          positions: Cartesian3.fromDegreesArrayHeights(coords),
          stopDiscs,
          shaftCenter: Cartesian3.fromDegrees(lo.coords[0], lo.coords[1], shaftBase + shaftLength / 2),
          shaftLength,
          topPosition: Cartesian3.fromDegrees(hi.coords[0], hi.coords[1], floorHeights(hi.elevation).top + 4),
        }];
      });
  }, [connections, connFilter, accessibleOnly, selectedElevation]);

  return (
    <>
      {connectionColumns.map((col) => {
        const clickInfo = () => setPicked({ name: `${col.icon} ${col.name}`, floorName: col.accessible ? 'Accessible · step-free' : col.label });
        const dashed = col.type === 'escalator' || col.type === 'ramp';
        return (
          <Entity key={`conn-${col.id}`} onClick={clickInfo}>
            <PolylineGraphics
              positions={col.positions}
              width={col.accessible ? 7 : 5}
              material={
                dashed
                  ? new PolylineDashMaterialProperty({ color: col.color.withAlpha(0.95), dashLength: 12 })
                  : new PolylineGlowMaterialProperty({ glowPower: 0.25, color: col.color.withAlpha(0.9) })
              }
            />
          </Entity>
        );
      })}
      {connectionColumns.filter((col) => col.type === 'elevator').map((col) => (
        <Entity key={`conn-shaft-${col.id}`} position={col.shaftCenter} onClick={() => setPicked({ name: `${col.icon} ${col.name}`, floorName: 'Accessible · step-free' })}>
          <CylinderGraphics
            length={col.shaftLength}
            topRadius={2.2}
            bottomRadius={2.2}
            material={col.color.withAlpha(0.22)}
            outline
            outlineColor={col.color.withAlpha(0.7)}
            slices={16}
          />
        </Entity>
      ))}
      {connectionColumns.flatMap((col) =>
        col.stopDiscs.map((d) => (
          <Entity key={`stop-${d.id}`} position={d.position}>
            <PointGraphics pixelSize={d.onSelectedFloor ? 15 : 7} color={col.color} outlineColor={d.onSelectedFloor ? Color.WHITE : Color.fromCssColorString('#0f172a')} outlineWidth={d.onSelectedFloor ? 3 : 1} />
          </Entity>
        )),
      )}
      {connectionColumns.map((col) => {
        const onFloor = col.stopDiscs.find((d) => d.onSelectedFloor);
        const labelPos = onFloor ? onFloor.position : col.topPosition;
        return (
          <Entity
            key={`conn-name-${col.id}`}
            position={labelPos}
            label={{
              text: `${col.icon} ${col.name}`,
              font: onFloor ? 'bold 11px sans-serif' : '10px sans-serif',
              fillColor: Color.WHITE,
              outlineColor: Color.BLACK,
              outlineWidth: 2,
              pixelOffset: new Cartesian2(0, -14),
              showBackground: true,
              backgroundColor: col.color.withAlpha(onFloor ? 0.6 : 0.4),
            }}
          />
        );
      })}
    </>
  );
};

export const ActiveSectionBeacon = ({
  activeSectionObj,
  selectedElevation,
}: {
  activeSectionObj: SectionInfo | null;
  selectedElevation: number | null;
}) => {
  if (!activeSectionObj || selectedElevation === null) return null;
  return (
    <Entity
      position={Cartesian3.fromDegrees(activeSectionObj.center[0], activeSectionObj.center[1], floorHeights(selectedElevation).top + 30)}
      point={{ pixelSize: 12, color: Color.fromCssColorString('#f59e0b'), outlineColor: Color.WHITE, outlineWidth: 2 }}
      label={{
        text: `Section ${activeSectionObj.name}`,
        font: 'bold 14px sans-serif',
        fillColor: Color.fromCssColorString('#fde68a'),
        outlineColor: Color.BLACK,
        outlineWidth: 3,
        showBackground: true,
        backgroundColor: Color.fromCssColorString('#78350f').withAlpha(0.85),
        pixelOffset: new Cartesian2(0, -18),
      }}
    />
  );
};

function renderSlab(key: string, rings: number[][][], base: number, top: number, color: Color, selected: boolean) {
  const ring0 = rings[0] ?? [];
  const outer = Cartesian3.fromDegreesArray(ring0.flatMap((c) => [c[0] as number, c[1] as number]));
  return (
    <Entity key={key}>
      <PolygonGraphics
        hierarchy={new PolygonHierarchy(outer)}
        height={base}
        extrudedHeight={top}
        material={color}
        outline
        outlineColor={selected ? Color.WHITE.withAlpha(0.9) : Color.fromCssColorString('#0f172a').withAlpha(0.6)}
      />
    </Entity>
  );
}
