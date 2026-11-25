import React, { useState } from 'react';
import { MonthlyPoint } from '../types/wardline';
import { fmtCompactIN, fmtIN, fmtPeriod } from '../utils/format';

interface Props {
  series: MonthlyPoint[];
  compareSeries?: MonthlyPoint[];
  primaryLabel: string;
  compareLabel?: string;
  showRolling12?: boolean;
  showFixedCohort?: boolean;
  metricMode?: 'monthly' | 'daily';
  darkStage?: boolean;
  unit: string;
  ariaLabel: string;
}

export const SvgTimeSeries: React.FC<Props> = ({
  series,
  compareSeries,
  primaryLabel,
  compareLabel,
  showRolling12 = true,
  showFixedCohort = false,
  metricMode = 'monthly',
  darkStage = false,
  unit,
  ariaLabel,
}) => {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const getPrimaryVal = (p: MonthlyPoint) => (metricMode === 'daily' ? p.daily_rate : p.value);
  const getCohortVal = (p: MonthlyPoint) => {
    if (p.fixed_cohort_value === null || p.fixed_cohort_value === undefined) return null;
    return metricMode === 'daily' ? Number((p.fixed_cohort_value / p.days).toFixed(2)) : p.fixed_cohort_value;
  };

  const observed = series.filter((d) => getPrimaryVal(d) !== null);
  if (observed.length === 0) {
    return <div className="unavailable-box">No observed monthly counts in the selected scope.</div>;
  }

  const w = 780;
  const h = 300;
  const pad = { top: 24, right: 24, bottom: 40, left: 68 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  const allVals = [
    ...series.map((d) => getPrimaryVal(d) ?? 0),
    ...(compareSeries ? compareSeries.map((d) => getPrimaryVal(d) ?? 0) : []),
    ...(showFixedCohort ? series.map((d) => getCohortVal(d) ?? 0) : []),
  ];
  const maxVal = Math.max(1, ...allVals) * 1.1;

  const xPos = (i: number) => pad.left + (i / Math.max(1, series.length - 1)) * plotW;
  const yPos = (v: number) => pad.top + plotH - (v / maxVal) * plotH;

  const buildSegments = (pts: MonthlyPoint[], accessor: (p: MonthlyPoint) => number | null) => {
    const segs: string[] = [];
    let current: string[] = [];
    pts.forEach((p, idx) => {
      const val = accessor(p);
      if (val !== null) {
        current.push(`${current.length === 0 ? 'M' : 'L'}${xPos(idx).toFixed(1)},${yPos(val).toFixed(1)}`);
      } else if (current.length > 0) {
        segs.push(current.join(' '));
        current = [];
      }
    });
    if (current.length > 0) segs.push(current.join(' '));
    return segs;
  };

  const primarySegs = buildSegments(series, getPrimaryVal);
  const rollingSegs =
    showRolling12 && metricMode === 'monthly' ? buildSegments(series, (p) => p.rolling_12m) : [];
  const cohortSegs = showFixedCohort ? buildSegments(series, getCohortVal) : [];
  const compareSegs = compareSeries ? buildSegments(compareSeries, getPrimaryVal) : [];

  const breakIdx = series.findIndex((d) => d.period === '2017-04');
  const peakVal = Math.max(...observed.map((d) => getPrimaryVal(d) ?? 0));

  const gridStroke = darkStage ? 'var(--chart-panel-grid)' : 'var(--border)';
  const axisInk = darkStage ? 'var(--chart-panel-muted)' : 'var(--muted-ink)';
  const primaryStroke = darkStage ? 'var(--chart-panel-ink)' : 'var(--ink)';
  const displayUnit = metricMode === 'daily' ? `${unit} / day` : unit;

  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const xTickIndices = series
    .map((d, i) => (d.month === 4 || (series.length <= 15 && i % 2 === 0) ? i : -1))
    .filter((i) => i >= 0);

  const activePoint = activeIdx !== null ? series[activeIdx] : null;
  const activeCompare = activeIdx !== null && compareSeries ? compareSeries[activeIdx] : null;

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={ariaLabel}>
        {yTicks.map((f) => {
          const y = yPos(maxVal * f);
          return (
            <g key={f}>
              <line x1={pad.left} x2={w - pad.right} y1={y} y2={y} stroke={gridStroke} strokeDasharray="3 4" />
              <text x={pad.left - 8} y={y + 4} textAnchor="end" fontSize="11" fill={axisInk} className="tabular">
                {fmtCompactIN(maxVal * f)}
              </text>
            </g>
          );
        })}

        {/* Missing-month vertical gap shading */}
        {series.map((pt, idx) =>
          getPrimaryVal(pt) === null ? (
            <rect
              key={`gap-${pt.period}`}
              x={xPos(idx) - 3}
              y={pad.top}
              width={6}
              height={plotH}
              fill="var(--accent)"
              fillOpacity="0.18"
            />
          ) : null
        )}

        {breakIdx >= 0 && (
          <g>
            <line
              x1={xPos(breakIdx)}
              x2={xPos(breakIdx)}
              y1={pad.top}
              y2={h - pad.bottom}
              stroke="var(--accent)"
              strokeWidth="1.2"
              strokeDasharray="4 3"
            />
            <text x={xPos(breakIdx) + 5} y={pad.top + 11} fontSize="10" fill="var(--accent)" fontWeight="700">
              APR 2017 HMIS FORMAT SHIFT
            </text>
          </g>
        )}

        {primarySegs.map((d, idx) => (
          <path key={`p-${idx}`} d={d} fill="none" stroke={primaryStroke} strokeWidth="2.3" strokeLinejoin="round" />
        ))}

        {rollingSegs.map((d, idx) => (
          <path key={`r-${idx}`} d={d} fill="none" stroke="var(--accent)" strokeWidth="2.1" strokeDasharray="6 3" />
        ))}

        {cohortSegs.map((d, idx) => (
          <path key={`fc-${idx}`} d={d} fill="none" stroke="#9BD0AB" strokeWidth="1.9" strokeDasharray="3 3" />
        ))}

        {compareSegs.map((d, idx) => (
          <path key={`c-${idx}`} d={d} fill="none" stroke="var(--accent)" strokeWidth="2.3" strokeDasharray="6 3" strokeLinejoin="round" />
        ))}

        {xTickIndices.map((idx) => (
          <text key={idx} x={xPos(idx)} y={h - 14} textAnchor="middle" fontSize="11" fill={axisInk} className="tabular">
            {series.length <= 15 ? fmtPeriod(series[idx].period) : series[idx].period.slice(0, 4)}
          </text>
        ))}

        {series.map((pt, idx) => {
          const val = getPrimaryVal(pt);
          if (val === null) return null;
          const cx = xPos(idx);
          const cy = yPos(val);
          const isPeak = val === peakVal;
          const isActive = activeIdx === idx;
          return (
            <circle
              key={pt.period}
              cx={cx}
              cy={cy}
              r={isActive ? 6 : isPeak ? 4.8 : 2.3}
              fill={isActive || isPeak ? 'var(--accent)' : primaryStroke}
              stroke={darkStage ? 'var(--chart-panel-bg)' : 'var(--surface)'}
              strokeWidth="1.4"
              tabIndex={0}
              role="button"
              aria-label={`${fmtPeriod(pt.period)}: ${fmtIN(val)} ${displayUnit}`}
              onMouseEnter={() => setActiveIdx(idx)}
              onFocus={() => setActiveIdx(idx)}
              onMouseLeave={() => setActiveIdx(null)}
              onBlur={() => setActiveIdx(null)}
              style={{ cursor: 'pointer' }}
            />
          );
        })}
      </svg>

      {activePoint && getPrimaryVal(activePoint) !== null && (
        <div
          className="chart-tooltip tabular"
          style={{
            left: `${Math.min(70, Math.max(4, ((activeIdx ?? 0) / Math.max(1, series.length - 1)) * 80))}%`,
            top: '8px',
          }}
        >
          <strong>{fmtPeriod(activePoint.period)}</strong>
          <div>
            {primaryLabel}: {fmtIN(getPrimaryVal(activePoint))} {displayUnit}
          </div>
          {activePoint.states_reporting !== undefined && (
            <div>Reporting units: {activePoint.states_reporting} ({activePoint.coverage_status === 'complete_34_of_34' ? 'complete 34/34' : 'partial'})</div>
          )}
          {activePoint.yoy_pct !== null && (
            <div>YoY: {activePoint.yoy_pct > 0 ? '+' : ''}{activePoint.yoy_pct.toFixed(1)}%</div>
          )}
          {activeCompare && getPrimaryVal(activeCompare) !== null && (
            <div>
              {compareLabel}: {fmtIN(getPrimaryVal(activeCompare))} {displayUnit}
            </div>
          )}
        </div>
      )}

      <div className="chart-legend">
        <span className="legend-item">
          <i className="legend-line" style={{ background: primaryStroke }} /> {primaryLabel} ({displayUnit})
        </span>
        {showRolling12 && metricMode === 'monthly' && (
          <span className="legend-item">
            <i className="legend-line" style={{ background: 'transparent', borderTop: '2px dashed var(--accent)' }} />
            12-month rolling mean
          </span>
        )}
        {showFixedCohort && (
          <span className="legend-item">
            <i className="legend-line" style={{ background: 'transparent', borderTop: '2px dotted #9BD0AB' }} />
            Fixed-cohort (100%-complete states)
          </span>
        )}
        {compareSeries && compareLabel && (
          <span className="legend-item">
            <i className="legend-line" style={{ background: 'transparent', borderTop: '2px dashed var(--accent)' }} />
            {compareLabel}
          </span>
        )}
      </div>
    </div>
  );
};
