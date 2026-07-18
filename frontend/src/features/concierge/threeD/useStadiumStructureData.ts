import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Cartesian3 } from 'cesium';
import {
  loadFloors,
  loadRooms,
  loadSections,
  loadConnections,
  routeToSection,
  floorHeights,
  type FloorInfo,
  type RoomShape,
  type SectionInfo,
  type ConnectionInfo,
  type RoutePoint,
  type ConnectionKind,
} from '../floorData.ts';

const DEFAULT_START_LABEL = 'Metlife VIP Gate';

export function useStadiumStructureData(mode: 'photo' | 'structure') {
  const [errored, setErrored] = useState<string | null>(null);
  const [floors, setFloors] = useState<FloorInfo[]>([]);
  const [selectedFloor, setSelectedFloor] = useState<string | null>(null);
  const [rooms, setRooms] = useState<RoomShape[]>([]);
  const [sections, setSections] = useState<SectionInfo[]>([]);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [connections, setConnections] = useState<ConnectionInfo[]>([]);
  const [connFilter, setConnFilter] = useState<Record<ConnectionKind, boolean>>({
    elevator: true,
    escalator: false,
    stairs: false,
    ramp: true,
  });
  const [accessibleOnly, setAccessibleOnly] = useState(false);
  const [routePts, setRoutePts] = useState<RoutePoint[] | null>(null);
  const [routing, setRouting] = useState(false);
  const [query, setQuery] = useState('');

  const roomsReqRef = useRef(0);
  const routeReqRef = useRef(0);
  const routeAbortRef = useRef<AbortController | null>(null);

  // Lazy-load the floor footprints + section index
  useEffect(() => {
    if (mode !== 'structure' || floors.length > 0) return;
    const ctrl = new AbortController();
    loadFloors(ctrl.signal)
      .then(setFloors)
      .catch((e) => {
        if (!ctrl.signal.aborted) setErrored(e instanceof Error ? e.message : 'Could not load floor data.');
      });
    loadSections(ctrl.signal)
      .then(setSections)
      .catch(() => {});
    loadConnections(ctrl.signal)
      .then(setConnections)
      .catch(() => {});
    return () => ctrl.abort();
  }, [mode, floors.length]);

  // When a floor is selected, fetch its rooms
  useEffect(() => {
    if (!selectedFloor) {
      setRooms([]);
      return;
    }
    const reqId = ++roomsReqRef.current;
    const ctrl = new AbortController();
    loadRooms(selectedFloor, ctrl.signal)
      .then((r) => {
        if (reqId === roomsReqRef.current) setRooms(r);
      })
      .catch(() => {
        if (reqId === roomsReqRef.current) setRooms([]);
      });
    return () => ctrl.abort();
  }, [selectedFloor]);

  const activateSection = useCallback(
    (name: string, onStageMode?: () => void) => {
      const sec = sections.find((s) => s.name.toUpperCase() === name.toUpperCase());
      if (!sec) return false;
      onStageMode?.();
      setSelectedFloor(sec.floorId);
      setActiveSection(sec.name);
      setQuery('');
      return true;
    },
    [sections],
  );

  const activeSectionObj = useMemo(
    () => sections.find((s) => s.name === activeSection) ?? null,
    [sections, activeSection],
  );

  const cancelRoute = useCallback(() => {
    routeReqRef.current += 1;
    routeAbortRef.current?.abort();
    routeAbortRef.current = null;
    setRouting(false);
  }, []);

  const showRouteToActive = useCallback(
    (stepFree = false) => {
      if (!activeSection) return;
      cancelRoute();
      const reqId = routeReqRef.current;
      const controller = new AbortController();
      routeAbortRef.current = controller;
      setRouting(true);
      routeToSection(activeSection, DEFAULT_START_LABEL, stepFree, controller.signal)
        .then((pts) => {
          if (reqId !== routeReqRef.current) return;
          setRoutePts(pts);
          setRouting(false);
          routeAbortRef.current = null;
        })
        .catch(() => {
          if (reqId !== routeReqRef.current) return;
          setRoutePts(null);
          setRouting(false);
          routeAbortRef.current = null;
        });
    },
    [activeSection, cancelRoute],
  );

  useEffect(() => {
    cancelRoute();
    setRoutePts(null);
    return () => cancelRoute();
  }, [activeSection, cancelRoute]);

  useEffect(() => () => cancelRoute(), [cancelRoute]);

  const routePositions3D = useMemo(() => {
    if (!routePts) return null;
    const heights = routePts.flatMap((p) => {
      const top = floorHeights(p.level).top;
      return [p.coords[0], p.coords[1], top + 6];
    });
    return Cartesian3.fromDegreesArrayHeights(heights);
  }, [routePts]);

  const routeStart = routePts && routePts.length > 0 ? routePts[0] : null;



  const selectedElevation = useMemo(
    () => floors.find((f) => f.id === selectedFloor)?.elevation ?? null,
    [floors, selectedFloor],
  );
  
  const selectedFloorName = useMemo(
    () => floors.find((f) => f.id === selectedFloor)?.name ?? '',
    [floors, selectedFloor],
  );

  return {
    errored,
    setErrored,
    floors,
    setFloors,
    selectedFloor,
    setSelectedFloor,
    rooms,
    sections,
    setSections,
    activeSection,
    setActiveSection,
    connections,
    connFilter,
    setConnFilter,
    accessibleOnly,
    setAccessibleOnly,
    routePts,
    setRoutePts,
    routing,
    query,
    setQuery,
    activateSection,
    activeSectionObj,
    showRouteToActive,
    routePositions3D,
    routeStart,
    selectedElevation,
    selectedFloorName,
  };
}
