import React, { useMemo, useState } from 'react';
import { SeriesAnalytics } from '../../types/wardline';
import { fmtCompactIN, fmtIN, fmtPct } from '../../utils/format';
import { buildGrowthSeries } from '../../viz/selectors';
import { GrowthPoint, MetricMode } from '../../viz/types';

interface Props {
  series: SeriesAnalytics;
  unit: string;
  geoName: string;
  mode: MetricMode;
}

type GrowthView = 'yoy_pct' | 'yoy_diff' | 'indexed' | 'rolling';

export const HistoricalGrowthSvg: React.FC<Props> = ({ series, unit, geoName, mode }) => {
  const [growthView, setGrowthView] = useState<GrowthView>('yoy_pct');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const points = useMemo(() => buildGrowthSeries(series, mode), [series, mode]);

  const getVal = (p: GrowthPoint): number | null => {
    if (growthView === 'yoy_pct') return p.yoyPct;
    if (growthView === 'yoy_diff') return p.yoyDiff;
    if (growthView === 'indexed') return p.indexedBase100;
    return p.rolling12m;
  };

  const validVals = points.map(getVal).filter((v): v is number => v !== null);
  const hasData = validVals.length > 0;

  const w = 780;
  const h = 260;
  const pad = { top: 20, right: 20, bottom: 38, left: 66 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  const rawMin = hasData ? Math.min(...validVals) : 0;
  const rawMax = hasData ? Math.max(...validVals) : 1;
  const baseline = growthView === 'indexed' ? 100 : 0;
  const yMin = growthView === 'rolling' ? 0 : Math.min(baseline, rawMin * 1.12);
  const yMax = Math.max(baseline + 1, rawMax * 1.12);
  const ySpan = Math.max(1e-6, yMax - yMin);

  const xPos = (i: number) => pad.left + (i / Math.max(1, points.length - 1)) * plotW;
  const yPos = (v: number) => pad.top + plotH - ((v - yMin) / ySpan) * plotH;

  // Build gap-preserving SVG path segments (never bridges missing data)
  const lineSegments = useMemo(() => {
    const segs: string[] = [];
    let cur = '';
    points.forEach((p, i) => {
      const v = getVal(p);
      if (v === null) {
        if (cur) {
          segs.push(cur);
          cur = '';
        }
        return;
      }
      const x = xPos(i);
      const y = yPos(v);
      cur += cur ? ` L${x.toFixed(1)},${y.toFixed(1)}` : `M${x.toFixed(1)},${y.toFixed(1)}`;
    });
    if (cur) segs.push(cur);
    return segs;
  }, [points, growthView, yMin, ySpan]);

  const active = hoveredIdx !== null ? points[hoveredIdx] : null;
  const basePeriod = points.find((p) => p.baselinePeriod)?.baselinePeriod ?? 'first observed';

  return (
    <div>
      <div className="filter-bar" style={{ marginBottom: '12px' }}>
        <button
          type="button"
          className={`btn ${growthView === 'yoy_pct' ? 'primary' : ''}`}
          onClick={() => setGrowthView('yoy_pct')}
          style={{ minHeight: '34px', padding: '5px 10px', fontSize: '12px' }}
        >
          YoY % Change
        </button>
        <button
          type="button"
          className={`btn ${growthView === 'yoy_diff' ? 'primary' : ''}`}
          onClick={() => setGrowthView('yoy_diff')}
          style={{ minHeight: '34px', padding: '5px 10px', fontSize: '12px' }}
        >
          Absolute YoY Diff
        </button>
        <button
          type="button"
          className={`btn ${growthView === 'indexed' ? 'primary' : ''}`}
          onClick={() => setGrowthView('indexed')}
          style={{ minHeight: '34px', padding: '5px 10px', fontSize: '12px' }}
        >
          Indexed (Base 100 = {basePeriod})
        </button>
        <button
          type="button"
          className={`btn ${growthView === 'rolling' ? 'primary' : ''}`}
          onClick={() => setGrowthView('rolling')}
          style={{ minHeight: '34px', padding: '5px 10px', fontSize: '12px' }}
        >
          12m Rolling Mean
        </button>
      </div>

      {!hasData ? (
        <div className="unavailable-box">
          <strong>Insufficient paired observations for {growthView.replace('_', ' ')}:</strong> At least 13 contiguous calendar months with non-zero prior baselines are required.
        </div>
      ) : (
        <div className="chart-wrap" style={{ minHeight: '240px' }}>
          <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`V08 Historical growth explorer (${growthView}) for ${geoName}`}>
            {[0, 0.25, 0.5, 0.75, 1].map((f) => {
              const v = yMin + f * ySpan;
              const y = yPos(v);
              return (
                <g key={f}>
                  <line x1={pad.left} x2={w - pad.right} y1={y} y2={y} stroke="var(--border)" strokeDasharray="3 4" />
                  <text x={pad.left - 8} y={y + 4} textAnchor="end" fontSize="10" fill="var(--muted-ink)" className="tabular">
                    {growthView === 'yoy_pct' ? `${v.toFixed(0)}%` : growthView === 'indexed' ? v.toFixed(0) : fmtCompactIN(v)}
                  </text>
                </g>
              );
            })}

            {/* Reference baseline */}
            {growthView !== 'rolling' && (
              <line
                x1={pad.left}
                x2={w - pad.right}
                y1={yPos(baseline)}
                y2={yPos(baseline)}
                stroke="var(--ink)"
                strokeWidth="1.2"
                strokeDasharray="4 3"
              />
            )}

            {/* Diverging bars for YoY % and Diff, crisp path for Indexed & Rolling */}
            {growthView === 'yoy_pct' || growthView === 'yoy_diff' ? (
              points.map((p, i) => {
                const v = getVal(p);
                if (v === null) return null;
                const x = xPos(i);
                const y0 = yPos(0);
                const y1 = yPos(v);
                const barW = Math.max(2, plotW / points.length - 1.5);
                return (
                  <rect
                    key={p.period}
                    x={x - barW / 2}
                    y={Math.min(y0, y1)}
                    width={barW}
                    height={Math.max(1.5, Math.abs(y1 - y0))}
                    fill={v >= 0 ? 'var(--accent)' : 'var(--secondary)'}
                    opacity={hoveredIdx === i ? 1 : 0.82}
                    onMouseEnter={() => setHoveredIdx(i)}
                    onMouseLeave={() => setHoveredIdx(null)}
                  />
                );
              })
            ) : (
              <>
                {lineSegments.map((d, i) => (
                  <path key={i} d={d} fill="none" stroke="var(--accent)" strokeWidth="2.2" />
                ))}
                {points.map((p, i) => {
                  const v = getVal(p);
                  if (v === null) return null;
                  return (
                    <circle
                      key={p.period}
                      cx={xPos(i)}
                      cy={yPos(v)}
                      r={hoveredIdx === i ? 4.5 : 2.2}
                      fill="var(--accent)"
                      onMouseEnter={() => setHoveredIdx(i)}
                      onMouseLeave={() => setHoveredIdx(null)}
                    />
                  );
                })}
              </>
            )}

            {/* X-axis year labels */}
            {points.map((p, i) =>
              p.month === 1 || i === 0 ? (
                <text key={p.period} x={xPos(i)} y={h - 12} textAnchor="middle" fontSize="10" fill="var(--muted-ink)" className="tabular">
                  {p.year}
                </text>
              ) : null
            )}
          </svg>
        </div>
      )}

      <div className="insight-box" style={{ marginTop: '10px' }}>
        {active ? (
          <span className="tabular">
            <strong>{active.period}</strong> · Value: {fmtIN(active.value)} ({mode === 'daily_rate' ? `${unit}/day` : unit}) · YoY Diff:{' '}
            <strong>{active.yoyDiff !== null ? fmtIN(active.yoyDiff) : 'n/a'}</strong> · YoY %:{' '}
            <strong>{fmtPct(active.yoyPct, true)}</strong> · Indexed: <strong>{active.indexedBase100?.toFixed(1) ?? 'n/a'}</strong> · 12m Rolling:{' '}
            <strong>{fmtIN(active.rolling12m)}</strong>
          </span>
        ) : (
          <span>
            <strong>Mathematical safeguards:</strong> YoY % change is strictly suppressed whenever the prior-year baseline is <code>0</code> or missing. 12-month rolling averages require 12 consecutive observed calendar months with zero gaps.
          </span>
        )}
      </div>
    </div>
  );
};
