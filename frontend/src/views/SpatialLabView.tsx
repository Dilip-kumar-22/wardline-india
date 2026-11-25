import React, { Suspense, useMemo, useState } from 'react';
import { SvgHeatmap } from '../components/SvgHeatmap';
import { RegionalComparisonWall } from '../components/viz/RegionalComparisonWall';
import { IndicatorMeta, SeriesAnalytics, ThemeId, WardlineBundle } from '../types/wardline';
import { buildTerrainMatrix, detectWebGLCapability } from '../viz/selectors';
import { MetricMode } from '../viz/types';
import { VizFrame } from '../viz/VizFrame';

const LazySeasonalTerrain3D = React.lazy(() => import('../components/spatial/SeasonalTerrain3D'));

interface Props {
  bundle: WardlineBundle;
  series: SeriesAnalytics;
  indicatorId: string;
  indicator: IndicatorMeta;
  geoName: string;
  theme: ThemeId;
  reduceMotion: boolean;
  onSelectGeo: (geoId: string) => void;
}

export const SpatialLabView: React.FC<Props> = ({
  bundle,
  series,
  indicatorId,
  indicator,
  geoName,
  theme,
  reduceMotion,
  onSelectGeo,
}) => {
  const [metricMode, setMetricMode] = useState<MetricMode>('daily_rate');
  const [terrainMode, setTerrainMode] = useState<'3d' | '2d'>('3d');
  const [webglRuntimeError, setWebglRuntimeError] = useState<string | null>(null);
  const webgl = useMemo(() => detectWebGLCapability(), []);
  const matrix = useMemo(() => buildTerrainMatrix(series, metricMode), [series, metricMode]);
  const canUse3D = webgl.supported && !webglRuntimeError;
  const effectiveTerrainMode = canUse3D ? terrainMode : '2d';

  const terrainCsv = useMemo(
    () => ({
      headers: ['period', 'year', 'month', 'season', 'days', 'value', 'daily_rate', 'status'],
      rows: series.monthly.map((m) => [m.period, m.year, m.month, m.season, m.days, m.value, m.daily_rate, m.status]),
    }),
    [series.monthly]
  );

  const exportMeta = {
    vizId: 'V01' as const,
    title: `${geoName} — ${indicator.short_label}`,
    indicatorLabel: indicator.short_label,
    geoName,
    periodRange: `${series.monthly[0]?.period ?? bundle.source.period_min} to ${series.monthly[series.monthly.length - 1]?.period ?? bundle.source.period_max}`,
    metricLabel: metricMode === 'daily_rate' ? `Daily Rate (${indicator.unit}/day)` : `Monthly Count (${indicator.unit})`,
    mode: bundle.mode,
    attribution: bundle.source.attribution,
    limitations: 'Missing observations are uninterpolated gaps; 3D is a progressive enhancement over identical 2D matrix values.',
  };

  return (
    <section className="view-enter" aria-label="Three.js spatial analytics laboratory">
      <div className="hero">
        <div>
          <div className="eyebrow">07 / Spatial Analytics Laboratory · Lazy-Loaded WebGL + 2D Parity</div>
          <h1>3D seasonal terrain &amp; regional comparison.</h1>
          <p className="hero-sub">
            Explore monthly observations in Three.js or the equivalent 2D heatmap, then compare reporting regions with aligned small multiples.
          </p>
        </div>
        <span className={`status-badge ${canUse3D ? 'accent' : 'warn'}`}>
          {canUse3D ? `WEBGL READY (${webgl.version.toUpperCase()})` : '2D FALLBACK ACTIVE'}
        </span>
      </div>

      {/* V01 — 3D Seasonal Terrain */}
      <VizFrame
        framing={{
          vizId: 'V01',
          question: 'How does seasonal demand amplitude evolve across calendar months and historical years simultaneously?',
          dataSource: `${bundle.mode === 'official' ? 'Verified MoHFW HMIS (Zenodo 10.5281/zenodo.23657569)' : bundle.source.vintage} · ${geoName}`,
          encoding: `X = Month (Jan–Dec), Depth = Year (${matrix.years[0]}–${matrix.years[matrix.years.length - 1]}), Height & Color = ${metricMode === 'daily_rate' ? `${indicator.unit}/day` : indicator.unit} (zero baseline).`,
          conclusion: `Visualizes recurring monsoon/post-monsoon ridges and multi-year structural shifts across ${matrix.observedCount} observed months.`,
          limitations: `${matrix.missingCount} missing cells are rendered as flat recessed gaps without interpolation. Switch to Orthographic or 2D Heatmap for exact cross-cell comparison.`,
        }}
        title={`Seasonal Terrain — ${geoName} (${indicator.short_label})`}
        darkStage={effectiveTerrainMode === '3d'}
        exportMeta={exportMeta}
        csvData={terrainCsv}
        controls={
          <>
            <button
              type="button"
              className={`btn viz-action-btn ${effectiveTerrainMode === '3d' ? 'primary' : ''}`}
              disabled={!canUse3D}
              onClick={() => setTerrainMode('3d')}
            >
              3D Terrain
            </button>
            <button
              type="button"
              className={`btn viz-action-btn ${effectiveTerrainMode === '2d' ? 'primary' : ''}`}
              onClick={() => setTerrainMode('2d')}
            >
              2D Heatmap
            </button>
            <button
              type="button"
              className={`btn viz-action-btn ${metricMode === 'daily_rate' ? 'primary' : ''}`}
              onClick={() => setMetricMode((m) => (m === 'daily_rate' ? 'monthly' : 'daily_rate'))}
            >
              {metricMode === 'daily_rate' ? 'Daily Rate' : 'Monthly Count'}
            </button>
          </>
        }
      >
        {!canUse3D && (
          <div className="unavailable-box" style={{ marginBottom: '12px' }}>
            <strong>{webglRuntimeError ?? webgl.reason}</strong> Automatically displaying the equivalent 2D Calendar Matrix representing the same observations.
          </div>
        )}
        {effectiveTerrainMode === '3d' ? (
          <Suspense fallback={<div className="panel">Loading lazy Three.js Seasonal Terrain module…</div>}>
            <LazySeasonalTerrain3D matrix={matrix} unit={indicator.unit} theme={theme} reduceMotion={reduceMotion} onWebGLError={setWebglRuntimeError} />
          </Suspense>
        ) : (
          <SvgHeatmap series={series.monthly} unit={indicator.unit} mode={metricMode} />
        )}
      </VizFrame>

      <VizFrame
        framing={{
          vizId: 'V02',
          question: 'How do reporting regions compare across the same monthly periods?',
          dataSource: bundle.source.attribution,
          encoding: 'Aligned monthly small multiples with a shared or independent scale.',
          conclusion: 'Filter, pin or open reporting regions and compare service volume, seasonal shape and reporting completeness.',
          limitations: 'Regions are listed as analytical units. Missing months appear as gaps.',
        }}
        title={`Regional Comparison Matrix — ${indicator.short_label}`}
      >
        <RegionalComparisonWall bundle={bundle} indicatorId={indicatorId} indicator={indicator} onSelectGeo={onSelectGeo} />
      </VizFrame>
    </section>
  );
};
