import React, { useEffect, useMemo, useState } from 'react';
import { SvgForecastChart } from '../components/SvgForecastChart';
import { SvgTimeSeries } from '../components/SvgTimeSeries';
import { CoverageObservatory } from '../components/viz/CoverageObservatory';
import { SeasonalClockSvg } from '../components/viz/SeasonalClockSvg';
import { SeasonalDistributionSvg } from '../components/viz/SeasonalDistributionSvg';
import { IndicatorMeta, SeriesAnalytics, ThemeId, ViewId, WardlineBundle } from '../types/wardline';
import { fmtCompactIN, fmtIN, fmtPct } from '../utils/format';

interface Props {
  bundle: WardlineBundle;
  series: SeriesAnalytics;
  indicatorId: string;
  indicator: IndicatorMeta;
  geoName: string;
  theme: ThemeId;
  reduceMotion: boolean;
  initialChapter?: number;
  onChapterChange?: (chapterIdx: number) => void;
  onExit: (targetView?: ViewId) => void;
  onSelectGeo: (geoId: string) => void;
}

interface ChapterDef {
  id: number;
  title: string;
  eyebrow: string;
  quickRoute: boolean;
  notes: string;
}

const CHAPTERS: ChapterDef[] = [
  {
    id: 1,
    title: 'WARDLINE INDIA — Healthcare Demand Intelligence',
    eyebrow: '01 / Project Introduction · CSE276 CA1',
    quickRoute: true,
    notes: 'Introduce the assigned CSE276 topic verbatim: Analysis of Hospital Admission Data for Identifying Patient Trends and Seasonal Healthcare Demand Patterns. Highlight Editorial Industrial design and real official Indian HMIS data.',
  },
  {
    id: 2,
    title: 'The Research Problem & Scope Honesty',
    eyebrow: '02 / Research Problem',
    quickRoute: true,
    notes: 'Explain why seasonal surges strain public hospitals in India, and demonstrate scientific integrity: general all-cause IPD is publicly unavailable, so we analyze verified MoHFW HMIS utilization proxies without fabricating IPD.',
  },
  {
    id: 3,
    title: 'Dataset Provenance & Geographic Scope',
    eyebrow: '03 / Dataset & Provenance',
    quickRoute: false,
    notes: 'Present active dataset provenance dynamically: for official HMIS, cite Zenodo DOI 10.5281/zenodo.23657569 (CC BY 4.0 / GODL-India), 34 harmonized states/UTs, 96 months (Apr 2012 – Mar 2020), and Mar 2020 COVID lockdown endpoint.',
  },
  {
    id: 4,
    title: 'Data Cleaning, Schema Validation & Coverage',
    eyebrow: '04 / Data Cleaning & Validation',
    quickRoute: false,
    notes: 'Walk through the live V09 Reporting Coverage Observatory distinguishing observed, zero, masked (<90% district gate), and missing months, plus fixed-cohort comparability.',
  },
  {
    id: 5,
    title: 'Historical Utilization Trends (Live Interactive Series)',
    eyebrow: '05 / Historical Trends',
    quickRoute: true,
    notes: 'Interact directly with the live active-dataset time series. Point out the 12-month rolling mean, format-break disclosure (if official HMIS), and missingness gap breaks.',
  },
  {
    id: 6,
    title: 'Seasonal Patterns & Radial Demand Clock',
    eyebrow: '06 / Seasonal Patterns',
    quickRoute: true,
    notes: 'Click IMD seasons (SW Monsoon Jun–Sep, Post-Monsoon Oct–Dec) on the live V04 Seasonal Clock to demonstrate recurring annual rhythm normalized by exact calendar days.',
  },
  {
    id: 7,
    title: 'Regional Disparities & Dispersion',
    eyebrow: '07 / Regional Comparisons',
    quickRoute: false,
    notes: 'Inspect regional spotlight metrics (when official HMIS is active) or dynamic top/bottom imported units, alongside live V07 month-of-year IQR dispersion.',
  },
  {
    id: 8,
    title: '3D Seasonal Exploration & Spatial Intelligence',
    eyebrow: '08 / 3D Spatial Analytics',
    quickRoute: false,
    notes: 'Explain how V01 (3D Seasonal Terrain) and its 2D fallback use the same monthly observations. V02 provides non-geographic regional small multiples. Jumping to 3D Lab preserves your chapter position.',
  },
  {
    id: 9,
    title: 'Chronologically Validated Forecasting',
    eyebrow: '09 / AI Forecasting Lab',
    quickRoute: true,
    notes: 'Show live retrospective evaluation when readiness passes (>=72 contiguous months), or explain why forecasting is withheld if an imported series is too short or has calendar gaps.',
  },
  {
    id: 10,
    title: 'Key Verified Research Findings',
    eyebrow: '10 / Research Findings',
    quickRoute: true,
    notes: 'Summarize findings derived strictly from the active dataset (forecasts, totals, coverage, seasonal amplitude), never conflating official HMIS benchmarks with custom imported datasets.',
  },
  {
    id: 11,
    title: 'Limitations & Responsible AI Safeguards',
    eyebrow: '11 / Limitations & Responsible AI',
    quickRoute: false,
    notes: 'Emphasize aggregate administrative scope, absence of patient-level/IPD data, 2012–2020 retrospective boundary, and isolated CSV import verification.',
  },
  {
    id: 12,
    title: 'Conclusion & Future Engineering Roadmap',
    eyebrow: '12 / Conclusion & Future Work',
    quickRoute: false,
    notes: 'Conclude with future integration of official MoHFW IPD exports via the client-side CSV validator, post-2020 HMIS panels, and local Windows Playwright visual baselines.',
  },
];

export const PresentationModeView: React.FC<Props> = ({
  bundle,
  series,
  indicatorId,
  indicator,
  geoName,
  theme,
  reduceMotion,
  initialChapter = 0,
  onChapterChange,
  onExit,
  onSelectGeo,
}) => {
  const [routeMode, setRouteMode] = useState<'full' | 'quick5'>('full');
  const [idx, setIdx] = useState(initialChapter);
  const [showNotes, setShowNotes] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const activeChapters = useMemo(
    () => (routeMode === 'quick5' ? CHAPTERS.filter((c) => c.quickRoute) : CHAPTERS),
    [routeMode]
  );

  const safeIdx = Math.min(idx, activeChapters.length - 1);
  const chapter = activeChapters[safeIdx];

  useEffect(() => {
    onChapterChange?.(safeIdx);
  }, [safeIdx, onChapterChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        setIdx((i) => Math.min(activeChapters.length - 1, i + 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setIdx((i) => Math.max(0, i - 1));
      } else if (e.key === 'n' || e.key === 'N') {
        setShowNotes((v) => !v);
      } else if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else {
          onExit('overview');
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeChapters.length, onExit]);

  const toggleFullscreen = () => {
    if (typeof document === 'undefined') return;
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const fcKey = bundle.forecasts[indicatorId] ? indicatorId : Object.keys(bundle.forecasts)[0];
  const fcEntry = bundle.forecasts[fcKey]?.IN ?? Object.values(bundle.forecasts[fcKey] ?? {})[0];
  const spotlight = bundle.mode === 'official' ? bundle.analytics.pb_br_spotlight[indicatorId] : undefined;
  const rankings = bundle.analytics.regional_rankings[indicatorId] ?? [];

  // DEF-15: Dynamically derive forecast findings from active bundle (never hard-coded)
  const readyForecastFindings = useMemo(() => {
    const rows: Array<{ label: string; model: string; testWape: number | null; naiveWape: number | null }> = [];
    Object.entries(bundle.forecasts).forEach(([indKey, geoMap]) => {
      Object.entries(geoMap).forEach(([gKey, entry]) => {
        if (!entry.ready || !entry.selected_model || !entry.holdout_metrics) return;
        const indLabel = bundle.indicators[indKey]?.short_label ?? indKey;
        rows.push({
          label: `${indLabel} (${entry.geo_name || gKey})`,
          model: entry.selected_model,
          testWape: entry.holdout_metrics[entry.selected_model]?.wape_pct ?? null,
          naiveWape: entry.holdout_metrics.seasonal_naive?.wape_pct ?? null,
        });
      });
    });
    return rows;
  }, [bundle]);

  const isOfficial = bundle.mode === 'official';

  return (
    <div className="pres-shell" role="region" aria-label="Guided research presentation mode">
      <header className="pres-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <strong style={{ fontFamily: 'var(--font-display)', fontSize: '20px', letterSpacing: '0.03em' }}>WARDLINE INDIA</strong>
          <span className="status-badge accent tabular">
            CHAPTER {safeIdx + 1} / {activeChapters.length}
          </span>
          <span className={`status-badge ${isOfficial ? '' : 'warn'}`}>
            {isOfficial ? 'LIVE OFFICIAL HMIS' : `LIVE IMPORTED · UNVERIFIED (${bundle.source.vintage})`}
          </span>
        </div>

        <div className="filter-bar">
          <button
            type="button"
            className={`btn viz-action-btn ${routeMode === 'quick5' ? 'primary' : ''}`}
            onClick={() => {
              setRouteMode('quick5');
              setIdx(0);
            }}
          >
            5-Min CA1 Route (6)
          </button>
          <button
            type="button"
            className={`btn viz-action-btn ${routeMode === 'full' ? 'primary' : ''}`}
            onClick={() => {
              setRouteMode('full');
              setIdx(0);
            }}
          >
            Full Technical (12)
          </button>
          <button type="button" className="btn viz-action-btn" onClick={() => setShowNotes((v) => !v)}>
            {showNotes ? 'Hide Notes (N)' : 'Presenter Notes (N)'}
          </button>
          <button type="button" className="btn viz-action-btn" onClick={toggleFullscreen}>
            {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          </button>
          <button type="button" className="btn primary viz-action-btn" onClick={() => onExit('overview')}>
            Exit Presentation (Esc)
          </button>
        </div>
      </header>

      <div className="pres-progress-track" aria-hidden="true">
        <div
          className="pres-progress-fill"
          style={{
            width: `${((safeIdx + 1) / activeChapters.length) * 100}%`,
            transition: reduceMotion ? 'none' : 'width 260ms ease',
          }}
        />
      </div>

      <main className="pres-stage">
        <div className="eyebrow" style={{ marginBottom: '6px' }}>{chapter.eyebrow}</div>
        <h1 className="pres-title">{chapter.title}</h1>

        {/* Chapter 1 */}
        {chapter.id === 1 && (
          <div className="grid-equal" style={{ marginTop: '20px' }}>
            <div className="panel dark-stage">
              <div className="eyebrow">Assigned Academic Topic · LPU CSE276 CA1</div>
              <h2>Analysis of Hospital Admission Data for Identifying Patient Trends and Seasonal Healthcare Demand Patterns</h2>
              <p className="panel-desc">
                Active measure: <strong>{indicator.short_label}</strong> · Active geography: <strong>{geoName}</strong> ·
                Span: <strong>{bundle.source.period_min} to {bundle.source.period_max}</strong>.
              </p>
            </div>
            <div className="kpi-strip" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              <div className="kpi">
                <div className="kpi-val tabular">{fmtCompactIN(series.total_observed)}</div>
                <div className="kpi-label">Cumulative Observed ({indicator.unit})</div>
              </div>
              <div className="kpi">
                <div className="kpi-val tabular">{series.coverage_pct.toFixed(1)}%</div>
                <div className="kpi-label">{isOfficial ? 'Verified Reporting Coverage' : 'Imported Reporting Coverage'}</div>
              </div>
              <div className="kpi">
                <div className="kpi-val tabular">{bundle.source.states_count}</div>
                <div className="kpi-label">{isOfficial ? 'Harmonized States & UTs' : 'Imported Reporting Units'}</div>
              </div>
              <div className="kpi">
                <div className="kpi-val tabular">{series.seasonal_amplitude_ratio?.toFixed(2) ?? '—'}×</div>
                <div className="kpi-label">Seasonal Peak-to-Trough Ratio</div>
              </div>
            </div>
          </div>
        )}

        {/* Chapter 2 */}
        {chapter.id === 2 && (
          <div className="grid-equal" style={{ marginTop: '18px' }}>
            <div className="panel">
              <h2>Operational Challenge</h2>
              <p>
                Indian public hospitals face sharp recurring seasonal demand swings across monsoon, post-monsoon, and winter
                months. Unadjusted monthly totals and shifting regional reporting coverage frequently distort capacity planning.
              </p>
            </div>
            <div className="unavailable-box">
              <strong>Scientific Scope Boundary (Preserved Strictly):</strong>
              <ul>
                {bundle.unavailable_dimensions.map((u) => (
                  <li key={u.id}>
                    <strong>{u.label}:</strong> {u.reason}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Chapter 3 — Dynamic Active Dataset Provenance (DEF-15) */}
        {chapter.id === 3 && (
          <div className="panel" style={{ marginTop: '18px' }}>
            <div className="kpi-strip">
              <div className="kpi">
                <div className="kpi-val tabular">{fmtIN(bundle.source.normalized_rows)}</div>
                <div className="kpi-label">Active Dataset Rows</div>
              </div>
              <div className="kpi">
                <div className="kpi-val tabular">{fmtIN(bundle.source.observed_rows)}</div>
                <div className="kpi-label">Observed Records</div>
              </div>
              <div className="kpi">
                <div className="kpi-val tabular">{bundle.source.states_count}</div>
                <div className="kpi-label">{isOfficial ? 'Harmonized Units (AP_TG, JK, DNH_DD)' : 'Imported Geographies'}</div>
              </div>
              <div className="kpi">
                <div className="kpi-val tabular">{series.expected_months}m</div>
                <div className="kpi-label">
                  {bundle.source.period_min} to {bundle.source.period_max}
                </div>
              </div>
            </div>
            <p className="panel-desc" style={{ marginBottom: 0 }}>
              <strong>Data Mode:</strong> {bundle.mode.toUpperCase()} · <strong>Attribution:</strong> {bundle.source.attribution} ·{' '}
              <strong>License:</strong> {bundle.source.license}
              {bundle.source.raw_sha256 ? (
                <>
                  {' '}· <strong>Archive SHA-256:</strong> <code>{bundle.source.raw_sha256.slice(0, 24)}…</code>
                </>
              ) : null}
            </p>
          </div>
        )}

        {/* Chapter 4 */}
        {chapter.id === 4 && (
          <div className="panel" style={{ marginTop: '16px' }}>
            <CoverageObservatory bundle={bundle} indicatorId={indicatorId} indicator={indicator} onSelectGeo={onSelectGeo} />
          </div>
        )}

        {/* Chapter 5 */}
        {chapter.id === 5 && (
          <div className="panel dark-stage" style={{ marginTop: '16px' }}>
            <SvgTimeSeries
              series={series.monthly}
              primaryLabel={`${geoName} (${indicator.short_label})`}
              unit={indicator.unit}
              showRolling12={true}
              ariaLabel={`Presentation live monthly time series for ${geoName}`}
            />
          </div>
        )}

        {/* Chapter 6 */}
        {chapter.id === 6 && (
          <div className="panel dark-stage" style={{ marginTop: '16px' }}>
            <SeasonalClockSvg series={series} unit={indicator.unit} theme={theme} mode="daily_rate" />
          </div>
        )}

        {/* Chapter 7 */}
        {chapter.id === 7 && (
          <div className="grid-equal" style={{ marginTop: '16px' }}>
            {spotlight ? (
              <>
                <div className="panel">
                  <div className="eyebrow">Official HMIS Reference Spotlight · Punjab (PB)</div>
                  <div className="kpi-val tabular">{fmtCompactIN(spotlight.punjab.total_8yr)}</div>
                  <p className="panel-desc">
                    FY 2019–20: {fmtIN(spotlight.punjab.fy2019_20_total)} · YoY: {fmtPct(spotlight.punjab.fy2019_20_yoy_pct, true)}
                  </p>
                </div>
                <div className="panel">
                  <div className="eyebrow">Official HMIS Reference Spotlight · Bihar (BR)</div>
                  <div className="kpi-val tabular">{fmtCompactIN(spotlight.bihar.total_8yr)}</div>
                  <p className="panel-desc">
                    FY 2019–20: {fmtIN(spotlight.bihar.fy2019_20_total)} · YoY: {fmtPct(spotlight.bihar.fy2019_20_yoy_pct, true)}
                  </p>
                </div>
              </>
            ) : (
              <div className="panel" style={{ gridColumn: '1 / -1' }}>
                <div className="eyebrow">Active Imported Regional Comparison ({rankings.length} units)</div>
                <p className="panel-desc" style={{ marginBottom: 0 }}>
                  Top imported geography: <strong>{rankings[0]?.geo_name ?? geoName}</strong> ({fmtIN(rankings[0]?.total_observed_8yr ?? series.total_observed)} {indicator.unit}, {rankings[0]?.observed_months ?? series.observed_months}/{rankings[0]?.expected_months ?? series.expected_months}m coverage).
                </p>
              </div>
            )}
            <div className="panel" style={{ gridColumn: '1 / -1' }}>
              <SeasonalDistributionSvg series={series} unit={indicator.unit} geoName={geoName} mode="daily_rate" />
            </div>
          </div>
        )}

        {/* Chapter 8 — Preserves chapter position when jumping to 3D Lab (DEF-15) */}
        {chapter.id === 8 && (
          <div className="panel dark-stage" style={{ marginTop: '16px' }}>
            <h2>Progressive-Enhancement Three.js Spatial Laboratory</h2>
            <p className="panel-desc">
              V01 (Seasonal Terrain) maps Month × Year × Zero-Baseline Utilization into an interactive WebGL 2 prism surface with
              Perspective/Orthographic cameras and flat non-quantitative zero/missing markers. V02 (Regional Comparison Matrix)
              compares the 34 harmonized HMIS units with aligned monthly small multiples.
            </p>
            <button type="button" className="btn primary" onClick={() => onExit('spatial')}>
              Open Live 3D Spatial Lab (Preserves Chapter {safeIdx + 1}) →
            </button>
          </div>
        )}

        {/* Chapter 9 — Handles ready AND withheld/unavailable states cleanly (DEF-15) */}
        {chapter.id === 9 && (
          fcEntry && fcEntry.ready ? (
            <div className="panel" style={{ marginTop: '16px' }}>
              <p className="panel-desc">
                <strong>Locked Model (Dev-CV):</strong> {fcEntry.selected_model} · <strong>Retrospective Test WAPE:</strong>{' '}
                {fcEntry.holdout_metrics?.[fcEntry.selected_model ?? 'seasonal_naive']?.wape_pct?.toFixed(2)}% vs Seasonal Naive{' '}
                {fcEntry.holdout_metrics?.seasonal_naive?.wape_pct?.toFixed(2)}%.
              </p>
              <SvgForecastChart
                history={
                  fcEntry.geo_id === 'IN'
                    ? bundle.analytics.national[fcKey]?.monthly ?? []
                    : bundle.analytics.states[fcKey]?.[fcEntry.geo_id]?.monthly ?? []
                }
                forecast={fcEntry}
                unit={bundle.indicators[fcKey]?.unit ?? 'counts'}
              />
            </div>
          ) : (
            <div className="unavailable-box" style={{ marginTop: '16px' }}>
              <strong>Forecasting Withheld for Active Dataset ({bundle.source.vintage}):</strong>{' '}
              {fcEntry?.reason ?? 'Series does not meet the ≥72 contiguous calendar-month readiness and rolling-origin evaluation contract.'}
            </div>
          )
        )}

        {/* Chapter 10 — Strictly derived from active bundle (DEF-15) */}
        {chapter.id === 10 && (
          <div className="grid-equal" style={{ marginTop: '16px' }}>
            <div className="panel">
              <h2>{isOfficial ? 'Verified Retrospective Benchmarks (Active HMIS Bundle)' : 'Active Imported Dataset Summary'}</h2>
              {readyForecastFindings.length > 0 ? (
                <ul>
                  {readyForecastFindings.slice(0, 6).map((rf) => (
                    <li key={rf.label} className="tabular">
                      <strong>{rf.label}:</strong> {rf.model} — Test WAPE {rf.testWape?.toFixed(2)}% vs Seasonal Naive {rf.naiveWape?.toFixed(2)}%
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="panel-desc">
                  Forecasting is withheld for this imported dataset ({series.observed_months}/{series.expected_months}m observed; ≥72 contiguous months required).
                </p>
              )}
            </div>
            <div className="panel">
              <h2>Live Descriptive Findings ({geoName})</h2>
              <ul className="tabular">
                <li><strong>Total Observed ({indicator.short_label}):</strong> {fmtIN(series.total_observed)} {indicator.unit} across {series.observed_months}/{series.expected_months} calendar months ({series.coverage_pct.toFixed(1)}%).</li>
                <li><strong>Mean Daily Rate:</strong> {fmtIN(series.mean_daily)} {indicator.unit}/day (removes 28/29/30/31-day length artifacts).</li>
                <li><strong>Seasonal Amplitude Ratio:</strong> {series.seasonal_amplitude_ratio !== null ? `${series.seasonal_amplitude_ratio.toFixed(2)}×` : 'Unavailable (incomplete coverage)'}.</li>
                {isOfficial && (
                  <li><strong>Official HMIS Boundary Note:</strong> March 2020 reflects India&apos;s national COVID-19 lockdown discontinuity across OPD and maternal indicators.</li>
                )}
              </ul>
            </div>
          </div>
        )}

        {/* Chapter 11 */}
        {chapter.id === 11 && (
          <div className="panel" style={{ marginTop: '16px' }}>
            <h2>Responsible AI &amp; Research Integrity Commitments</h2>
            <ul>
              <li><strong>No fabricated IPD or patient demographics:</strong> Explicitly withheld with transparent UI disclosures.</li>
              <li><strong>Development-selected forecasts:</strong> Rolling-origin validation selects the model before retrospective evaluation of the final window.</li>
              <li><strong>No overclaimed intervals:</strong> Empirical P80 error bands are labeled uncalibrated.</li>
              <li><strong>Historical scope:</strong> 2012–2020 evaluations do not claim verified 2026 operational hospital forecasts.</li>
            </ul>
          </div>
        )}

        {/* Chapter 12 */}
        {chapter.id === 12 && (
          <div className="panel dark-stage" style={{ marginTop: '16px' }}>
            <h2>Conclusion &amp; Future Work</h2>
            <p className="panel-desc">
              WARDLINE INDIA v1.4.2 combines reproducible Python verification, strict statistical governance, Editorial Industrial
              visual intelligence, and a complete 18-chapter educational handbook for academic defense.
            </p>
            <ul>
              <li>Ingest official post-2020 MoHFW HMIS &amp; General IPD exports via the validated client-side CSV importer.</li>
              <li>Integrate district-level meteorological covariates for causal monsoon demand modeling.</li>
            </ul>
          </div>
        )}

        {showNotes && (
          <aside className="insight-box" style={{ marginTop: '18px' }} aria-label="Presenter speaker notes">
            <strong>Presenter Notes (Chapter {chapter.id}):</strong> {chapter.notes}
          </aside>
        )}
      </main>

      <footer className="pres-foot">
        <button
          type="button"
          className="btn"
          disabled={safeIdx === 0}
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
        >
          ← Previous
        </button>
        <div className="filter-bar">
          {activeChapters.map((c, i) => (
            <button
              key={c.id}
              type="button"
              className={`btn ${i === safeIdx ? 'primary' : ''}`}
              onClick={() => setIdx(i)}
              style={{ minHeight: '32px', padding: '4px 9px', fontSize: '12px' }}
              aria-label={`Jump to chapter ${c.id}: ${c.title}`}
            >
              {c.id}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn primary"
          disabled={safeIdx === activeChapters.length - 1}
          onClick={() => setIdx((i) => Math.min(activeChapters.length - 1, i + 1))}
        >
          Next →
        </button>
      </footer>
    </div>
  );
};
