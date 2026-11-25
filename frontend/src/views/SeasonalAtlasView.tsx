import React, { useMemo, useState } from 'react';
import { SvgHeatmap } from '../components/SvgHeatmap';
import { HistoricalGrowthSvg } from '../components/viz/HistoricalGrowthSvg';
import { SeasonalClockSvg } from '../components/viz/SeasonalClockSvg';
import { SeasonalDistributionSvg } from '../components/viz/SeasonalDistributionSvg';
import { IndicatorMeta, SeriesAnalytics, ThemeId } from '../types/wardline';
import { fmtIN } from '../utils/format';
import { MetricMode } from '../viz/types';
import { VizFrame } from '../viz/VizFrame';

interface Props {
  series: SeriesAnalytics;
  indicator: IndicatorMeta;
  geoName: string;
  theme: ThemeId;
  mode: 'official' | 'imported_unverified';
  attribution: string;
  periodRange: string;
}

export const SeasonalAtlasView: React.FC<Props> = ({
  series,
  indicator,
  geoName,
  theme,
  mode,
  attribution,
  periodRange,
}) => {
  const [metricMode, setMetricMode] = useState<MetricMode>('daily_rate');

  const monthlyCsv = useMemo(
    () => ({
      headers: ['period', 'year', 'month', 'season', 'days', 'value', 'daily_rate', 'yoy_pct', 'rolling_12m', 'status'],
      rows: series.monthly.map((m) => [
        m.period,
        m.year,
        m.month,
        m.season,
        m.days,
        m.value,
        m.daily_rate,
        m.yoy_pct,
        m.rolling_12m,
        m.status,
      ]),
    }),
    [series.monthly]
  );

  const baseExport = {
    indicatorLabel: indicator.short_label,
    geoName,
    periodRange,
    mode,
    attribution,
    metricLabel: metricMode === 'daily_rate' ? `Daily Rate (${indicator.unit}/day)` : `Monthly Count (${indicator.unit})`,
  };

  return (
    <section className="view-enter" aria-label="Interactive seasonal demand atlas">
      <div className="hero">
        <div>
          <div className="eyebrow">02 / Temporal &amp; Seasonal Atlas · {geoName}</div>
          <h1>Seasonal demand atlas.</h1>
          <p className="hero-sub">
            Radial clock, calendar rhythm matrix, interquartile dispersion, and historical growth explorer normalized by
            exact calendar days (including leap years 2016 and 2020). Seasons follow IMD 4-season bins.
          </p>
        </div>
        <div className="filter-bar">
          <button
            type="button"
            className={`btn ${metricMode === 'daily_rate' ? 'primary' : ''}`}
            onClick={() => setMetricMode('daily_rate')}
            style={{ minHeight: '38px', padding: '6px 12px' }}
          >
            Daily Rate ({indicator.unit}/day)
          </button>
          <button
            type="button"
            className={`btn ${metricMode === 'monthly' ? 'primary' : ''}`}
            onClick={() => setMetricMode('monthly')}
            style={{ minHeight: '38px', padding: '6px 12px' }}
          >
            Monthly Count
          </button>
        </div>
      </div>

      {/* V04 — Radial Seasonal Clock */}
      <VizFrame
        framing={{
          vizId: 'V04',
          question: 'How does annual healthcare demand cycle across the 12 calendar months and Indian IMD seasons?',
          dataSource: `${mode === 'official' ? 'Verified MoHFW HMIS' : 'Imported Unverified'} · ${geoName}`,
          encoding: `Concentric rings = years (innermost earliest), 12 angular wedges = Jan–Dec, color ramp = ${metricMode === 'daily_rate' ? 'mean daily rate' : 'monthly count'}, outer ring = IMD season.`,
          conclusion: `Highlights recurring peak seasons and multi-year rhythm stability across ${series.observed_months}/${series.expected_months} months.`,
          limitations: 'Radial geometry emphasizes cyclical phase over linear trend; click "2D Heatmap Alternative" for exact row-column comparison.',
        }}
        title={`Seasonal Clock — ${geoName} (${indicator.short_label})`}
        darkStage={true}
        exportMeta={{ ...baseExport, vizId: 'V04', title: 'Seasonal Clock', limitations: 'Radial phase comparison; use 2D matrix for exact tabular comparison.' }}
        csvData={monthlyCsv}
      >
        <SeasonalClockSvg series={series} unit={indicator.unit} theme={theme} mode={metricMode} />
      </VizFrame>

      {/* V06 — Calendar Rhythm Matrix */}
      <VizFrame
        framing={{
          vizId: 'V06',
          question: 'Which specific year-month cells exhibit peak demand, troughs, or reporting gaps?',
          dataSource: `${mode === 'official' ? 'Verified MoHFW HMIS' : 'Imported Unverified'} · ${geoName}`,
          encoding: `Rows = calendar years, columns = Jan–Dec, color = ${baseExport.metricLabel}; hatched cells = missing/unreported.`,
          conclusion: 'Enables direct side-by-side inspection of the same month across consecutive historical years.',
          limitations: 'Missing observations are explicitly left uncolored and never interpolated.',
        }}
        title={`Calendar Rhythm Matrix — ${geoName} (${indicator.short_label})`}
        exportMeta={{ ...baseExport, vizId: 'V06', title: 'Calendar Rhythm Matrix', limitations: 'Exact calendar-day normalization applied; missing months uninterpolated.' }}
        csvData={monthlyCsv}
      >
        <SvgHeatmap series={series.monthly} unit={indicator.unit} mode={metricMode} />
      </VizFrame>

      <div className="grid-equal">
        {/* V07 — Seasonal Distribution Explorer */}
        <VizFrame
          framing={{
            vizId: 'V07',
            question: 'How much year-to-year variability and outlier behavior occurs within each calendar month?',
            dataSource: `${mode === 'official' ? 'Verified MoHFW HMIS' : 'Imported Unverified'} · ${geoName}`,
            encoding: 'Orange line = median, box = Q25–Q75 IQR, whiskers = 1.5×IQR fence, hollow red circles = outliers; switches to dot-plot if n < 4.',
            conclusion: 'Separates consistent seasonal peaks from single-year shocks or reporting anomalies.',
            limitations: 'Quartile summaries require n ≥ 4 observed years per month; smaller samples automatically render as raw dot plots.',
          }}
          title={`Seasonal Distribution Explorer (${indicator.unit})`}
          exportMeta={{ ...baseExport, vizId: 'V07', title: 'Seasonal Distribution Explorer', limitations: 'Switches to dot-plot below n=4 years per month.' }}
          csvData={monthlyCsv}
        >
          <SeasonalDistributionSvg series={series} unit={indicator.unit} geoName={geoName} mode={metricMode} />
        </VizFrame>

        {/* Chart-Table Parity */}
        <article className="panel">
          <div className="eyebrow">Chart-Table Parity</div>
          <h2>Complete-Season Comparison Table</h2>
          <p className="panel-desc">
            Incomplete calendar-year seasons are strictly excluded from complete-season averages.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>IMD Season</th>
                  <th>Months</th>
                  <th>Complete Yrs</th>
                  <th>Mean / Day</th>
                  <th>Median / Day</th>
                  <th>Mean / Month</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {series.seasonal_summary.map((s) => (
                  <tr key={s.season_id}>
                    <td><strong>{s.label}</strong></td>
                    <td>{s.month_span}</td>
                    <td>{s.complete_years_count}</td>
                    <td>{fmtIN(s.mean_daily_count)}</td>
                    <td>{fmtIN(s.median_daily_count)}</td>
                    <td>{fmtIN(s.mean_monthly_count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="insight-box">
            <strong>Methodological caution</strong>
            <div>
              Seasonal bins represent recurring calendar-month utilization patterns, not causal meteorological proof.
              Regional monsoon timing varies across India.
            </div>
          </div>
        </article>
      </div>

      {/* V08 — Historical Growth Explorer */}
      <VizFrame
        framing={{
          vizId: 'V08',
          question: 'How fast is service utilization growing or contracting year-over-year and relative to the opening baseline?',
          dataSource: `${mode === 'official' ? 'Verified MoHFW HMIS' : 'Imported Unverified'} · ${geoName}`,
          encoding: 'Diverging bars = YoY % or absolute change; line = Base-100 index or 12m rolling mean with strict gap breaks.',
          conclusion: 'Distinguishes multi-year structural expansion from temporary calendar or shock fluctuations.',
          limitations: 'Zero-denominator safeguard suppresses % change when prior-year value is 0; rolling means require 12 consecutive observed months.',
        }}
        title={`Historical Growth Explorer — ${geoName} (${indicator.short_label})`}
        exportMeta={{ ...baseExport, vizId: 'V08', title: 'Historical Growth Explorer', limitations: 'Zero-denominator safe; 12m rolling requires 12 consecutive observed months.' }}
        csvData={monthlyCsv}
      >
        <HistoricalGrowthSvg series={series} unit={indicator.unit} geoName={geoName} mode={metricMode} />
      </VizFrame>
    </section>
  );
};
