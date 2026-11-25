import React, { useMemo, useState } from 'react';
import { IndicatorMeta, WardlineBundle } from '../../types/wardline';
import { fmtCompactIN, fmtIN } from '../../utils/format';
import { getMetricValue } from '../../viz/selectors';
import { MetricMode } from '../../viz/types';

interface Props {
  bundle: WardlineBundle;
  indicatorId: string;
  indicator: IndicatorMeta;
  onSelectGeo: (geoId: string) => void;
}

type SortKey = 'volume' | 'coverage' | 'seasonal' | 'name';

export const RegionalComparisonWall: React.FC<Props> = ({ bundle, indicatorId, indicator, onSelectGeo }) => {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('volume');
  const [scaleMode, setScaleMode] = useState<'shared' | 'independent'>('independent');
  const [metricMode, setMetricMode] = useState<MetricMode>('daily_rate');
  const [pinnedIds, setPinnedIds] = useState<string[]>(['PB', 'BR']);

  const statesMap = bundle.analytics.states[indicatorId] ?? {};
  const rankings = bundle.analytics.regional_rankings[indicatorId] ?? [];

  const items = useMemo(() => {
    const rankById = new Map(rankings.map((r) => [r.geo_id, r]));
    return bundle.analytics.states_directory
      .filter((d) => Boolean(statesMap[d.geo_id]))
      .map((d) => {
        const series = statesMap[d.geo_id];
        const rank = rankById.get(d.geo_id);
        const vals = series.monthly.map((m) => getMetricValue(m, metricMode));
        const obs = vals.filter((v): v is number => v !== null);
        const localMax = obs.length ? Math.max(...obs) : 1;
        return {
          geo_id: d.geo_id,
          geo_name: d.geo_name,
          series,
          rank,
          vals,
          localMax,
          fyTotal: rank?.fy2019_20_total ?? series.total_observed,
          coveragePct: series.coverage_pct,
          seasonalRatio: series.seasonal_amplitude_ratio ?? 0,
        };
      })
      .filter(
        (it) =>
          it.geo_name.toLowerCase().includes(search.toLowerCase()) ||
          it.geo_id.toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => {
        if (sortBy === 'name') return a.geo_name.localeCompare(b.geo_name);
        if (sortBy === 'coverage') return b.coveragePct - a.coveragePct;
        if (sortBy === 'seasonal') return b.seasonalRatio - a.seasonalRatio;
        return (b.fyTotal ?? 0) - (a.fyTotal ?? 0);
      });
  }, [bundle.analytics.states_directory, statesMap, rankings, metricMode, search, sortBy]);

  const sharedMax = useMemo(() => Math.max(1, ...items.map((it) => it.localMax)), [items]);

  const togglePin = (gid: string) => {
    setPinnedIds((prev) => (prev.includes(gid) ? prev.filter((id) => id !== gid) : [...prev.slice(-3), gid]));
  };

  const pinnedItems = items.filter((it) => pinnedIds.includes(it.geo_id));

  const renderSparkline = (vals: Array<number | null>, maxY: number, isHighlighted: boolean) => {
    const w = 180;
    const h = 48;
    const pad = 4;
    const n = Math.max(1, vals.length);
    const segments: string[] = [];
    let current = '';
    vals.forEach((v, idx) => {
      if (v === null) {
        if (current) {
          segments.push(current);
          current = '';
        }
        return;
      }
      const x = pad + (idx / Math.max(1, n - 1)) * (w - pad * 2);
      const y = h - pad - (v / Math.max(1e-6, maxY)) * (h - pad * 2);
      current += current ? ` L${x.toFixed(1)},${y.toFixed(1)}` : `M${x.toFixed(1)},${y.toFixed(1)}`;
    });
    if (current) segments.push(current);

    return (
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: '48px', display: 'block' }} aria-hidden="true">
        <line x1={pad} x2={w - pad} y1={h - pad} y2={h - pad} stroke="var(--border)" strokeWidth="1" />
        {segments.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={isHighlighted ? 'var(--accent)' : 'var(--ink)'}
            strokeWidth={isHighlighted ? 1.8 : 1.3}
          />
        ))}
      </svg>
    );
  };

  return (
    <div>
      <div className="filter-bar" style={{ marginBottom: '14px' }}>
        <input
          type="search"
          className="select-field"
          placeholder="Search region..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Filter regional comparison wall"
          style={{ minHeight: '34px', padding: '5px 10px', width: '170px' }}
        />
        <select
          className="select-field"
          aria-label="Sort regions"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortKey)}
          style={{ minHeight: '34px', padding: '5px 10px' }}
        >
          <option value="volume">Sort: Highest Volume</option>
          <option value="coverage">Sort: Coverage %</option>
          <option value="seasonal">Sort: Seasonal Amplitude</option>
          <option value="name">Sort: A–Z</option>
        </select>
        <button
          type="button"
          className={`btn ${scaleMode === 'shared' ? 'primary' : ''}`}
          onClick={() => setScaleMode('shared')}
          style={{ minHeight: '34px', padding: '5px 10px', fontSize: '12px' }}
        >
          Shared Y-Scale
        </button>
        <button
          type="button"
          className={`btn ${scaleMode === 'independent' ? 'primary' : ''}`}
          onClick={() => setScaleMode('independent')}
          style={{ minHeight: '34px', padding: '5px 10px', fontSize: '12px' }}
        >
          Independent Y-Scales (Labeled)
        </button>
        <button
          type="button"
          className={`btn ${metricMode === 'daily_rate' ? 'primary' : ''}`}
          onClick={() => setMetricMode((m) => (m === 'daily_rate' ? 'monthly' : 'daily_rate'))}
          style={{ minHeight: '34px', padding: '5px 10px', fontSize: '12px' }}
        >
          Mode: {metricMode === 'daily_rate' ? 'Daily Rate' : 'Monthly Count'}
        </button>
      </div>

      {pinnedItems.length > 0 && (
        <div className="insight-box" style={{ marginTop: 0, marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
            <strong>Pinned Side-by-Side Comparison ({pinnedItems.length} units)</strong>
            <span className="eyebrow">
              Scale: {scaleMode === 'shared' ? `Shared max ${fmtCompactIN(sharedMax)}` : 'Independent per unit'} · {metricMode === 'daily_rate' ? `${indicator.unit}/day` : indicator.unit}
            </span>
          </div>
          <div className="sm-wall-grid">
            {pinnedItems.map((it) => (
              <div key={`pin-${it.geo_id}`} className="sm-tile pinned">
                <div className="sm-tile-head">
                  <strong>{it.geo_name} ({it.geo_id})</strong>
                  <button type="button" className="sm-pin-btn" onClick={() => togglePin(it.geo_id)}>
                    Unpin
                  </button>
                </div>
                {renderSparkline(it.vals, scaleMode === 'shared' ? sharedMax : it.localMax, true)}
                <div className="sm-tile-meta tabular">
                  <span>Max: {fmtCompactIN(it.localMax)}</span>
                  <span>Cov: {it.coveragePct.toFixed(0)}%</span>
                  <span>Ratio: {it.seasonalRatio ? `${it.seasonalRatio.toFixed(2)}×` : '—'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="sm-wall-grid" role="list" aria-label={`Small-multiple time series wall for ${items.length} regions`}>
        {items.map((it) => {
          const isPinned = pinnedIds.includes(it.geo_id);
          const maxY = scaleMode === 'shared' ? sharedMax : it.localMax;
          return (
            <div key={it.geo_id} className={`sm-tile ${isPinned ? 'pinned' : ''}`} role="listitem">
              <div className="sm-tile-head">
                <button
                  type="button"
                  onClick={() => onSelectGeo(it.geo_id)}
                  style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left', fontWeight: 700, fontSize: '12px' }}
                >
                  {it.geo_name} ({it.geo_id})
                </button>
                <button type="button" className="sm-pin-btn" onClick={() => togglePin(it.geo_id)}>
                  {isPinned ? 'Pinned' : 'Pin'}
                </button>
              </div>
              {renderSparkline(it.vals, maxY, isPinned)}
              <div className="sm-tile-meta tabular">
                <span title={`Peak ${metricMode}`}>
                  {scaleMode === 'independent' ? `Y-max ${fmtCompactIN(it.localMax)}` : `Peak ${fmtCompactIN(it.localMax)}`}
                </span>
                <span>
                  {it.series.observed_months}/{it.series.expected_months}m ({it.coveragePct.toFixed(0)}%)
                </span>
              </div>
              {it.coveragePct < 90 && (
                <div style={{ fontSize: '10px', color: 'var(--accent-text)', marginTop: '3px' }}>
                  Partial coverage — interpret trends cautiously
                </div>
              )}
              <span className="sr-only">
                {it.geo_name}: cumulative observed {fmtIN(it.series.total_observed)}, coverage {it.coveragePct.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
