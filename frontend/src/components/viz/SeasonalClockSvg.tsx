import React, { useMemo, useState } from 'react';
import { SeriesAnalytics, ThemeId } from '../../types/wardline';
import { fmtIN, MONTH_SHORT } from '../../utils/format';
import { getThemePalette, interpolateRamp } from '../../viz/palettes';
import { buildTerrainMatrix } from '../../viz/selectors';
import { MetricMode, TerrainCell } from '../../viz/types';
import { SvgHeatmap } from '../SvgHeatmap';

interface Props {
  series: SeriesAnalytics;
  unit: string;
  theme: ThemeId;
  mode: MetricMode;
}

const SEASON_ARCS: Array<{ id: string; label: string; startMonth: number; endMonth: number }> = [
  { id: 'winter', label: 'Winter (Jan–Feb)', startMonth: 1, endMonth: 2 },
  { id: 'pre_monsoon', label: 'Pre-Monsoon (Mar–May)', startMonth: 3, endMonth: 5 },
  { id: 'sw_monsoon', label: 'SW Monsoon (Jun–Sep)', startMonth: 6, endMonth: 9 },
  { id: 'post_monsoon', label: 'Post-Monsoon (Oct–Dec)', startMonth: 10, endMonth: 12 },
];

function polarToXY(cx: number, cy: number, r: number, angleRad: number): [number, number] {
  return [cx + r * Math.cos(angleRad), cy + r * Math.sin(angleRad)];
}

function annularSectorPath(
  cx: number,
  cy: number,
  rIn: number,
  rOut: number,
  a0: number,
  a1: number
): string {
  const [x0, y0] = polarToXY(cx, cy, rOut, a0);
  const [x1, y1] = polarToXY(cx, cy, rOut, a1);
  const [x2, y2] = polarToXY(cx, cy, rIn, a1);
  const [x3, y3] = polarToXY(cx, cy, rIn, a0);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${x0.toFixed(1)},${y0.toFixed(1)} A${rOut.toFixed(1)},${rOut.toFixed(1)} 0 ${large} 1 ${x1.toFixed(1)},${y1.toFixed(1)} L${x2.toFixed(1)},${y2.toFixed(1)} A${rIn.toFixed(1)},${rIn.toFixed(1)} 0 ${large} 0 ${x3.toFixed(1)},${y3.toFixed(1)} Z`;
}

export const SeasonalClockSvg: React.FC<Props> = ({ series, unit, theme, mode }) => {
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [hovered, setHovered] = useState<TerrainCell | null>(null);
  const [showHeatmapAlt, setShowHeatmapAlt] = useState(false);

  const palette = getThemePalette(theme);
  const matrix = useMemo(() => buildTerrainMatrix(series, mode), [series, mode]);

  if (showHeatmapAlt) {
    return (
      <div>
        <div className="filter-bar" style={{ marginBottom: '12px' }}>
          <button type="button" className="btn primary" onClick={() => setShowHeatmapAlt(false)} style={{ minHeight: '34px', padding: '5px 10px' }}>
            Switch to Radial Seasonal Clock (V04)
          </button>
          <span className="eyebrow">Showing equivalent 2D Calendar Matrix for identical observations</span>
        </div>
        <SvgHeatmap series={series.monthly} unit={unit} mode={mode} />
      </div>
    );
  }

  const size = 460;
  const cx = size / 2;
  const cy = size / 2;
  const innerR = 54;
  const outerR = 178;
  const ringCount = Math.max(1, matrix.years.length);
  const ringThick = (outerR - innerR) / ringCount;
  const gapRad = 0.014;
  const span = Math.max(1e-6, matrix.maxValue - matrix.minValue);

  const activeCell = hovered;

  return (
    <div>
      <div className="filter-bar" style={{ marginBottom: '12px' }}>
        {SEASON_ARCS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`btn ${selectedSeason === s.id ? 'primary' : ''}`}
            onClick={() => setSelectedSeason((cur) => (cur === s.id ? null : s.id))}
            style={{ minHeight: '32px', padding: '4px 9px', fontSize: '12px' }}
          >
            {s.label}
          </button>
        ))}
        <button
          type="button"
          className="btn"
          onClick={() => {
            setSelectedSeason(null);
            setSelectedYear(null);
            setSelectedMonth(null);
          }}
          style={{ minHeight: '32px', padding: '4px 9px', fontSize: '12px' }}
        >
          Reset Highlight
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => setShowHeatmapAlt(true)}
          style={{ minHeight: '32px', padding: '4px 9px', fontSize: '12px' }}
        >
          2D Heatmap Alternative
        </button>
      </div>

      <div className="grid-equal" style={{ alignItems: 'center', marginBottom: 0 }}>
        <div className="chart-wrap" style={{ minHeight: '360px' }}>
          <svg
            viewBox={`0 0 ${size} ${size}`}
            role="img"
            aria-label={`V04 Radial Seasonal Clock across ${matrix.years.length} years and 12 months`}
          >
            {/* Outer IMD season arcs */}
            {SEASON_ARCS.map((s) => {
              const a0 = -Math.PI / 2 + ((s.startMonth - 1) / 12) * Math.PI * 2 + 0.02;
              const a1 = -Math.PI / 2 + (s.endMonth / 12) * Math.PI * 2 - 0.02;
              const isActive = !selectedSeason || selectedSeason === s.id;
              return (
                <path
                  key={s.id}
                  d={annularSectorPath(cx, cy, outerR + 10, outerR + 18, a0, a1)}
                  fill={palette.seasonColors[s.id] ?? palette.accent}
                  opacity={isActive ? 0.95 : 0.25}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedSeason((cur) => (cur === s.id ? null : s.id))}
                >
                  <title>{s.label}</title>
                </path>
              );
            })}

            {/* Month labels around perimeter */}
            {MONTH_SHORT.map((mLabel, mIdx) => {
              const angle = -Math.PI / 2 + ((mIdx + 0.5) / 12) * Math.PI * 2;
              const [lx, ly] = polarToXY(cx, cy, outerR + 34, angle);
              const mNum = mIdx + 1;
              const isSelected = selectedMonth === mNum;
              return (
                <text
                  key={mLabel}
                  x={lx}
                  y={ly + 4}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight={isSelected ? '700' : '600'}
                  fill={isSelected ? 'var(--accent)' : 'var(--chart-panel-ink, var(--ink))'}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedMonth((cur) => (cur === mNum ? null : mNum))}
                >
                  {mLabel}
                </text>
              );
            })}

            {/* Concentric year rings x 12 months */}
            {matrix.cells.map((row, yIdx) => {
              const rIn = innerR + yIdx * ringThick + 1.5;
              const rOut = innerR + (yIdx + 1) * ringThick - 1.5;
              const yr = matrix.years[yIdx];
              return (
                <g key={yr}>
                  {row.map((cell, mIdx) => {
                    const a0 = -Math.PI / 2 + (mIdx / 12) * Math.PI * 2 + gapRad;
                    const a1 = -Math.PI / 2 + ((mIdx + 1) / 12) * Math.PI * 2 - gapRad;
                    const seasonMatch = !selectedSeason || cell.season === selectedSeason;
                    const yearMatch = !selectedYear || cell.year === selectedYear;
                    const monthMatch = !selectedMonth || cell.month === selectedMonth;
                    const dimmed = !(seasonMatch && yearMatch && monthMatch);

                    const fill =
                      cell.value === null
                        ? palette.missingFill
                        : interpolateRamp((cell.value - matrix.minValue) / span, palette);

                    return (
                      <path
                        key={cell.period}
                        d={annularSectorPath(cx, cy, rIn, rOut, a0, a1)}
                        fill={fill}
                        stroke={hovered?.period === cell.period ? palette.canvas : 'transparent'}
                        strokeWidth={hovered?.period === cell.period ? 2 : 0}
                        strokeDasharray={cell.value === null ? '2 2' : undefined}
                        opacity={dimmed ? 0.2 : 1}
                        style={{ cursor: 'pointer' }}
                        onMouseEnter={() => setHovered(cell)}
                        onMouseLeave={() => setHovered(null)}
                        onClick={() => {
                          setSelectedYear((cur) => (cur === cell.year ? null : cell.year));
                          setHovered(cell);
                        }}
                      >
                        <title>
                          {`${cell.period} (${MONTH_SHORT[cell.month - 1]} ${cell.year}): ${
                            cell.value !== null ? `${fmtIN(cell.value)} ${mode === 'daily_rate' ? `${unit}/day` : unit}` : cell.status.toUpperCase()
                          }`}
                        </title>
                      </path>
                    );
                  })}
                </g>
              );
            })}

            {/* Center label */}
            <circle cx={cx} cy={cy} r={innerR - 4} fill="var(--chart-panel-bg, var(--surface))" stroke="var(--chart-panel-grid, var(--border))" />
            <text x={cx} y={cy - 6} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--chart-panel-ink, var(--ink))" className="tabular">
              {matrix.years[0]}–{matrix.years[matrix.years.length - 1]}
            </text>
            <text x={cx} y={cy + 10} textAnchor="middle" fontSize="10" fill="var(--chart-panel-muted, var(--muted-ink))">
              {mode === 'daily_rate' ? 'Daily rate' : 'Monthly'}
            </text>
          </svg>
        </div>

        <div>
          <div className="eyebrow">Selected Cell Inspection</div>
          <div className="insight-box" style={{ marginTop: '8px', background: 'rgba(239, 235, 224, 0.08)', color: 'inherit' }}>
            {activeCell ? (
              <div className="tabular">
                <strong>
                  {MONTH_SHORT[activeCell.month - 1]} {activeCell.year} ({activeCell.period})
                </strong>
                <div>
                  {mode === 'daily_rate' ? 'Daily rate' : 'Monthly count'}:{' '}
                  <strong>
                    {activeCell.value !== null
                      ? `${fmtIN(activeCell.value)} ${mode === 'daily_rate' ? `${unit}/day` : unit}`
                      : `Unavailable (${activeCell.status})`}
                  </strong>
                </div>
                <div>
                  Calendar days: {activeCell.days} · IMD Season: {activeCell.season.replace('_', ' ')}
                </div>
              </div>
            ) : (
              <div>
                Hover or click any radial wedge to inspect exact monthly values. Inner ring ={' '}
                <strong>{matrix.years[0]}</strong>, outer ring ={' '}
                <strong>{matrix.years[matrix.years.length - 1]}</strong>. Dashed cells mark missing/unreported months.
              </div>
            )}
          </div>

          <div style={{ marginTop: '14px' }}>
            <div className="eyebrow" style={{ marginBottom: '6px' }}>Filter Year Ring</div>
            <div className="filter-bar">
              {matrix.years.map((yr) => (
                <button
                  key={yr}
                  type="button"
                  className={`btn ${selectedYear === yr ? 'primary' : ''}`}
                  onClick={() => setSelectedYear((cur) => (cur === yr ? null : yr))}
                  style={{ minHeight: '30px', padding: '3px 8px', fontSize: '12px' }}
                >
                  {yr}
                </button>
              ))}
            </div>
          </div>

          <div className="chart-legend" style={{ marginTop: '14px' }}>
            <span className="legend-item tabular">
              <span className="swatch" style={{ background: palette.rampLow }} /> Min: {fmtIN(matrix.minValue)}
            </span>
            <span className="legend-item tabular">
              <span className="swatch" style={{ background: palette.rampHigh }} /> Max: {fmtIN(matrix.maxValue)}
            </span>
            <span className="legend-item tabular">
              <span className="swatch" style={{ background: palette.missingFill }} /> Missing: {matrix.missingCount} cells
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
