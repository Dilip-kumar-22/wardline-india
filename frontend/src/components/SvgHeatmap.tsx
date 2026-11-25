import React, { useState } from 'react';
import { MonthlyPoint } from '../types/wardline';
import { fmtCompactIN, fmtPeriod, MONTH_SHORT } from '../utils/format';
import { formatMeasurement } from '../utils/formatMeasurement';
import { MetricMode } from '../viz/types';

interface Props {
  series: MonthlyPoint[];
  unit: string;
  mode?: MetricMode;
}

export const SvgHeatmap: React.FC<Props> = ({ series, unit, mode = 'daily_rate' }) => {
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const selected = series.find((point) => point.period === selectedPeriod);

  const years = Array.from(new Set(series.map((s) => s.year))).sort((a, b) => a - b);
  const byKey = new Map(series.map((s) => [`${s.year}-${s.month}`, s]));
  const getVal = (pt: MonthlyPoint | undefined): number | null => {
    if (!pt || pt.status !== 'observed') return null;
    return mode === 'daily_rate' ? pt.daily_rate : pt.value;
  };
  const vals = series.map((s) => getVal(s)).filter((v): v is number => v !== null);
  const minR = vals.length ? Math.min(...vals) : 0;
  const maxR = vals.length ? Math.max(...vals) : 1;

  const cellW = 54;
  const cellH = 34;
  const padLeft = 52;
  const padTop = 30;
  const w = padLeft + 12 * cellW + 16;
  const h = padTop + years.length * cellH + 16;
  const unitLabel = mode === 'daily_rate' ? `${unit}/day` : unit;

  return (
    <div>
      <div className="chart-wrap" style={{ minHeight: '220px' }}>
        <svg viewBox={`0 0 ${w} ${h}`} role="group" aria-label={`Year by month ${mode === 'daily_rate' ? 'daily-normalized' : 'monthly count'} utilization heatmap (${unitLabel})`}>
          <defs>
            <pattern id="missingHatch" width="6" height="6" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--muted-ink)" strokeWidth="1.4" strokeOpacity="0.45" />
            </pattern>
          </defs>

          {/* Month headers */}
          {MONTH_SHORT.map((m, idx) => (
            <text
              key={m}
              x={padLeft + idx * cellW + cellW / 2}
              y={18}
              textAnchor="middle"
              fontSize="11"
              fontWeight="600"
              fill="var(--muted-ink)"
            >
              {m}
            </text>
          ))}

          {/* Rows by year */}
          {years.map((yr, rIdx) => (
            <g key={yr}>
              <text
                x={padLeft - 8}
                y={padTop + rIdx * cellH + cellH / 2 + 4}
                textAnchor="end"
                fontSize="11"
                fontWeight="600"
                fill="var(--muted-ink)"
                className="tabular"
              >
                {yr}
              </text>
              {Array.from({ length: 12 }, (_, mIdx) => {
                const mo = mIdx + 1;
                const pt = byKey.get(`${yr}-${mo}`);
                const x = padLeft + mIdx * cellW + 2;
                const y = padTop + rIdx * cellH + 2;
                const cw = cellW - 4;
                const ch = cellH - 4;
                const val = getVal(pt);
                const isObserved = pt && val !== null;
                const isZero = isObserved && val === 0;
                const t = isObserved ? (val! - minR) / Math.max(1e-6, maxR - minR) : 0;
                const period = pt?.period ?? `${yr}-${String(mo).padStart(2, '0')}`;
                const isSelected = selectedPeriod === period;
                const select = () => setSelectedPeriod(period);

                return (
                  <g
                    key={mo}
                    tabIndex={0}
                    role="button"
                    aria-pressed={isSelected}
                    data-period={period}
                    data-value={val ?? ''}
                    data-unit={unitLabel}
                    data-status={pt?.status ?? 'missing'}
                    aria-label={
                      isObserved
                        ? `${fmtPeriod(pt!.period)}: ${formatMeasurement(val)} ${unitLabel} (${formatMeasurement(pt!.value)} monthly, ${formatMeasurement(pt!.daily_rate)} / day)`
                        : `${MONTH_SHORT[mIdx]} ${yr}: not observed or out of reporting window`
                    }
                    onMouseEnter={select}
                    onFocus={select}
                    onClick={select}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        select();
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <rect
                      x={x}
                      y={y}
                      width={cw}
                      height={ch}
                      rx={3}
                      fill={isObserved ? (isZero ? 'var(--secondary)' : 'var(--accent)') : 'url(#missingHatch)'}
                      fillOpacity={isObserved ? (isZero ? 0.28 : 0.14 + t * 0.78) : 1}
                      stroke={isSelected ? 'var(--secondary)' : isZero ? 'var(--ink)' : 'var(--border)'}
                      strokeWidth={isSelected ? 2 : 1}
                    />
                    {isObserved && (
                      <text
                        x={x + cw / 2}
                        y={y + ch / 2 + 4}
                        textAnchor="middle"
                        fontSize="10"
                        fontWeight="600"
                        fill={t > 0.52 && !isZero ? 'var(--on-accent)' : 'var(--ink)'}
                        className="tabular"
                      >
                        {fmtCompactIN(val)}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          ))}
        </svg>
      </div>

      <div className="panel-foot tabular">
        <span>
          {selectedPeriod
            ? selected?.status === 'observed'
              ? `Selected: ${fmtPeriod(selectedPeriod)} · ${formatMeasurement(getVal(selected))} ${unitLabel} (Monthly: ${formatMeasurement(selected.value)}, Daily: ${formatMeasurement(selected.daily_rate)}/day)`
              : `Selected: ${fmtPeriod(selectedPeriod)} · Status: ${selected?.status ?? 'outside available calendar observations'}`
            : `Metric: ${mode === 'daily_rate' ? `Daily rate (${unit}/day)` : `Monthly count (${unit})`}. Range: ${fmtCompactIN(minR)} to ${fmtCompactIN(maxR)}.`}
        </span>
        <span>Hatched = missing/masked · Outlined 0 = observed zero</span>
      </div>
    </div>
  );
};
