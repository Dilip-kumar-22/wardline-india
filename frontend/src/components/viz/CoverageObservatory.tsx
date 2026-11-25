import React, { useMemo, useState } from 'react';
import { IndicatorMeta, WardlineBundle } from '../../types/wardline';
import { fmtIN } from '../../utils/format';
import { buildCoverageMatrix } from '../../viz/selectors';

interface Props {
  bundle: WardlineBundle;
  indicatorId: string;
  indicator: IndicatorMeta;
  onSelectGeo: (geoId: string) => void;
}

export const CoverageObservatory: React.FC<Props> = ({ bundle, indicatorId, indicator, onSelectGeo }) => {
  const [filterMode, setFilterMode] = useState<'all' | 'incomplete'>('all');
  const { years, rows } = useMemo(() => buildCoverageMatrix(bundle, indicatorId), [bundle, indicatorId]);
  const natSeries = bundle.analytics.national[indicatorId];
  const comp = natSeries?.national_comparability;

  const filtered = filterMode === 'incomplete' ? rows.filter((r) => r.coveragePct < 100) : rows;
  const incompleteCount = rows.filter((r) => r.coveragePct < 100).length;
  const totalZeros = rows.reduce((acc, r) => acc + r.zeroMonths, 0);
  const totalNotRep = rows.reduce((acc, r) => acc + r.notReportedMonths, 0);
  const totalMissing = rows.reduce((acc, r) => acc + r.missingMonths, 0);

  return (
    <div>
      <div className="kpi-strip" style={{ marginBottom: '18px' }}>
        <div className="kpi">
          <div className="kpi-val tabular">{rows.length - incompleteCount}/{rows.length}</div>
          <div className="kpi-label">100% Complete Units</div>
          <div className="kpi-note">Eligible for fixed-cohort national trend</div>
        </div>
        <div className="kpi">
          <div className="kpi-val tabular">{totalZeros}</div>
          <div className="kpi-label">Observed Zero Months</div>
          <div className="kpi-note">Verified numeric 0 (distinct from missing)</div>
        </div>
        <div className="kpi">
          <div className="kpi-val tabular">{totalNotRep}</div>
          <div className="kpi-label">Masked (&lt;90% District Gate)</div>
          <div className="kpi-note">Withheld to prevent under-reporting bias</div>
        </div>
        <div className="kpi">
          <div className="kpi-val tabular">{totalMissing}</div>
          <div className="kpi-label">Missing Calendar Months</div>
          <div className="kpi-note">No verified record in interval</div>
        </div>
      </div>

      {comp && (
        <div className="insight-box" style={{ marginTop: 0, marginBottom: '16px' }}>
          <strong>Fixed-Cohort vs. Variable-Coverage Comparability ({indicator.short_label}):</strong>{' '}
          {comp.note} Raw All-India totals include <strong>{comp.partial_reporting_months}</strong> months where fewer than{' '}
          {comp.total_units} units reported; the <strong>{comp.fixed_cohort_states_count}-unit fixed cohort</strong> holds geography constant across all months (FY 2019–20 fixed-cohort total: <strong>{fmtIN(comp.fixed_cohort_fy2019_20_total)}</strong>).
        </div>
      )}

      <div className="filter-bar" style={{ marginBottom: '12px' }}>
        <button
          type="button"
          className={`btn ${filterMode === 'all' ? 'primary' : ''}`}
          onClick={() => setFilterMode('all')}
          style={{ minHeight: '32px', padding: '4px 10px', fontSize: '12px' }}
        >
          All Units ({rows.length})
        </button>
        <button
          type="button"
          className={`btn ${filterMode === 'incomplete' ? 'primary' : ''}`}
          onClick={() => setFilterMode('incomplete')}
          style={{ minHeight: '32px', padding: '4px 10px', fontSize: '12px' }}
        >
          Units with Gaps ({incompleteCount})
        </button>
        <span className="chart-legend" style={{ marginTop: 0 }}>
          <span className="legend-item"><span className="swatch" style={{ background: 'var(--ink)' }} /> 100% Observed</span>
          <span className="legend-item"><span className="swatch" style={{ background: 'var(--accent)' }} /> Partial (&lt;100%)</span>
          <span className="legend-item"><span className="swatch" style={{ background: 'var(--danger-ink)' }} /> 0% / Masked</span>
        </span>
      </div>

      <div className="table-wrap" style={{ maxHeight: '360px' }}>
        <table>
          <thead>
            <tr>
              <th>Geography</th>
              <th>Coverage</th>
              <th>Zeros</th>
              <th>Gaps</th>
              {years.map((y) => (
                <th key={y}>{y}</th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular">
            {filtered.map((r) => (
              <tr key={r.geo_id} className="clickable-row" onClick={() => onSelectGeo(r.geo_id)}>
                <td>
                  <strong>{r.geo_name}</strong> ({r.geo_id})
                </td>
                <td>
                  {r.observedMonths}/{r.expectedMonths}m ({r.coveragePct.toFixed(1)}%)
                </td>
                <td>{r.zeroMonths}</td>
                <td>{r.missingMonths + r.notReportedMonths}</td>
                {r.byYear.map((yc) => {
                  const bg =
                    yc.pct === 100
                      ? 'var(--ink)'
                      : yc.pct > 0
                      ? 'var(--accent)'
                      : 'var(--danger-ink)';
                  const fg = yc.pct === 100 ? 'var(--canvas)' : 'var(--on-accent)';
                  return (
                    <td key={yc.year} style={{ padding: '6px 8px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          minWidth: '42px',
                          textAlign: 'center',
                          padding: '2px 5px',
                          borderRadius: '2px',
                          background: bg,
                          color: fg,
                          fontSize: '11px',
                          fontWeight: 700,
                        }}
                        title={`${r.geo_name} ${yc.year}: ${yc.observed}/${yc.expected} observed, ${yc.zeros} zeros, ${yc.notReported} masked, ${yc.missing} missing`}
                      >
                        {yc.observed}/{yc.expected}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="unavailable-box" style={{ marginTop: '14px' }}>
        <strong>Unavailable Indicators (Explicitly Withheld):</strong>{' '}
        {bundle.unavailable_dimensions.map((u) => u.label).join(' · ')}. WARDLINE INDIA never proxies or fabricates unavailable hospital admission dimensions.
      </div>
    </div>
  );
};
