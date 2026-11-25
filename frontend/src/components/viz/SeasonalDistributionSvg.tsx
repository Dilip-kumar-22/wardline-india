import React, { useMemo, useState } from 'react';
import { SeriesAnalytics } from '../../types/wardline';
import { fmtCompactIN, fmtIN, MONTH_SHORT } from '../../utils/format';
import { getMetricValue } from '../../viz/selectors';
import { MetricMode } from '../../viz/types';

interface Props {
  series: SeriesAnalytics;
  unit: string;
  geoName: string;
  mode: MetricMode;
}

interface MonthDist {
  month: number;
  values: number[];
  missingCount: number;
  n: number;
  min: number | null;
  q25: number | null;
  median: number | null;
  q75: number | null;
  max: number | null;
  outliers: number[];
  whiskerLow: number | null;
  whiskerHigh: number | null;
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

export const SeasonalDistributionSvg: React.FC<Props> = ({ series, unit, geoName, mode }) => {
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);

  const dists: MonthDist[] = useMemo(() => {
    return Array.from({ length: 12 }, (_, idx) => {
      const m = idx + 1;
      const pts = series.monthly.filter((p) => p.month === m);
      const vals = pts
        .map((p) => getMetricValue(p, mode))
        .filter((v): v is number => v !== null)
        .sort((a, b) => a - b);
      const missingCount = pts.length - vals.length;
      if (!vals.length) {
        return {
          month: m,
          values: [],
          missingCount,
          n: 0,
          min: null,
          q25: null,
          median: null,
          q75: null,
          max: null,
          outliers: [],
          whiskerLow: null,
          whiskerHigh: null,
        };
      }
      const q25 = quantile(vals, 0.25);
      const med = quantile(vals, 0.5);
      const q75 = quantile(vals, 0.75);
      const iqr = q75 - q25;
      const lowFence = q25 - 1.5 * iqr;
      const highFence = q75 + 1.5 * iqr;
      const inliers = vals.filter((v) => v >= lowFence && v <= highFence);
      const outliers = vals.filter((v) => v < lowFence || v > highFence);
      return {
        month: m,
        values: vals,
        missingCount,
        n: vals.length,
        min: vals[0],
        q25,
        median: med,
        q75,
        max: vals[vals.length - 1],
        outliers,
        whiskerLow: inliers.length ? inliers[0] : vals[0],
        whiskerHigh: inliers.length ? inliers[inliers.length - 1] : vals[vals.length - 1],
      };
    });
  }, [series.monthly, mode]);

  const maxVal = Math.max(1, ...dists.map((d) => d.max ?? 0)) * 1.08;
  const smallSample = dists.every((d) => d.n < 4);

  const w = 720;
  const h = 270;
  const pad = { top: 22, right: 16, bottom: 48, left: 66 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;
  const yPos = (v: number) => pad.top + plotH - (v / maxVal) * plotH;

  const active = hoveredMonth !== null ? dists[hoveredMonth - 1] : null;
  const unitLabel = mode === 'daily_rate' ? `${unit}/day` : unit;

  return (
    <div>
      {smallSample && (
        <div className="insight-box" style={{ marginTop: 0, marginBottom: '12px' }}>
          <strong>Small-sample dot-plot mode active (n &lt; 4 years per month):</strong> Quartile boxes are suppressed to avoid misleading distribution summaries; individual observed points are plotted directly.
        </div>
      )}

      <div className="chart-wrap" style={{ minHeight: '250px' }}>
        <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`V07 Seasonal distribution for ${geoName} (${unitLabel})`}>
          {[0, 0.25, 0.5, 0.75, 1].map((f) => {
            const y = yPos(maxVal * f);
            return (
              <g key={f}>
                <line x1={pad.left} x2={w - pad.right} y1={y} y2={y} stroke="var(--border)" strokeDasharray="3 4" />
                <text x={pad.left - 8} y={y + 4} textAnchor="end" fontSize="10" fill="var(--muted-ink)" className="tabular">
                  {fmtCompactIN(maxVal * f)}
                </text>
              </g>
            );
          })}

          {dists.map((d, idx) => {
            const cx = pad.left + ((idx + 0.5) / 12) * plotW;
            const isMonsoon = d.month >= 6 && d.month <= 9;
            return (
              <g
                key={d.month}
                onMouseEnter={() => setHoveredMonth(d.month)}
                onMouseLeave={() => setHoveredMonth(null)}
                style={{ cursor: 'pointer' }}
              >
                <rect x={cx - 22} y={pad.top} width={44} height={plotH} fill="transparent" />
                <text x={cx} y={h - 24} textAnchor="middle" fontSize="11" fontWeight={isMonsoon ? '700' : '500'} fill="var(--ink)">
                  {MONTH_SHORT[d.month - 1]}
                </text>
                <text x={cx} y={h - 10} textAnchor="middle" fontSize="9.5" fill="var(--muted-ink)" className="tabular">
                  n={d.n}
                  {d.missingCount > 0 ? ` (${d.missingCount}m)` : ''}
                </text>

                {d.n >= 4 && d.whiskerLow !== null && d.whiskerHigh !== null && d.q25 !== null && d.q75 !== null && d.median !== null ? (
                  <>
                    <line x1={cx} x2={cx} y1={yPos(d.whiskerHigh)} y2={yPos(d.whiskerLow)} stroke="var(--muted-ink)" strokeWidth="1.5" />
                    <line x1={cx - 6} x2={cx + 6} y1={yPos(d.whiskerHigh)} y2={yPos(d.whiskerHigh)} stroke="var(--muted-ink)" strokeWidth="1.5" />
                    <line x1={cx - 6} x2={cx + 6} y1={yPos(d.whiskerLow)} y2={yPos(d.whiskerLow)} stroke="var(--muted-ink)" strokeWidth="1.5" />
                    <rect
                      x={cx - 11}
                      y={yPos(d.q75)}
                      width={22}
                      height={Math.max(2, yPos(d.q25) - yPos(d.q75))}
                      fill={isMonsoon ? 'var(--accent)' : 'var(--ink)'}
                      fillOpacity={isMonsoon ? 0.34 : 0.2}
                      stroke={isMonsoon ? 'var(--accent)' : 'var(--ink)'}
                      strokeWidth="1.3"
                    />
                    <line x1={cx - 11} x2={cx + 11} y1={yPos(d.median)} y2={yPos(d.median)} stroke="var(--accent)" strokeWidth="2.4" />
                    {d.outliers.map((ov, oi) => (
                      <circle
                        key={oi}
                        cx={cx}
                        cy={yPos(ov)}
                        r="3.5"
                        fill="var(--surface)"
                        stroke="var(--danger-ink)"
                        strokeWidth="1.6"
                      >
                        <title>{`Outlier in ${MONTH_SHORT[d.month - 1]}: ${fmtIN(ov)} ${unitLabel}`}</title>
                      </circle>
                    ))}
                  </>
                ) : (
                  d.values.map((v, vi) => (
                    <circle
                      key={vi}
                      cx={cx + (vi - (d.values.length - 1) / 2) * 5}
                      cy={yPos(v)}
                      r="4"
                      fill={isMonsoon ? 'var(--accent)' : 'var(--ink)'}
                    />
                  ))
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="insight-box" style={{ marginTop: '10px' }}>
        {active ? (
          <span className="tabular">
            <strong>{MONTH_SHORT[active.month - 1]}</strong> (n={active.n} observed, {active.missingCount} missing):{' '}
            Median <strong>{fmtIN(active.median)}</strong> · IQR [{fmtIN(active.q25)} – {fmtIN(active.q75)}] · Min {fmtIN(active.min)} · Max {fmtIN(active.max)} · Outliers: {active.outliers.length} ({unitLabel})
          </span>
        ) : (
          <span>
            <strong>Reading the distribution:</strong> Orange line = median, box = middle 50% (Q25–Q75), whiskers = 1.5×IQR fence, hollow red circles = statistical outliers. Sample size <code>n</code> is shown beneath every month.
          </span>
        )}
      </div>
    </div>
  );
};
