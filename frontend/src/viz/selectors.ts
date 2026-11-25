import { MonthlyPoint, SeriesAnalytics, WardlineBundle } from '../types/wardline';
import {
  CoverageUnitRow,
  GrowthPoint,
  MetricMode,
  TerrainCell,
  TerrainMatrix,
  WebGLCapability,
} from './types';

export function getMetricValue(point: MonthlyPoint, mode: MetricMode): number | null {
  if (point.status !== 'observed') return null;
  return mode === 'daily_rate' ? point.daily_rate : point.value;
}

/**
 * Build deterministic Year x Month matrix for V01 (3D Seasonal Terrain), V04 (Seasonal Clock),
 * and V06 (Calendar Rhythm Matrix). Strictly preserves missing records as null (no interpolation).
 */
export function buildTerrainMatrix(series: SeriesAnalytics, mode: MetricMode): TerrainMatrix {
  const years = Array.from(new Set(series.monthly.map((p) => p.year))).sort((a, b) => a - b);
  const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const byKey = new Map<string, MonthlyPoint>(series.monthly.map((p) => [`${p.year}-${p.month}`, p]));

  const observedValues: number[] = [];
  let observedCount = 0;
  let missingCount = 0;
  let zeroCount = 0;

  const rawCells: TerrainCell[][] = years.map((year) =>
    months.map((month) => {
      const pt = byKey.get(`${year}-${month}`);
      if (!pt) {
        missingCount += 1;
        return {
          year,
          month,
          period: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`,
          season: month <= 2 ? 'winter' : month <= 5 ? 'pre_monsoon' : month <= 9 ? 'sw_monsoon' : 'post_monsoon',
          days: new Date(Date.UTC(year, month, 0)).getUTCDate(),
          value: null,
          rawValue: null,
          dailyRate: null,
          status: 'missing',
          normalizedHeight: null,
        };
      }
      const val = getMetricValue(pt, mode);
      if (val !== null) {
        observedCount += 1;
        if (val === 0) zeroCount += 1;
        observedValues.push(val);
      } else {
        missingCount += 1;
      }
      return {
        year,
        month,
        period: pt.period,
        season: pt.season,
        days: pt.days,
        value: val,
        rawValue: pt.value,
        dailyRate: pt.daily_rate,
        status: pt.status,
        normalizedHeight: null,
      };
    })
  );

  const minValue = observedValues.length ? Math.min(...observedValues) : 0;
  const maxValue = observedValues.length ? Math.max(...observedValues) : 0;

  // Preserve zero baseline for honest vertical height scaling (no deceptive exaggeration)
  const scaleMax = maxValue > 0 ? maxValue : 1;
  const cells = rawCells.map((row) =>
    row.map((cell) => ({
      ...cell,
      normalizedHeight: cell.value !== null ? cell.value / scaleMax : null,
    }))
  );

  return {
    years,
    months,
    cells,
    minValue,
    maxValue,
    observedCount,
    missingCount,
    zeroCount,
    mode,
  };
}

/**
 * Build V08 Historical Growth series with zero-denominator safeguards and calendar continuity.
 */
export function buildGrowthSeries(series: SeriesAnalytics, mode: MetricMode): GrowthPoint[] {
  const byPeriod = new Map<string, MonthlyPoint>(series.monthly.map((p) => [p.period, p]));
  const firstPositive = series.monthly.find((p) => {
    const v = getMetricValue(p, mode);
    return v !== null && v > 0;
  });
  const baseValue = firstPositive ? getMetricValue(firstPositive, mode) : null;
  const basePeriod = firstPositive ? firstPositive.period : null;

  return series.monthly.map((pt, idx) => {
    const val = getMetricValue(pt, mode);
    const priorKey = `${String(pt.year - 1).padStart(4, '0')}-${String(pt.month).padStart(2, '0')}`;
    const priorPt = byPeriod.get(priorKey);
    const priorVal = priorPt ? getMetricValue(priorPt, mode) : null;

    let yoyDiff: number | null = null;
    let yoyPct: number | null = null;
    if (val !== null && priorVal !== null) {
      yoyDiff = Number((val - priorVal).toFixed(2));
      // Zero-denominator safeguard: never compute % change when prior value <= 0
      if (priorVal > 0) {
        yoyPct = Number(((yoyDiff / priorVal) * 100).toFixed(2));
      }
    }

    // Calendar-continuous 12m rolling mean in chosen metric mode
    let rolling12m: number | null = null;
    if (idx >= 11) {
      const win = series.monthly.slice(idx - 11, idx + 1);
      const allContiguous = win.every((item, k) => {
        if (k === 0) return true;
        const prev = win[k - 1];
        return item.year * 12 + item.month - (prev.year * 12 + prev.month) === 1;
      });
      const vals = win.map((item) => getMetricValue(item, mode));
      if (allContiguous && vals.every((v) => v !== null)) {
        rolling12m = Number(((vals as number[]).reduce((a, b) => a + b, 0) / 12).toFixed(2));
      }
    }

    const indexedBase100 =
      val !== null && baseValue !== null && baseValue > 0 ? Number(((val / baseValue) * 100).toFixed(2)) : null;

    return {
      period: pt.period,
      year: pt.year,
      month: pt.month,
      value: val,
      status: pt.status,
      yoyDiff,
      yoyPct,
      rolling12m,
      indexedBase100,
      baselinePeriod: basePeriod,
    };
  });
}

/**
 * Build V09 Reporting Coverage Observatory matrix across all states/units and years.
 */
export function buildCoverageMatrix(bundle: WardlineBundle, indicatorId: string): {
  years: number[];
  rows: CoverageUnitRow[];
} {
  const statesMap = bundle.analytics.states[indicatorId] ?? {};
  const yearSet = new Set<number>();
  Object.values(statesMap).forEach((s) => s.monthly.forEach((m) => yearSet.add(m.year)));
  const years = Array.from(yearSet).sort((a, b) => a - b);

  const rows: CoverageUnitRow[] = bundle.analytics.states_directory
    .filter((d) => Boolean(statesMap[d.geo_id]))
    .map((dir) => {
      const s = statesMap[dir.geo_id];
      let observedMonths = 0;
      let zeroMonths = 0;
      let missingMonths = 0;
      let notReportedMonths = 0;

      const byYear = years.map((yr) => {
        const pts = s.monthly.filter((m) => m.year === yr);
        let obs = 0;
        let zeros = 0;
        let miss = 0;
        let notRep = 0;
        pts.forEach((p) => {
          if (p.status === 'observed' && p.value !== null) {
            obs += 1;
            if (p.value === 0) zeros += 1;
          } else if (p.status === 'not_reported') {
            notRep += 1;
          } else {
            miss += 1;
          }
        });
        observedMonths += obs;
        zeroMonths += zeros;
        missingMonths += miss;
        notReportedMonths += notRep;
        const expected = pts.length;
        return {
          year: yr,
          observed: obs,
          zeros,
          missing: miss,
          notReported: notRep,
          expected,
          pct: expected > 0 ? Number(((obs / expected) * 100).toFixed(1)) : 0,
        };
      });

      return {
        geo_id: dir.geo_id,
        geo_name: dir.geo_name,
        observedMonths,
        expectedMonths: s.expected_months,
        zeroMonths,
        missingMonths,
        notReportedMonths,
        coveragePct: s.coverage_pct,
        byYear,
      };
    });

  return { years, rows };
}

/**
 * DEF-14: Strict zero-baseline geometry height calculation for V01 3D Seasonal Terrain.
 * Observed zero has 0 quantitative height; missing cells return null; positive values scale strictly proportionally.
 */
export function computeTerrainBarHeight(cell: TerrainCell, maxBarHeight = 5.4): number | null {
  if (cell.value === null || cell.normalizedHeight === null) return null;
  if (cell.value <= 0) return 0;
  return Number((cell.normalizedHeight * maxBarHeight).toFixed(6));
}


/** DEF-16: Strict WebGL 2 capability detection matching Three.js 0.170.0 requirements. */
export function detectWebGLCapability(): WebGLCapability {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { supported: false, version: 'none', reason: 'Server-side or non-DOM environment.' };
  }
  try {
    const canvas = document.createElement('canvas');
    const gl2 = canvas.getContext('webgl2');
    if (gl2) {
      const lose = gl2.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
      return { supported: true, version: 'webgl2' };
    }
    const gl1 = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl1) {
      return {
        supported: false,
        version: 'webgl1',
        reason: 'WebGL 1 detected, but Three.js 0.170.0 requires WebGL 2. Automatically displaying 2D equivalent.',
      };
    }
    return { supported: false, version: 'none', reason: 'Browser WebGL 2 context unavailable or disabled.' };
  } catch (err) {
    return {
      supported: false,
      version: 'none',
      reason: err instanceof Error ? err.message : 'WebGL 2 initialization failed.',
    };
  }
}
