import React, { useEffect, useState } from 'react';
import { ForecastEntry } from '../../types/wardline';
import { fmtIN } from '../../utils/format';

interface Props {
  forecast: ForecastEntry;
  unit: string;
  reduceMotion: boolean;
}

const STEPS = [
  {
    id: 0,
    title: 'Step 1 · Rolling-Origin CV Fold 1',
    train: '2012-04 → 2017-03 (60m)',
    val: '2017-04 → 2018-03 (12m)',
    test: 'SEALED (Untouched)',
    note: 'All 4 candidate models train strictly on the first 60 contiguous months and predict FY 2017–18.',
    trainPct: 62.5,
    valStart: 62.5,
    valPct: 12.5,
    testActive: false,
  },
  {
    id: 1,
    title: 'Step 2 · Rolling-Origin CV Fold 2',
    train: '2012-04 → 2018-03 (72m)',
    val: '2018-04 → 2019-03 (12m)',
    test: 'SEALED (Untouched)',
    note: 'Training expands by 12 months; models predict FY 2018–19. Fold 1 + Fold 2 errors are pooled to compute Dev-CV MAE & WAPE.',
    trainPct: 75,
    valStart: 75,
    valPct: 12.5,
    testActive: false,
  },
  {
    id: 2,
    title: 'Step 3 · Model Locked (Zero Holdout Leakage)',
    train: '2012-04 → 2019-03 (84m)',
    val: 'Model Locked by Dev-CV',
    test: 'Ready for Single Evaluation',
    note: 'The lowest Dev-CV MAE model (if beating Seasonal Naive) is permanently locked BEFORE the FY 2019–20 test window is ever evaluated.',
    trainPct: 87.5,
    valStart: 87.5,
    valPct: 0,
    testActive: false,
  },
  {
    id: 3,
    title: 'Step 4 · Retrospective Test Evaluation (FY 2019–20)',
    train: '2012-04 → 2019-03 (84m)',
    val: 'Locked Model Applied',
    test: '2019-04 → 2020-03 (12m)',
    note: 'Locked model generates 12-month retrospective predictions vs actual FY 2019–20 observations. Empirical P80 error bands remain uncalibrated.',
    trainPct: 87.5,
    valStart: 87.5,
    valPct: 0,
    testActive: true,
  },
];

export const ForecastExplainerTimeline: React.FC<Props> = ({ forecast, unit, reduceMotion }) => {
  const [stepIdx, setStepIdx] = useState(3);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing || reduceMotion) return;
    const timer = window.setInterval(() => {
      setStepIdx((prev) => (prev + 1) % STEPS.length);
    }, 2400);
    return () => window.clearInterval(timer);
  }, [playing, reduceMotion]);

  const step = STEPS[stepIdx];
  const holdout = forecast.holdout_series ?? [];
  const selectedKey = (forecast.selected_model ?? 'seasonal_naive') as
    | 'seasonal_naive'
    | 'ridge_seasonal_lag'
    | 'additive_holt_winters'
    | 'last_value_naive';

  const absErrors = holdout.map((h) => ({
    period: h.period,
    actual: h.actual,
    predicted: h[selectedKey],
    naive: h.seasonal_naive,
    errModel: Math.abs(h.actual - h[selectedKey]),
    errNaive: Math.abs(h.actual - h.seasonal_naive),
  }));
  const maxErr = Math.max(1, ...absErrors.map((e) => Math.max(e.errModel, e.errNaive)));

  return (
    <div style={{ display: 'grid', gap: '18px' }}>
      <div>
        <div className="filter-bar" style={{ marginBottom: '12px' }}>
          {STEPS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`btn ${stepIdx === s.id ? 'primary' : ''}`}
              onClick={() => {
                setPlaying(false);
                setStepIdx(s.id);
              }}
              style={{ minHeight: '32px', padding: '4px 10px', fontSize: '12px' }}
            >
              Step {s.id + 1}
            </button>
          ))}
          <button
            type="button"
            className="btn"
            disabled={reduceMotion}
            onClick={() => setPlaying((p) => !p)}
            style={{ minHeight: '32px', padding: '4px 10px', fontSize: '12px' }}
          >
            {reduceMotion ? 'Auto-play disabled (Reduced Motion)' : playing ? 'Pause Walkthrough' : 'Animate Windows'}
          </button>
        </div>

        <svg viewBox="0 0 760 112" role="img" aria-label={`Chronological rolling-origin timeline: ${step.title}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
          <rect x="20" y="28" width="720" height="32" fill="var(--chart-track)" rx="2" />
          {/* Train window */}
          <rect
            x="20"
            y="28"
            width={(720 * step.trainPct) / 100}
            height="32"
            fill="var(--ink)"
            style={{ transition: reduceMotion ? 'none' : 'width 320ms ease' }}
          />
          {/* Validation fold */}
          {step.valPct > 0 && (
            <rect
              x={20 + (720 * step.valStart) / 100}
              y="28"
              width={(720 * step.valPct) / 100}
              height="32"
              fill="var(--accent)"
              style={{ transition: reduceMotion ? 'none' : 'all 320ms ease' }}
            />
          )}
          {/* Holdout test window */}
          <rect
            x={20 + 720 * 0.875}
            y="28"
            width={720 * 0.125}
            height="32"
            fill={step.testActive ? 'var(--accent)' : 'none'}
            fillOpacity={step.testActive ? 0.35 : 0}
            stroke={step.testActive ? 'var(--accent)' : 'var(--muted-ink)'}
            strokeWidth="2"
            strokeDasharray={step.testActive ? undefined : '4 3'}
          />
          <text x="20" y="20" fontSize="11" fontWeight="700" fill="var(--ink)">
            {step.title}
          </text>
          <text x="24" y="48" fontSize="11" fontWeight="700" fill="var(--canvas)">
            DEV TRAIN: {step.train}
          </text>
          <text x={20 + 720 * 0.9375} y="48" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--ink)">
            {step.testActive ? 'TEST' : 'SEALED'}
          </text>
          <text x="20" y="80" fontSize="10.5" fill="var(--muted-ink)" className="tabular">
            2012-04
          </text>
          <text x={20 + 720 * 0.625} y="80" textAnchor="middle" fontSize="10.5" fill="var(--muted-ink)" className="tabular">
            2017-04
          </text>
          <text x={20 + 720 * 0.75} y="80" textAnchor="middle" fontSize="10.5" fill="var(--muted-ink)" className="tabular">
            2018-04
          </text>
          <text x={20 + 720 * 0.875} y="80" textAnchor="middle" fontSize="10.5" fontWeight="700" fill="var(--accent-text)" className="tabular">
            LOCK (2019-03)
          </text>
          <text x="740" y="80" textAnchor="end" fontSize="10.5" fill="var(--muted-ink)" className="tabular">
            2020-03
          </text>
        </svg>

        <div className="insight-box" style={{ marginTop: '8px' }}>
          <strong>{step.title}:</strong> {step.note}
        </div>
      </div>

      {absErrors.length > 0 && (
        <div>
          <div className="eyebrow" style={{ marginBottom: '6px' }}>
            Monthly Absolute Error Comparison (FY 2019–20 Retrospective Test Window · {unit})
          </div>
          <svg viewBox="0 0 760 180" role="img" aria-label="Monthly absolute forecast error comparison between locked model and seasonal naive" style={{ width: '100%', height: 'auto', display: 'block' }}>
            {absErrors.map((e, idx) => {
              const slotW = 700 / absErrors.length;
              const x0 = 40 + idx * slotW;
              const hModel = (e.errModel / maxErr) * 115;
              const hNaive = (e.errNaive / maxErr) * 115;
              return (
                <g key={e.period}>
                  <rect x={x0 + 4} y={140 - hNaive} width={slotW * 0.36} height={Math.max(2, hNaive)} fill="var(--secondary)" opacity="0.65">
                    <title>{`${e.period} Seasonal Naive |err| = ${fmtIN(e.errNaive)} ${unit}`}</title>
                  </rect>
                  <rect x={x0 + 4 + slotW * 0.4} y={140 - hModel} width={slotW * 0.36} height={Math.max(2, hModel)} fill="var(--accent)">
                    <title>{`${e.period} Locked Model |err| = ${fmtIN(e.errModel)} ${unit}`}</title>
                  </rect>
                  <text x={x0 + slotW * 0.4} y="158" textAnchor="middle" fontSize="9.5" fill="var(--muted-ink)" className="tabular">
                    {e.period.slice(2)}
                  </text>
                </g>
              );
            })}
            <line x1="36" x2="740" y1="140" y2="140" stroke="var(--border)" />
          </svg>
          <div className="chart-legend">
            <span className="legend-item">
              <span className="swatch" style={{ background: 'var(--accent)' }} /> Locked Model |Actual − Pred|
            </span>
            <span className="legend-item">
              <span className="swatch" style={{ background: 'var(--secondary)' }} /> Seasonal Naive Baseline |Actual − Pred|
            </span>
            <span className="legend-item">
              Note: Historical 2012–2020 retrospective evaluation — NOT a verified 2026 operational hospital forecast.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
