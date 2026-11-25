/// <reference types="vite/client" />
import React, { useEffect, useMemo, useState } from 'react';
import { ImportedObservation, ThemeId, ViewId, WardlineBundle } from './types/wardline';
import { buildActiveDataset } from './utils/activeDataset';
import { DataInspectorView } from './views/DataInspectorView';
import { ForecastView } from './views/ForecastView';
import { MethodologyView } from './views/MethodologyView';
import { OverviewView } from './views/OverviewView';
import { PresentationModeView } from './views/PresentationModeView';
import { RegionalExplorerView } from './views/RegionalExplorerView';
import { SeasonalAtlasView } from './views/SeasonalAtlasView';
import { ServiceView } from './views/ServiceView';
import { SpatialLabView } from './views/SpatialLabView';

const NAV_ITEMS: Array<{ id: ViewId; num: string; label: string }> = [
  { id: 'overview', num: '01', label: 'Overview' },
  { id: 'seasonal', num: '02', label: 'Seasonal atlas' },
  { id: 'regional', num: '03', label: 'Regional explorer' },
  { id: 'services', num: '04', label: 'Services & scope' },
  { id: 'forecast', num: '05', label: 'Forecast lab' },
  { id: 'data', num: '06', label: 'Data & methods' },
  { id: 'spatial', num: '07', label: '3D spatial lab' },
  { id: 'methodology', num: '08', label: 'Methodology (D01–08)' },
];

const THEMES: Array<{ id: ThemeId; label: string; color: string }> = [
  { id: 'industrial', label: 'Industrial', color: '#F2662B' },
  { id: 'sage', label: 'Sage', color: '#176C55' },
  { id: 'midnight', label: 'Midnight', color: '#1C2928' },
  { id: 'blue', label: 'Clinical', color: '#276B94' },
];
const PUBLIC_REPOSITORY = import.meta.env.VITE_PUBLIC_REPOSITORY_URL;

declare global {
  interface Window {
    __WARDLINE_INLINE_BUNDLE__?: WardlineBundle;
  }
}

export const App: React.FC = () => {
  const [officialBundle, setOfficialBundle] = useState<WardlineBundle | null>(window.__WARDLINE_INLINE_BUNDLE__ ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<ViewId>('overview');
  const [theme, setTheme] = useState<ThemeId>(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('wardline-theme') : null;
    return saved === 'industrial' || saved === 'sage' || saved === 'midnight' || saved === 'blue' ? saved : 'industrial';
  });
  const [reduceMotion, setReduceMotion] = useState(() => {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  });
  const [indicatorId, setIndicatorId] = useState('inst_del');
  const [geoId, setGeoId] = useState('IN');
  const [importedRows, setImportedRows] = useState<ImportedObservation[] | null>(null);
  const [importedName, setImportedName] = useState<string>('');
  const [presChapter, setPresChapter] = useState<number>(0);

  useEffect(() => {
    document.body.dataset.theme = theme;
    try {
      localStorage.setItem('wardline-theme', theme);
    } catch {
      // ignore storage errors
    }
  }, [theme]);

  useEffect(() => {
    document.body.classList.toggle('reduce-motion', reduceMotion);
  }, [reduceMotion]);

  useEffect(() => {
    if (officialBundle) return;
    fetch('./data/wardline_india_bundle.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: WardlineBundle) => setOfficialBundle(data))
      .catch((err) => setLoadError(`Could not load official HMIS bundle (${err.message}).`));
  }, [officialBundle]);

  const activeDataset = useMemo(() => {
    if (!officialBundle) return null;
    return buildActiveDataset(officialBundle, importedRows, importedName);
  }, [officialBundle, importedRows, importedName]);

  const effectiveIndicatorId = useMemo(() => {
    if (!activeDataset) return indicatorId;
    if (activeDataset.indicators[indicatorId]) return indicatorId;
    return Object.keys(activeDataset.indicators)[0] ?? indicatorId;
  }, [activeDataset, indicatorId]);

  const effectiveGeoId = useMemo(() => {
    if (!activeDataset) return geoId;
    if (geoId === 'IN') return 'IN';
    if (activeDataset.analytics.states[effectiveIndicatorId]?.[geoId]) return geoId;
    return 'IN';
  }, [activeDataset, effectiveIndicatorId, geoId]);

  const activeIndicator = activeDataset?.indicators[effectiveIndicatorId];
  const activeGeoName = useMemo(() => {
    if (!activeDataset) return effectiveGeoId;
    if (effectiveGeoId === 'IN') {
      return activeDataset.mode === 'imported_unverified'
        ? `All Imported (${activeDataset.source.states_count} units)`
        : 'All-India (34 harmonised units)';
    }
    return activeDataset.analytics.states_directory.find((s) => s.geo_id === effectiveGeoId)?.geo_name ?? effectiveGeoId;
  }, [activeDataset, effectiveGeoId]);

  const activeSeries = useMemo(() => {
    if (!activeDataset) return null;
    if (effectiveGeoId === 'IN') return activeDataset.analytics.national[effectiveIndicatorId];
    return (
      activeDataset.analytics.states[effectiveIndicatorId]?.[effectiveGeoId] ??
      activeDataset.analytics.national[effectiveIndicatorId]
    );
  }, [activeDataset, effectiveGeoId, effectiveIndicatorId]);

  if (loadError) {
    return (
      <main className="main">
        <div className="unavailable-box">
          <strong>Data bundle unavailable:</strong> {loadError}
        </div>
      </main>
    );
  }

  if (!activeDataset || !activeIndicator || !activeSeries) {
    return (
      <main className="main">
        <div className="panel">Loading verified MoHFW HMIS analytical bundle…</div>
      </main>
    );
  }

  if (view === 'presentation') {
    return (
      <PresentationModeView
        bundle={activeDataset}
        series={activeSeries}
        indicatorId={effectiveIndicatorId}
        indicator={activeIndicator}
        geoName={activeGeoName}
        theme={theme}
        reduceMotion={reduceMotion}
        initialChapter={presChapter}
        onChapterChange={setPresChapter}
        onExit={(target) => setView(target ?? 'overview')}
        onSelectGeo={(id) => {
          setGeoId(id);
          setView('overview');
        }}
      />
    );
  }

  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <div className="shell">
        <aside className="rail" aria-label="Primary workspace navigation">
          <div className="brand">
            <div className="brand-word">WARDLINE.</div>
            <span className="brand-sub">RESEARCH EDITION · v1.4.2</span>
          </div>

          <div className="rail-section">India · HMIS</div>
          <nav aria-label="Views">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                className="nav-btn"
                aria-label={item.label}
                aria-current={view === item.id ? 'page' : undefined}
                onClick={() => {
                  setView(item.id);
                  window.scrollTo({ top: 0, behavior: 'auto' });
                }}
              >
                <span className="nav-num">{item.num}</span>
                <span className="nav-label">{item.label}</span>
              </button>
            ))}
            <a className="nav-btn nav-handbook" href="./handbook.html" aria-label="Complete handbook">
              <span className="nav-num" aria-hidden="true">↗</span>
              <span className="nav-label">Complete handbook</span>
            </a>
          </nav>

          <div className="presentation-entry">
            <button
              type="button"
              className="btn primary"
              aria-label="Presentation Mode"
              title="Presentation Mode"
              onClick={() => setView('presentation')}
            >
              <span aria-hidden="true">▶</span><span className="presentation-entry-label"> Presentation Mode</span>
            </button>
          </div>

          <div className="rail-foot">
            <strong>WARDLINE INDIA</strong>
            <div>HEALTHCARE INTELLIGENCE</div>
            <div>{activeDataset.mode === 'official' ? 'MoHFW HMIS · 2012–2020' : 'IMPORTED · UNVERIFIED'}</div>
          </div>
        </aside>

        <main id="main-content" className="main" tabIndex={-1}>
          <header className="topbar">
            <div className="eyebrow">HOSPITAL ACTIVITY / RESEARCH / ANALYTICS</div>
            <div className="topbar-controls">
              <select
                className="select-field"
                aria-label="Global indicator selector"
                value={effectiveIndicatorId}
                onChange={(e) => setIndicatorId(e.target.value)}
                style={{ minHeight: '36px', padding: '5px 10px' }}
              >
                {Object.values(activeDataset.indicators).map((ind) => (
                  <option key={ind.indicator_id} value={ind.indicator_id}>
                    {ind.short_label}
                  </option>
                ))}
              </select>

              <select
                className="select-field"
                aria-label="Global geography selector"
                value={effectiveGeoId}
                onChange={(e) => setGeoId(e.target.value)}
                style={{ minHeight: '36px', padding: '5px 10px' }}
              >
                <option value="IN">
                  {activeDataset.mode === 'imported_unverified'
                    ? `All Imported (${activeDataset.source.states_count} units)`
                    : 'All-India (34 units)'}
                </option>
                {activeDataset.analytics.states_directory.map((s) => (
                  <option key={s.geo_id} value={s.geo_id}>
                    {s.geo_name} ({s.geo_id})
                  </option>
                ))}
              </select>

              <div className="theme-group" role="group" aria-label="Color theme">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    className="theme-btn"
                    aria-pressed={theme === t.id}
                    onClick={() => setTheme(t.id)}
                  >
                    <span className="swatch" style={{ background: t.color }} />
                    {t.label}
                  </button>
                ))}
              </div>

              <button
                className="btn"
                aria-pressed={reduceMotion}
                onClick={() => setReduceMotion((v) => !v)}
                style={{ minHeight: '36px', padding: '5px 10px', fontSize: '12px' }}
              >
                {reduceMotion ? 'Motion: Reduced' : 'Motion: Standard'}
              </button>

              <span className="edition-pill">INDIA EDITION</span>
            </div>
          </header>

          <div className={`evidence-ribbon ${activeDataset.mode === 'imported_unverified' ? 'unverified' : ''}`} role="region" aria-label="Active data scope">
            <span className={`status-badge ${activeDataset.mode === 'imported_unverified' ? 'warn' : 'accent'}`}>
              {activeDataset.mode === 'imported_unverified'
                ? `IMPORTED · UNVERIFIED (${importedName})`
                : 'OFFICIAL · GODL-INDIA / CC BY 4.0'}
            </span>
            <span className="ribbon-item">
              <span className="ribbon-label">Measure</span> <strong>{activeIndicator.short_label}</strong>
            </span>
            <span className="ribbon-item">
              <span className="ribbon-label">Geography</span> <strong>{activeGeoName}</strong>
            </span>
            <span className="ribbon-item tabular">
              <span className="ribbon-label">Period</span>{' '}
              <strong>
                {activeDataset.source.period_min} to {activeDataset.source.period_max}
              </strong>
            </span>
            <span className="ribbon-item tabular">
              <span className="ribbon-label">Coverage</span>{' '}
              <strong>
                {activeSeries.observed_months}/{activeSeries.expected_months}m ({activeSeries.coverage_pct.toFixed(1)}%)
              </strong>
            </span>
          </div>

          {view === 'overview' && (
            <OverviewView
              series={activeSeries}
              indicator={activeIndicator}
              geoName={activeGeoName}
              mode={activeDataset.mode}
              periodMin={activeDataset.source.period_min}
              periodMax={activeDataset.source.period_max}
              onNavigate={setView}
            />
          )}
          {view === 'seasonal' && (
            <SeasonalAtlasView
              series={activeSeries}
              indicator={activeIndicator}
              geoName={activeGeoName}
              theme={theme}
              mode={activeDataset.mode}
              attribution={activeDataset.source.attribution}
              periodRange={`${activeDataset.source.period_min} to ${activeDataset.source.period_max}`}
            />
          )}
          {view === 'regional' && (
            <RegionalExplorerView
              bundle={activeDataset}
              indicatorId={effectiveIndicatorId}
              indicator={activeIndicator}
              onSelectGeo={(id) => {
                setGeoId(id);
                setView('overview');
              }}
            />
          )}
          {view === 'services' && (
            <ServiceView
              bundle={activeDataset}
              geoId={effectiveGeoId}
              geoName={activeGeoName}
              onSelectIndicator={(id) => {
                setIndicatorId(id);
                setView('overview');
              }}
            />
          )}
          {view === 'forecast' && <ForecastView bundle={activeDataset} reduceMotion={reduceMotion} />}
          {view === 'spatial' && (
            <SpatialLabView
              bundle={activeDataset}
              series={activeSeries}
              indicatorId={effectiveIndicatorId}
              indicator={activeIndicator}
              geoName={activeGeoName}
              theme={theme}
              reduceMotion={reduceMotion}
              onSelectGeo={(id) => {
                setGeoId(id);
                setView('overview');
              }}
            />
          )}
          {view === 'methodology' && <MethodologyView bundle={activeDataset} reduceMotion={reduceMotion} />}
          {view === 'data' && (
            <DataInspectorView
              bundle={activeDataset}
              activeSeries={activeSeries}
              activeGeoName={activeGeoName}
              activeIndicatorLabel={activeIndicator.short_label}
              activeIndicatorUnit={activeIndicator.unit}
              importedRows={importedRows}
              onImport={(rows, name) => {
                setImportedRows(rows);
                setImportedName(name);
                setGeoId('IN');
              }}
              onResetImport={() => {
                setImportedRows(null);
                setImportedName('');
                setGeoId('IN');
                setIndicatorId('inst_del');
              }}
            />
          )}

          <footer className="app-footer">
            <span><a href="./handbook.html">Complete handbook</a></span>
            {PUBLIC_REPOSITORY && (
              <span>
                <a href={PUBLIC_REPOSITORY}>Source and documentation</a> ·{' '}
                <a href={PUBLIC_REPOSITORY + '/releases'}>Downloads</a>
              </span>
            )}
            <span>
              WARDLINE INDIA v1.4.2 · Aggregate public health research ·{' '}
              <a href="./licenses/THIRD_PARTY_NOTICES.md">Attribution</a>
            </span>
            <span>
              {activeDataset.mode === 'official' && activeDataset.source.doi ? (
                <>
                  Source: MoHFW HMIS via{' '}
                  <a href={activeDataset.source.doi} target="_blank" rel="noopener noreferrer">
                    Zenodo 10.5281/zenodo.23657569 ↗
                  </a>
                </>
              ) : (
                `Active mode: ${activeDataset.mode}`
              )}
            </span>
          </footer>
        </main>
      </div>
    </>
  );
};
