import React, { useState } from 'react';
import { SvgTimeSeries } from '../components/SvgTimeSeries';
import { IndicatorMeta, SeriesAnalytics, ViewId } from '../types/wardline';
import { fmtCompactIN, fmtIN, fmtPct, fmtPeriod } from '../utils/format';

interface Props {
  series: SeriesAnalytics;
  indicator: IndicatorMeta;
  geoName: string;
  mode: 'official' | 'imported_unverified';
  periodMin: string;
  periodMax: string;
  onNavigate: (view: ViewId) => void;
}

export const OverviewView: React.FC<Props> = ({
  series,
  indicator,
  geoName,
  mode,
  periodMin,
  periodMax,
  onNavigate,
}) => {
  const [showRolling, setShowRolling] = useState(true);
  const [metricMode, setMetricMode] = useState<'monthly' | 'daily'>('monthly');
  const [showFixedCohort, setShowFixedCohort] = useState(false);

  const maxSeason = Math.max(1, ...series.seasonal_summary.map((s) => s.mean_daily_count ?? 0));
  const comp = series.national_comparability;

  return (
    <section className="view-enter" aria-label="National and state healthcare overview">
      <div className="hero">
        <div>
          <div className="eyebrow">01 / Healthcare Utilization Briefing · {geoName}</div>
          <h1>
            Hospital
            <br />
            Intelligence.
          </h1>
          <p className="hero-sub">
            {mode === 'official'
              ? `Verified monthly facility reporting from MoHFW HMIS (${periodMin} to ${periodMax}). `
              : `User-imported monthly observations (${periodMin} to ${periodMax}; unverified). `}
            Active measure: <strong>{indicator.raw_indicator}</strong> ({indicator.unit}).
          </p>
        </div>
        <div className="vintage-block tabular">
          <div className="vintage-block-eyebrow">{mode === 'official' ? 'Research · HMIS' : 'Imported · CSV'}</div>
          <div className="vintage-block-val">
            {periodMin.slice(0, 4)}–{periodMax.slice(2, 4)}
          </div>
        </div>
      </div>

      <div className="kpi-strip">
        <article className="kpi">
          <div className="kpi-val tabular" aria-label={fmtIN(series.fy2019_20_total ?? series.mean_monthly)}>
            {series.fy2019_20_total !== null ? fmtCompactIN(series.fy2019_20_total) : fmtCompactIN(series.mean_monthly)}
          </div>
          <div className="kpi-label">
            {series.fy2019_20_total !== null ? `FY 2019–20 Total (${indicator.unit})` : `Mean Monthly (${indicator.unit})`}
          </div>
          <div className="kpi-note tabular">
            {series.fy2019_20_total !== null
              ? `Exact: ${fmtIN(series.fy2019_20_total)} · YoY ${fmtPct(series.fy2019_20_yoy_pct, true)}`
              : `Median monthly: ${fmtIN(series.median_monthly)}`}
          </div>
        </article>

        <article className="kpi">
          <div className="kpi-val tabular" aria-label={fmtIN(series.total_observed)}>
            {fmtCompactIN(series.total_observed)}
          </div>
          <div className="kpi-label">Cumulative Observed ({series.observed_months}m)</div>
          <div className="kpi-note tabular">
            {series.observed_months}/{series.expected_months} valid calendar months ({series.coverage_pct.toFixed(1)}%)
          </div>
        </article>

        <article className="kpi">
          <div className="kpi-val tabular">
            {series.peak_periods.length ? fmtPeriod(series.peak_periods[0]) : '—'}
          </div>
          <div className="kpi-label">Peak Reported Month</div>
          <div className="kpi-note tabular">
            {fmtIN(series.peak_value)} {indicator.unit}
          </div>
        </article>

        <article className="kpi">
          <div className="kpi-val tabular">
            {series.seasonal_amplitude_ratio !== null ? `${series.seasonal_amplitude_ratio.toFixed(2)}×` : '—'}
          </div>
          <div className="kpi-label">Seasonal Amplitude Ratio</div>
          <div className="kpi-note">Peak-to-trough IMD daily intensity</div>
        </article>
      </div>

      <div className="grid-main">
        <article className="panel dark-stage">
          <div className="panel-head">
            <div>
              <div className="eyebrow">
                01 / Utilization Rhythm · {periodMin} to {periodMax}
              </div>
              <h2>
                {metricMode === 'daily' ? 'Daily-Normalized' : 'Monthly'} {indicator.short_label}
              </h2>
            </div>
            <div className="filter-bar" style={{ gap: '8px' }}>
              <button
                className={`btn ${metricMode === 'monthly' ? 'primary' : ''}`}
                onClick={() => setMetricMode('monthly')}
                style={{ minHeight: '32px', padding: '4px 9px', fontSize: '12px' }}
              >
                Monthly Total
              </button>
              <button
                className={`btn ${metricMode === 'daily' ? 'primary' : ''}`}
                onClick={() => setMetricMode('daily')}
                style={{ minHeight: '32px', padding: '4px 9px', fontSize: '12px' }}
              >
                Daily Rate
              </button>
              {metricMode === 'monthly' && (
                <label style={{ fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={showRolling} onChange={(e) => setShowRolling(e.target.checked)} />
                  12m mean
                </label>
              )}
              {comp && (
                <label style={{ fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={showFixedCohort} onChange={(e) => setShowFixedCohort(e.target.checked)} />
                  Fixed cohort ({comp.fixed_cohort_states_count})
                </label>
              )}
            </div>
          </div>
          <p className="panel-desc">{indicator.format_break_note}</p>
          <SvgTimeSeries
            series={series.monthly}
            primaryLabel={`${geoName} · ${indicator.short_label}`}
            showRolling12={showRolling}
            showFixedCohort={showFixedCohort}
            metricMode={metricMode}
            darkStage={true}
            unit={indicator.unit}
            ariaLabel={`${metricMode === 'daily' ? 'Daily-normalized' : 'Monthly'} ${indicator.short_label} time series for ${geoName}`}
          />
          <div className="panel-foot">
            <span>Measure: {indicator.raw_indicator}</span>
            <span>
              {comp
                ? `Reporting coverage: ${comp.complete_34_of_34_months}/96 complete 34-state months · Fixed cohort: ${comp.fixed_cohort_states_count} states`
                : `HMIS codes: E1 ${indicator.e1_codes} → E2 ${indicator.e2_codes}`}
            </span>
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">02 / Seasonal Composition</div>
              <h2>Daily Intensity by IMD Season</h2>
            </div>
            <span className="status-badge">COMPLETE YEARS</span>
          </div>
          <p className="panel-desc">
            Mean daily counts adjust for unequal IMD season lengths (Winter 2m vs Southwest Monsoon 4m).
          </p>
          {series.seasonal_summary.map((s, idx) => (
            <div className="bar-row" key={s.season_id}>
              <div className="bar-head tabular">
                <span>
                  <strong>{s.label}</strong> ({s.month_span})
                </span>
                <strong>{fmtIN(s.mean_daily_count)} / day</strong>
              </div>
              <div className="bar-track">
                <div
                  className={`bar-fill ${idx === 2 ? 'secondary' : ''}`}
                  style={{ width: `${s.mean_daily_count ? (s.mean_daily_count / maxSeason) * 100 : 0}%` }}
                />
              </div>
              <div className="kpi-note">
                Complete years: n = {s.complete_years_count} · Incomplete excluded: {s.incomplete_years.join(', ') || 'none'}
              </div>
            </div>
          ))}

          {comp ? (
            <div className="insight-box tabular">
              <strong>National Comparability &amp; Fixed-Cohort Sensitivity</strong>
              <div>
                {comp.partial_reporting_months > 0
                  ? `${comp.partial_reporting_months} of 96 months have <34/34 reporting states. Fixed-cohort (${comp.fixed_cohort_states_count} complete states) FY19–20 YoY: ${fmtPct(comp.fixed_cohort_fy2019_20_yoy_pct, true)}.`
                  : `All 34/34 states reported across all 96 months.`}
              </div>
            </div>
          ) : (
            <div className="insight-box">
              <strong>{mode === 'official' ? 'Aggregate-data scope note' : 'Imported dataset scope note'}</strong>
              <div>
                {mode === 'official'
                  ? 'This official archive publishes facility-level aggregate utilization counts, not individual patient records. All-cause general IPD attendance is unavailable and explicitly withheld.'
                  : 'User-imported CSV observations are unverified and remain strictly isolated from the official national archive.'}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
            <button className="btn primary" onClick={() => onNavigate('regional')}>
              Regional Explorer →
            </button>
            <button className="btn" onClick={() => onNavigate('forecast')}>
              Forecast Lab →
            </button>
          </div>
        </article>
      </div>
    </section>
  );
};
