import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  Ion,
  IonGeocodeProviderType,
  Cartesian2,
  Cartesian3,
  Color,
  HeightReference,
  PolylineGlowMaterialProperty,
  type Viewer as CesiumViewer,
} from 'cesium';
import {
  Viewer,
  GooglePhotorealistic3DTileset,
  Entity,
  PolylineGraphics,
  CameraFlyTo,
  type CesiumComponentRef,
} from 'resium';
import polyline from '@mapbox/polyline';

import { floorHeights } from './floorData.ts';

import { useCesiumPerformanceProfile } from './threeD/useCesiumPerformanceProfile.ts';
import { usePageVisible } from './threeD/usePageVisible.ts';
import { useStadiumStructureData } from './threeD/useStadiumStructureData.ts';
import { useCesiumCamera } from './threeD/useCesiumCamera.ts';

import {
  StructureFloorLayer,
  StructureRoomsLayer,
  FacilityPinsLayer,
  VerticalConnectionsLayer,
  ActiveSectionBeacon,
} from './threeD/StructureLayers.tsx';

import {
  ModeToggle,
  SectionSearchControl,
  FloorSelectorControl,
  ConnectionsLegendControl,
  ActiveSectionCard,
  ClickedRoomPopup,
} from './threeD/OverlayControls.tsx';

interface StadiumMap3DProps {
  userLocation: { lat: number; lng: number } | null;
  encodedPolyline?: string | null;
  /** A seating section name (e.g. "128") to highlight — driven by the concierge. */
  focusSection?: string | null;
}

const METLIFE = { lat: 40.8128, lng: -74.0742 };
const ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN;
if (ION_TOKEN) Ion.defaultAccessToken = ION_TOKEN;

type ViewMode = 'photo' | 'structure';

export const StadiumMap3D: React.FC<StadiumMap3DProps> = ({ userLocation, encodedPolyline, focusSection }) => {
  const performanceProfile = useCesiumPerformanceProfile();
  const pageVisible = usePageVisible();
  
  const [mode, setMode] = useState<ViewMode>('photo');
  const [picked, setPicked] = useState<{ name: string; floorName: string } | null>(null);
  
  const viewerRef = useRef<CesiumComponentRef<CesiumViewer> | null>(null);

  const data = useStadiumStructureData(mode);

  useCesiumCamera(viewerRef, mode, data.activeSection, data.activeSectionObj);

  const sectionsLength = data.sections.length;
  const activateSection = data.activateSection;
  useEffect(() => {
    if (!focusSection) return;
    if (sectionsLength === 0) {
      activateSection(focusSection, () => setMode('structure'));
      return undefined;
    }
    activateSection(focusSection, () => setMode('structure'));
    return undefined;
  }, [focusSection, sectionsLength, activateSection]);

  const routePositions = useMemo(() => {
    if (!encodedPolyline) return null;
    try {
      const pairs = polyline.decode(encodedPolyline) as [number, number][];
      if (pairs.length < 2) return null;
      return Cartesian3.fromDegreesArrayHeights(pairs.flatMap(([lat, lng]) => [lng, lat, 8]));
    } catch {
      return null;
    }
  }, [encodedPolyline]);

  useEffect(() => {
    if (!pageVisible) return;
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer || viewer.isDestroyed()) return;
    viewer.scene.requestRender();
  }, [
    pageVisible,
    performanceProfile,
    mode,
    data.floors,
    data.selectedFloor,
    data.rooms,
    data.activeSection,
    data.routePositions3D,
    data.connections,
    data.connFilter,
    data.accessibleOnly,
    data.selectedElevation,
    routePositions,
    userLocation,
  ]);

  if (!ION_TOKEN) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-surface-950 p-6 text-center" style={{ minHeight: '300px' }}>
        <div className="max-w-xs">
          <p className="text-sm font-semibold text-surface-100">Enable the 3D MetLife view</p>
          <p className="mt-2 text-xs leading-relaxed text-surface-400">
            Add your free Cesium Ion token to <code className="text-primary-300">frontend/.env</code> as
            {' '}<code className="text-primary-300">VITE_CESIUM_ION_TOKEN=…</code>, then restart Vite.
          </p>
          <p className="mt-2 text-[11px] text-surface-500">The 2D map and all navigation work without it.</p>
        </div>
      </div>
    );
  }

  if (data.errored) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-surface-950/90 p-6 text-center backdrop-blur" style={{ minHeight: '300px' }}>
        <div className="max-w-xs">
          <p className="text-sm font-semibold text-red-300">3D view could not load</p>
          <p className="mt-2 break-words text-xs text-surface-400">{data.errored}</p>
          <p className="mt-2 text-[11px] text-surface-500">Switch to 2D — route guidance remains available.</p>
        </div>
      </div>
    );
  }

  const showTiles = mode === 'photo';
  const focus = userLocation ?? METLIFE;

  // Let's compute some data for legends
  const visibleConnCount = data.connections
      .filter((c) => data.connFilter[c.type] && (!data.accessibleOnly || c.accessible))
      .filter((c) => data.selectedElevation === null || c.points.some((p) => p.elevation === data.selectedElevation))
      .length;

  return (
    <div className="relative h-full w-full" style={{ minHeight: '300px' }}>
      <Viewer
        ref={viewerRef}
        full
        geocoder={IonGeocodeProviderType.GOOGLE}
        baseLayer={false}
        baseLayerPicker={false}
        homeButton={false}
        sceneModePicker={false}
        navigationHelpButton={false}
        animation={false}
        timeline={false}
        fullscreenButton={false}
        infoBox={false}
        selectionIndicator={false}
        scene3DOnly
        requestRenderMode
        maximumRenderTimeChange={Infinity}
        useDefaultRenderLoop={pageVisible}
        resolutionScale={performanceProfile.resolutionScale}
        useBrowserRecommendedResolution={false}
        targetFrameRate={performanceProfile.targetFrameRate}
        msaaSamples={1}
      >
        <GooglePhotorealistic3DTileset
          show={showTiles && pageVisible}
          onlyUsingWithGoogleGeocoder
          maximumScreenSpaceError={performanceProfile.maximumScreenSpaceError}
          cacheBytes={performanceProfile.tileCacheBytes}
          cullRequestsWhileMoving
          preloadWhenHidden={false}
          preloadFlightDestinations={false}
          foveatedScreenSpaceError
          skipLevelOfDetail={performanceProfile.isHandset}
          onError={(err) => data.setErrored(err instanceof Error ? err.message : 'Google 3D Tiles could not load.')}
        />

        <CameraFlyTo
          duration={2}
          destination={Cartesian3.fromDegrees(focus.lng, focus.lat, 700)}
          orientation={{
            heading: 0,
            pitch: -0.6632251157578453, // Math.toRadians(-38)
            roll: 0,
          }}
          once
        />

        {mode === 'structure' && (
          <>
            <StructureFloorLayer floors={data.floors} selectedFloor={data.selectedFloor} />
            <StructureRoomsLayer
              rooms={data.rooms}
              sections={data.sections}
              selectedFloor={data.selectedFloor}
              selectedElevation={data.selectedElevation}
              selectedFloorName={data.selectedFloorName}
              activeSection={data.activeSection}
              activateSection={(name) => data.activateSection(name, () => setMode('structure'))}
              setPicked={setPicked}
            />
            <VerticalConnectionsLayer
              connections={data.connections}
              connFilter={data.connFilter}
              accessibleOnly={data.accessibleOnly}
              selectedElevation={data.selectedElevation}
              setPicked={setPicked}
            />
            <FacilityPinsLayer
              rooms={data.rooms}
              selectedElevation={data.selectedElevation}
              selectedFloorName={data.selectedFloorName}
              setPicked={setPicked}
            />
            <ActiveSectionBeacon
              activeSectionObj={data.activeSectionObj}
              selectedElevation={data.selectedElevation}
            />
          </>
        )}

        {mode === 'photo' && (
          <Entity
            position={Cartesian3.fromDegrees(METLIFE.lng, METLIFE.lat, 60)}
            point={{ pixelSize: 14, color: Color.fromCssColorString('#3b82f6'), outlineColor: Color.WHITE, outlineWidth: 2 }}
            label={{ text: 'MetLife Stadium', font: '14px sans-serif', fillColor: Color.WHITE, outlineColor: Color.BLACK, outlineWidth: 2, pixelOffset: new Cartesian2(0, -22) }}
          />
        )}

        {userLocation && (
          <Entity
            position={Cartesian3.fromDegrees(userLocation.lng, userLocation.lat, 20)}
            point={{ pixelSize: 12, color: Color.fromCssColorString('#22c55e'), outlineColor: Color.WHITE, outlineWidth: 2, heightReference: HeightReference.NONE }}
            label={{ text: 'You', font: '12px sans-serif', fillColor: Color.WHITE, outlineColor: Color.BLACK, outlineWidth: 2, pixelOffset: new Cartesian2(0, -18) }}
          />
        )}

        {routePositions && mode === 'photo' && (
          <Entity>
            <PolylineGraphics
              positions={routePositions}
              width={5}
              material={Color.fromCssColorString('#3b82f6').withAlpha(0.96)}
              clampToGround
            />
          </Entity>
        )}

        {data.routePositions3D && mode === 'structure' && (
          <Entity>
            <PolylineGraphics
              positions={data.routePositions3D}
              width={6}
              material={
                new PolylineGlowMaterialProperty({
                  color: Color.fromCssColorString('#f59e0b'),
                  glowPower: 0.25,
                })
              }
            />
          </Entity>
        )}
        {data.routeStart && mode === 'structure' && (
          <Entity
            position={Cartesian3.fromDegrees(
              data.routeStart.coords[0],
              data.routeStart.coords[1],
              floorHeights(data.routeStart.level).top + 10,
            )}
            point={{ pixelSize: 12, color: Color.fromCssColorString('#22c55e'), outlineColor: Color.WHITE, outlineWidth: 2 }}
            label={{
              text: `Start · ${data.routeStart.label}`,
              font: '11px sans-serif',
              fillColor: Color.WHITE,
              outlineColor: Color.BLACK,
              outlineWidth: 2,
              showBackground: true,
              backgroundColor: Color.fromCssColorString('#065f46').withAlpha(0.85),
              pixelOffset: new Cartesian2(0, -16),
            }}
          />
        )}
      </Viewer>

      <ModeToggle mode={mode} setMode={setMode} />

      {mode === 'structure' && data.sections.length > 0 && (
        <SectionSearchControl
          sections={data.sections}
          query={data.query}
          setQuery={data.setQuery}
          activateSection={(name) => data.activateSection(name, () => setMode('structure'))}
        />
      )}

      {mode === 'structure' && data.floors.length > 0 && (
        <FloorSelectorControl floors={data.floors} selectedFloor={data.selectedFloor} setSelectedFloor={data.setSelectedFloor} />
      )}

      {mode === 'structure' && data.connections.length > 0 && (
        <ConnectionsLegendControl
          connFilter={data.connFilter}
          setConnFilter={data.setConnFilter}
          accessibleOnly={data.accessibleOnly}
          setAccessibleOnly={data.setAccessibleOnly}
          connectionCount={(kind) => data.connections.filter((c) => c.type === kind).length}
          visibleConnCount={visibleConnCount}
          selectedElevation={data.selectedElevation}
          selectedFloorName={data.selectedFloorName}
        />
      )}

      {mode === 'structure' && data.activeSectionObj && (
        <ActiveSectionCard
          activeSectionObj={data.activeSectionObj}
          floors={data.floors}
          setActiveSection={data.setActiveSection}
          routePts={data.routePts}
          setRoutePts={data.setRoutePts}
          showRouteToActive={data.showRouteToActive}
          routing={data.routing}
        />
      )}

      {picked && !data.activeSectionObj && (
        <ClickedRoomPopup picked={picked} setPicked={setPicked} />
      )}

      <div className="pointer-events-none absolute right-3 top-3 z-10 rounded-full border border-surface-700 bg-surface-900/85 px-2 py-0.5 text-[10px] font-mono text-surface-300 backdrop-blur">
        {mode === 'photo' ? '3D · Cesium Ion' : '3D · MetLife structure'}
      </div>
    </div>
  );
};
