import React, { useState } from 'react';
import { SvgTimeSeries } from '../components/SvgTimeSeries';
import { CoverageObservatory } from '../components/viz/CoverageObservatory';
import { RegionalComparisonWall } from '../components/viz/RegionalComparisonWall';
import { IndicatorMeta, WardlineBundle } from '../types/wardline';
import { fmtCompactIN, fmtIN, fmtPct } from '../utils/format';
import { VizFrame } from '../viz/VizFrame';

interface Props {
  bundle: WardlineBundle;
  indicatorId: string;
  indicator: IndicatorMeta;
  onSelectGeo: (geoId: string) => void;
}

export const RegionalExplorerView: React.FC<Props> = ({ bundle, indicatorId, indicator, onSelectGeo }) => {
  const [search, setSearch] = useState('');

  const spotlight = bundle.analytics.pb_br_spotlight[indicatorId];
  const pbSeries = bundle.analytics.states[indicatorId]?.['PB'];
  const brSeries = bundle.analytics.states[indicatorId]?.['BR'];
  const rankings = bundle.analytics.regional_rankings[indicatorId] ?? [];
  const hasFy1920 = rankings.some((r) => r.fy2019_20_total !== null);

  const rankingValue = (region: (typeof rankings)[number]) => hasFy1920
    ? region.fy2019_20_total
    : region.total_observed_8yr;
  const sortedRankings = [...rankings]
    .filter((r) => r.geo_name.toLowerCase().includes(search.toLowerCase()) || r.geo_id.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (rankingValue(b) ?? -1) - (rankingValue(a) ?? -1));

  const top10 = sortedRankings.slice(0, 10);
  const maxBar = Math.max(1, ...top10.map((r) => rankingValue(r) ?? 0));

  return (
    <section className="view-enter" aria-label="State and regional comparison explorer">
      <div className="hero">
        <div>
          <div className="eyebrow">03 / Regional Explorer · {bundle.source.states_count} Geographies</div>
          <h1>{spotlight ? 'Punjab, Bihar & national disparities.' : 'Regional comparison explorer.'}</h1>
          <p className="hero-sub">
            {bundle.mode === 'official'
              ? 'Matched-period comparison across 34 boundary-harmonised Indian states/UTs (AP+Telangana, J&K+Ladakh, DNH+DD pooled for 2012–2020 continuity).'
              : `Active imported dataset (${bundle.source.vintage}): regional totals computed exclusively from imported rows.`}
          </p>
        </div>
        <span className="status-badge">{bundle.mode === 'official' ? '96/96 MONTHS · PB & BR VERIFIED' : 'IMPORTED · UNVERIFIED'}</span>
      </div>

      {spotlight && pbSeries && brSeries && (
        <article className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">Priority Regional Spotlight · Matched 96-Month Coverage</div>
              <h2>Punjab vs. Bihar — {indicator.short_label}</h2>
            </div>
            <span className="status-badge">COMPARABLE SCOPE</span>
          </div>

          <div className="grid-equal" style={{ marginBottom: '16px' }}>
            <div className="kpi">
              <div className="kpi-label">Punjab (PB) · FY 2019–20</div>
              <div className="kpi-val tabular">{fmtCompactIN(spotlight.punjab.fy2019_20_total)}</div>
              <div className="kpi-note tabular">
                Exact: {fmtIN(spotlight.punjab.fy2019_20_total)} · Seasonal ratio:{' '}
                {spotlight.punjab.seasonal_amplitude_ratio?.toFixed(2)}× · Valid: {spotlight.punjab.observed_months}/96m
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Bihar (BR) · FY 2019–20</div>
              <div className="kpi-val tabular">{fmtCompactIN(spotlight.bihar.fy2019_20_total)}</div>
              <div className="kpi-note tabular">
                Exact: {fmtIN(spotlight.bihar.fy2019_20_total)} · Seasonal ratio:{' '}
                {spotlight.bihar.seasonal_amplitude_ratio?.toFixed(2)}× · Valid: {spotlight.bihar.observed_months}/96m
              </div>
            </div>
          </div>

          <SvgTimeSeries
            series={brSeries.monthly}
            compareSeries={pbSeries.monthly}
            primaryLabel="Bihar (BR)"
            compareLabel="Punjab (PB)"
            showRolling12={false}
            unit={indicator.unit}
            ariaLabel={`Monthly comparison of ${indicator.short_label} between Bihar and Punjab`}
          />
        </article>
      )}

      {/* V05 — Regional Comparison Wall */}
      <VizFrame
        framing={{
          vizId: 'V05',
          question: 'How do temporal trajectories and seasonal shapes compare across all reporting regions simultaneously?',
          dataSource: `${bundle.mode === 'official' ? 'Verified MoHFW HMIS (34 harmonized units)' : bundle.source.vintage}`,
          encoding: 'Small-multiple line trajectories per region with toggleable shared vs explicitly labeled independent Y-scales and coverage badges.',
          conclusion: 'Reveals regional heterogeneity without the perspective occlusion of 3D multi-region bar walls.',
          limitations: 'Regions below 90% coverage are flagged explicitly; independent Y-scales highlight shape rather than magnitude.',
        }}
        title={`Regional Comparison Wall — ${indicator.short_label}`}
      >
        <RegionalComparisonWall
          bundle={bundle}
          indicatorId={indicatorId}
          indicator={indicator}
          onSelectGeo={onSelectGeo}
        />
      </VizFrame>

      {/* V09 — Reporting Coverage Observatory */}
      <VizFrame
        framing={{
          vizId: 'V09',
          question: 'Where do reporting gaps, observed zeroes, and <90% district completeness masks occur across regions and years?',
          dataSource: `${bundle.mode === 'official' ? 'Verified MoHFW HMIS quality audit' : bundle.source.vintage}`,
          encoding: 'Color-coded unit × year completeness badges distinguishing 100% observed, partial, and masked/missing periods.',
          conclusion: 'Demonstrates why fixed-cohort national baselines are essential whenever regional reporting fluctuates.',
          limitations: 'District-level completeness masking is inherited from the upstream HMIS quality gate (<90% districts reporting).',
        }}
        title={`Reporting Coverage Observatory — ${indicator.short_label}`}
      >
        <CoverageObservatory
          bundle={bundle}
          indicatorId={indicatorId}
          indicator={indicator}
          onSelectGeo={onSelectGeo}
        />
      </VizFrame>

      <div className="grid-main">
        <article className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">{hasFy1920 ? 'FY 2019–20 Complete-Year Ranking' : 'Imported Period Cumulative Ranking'}</div>
              <h2>Top Geographies by Volume</h2>
            </div>
          </div>

          {top10.map((r) => {
            const val = rankingValue(r);
            const isPriority = r.geo_id === 'PB' || r.geo_id === 'BR';
            return (
              <div className="bar-row" key={r.geo_id} style={{ margin: '11px 0' }}>
                <div className="bar-head tabular">
                  <button
                    onClick={() => onSelectGeo(r.geo_id)}
                    style={{
                      background: 'none',
                      border: 0,
                      padding: 0,
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontWeight: isPriority ? 700 : 500,
                      color: isPriority ? 'var(--accent-text)' : 'var(--ink)',
                    }}
                  >
                    {r.geo_name} ({r.geo_id})
                  </button>
                  <strong>{fmtIN(val)}</strong>
                </div>
                <div className="bar-track">
                  <div
                    className={`bar-fill ${isPriority ? 'secondary' : ''}`}
                    style={{ width: `${val ? (val / maxBar) * 100 : 0}%` }}
                  />
                </div>
              </div>
            );
          })}
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">All {bundle.source.states_count} Geographies</div>
              <h2>Regional Crosswalk Table</h2>
            </div>
            <input
              type="search"
              placeholder="Filter state..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Filter states"
              className="select-field"
              style={{ minHeight: '36px', padding: '6px 10px', width: '160px' }}
            />
          </div>
          <p className="panel-desc">Click any row to switch the global workspace geography to that unit.</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Geography</th>
                  <th>{hasFy1920 ? 'FY19–20 Total' : 'Cumulative'}</th>
                  {hasFy1920 && <th>YoY</th>}
                  <th>Coverage</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {sortedRankings.map((r) => (
                  <tr
                    key={r.geo_id}
                    className="clickable-row"
                    onClick={() => onSelectGeo(r.geo_id)}
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && onSelectGeo(r.geo_id)}
                  >
                    <td>
                      <strong>{r.geo_name}</strong> ({r.geo_id})
                    </td>
                    <td>{fmtIN(hasFy1920 ? r.fy2019_20_total : r.total_observed_8yr)}</td>
                    {hasFy1920 && <td>{fmtPct(r.fy2019_20_yoy_pct, true)}</td>}
                    <td>
                      {r.observed_months}/{r.expected_months}m
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </div>
    </section>
  );
};
