import { useEffect } from 'react';
import { Cartesian3, Math as CesiumMath, Color } from 'cesium';
import type { Viewer as CesiumViewer } from 'cesium';
import type { CesiumComponentRef } from 'resium';
import { floorHeights, type SectionInfo } from '../floorData.ts';

const METLIFE = { lat: 40.8128, lng: -74.0742 };

export function useCesiumCamera(
  viewerRef: React.RefObject<CesiumComponentRef<CesiumViewer> | null>,
  mode: 'photo' | 'structure',
  activeSection: string | null,
  activeSectionObj: SectionInfo | null,
) {
  // Stage the scene per mode
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;
    const scene = viewer.scene;
    if (mode === 'structure') {
      scene.globe.show = false;
      scene.backgroundColor = Color.fromCssColorString('#0a0e16');
      if (scene.skyBox) scene.skyBox.show = false;
      if (scene.skyAtmosphere) scene.skyAtmosphere.show = false;
      
      if (!activeSection) {
        viewer.camera.flyTo({
          destination: Cartesian3.fromDegrees(METLIFE.lng, METLIFE.lat - 0.0042, 360),
          orientation: { heading: CesiumMath.toRadians(15), pitch: CesiumMath.toRadians(-24), roll: 0 },
          duration: 1.6,
        });
      }
    } else {
      scene.globe.show = true;
      if (scene.skyBox) scene.skyBox.show = true;
      if (scene.skyAtmosphere) scene.skyAtmosphere.show = true;
    }
    scene.requestRender();
    // reason: flyTo and staging only run when mode/section change, ignoring viewer ref updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Fly to the active section
  useEffect(() => {
    if (mode !== 'structure' || !activeSectionObj) return;
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;
    const { top } = floorHeights(activeSectionObj.elevation);
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(
        activeSectionObj.center[0],
        activeSectionObj.center[1] - 0.0016,
        top + 190,
      ),
      orientation: { heading: CesiumMath.toRadians(0), pitch: CesiumMath.toRadians(-42), roll: 0 },
      duration: 1.8,
    });
    viewer.scene.requestRender();
    // reason: flyTo and staging only run when mode/section change, ignoring viewer ref updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, activeSectionObj]);
}
