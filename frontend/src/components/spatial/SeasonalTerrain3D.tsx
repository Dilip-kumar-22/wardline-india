import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ThemeId } from '../../types/wardline';
import { fmtCompactIN, MONTH_SHORT } from '../../utils/format';
import { formatMeasurement } from '../../utils/formatMeasurement';
import { getThemePalette, interpolateRamp } from '../../viz/palettes';
import { computeTerrainBarHeight } from '../../viz/selectors';
import { TerrainCell, TerrainMatrix } from '../../viz/types';
import { fittedVerticalFov } from './cameraFraming';

interface Props {
  matrix: TerrainMatrix;
  unit: string;
  theme: ThemeId;
  reduceMotion: boolean;
  onWebGLError?: (reason: string) => void;
}

type CameraPreset = 'perspective' | 'top' | 'front';
type ProjectionMode = 'perspective' | 'orthographic';

interface TerrainHit {
  cell: TerrainCell;
  quantitativeHeight: number | null;
}

export const SeasonalTerrain3D: React.FC<Props> = ({ matrix, unit, theme, reduceMotion, onWebGLError }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [projection, setProjection] = useState<ProjectionMode>('perspective');
  const [preset, setPreset] = useState<CameraPreset>('perspective');
  const [resetTick, setResetTick] = useState(0);
  const [hovered, setHovered] = useState<TerrainHit | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);

  const palette = getThemePalette(theme);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'default',
        preserveDrawingBuffer: true, // DEF-17: enables reliable PNG canvas snapshot export
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to initialize WebGL 2 context.';
      setWebglError(msg);
      onWebGLError?.(msg);
      return;
    }

    setWebglError(null);
    setHovered(null);
    let width = Math.max(1, container.clientWidth);
    let height = Math.max(1, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(new THREE.Color(palette.panelBg), 1);
    renderer.domElement.style.display = 'block';

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      const msg = 'The seasonal terrain lost its WebGL context.';
      setWebglError(msg);
      onWebGLError?.(msg);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost, false);

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.72));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.75);
    dirLight.position.set(14, 24, 16);
    scene.add(dirLight);

    const cols = 12;
    const rows = Math.max(1, matrix.years.length);
    const maxBarHeight = 5.4;
    const spacingX = 1.15;
    const spacingZ = 1.25;
    const offsetX = -((cols - 1) * spacingX) / 2;
    const offsetZ = -((rows - 1) * spacingZ) / 2;

    const gridW = cols * spacingX + 1.2;
    const gridD = rows * spacingZ + 1.2;
    const baseGeo = new THREE.PlaneGeometry(gridW, gridD);
    const baseMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(palette.panelGrid),
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
    });
    const basePlane = new THREE.Mesh(baseGeo, baseMat);
    basePlane.rotation.x = -Math.PI / 2;
    basePlane.position.y = -0.02;
    scene.add(basePlane);

    const geometries: THREE.BufferGeometry[] = [baseGeo];
    const materials: THREE.Material[] = [baseMat];
    const interactiveMeshes: THREE.Mesh[] = [];
    const span = Math.max(1e-6, matrix.maxValue - matrix.minValue);

    const boxGeo = new THREE.BoxGeometry(0.86, 1, 0.86);
    const flatMarkerGeo = new THREE.PlaneGeometry(0.76, 0.76);
    geometries.push(boxGeo, flatMarkerGeo);

    const missingMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(palette.missingFill),
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
    });
    const zeroMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(palette.zeroFill),
      side: THREE.DoubleSide,
    });
    materials.push(missingMat, zeroMat);

    matrix.cells.forEach((row, yIdx) => {
      row.forEach((cell, mIdx) => {
        const x = offsetX + mIdx * spacingX;
        const z = offsetZ + yIdx * spacingZ;
        const h = computeTerrainBarHeight(cell, maxBarHeight);

        if (h === null) {
          // Missing observation: flat non-quantitative marker at y=0
          const gapMesh = new THREE.Mesh(flatMarkerGeo, missingMat);
          gapMesh.rotation.x = -Math.PI / 2;
          gapMesh.position.set(x, 0.002, z);
          gapMesh.userData = { cell, quantitativeHeight: null };
          scene.add(gapMesh);
          interactiveMeshes.push(gapMesh);
          return;
        }

        if (h === 0) {
          // DEF-14: Observed zero has strictly 0 quantitative height, shown via flat non-quantitative disc/plate
          const zMesh = new THREE.Mesh(flatMarkerGeo, zeroMat);
          zMesh.rotation.x = -Math.PI / 2;
          zMesh.position.set(x, 0.004, z);
          zMesh.userData = { cell, quantitativeHeight: 0 };
          scene.add(zMesh);
          interactiveMeshes.push(zMesh);
          return;
        }

        const colorHex = interpolateRamp((cell.value! - matrix.minValue) / span, palette);
        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(colorHex),
          roughness: 0.55,
          metalness: 0.06,
        });
        materials.push(mat);
        const mesh = new THREE.Mesh(boxGeo, mat);
        mesh.scale.set(1, h, 1);
        mesh.position.set(x, h / 2, z);
        mesh.userData = { cell, baseColor: colorHex, quantitativeHeight: h };
        scene.add(mesh);
        interactiveMeshes.push(mesh);
      });
    });

    const aspect = width / height;
    const orthoExtent = 10.5;
    const camera: THREE.PerspectiveCamera | THREE.OrthographicCamera =
      projection === 'orthographic'
        ? new THREE.OrthographicCamera(
            -orthoExtent * Math.max(1, aspect), orthoExtent * Math.max(1, aspect),
            orthoExtent / Math.min(1, aspect), -orthoExtent / Math.min(1, aspect), 0.1, 100,
          )
        : new THREE.PerspectiveCamera(fittedVerticalFov(42, aspect), aspect, 0.1, 120);

    if (preset === 'top') {
      camera.position.set(0, 22, 0.01);
    } else if (preset === 'front') {
      camera.position.set(0, 4.2, 20);
    } else {
      camera.position.set(13.5, 11.5, 14.5);
    }
    camera.lookAt(0, 1.4, 0);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !reduceMotion;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 1.2, 0);
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.minDistance = 6;
    controls.maxDistance = 42;
    controls.update();

    let isVisible = true;
    let rafId: number | null = null;
    const renderScene = () => {
      rafId = null;
      if (!isVisible || !renderer) return;
      if (controls.enableDamping) controls.update();
      renderer.render(scene, camera);
      if (document.documentElement.dataset.wardlineVerify === 'spatial') {
        const data = renderer.domElement.dataset;
        data.cameraPosition = camera.position.toArray().join(',');
        data.cameraTarget = controls.target.toArray().join(',');
        data.cameraProjection = projection;
        data.cameraZoom = String(camera.zoom);
        data.cameraDamping = String(controls.enableDamping);
        data.drawCalls = String(renderer.info.render.calls);
        data.triangles = String(renderer.info.render.triangles);
      }
    };
    const requestRender = () => {
      if (rafId === null && isVisible) {
        rafId = window.requestAnimationFrame(renderScene);
      }
    };

    controls.addEventListener('change', requestRender);
    requestRender();

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let highlightedMesh: THREE.Mesh | null = null;

    const onPointerMove = (e: PointerEvent) => {
      if (!renderer) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(interactiveMeshes, false);

      if (highlightedMesh && highlightedMesh.userData.baseColor) {
        (highlightedMesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
        highlightedMesh = null;
      }

      if (hits.length > 0) {
        const hitMesh = hits[0].object as THREE.Mesh;
        setHovered(hitMesh.userData as TerrainHit);
        if (hitMesh.userData.baseColor) {
          (hitMesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x333333);
          highlightedMesh = hitMesh;
        }
        requestRender();
      } else {
        setHovered(null);
        requestRender();
      }
    };

    renderer.domElement.addEventListener('pointermove', onPointerMove);
    const onPointerLeave = () => {
      if (highlightedMesh) {
        (highlightedMesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
        highlightedMesh = null;
      }
      setHovered(null);
      requestRender();
    };
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);

    const io =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver((entries) => {
            isVisible = entries[0]?.isIntersecting ?? true;
            if (isVisible) requestRender();
          })
        : null;
    io?.observe(container);

    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            if (!renderer || !container) return;
            const nextWidth = Math.max(1, container.clientWidth);
            const nextHeight = Math.max(1, container.clientHeight);
            if (nextWidth === width && nextHeight === height) return;
            width = nextWidth;
            height = nextHeight;
            renderer.setSize(width, height);
            const na = width / height;
            if (camera instanceof THREE.PerspectiveCamera) {
              camera.aspect = na;
              camera.fov = fittedVerticalFov(42, na);
            } else {
              camera.left = -orthoExtent * Math.max(1, na);
              camera.right = -camera.left;
              camera.top = orthoExtent / Math.min(1, na);
              camera.bottom = -camera.top;
            }
            camera.updateProjectionMatrix();
            requestRender();
          })
        : null;
    ro?.observe(container);

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      io?.disconnect();
      ro?.disconnect();
      renderer?.domElement.removeEventListener('pointermove', onPointerMove);
      renderer?.domElement.removeEventListener('pointerleave', onPointerLeave);
      renderer?.domElement.removeEventListener('webglcontextlost', onContextLost);
      controls.removeEventListener('change', requestRender);
      controls.dispose();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      renderer?.dispose();
      if (renderer && !renderer.getContext().isContextLost()) renderer.forceContextLoss();
      if (container) container.innerHTML = '';
    };
  }, [matrix, palette, projection, preset, resetTick, reduceMotion, onWebGLError]);

  if (webglError) {
    return (
      <div className="unavailable-box">
        <strong>WebGL context unavailable:</strong> {webglError}
      </div>
    );
  }

  const unitLabel = matrix.mode === 'daily_rate' ? `${unit}/day` : unit;
  const hoveredCell = hovered?.cell;

  return (
    <div>
      <div className="filter-bar" style={{ marginBottom: '12px' }}>
        <button
          type="button"
          className={`btn ${preset === 'perspective' ? 'primary' : ''}`}
          onClick={() => {
            setPreset('perspective');
            setResetTick((t) => t + 1);
          }}
          style={{ minHeight: '32px', padding: '4px 10px', fontSize: '12px' }}
        >
          Perspective View
        </button>
        <button
          type="button"
          className={`btn ${preset === 'top' ? 'primary' : ''}`}
          onClick={() => {
            setPreset('top');
            setResetTick((t) => t + 1);
          }}
          style={{ minHeight: '32px', padding: '4px 10px', fontSize: '12px' }}
        >
          Top View
        </button>
        <button
          type="button"
          className={`btn ${preset === 'front' ? 'primary' : ''}`}
          onClick={() => {
            setPreset('front');
            setResetTick((t) => t + 1);
          }}
          style={{ minHeight: '32px', padding: '4px 10px', fontSize: '12px' }}
        >
          Front View
        </button>
        <button
          type="button"
          className={`btn ${projection === 'orthographic' ? 'primary' : ''}`}
          onClick={() => setProjection((p) => (p === 'perspective' ? 'orthographic' : 'perspective'))}
          style={{ minHeight: '32px', padding: '4px 10px', fontSize: '12px' }}
        >
          Camera: {projection === 'orthographic' ? 'Orthographic' : 'Perspective'}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setPreset('perspective');
            setProjection('perspective');
            setResetTick((t) => t + 1);
          }}
          style={{ minHeight: '32px', padding: '4px 10px', fontSize: '12px' }}
        >
          Reset Camera
        </button>
      </div>

      <div
        ref={mountRef}
        style={{ width: '100%', height: 'clamp(240px, 62vw, 400px)', borderRadius: '2px', overflow: 'hidden', border: '1px solid var(--chart-panel-grid)' }}
        role="img"
        aria-label={`V01 3D Seasonal Terrain: X-axis Jan–Dec, Z-axis ${matrix.years[0]}–${matrix.years[matrix.years.length - 1]}, Y-height ${unitLabel}`}
      />

      <div className="chart-legend tabular" style={{ marginTop: '10px' }}>
        <span className="legend-item">
          <span className="swatch" style={{ background: palette.rampLow }} /> Height Scale: 0 = Flat · 50% = {fmtCompactIN(matrix.maxValue * 0.5)} · 100% = {fmtCompactIN(matrix.maxValue)} {unitLabel}
        </span>
        <span className="legend-item">
          <span className="swatch" style={{ background: palette.zeroFill }} /> Observed 0 ({matrix.zeroCount})
        </span>
        <span className="legend-item">
          <span className="swatch" style={{ background: palette.missingFill }} /> Missing/Unreported ({matrix.missingCount})
        </span>
      </div>

      <div className="insight-box" style={{ marginTop: '10px', background: 'rgba(239, 235, 224, 0.08)', color: 'inherit' }}>
        {hovered && hoveredCell ? (
          <span
            className="tabular"
            data-terrain-tooltip=""
            data-period={hoveredCell.period}
            data-value={hoveredCell.value ?? ''}
            data-unit={unitLabel}
            data-status={hoveredCell.status}
            data-height={hovered.quantitativeHeight ?? ''}
          >
            <strong>
              {MONTH_SHORT[hoveredCell.month - 1]} {hoveredCell.year} ({hoveredCell.period})
            </strong>{' '}
            ·{' '}
            {hoveredCell.value !== null
              ? `${formatMeasurement(hoveredCell.value)} ${unitLabel} (Monthly: ${formatMeasurement(hoveredCell.rawValue)}, Daily: ${formatMeasurement(hoveredCell.dailyRate)}/day)`
              : `MISSING (${hoveredCell.status.toUpperCase()} — not interpolated)`}{' '}
            · {hoveredCell.days} days
          </span>
        ) : (
          <span>
            <strong>3D Controls:</strong> Drag to orbit, scroll to zoom, hover any prism or flat marker for exact values. Observed zeroes render at strict zero quantitative height.
          </span>
        )}
      </div>
    </div>
  );
};

export default SeasonalTerrain3D;
