import React, { useState } from 'react';
import { SvgForecastChart } from '../components/SvgForecastChart';
import { ForecastExplainerTimeline } from '../components/viz/ForecastExplainerTimeline';
import { WardlineBundle } from '../types/wardline';
import { fmtIN } from '../utils/format';

interface Props {
  bundle: WardlineBundle;
  reduceMotion: boolean;
}

const MODEL_LABELS: Record<string, string> = {
  seasonal_naive: 'Seasonal Naive (y[t−12])',
  last_value_naive: 'Last-Value Naive (y[t])',
  ridge_seasonal_lag: 'Ridge Regression (Lag 1/12 + Month + E2)',
  additive_holt_winters: 'Additive Holt-Winters Exponential Smoothing',
};

export const ForecastView: React.FC<Props> = ({ bundle, reduceMotion }) => {
  const availableInds = Object.keys(bundle.forecasts);
  const [indId, setIndId] = useState(availableInds[0] ?? 'inst_del');
  const activeInd = bundle.forecasts[indId] ? indId : availableInds[0];
  const availableGeos = Object.keys(bundle.forecasts[activeInd] ?? {});
  const [geoId, setGeoId] = useState('PB');
  const effectiveGeo = bundle.forecasts[activeInd]?.[geoId] ? geoId : availableGeos[0] ?? 'IN';

  const fc = bundle.forecasts[activeInd]?.[effectiveGeo];
  const history =
    effectiveGeo === 'IN'
      ? bundle.analytics.national[activeInd]?.monthly ?? []
      : bundle.analytics.states[activeInd]?.[effectiveGeo]?.monthly ?? [];
  const unit = bundle.indicators[activeInd]?.unit ?? 'counts';

  return (
    <section className="view-enter" aria-label="Chronological forecasting laboratory">
      <div className="hero">
        <div>
          <div className="eyebrow">05 / Explainable AI &amp; Forecasting Laboratory · Development-Locked Selection</div>
          <h1>Chronologically validated demand forecasting.</h1>
          <p className="hero-sub">
            Candidate models are selected by two-fold rolling-origin validation within the development window.
            The selected model is evaluated retrospectively against baselines on the final 12 months.
          </p>
        </div>
        <div className="filter-bar">
          <select className="select-field" aria-label="Forecast indicator" value={activeInd} onChange={(e) => setIndId(e.target.value)}>
            {availableInds.map((id) => (
              <option key={id} value={id}>
                {bundle.indicators[id]?.short_label ?? 'All-Cause General IPD (Unavailable)'}
              </option>
            ))}
          </select>
          {availableGeos.length > 1 && (
            <select className="select-field" aria-label="Forecast geography" value={effectiveGeo} onChange={(e) => setGeoId(e.target.value)}>
              {availableGeos.map((g) => (
                <option key={g} value={g}>
                  {bundle.forecasts[activeInd][g].geo_name} ({g})
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {!fc || !fc.ready ? (
        <article className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">Readiness Gate: BLOCKED</div>
              <h2>Forecasting Unavailable for Selected Measure</h2>
            </div>
            <span className="status-badge danger">WITHHELD</span>
          </div>
          <div className="unavailable-box">
            <strong>Reason:</strong> {fc?.reason ?? 'Insufficient contiguous verified monthly observations.'}
          </div>
        </article>
      ) : (
        <>
          <div className="kpi-strip">
            <article className="kpi">
              <div className="kpi-val tabular">{fc.contiguous_months}m</div>
              <div className="kpi-label">Readiness Gate (≥72m)</div>
              <div className="kpi-note">Contiguous calendar months · Cutoff {fc.train_cutoff}</div>
            </article>
            <article className="kpi">
              <div className="kpi-val" style={{ fontSize: '20px', fontFamily: 'var(--font-ui)', fontWeight: 700, textTransform: 'none' }}>
                {MODEL_LABELS[fc.selected_model ?? 'seasonal_naive']}
              </div>
              <div className="kpi-label">Locked Model (Dev CV)</div>
              <div className="kpi-note">Selected strictly before test evaluation</div>
            </article>
            <article className="kpi">
              <div className="kpi-val tabular">
                {fc.holdout_metrics?.[fc.selected_model ?? 'seasonal_naive']?.wape_pct?.toFixed(2)}%
              </div>
              <div className="kpi-label">Test Window WAPE (FY 2019–20)</div>
              <div className="kpi-note tabular">
                Seasonal naive baseline: {fc.holdout_metrics?.seasonal_naive?.wape_pct?.toFixed(2)}%
              </div>
            </article>
            <article className="kpi">
              <div className="kpi-val tabular">
                ±{fmtIN(fc.empirical_abs_error_p80_halfwidth)}
              </div>
              <div className="kpi-label">Uncalibrated Dev-CV P80 Band</div>
              <div className="kpi-note tabular">
                Test MAE: {fmtIN(fc.holdout_metrics?.[fc.selected_model ?? 'seasonal_naive']?.mae)}
              </div>
            </article>
          </div>

          <article className="panel">
            <div className="panel-head">
              <div>
                <div className="eyebrow">Interactive Explainable AI · Rolling-Origin Window Walkthrough</div>
                <h2>How Chronological Model Locking Prevents Holdout Leakage</h2>
              </div>
              <span className="status-badge">XAI TIMELINE</span>
            </div>
            <ForecastExplainerTimeline forecast={fc} unit={unit} reduceMotion={reduceMotion} />
          </article>

          <article className="panel">
            <div className="panel-head">
              <div>
                <div className="eyebrow">Retrospective Test Evaluation &amp; 12m Exploratory Projection</div>
                <h2>
                  {fc.geo_name} — {bundle.indicators[activeInd]?.short_label}
                </h2>
              </div>
              <span className="status-badge">RETROSPECTIVE HOLDOUT</span>
            </div>
            <p className="panel-desc">
              {fc.selection_reason} {fc.geographic_composition_note ?? ''}
            </p>
            <SvgForecastChart history={history} forecast={fc} unit={unit} />
            <div className="insight-box">
              <strong>Retrospective Evaluation &amp; Uncertainty Disclosure</strong>
              <div>{fc.caveat}</div>
            </div>
          </article>

          <article className="panel">
            <div className="eyebrow">Reproducible Benchmark Table</div>
            <h2>Model Comparison (Development CV vs. Retrospective FY 2019–20 Test Window)</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Dev CV MAE (2 folds)</th>
                    <th>Dev CV WAPE</th>
                    <th>Test MAE</th>
                    <th>Test RMSE</th>
                    <th>Test WAPE</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {Object.keys(MODEL_LABELS).map((mKey) => {
                    const cv = fc.cv_metrics?.[mKey];
                    const ho = fc.holdout_metrics?.[mKey];
                    const isSel = fc.selected_model === mKey;
                    return (
                      <tr key={mKey} style={isSel ? { background: 'var(--accent-surface)' } : undefined}>
                        <td><strong>{MODEL_LABELS[mKey]}</strong></td>
                        <td>{fmtIN(cv?.mae)}</td>
                        <td>{cv?.wape_pct !== null && cv?.wape_pct !== undefined ? `${cv.wape_pct.toFixed(2)}%` : '—'}</td>
                        <td>{fmtIN(ho?.mae)}</td>
                        <td>{fmtIN(ho?.rmse)}</td>
                        <td>{ho?.wape_pct !== null && ho?.wape_pct !== undefined ? `${ho.wape_pct.toFixed(2)}%` : '—'}</td>
                        <td>{isSel ? <span className="status-badge accent">LOCKED (DEV CV)</span> : 'Benchmarked'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </article>
        </>
      )}
    </section>
  );
};
