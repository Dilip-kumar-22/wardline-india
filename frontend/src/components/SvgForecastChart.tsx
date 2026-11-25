import React from 'react';
import { ForecastEntry, MonthlyPoint } from '../types/wardline';
import { fmtCompactIN, fmtPeriod } from '../utils/format';

interface Props {
  history: MonthlyPoint[];
  forecast: ForecastEntry;
  unit: string;
}

export const SvgForecastChart: React.FC<Props> = ({ history, forecast, unit }) => {
  if (!forecast.ready || !forecast.holdout_series || !forecast.future_projection) {
    return (
      <div className="unavailable-box">
        <strong>Forecast withheld:</strong> {forecast.reason}
      </div>
    );
  }

  const histTail = history.slice(-36);
  const fut = forecast.future_projection;
  const totalPts = histTail.length + fut.length;

  const w = 780;
  const h = 300;
  const pad = { top: 24, right: 24, bottom: 40, left: 68 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  const selectedModel = forecast.selected_model ?? 'seasonal_naive';
  const holdoutMap = new Map(forecast.holdout_series.map((r) => [r.period, r]));

  const allVals: number[] = [
    ...histTail.map((d) => d.value ?? 0),
    ...fut.map((d) => d.upper_p80_uncalibrated),
  ];
  const maxVal = Math.max(1, ...allVals) * 1.08;

  const xPos = (i: number) => pad.left + (i / Math.max(1, totalPts - 1)) * plotW;
  const yPos = (v: number) => pad.top + plotH - (v / maxVal) * plotH;

  const obsPath = histTail
    .map((d, i) => (d.value !== null ? `${i === 0 ? 'M' : 'L'}${xPos(i).toFixed(1)},${yPos(d.value).toFixed(1)}` : ''))
    .filter(Boolean)
    .join(' ');

  const holdoutPts: string[] = [];
  histTail.forEach((d, i) => {
    const hm = holdoutMap.get(d.period);
    if (hm) {
      const pred = hm[selectedModel as keyof typeof hm] as number;
      holdoutPts.push(`${holdoutPts.length === 0 ? 'M' : 'L'}${xPos(i).toFixed(1)},${yPos(pred).toFixed(1)}`);
    }
  });

  const startFutIdx = histTail.length;
  const lastObsVal = histTail[histTail.length - 1]?.value ?? fut[0].point;
  const futPath = [
    `M${xPos(startFutIdx - 1).toFixed(1)},${yPos(lastObsVal).toFixed(1)}`,
    ...fut.map((d, i) => `L${xPos(startFutIdx + i).toFixed(1)},${yPos(d.point).toFixed(1)}`),
  ].join(' ');

  const bandTop = fut.map((d, i) => `${xPos(startFutIdx + i).toFixed(1)},${yPos(d.upper_p80_uncalibrated).toFixed(1)}`);
  const bandBot = [...fut]
    .reverse()
    .map((d, i) => `${xPos(startFutIdx + (fut.length - 1 - i)).toFixed(1)},${yPos(d.lower_p80_uncalibrated).toFixed(1)}`);
  const bandPolygon = `${bandTop.join(' ')} ${bandBot.join(' ')}`;

  const cutoffIdx = histTail.findIndex((d) => d.period === forecast.train_cutoff);

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Chronological test window and 12-month projection for ${forecast.geo_name}`}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const y = yPos(maxVal * f);
          return (
            <g key={f}>
              <line x1={pad.left} x2={w - pad.right} y1={y} y2={y} stroke="var(--border)" strokeDasharray="3 4" />
              <text x={pad.left - 8} y={y + 4} textAnchor="end" fontSize="11" fill="var(--muted-ink)" className="tabular">
                {fmtCompactIN(maxVal * f)}
              </text>
            </g>
          );
        })}

        {cutoffIdx >= 0 && (
          <g>
            <line
              x1={xPos(cutoffIdx)}
              x2={xPos(cutoffIdx)}
              y1={pad.top}
              y2={h - pad.bottom}
              stroke="var(--muted-ink)"
              strokeDasharray="4 3"
            />
            <text x={xPos(cutoffIdx) + 5} y={pad.top + 11} fontSize="10" fill="var(--muted-ink)" fontWeight="600">
              Test start ({forecast.holdout_start})
            </text>
          </g>
        )}

        <line
          x1={xPos(startFutIdx - 1)}
          x2={xPos(startFutIdx - 1)}
          y1={pad.top}
          y2={h - pad.bottom}
          stroke="var(--accent)"
          strokeDasharray="4 3"
        />
        <text x={xPos(startFutIdx - 1) + 5} y={pad.top + 11} fontSize="10" fill="var(--accent-text)" fontWeight="700">
          Projected (12m)
        </text>

        <polygon points={bandPolygon} fill="var(--accent)" fillOpacity="0.14" />
        <path d={obsPath} fill="none" stroke="var(--ink)" strokeWidth="2.4" />
        <path d={holdoutPts.join(' ')} fill="none" stroke="var(--accent)" strokeWidth="2" strokeDasharray="4 3" />
        <path d={futPath} fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeDasharray="6 4" />

        {[0, 12, 24, 35, totalPts - 1].map((idx) => {
          const p = idx < histTail.length ? histTail[idx].period : fut[idx - histTail.length].period;
          return (
            <text key={idx} x={xPos(idx)} y={h - 14} textAnchor="middle" fontSize="11" fill="var(--muted-ink)" className="tabular">
              {fmtPeriod(p)}
            </text>
          );
        })}
      </svg>

      <div className="chart-legend">
        <span className="legend-item">
          <i className="legend-line" style={{ background: 'var(--ink)' }} /> Observed ({unit})
        </span>
        <span className="legend-item">
          <i className="legend-line dashed" style={{ borderTopColor: 'var(--accent)' }} /> {selectedModel.replace(/_/g, ' ')} (locked dev-CV model)
        </span>
        <span className="legend-item">
          <i style={{ width: 12, height: 10, display: 'inline-block', background: 'var(--accent)', opacity: 0.25 }} />
          Uncalibrated dev-CV p80 abs-error band
        </span>
      </div>
    </div>
  );
};
