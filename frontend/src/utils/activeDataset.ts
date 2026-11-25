import {
  ForecastEntry,
  ImportedObservation,
  IndicatorMeta,
  MonthlyPoint,
  MonthProfile,
  RegionalRankRow,
  SeasonDef,
  SeasonSummary,
  SeriesAnalytics,
  WardlineBundle,
} from '../types/wardline';

function daysInMonth(period: string): number {
  const y = parseInt(period.slice(0, 4), 10);
  const m = parseInt(period.slice(5, 7), 10);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function monthIndex(period: string): number {
  return parseInt(period.slice(0, 4), 10) * 12 + parseInt(period.slice(5, 7), 10);
}

/** Generate full contiguous calendar period list [minPeriod .. maxPeriod] inclusive (DEF-10). */
export function expandCalendarInterval(minPeriod: string, maxPeriod: string): string[] {
  const out: string[] = [];
  let y = parseInt(minPeriod.slice(0, 4), 10);
  let m = parseInt(minPeriod.slice(5, 7), 10);
  const endIdx = monthIndex(maxPeriod);
  while (y * 12 + m <= endIdx) {
    out.push(`${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function median(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function computeImportedSeries(
  rows: ImportedObservation[],
  seasons: SeasonDef[],
  calendarInterval: string[]
): SeriesAnalytics {
  const rowByPeriod = new Map<string, ImportedObservation>(rows.map((r) => [r.period, r]));
  const seasonLookup = new Map<number, string>();
  seasons.forEach((s) => s.months.forEach((m) => seasonLookup.set(m, s.id)));

  // DEF-10: Materialize every calendar month in [minPeriod, maxPeriod], marking omitted months explicitly as status="missing"
  const expanded = calendarInterval.map((period) => {
    const found = rowByPeriod.get(period);
    if (found) return found;
    return {
      period,
      geo_level: rows[0]?.geo_level ?? 'state_ut',
      geo_id: rows[0]?.geo_id ?? 'IMP',
      geo_name: rows[0]?.geo_name ?? 'Imported',
      indicator_id: rows[0]?.indicator_id ?? 'imported_indicator',
      raw_indicator: rows[0]?.raw_indicator ?? 'Imported',
      unit: rows[0]?.unit ?? 'counts',
      stratum: 'all',
      value: null,
      status: 'missing' as const,
    };
  });

  const valMap = new Map<string, number | null>(expanded.map((r) => [r.period, r.value]));

  const monthly: MonthlyPoint[] = expanded.map((r, i) => {
    const year = parseInt(r.period.slice(0, 4), 10);
    const month = parseInt(r.period.slice(5, 7), 10);
    const days = daysInMonth(r.period);
    const v = r.status === 'observed' ? r.value : null;
    const daily_rate = v !== null ? Number((v / days).toFixed(2)) : null;

    let mom_pct: number | null = null;
    if (i > 0 && v !== null) {
      const prev = expanded[i - 1];
      if (monthIndex(r.period) - monthIndex(prev.period) === 1 && prev.status === 'observed' && prev.value !== null && prev.value > 0) {
        mom_pct = Number((((v - prev.value) / prev.value) * 100).toFixed(2));
      }
    }

    let yoy_diff: number | null = null;
    let yoy_pct: number | null = null;
    const priorP = `${String(year - 1).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
    const priorV = valMap.get(priorP);
    if (v !== null && priorV !== undefined && priorV !== null) {
      yoy_diff = v - priorV;
      if (priorV > 0) yoy_pct = Number(((yoy_diff / priorV) * 100).toFixed(2));
    }

    let rolling_12m: number | null = null;
    if (i >= 11) {
      const win = expanded.slice(i - 11, i + 1);
      const consecutive = win.every((item, k) => k === 0 || monthIndex(item.period) - monthIndex(win[k - 1].period) === 1);
      if (consecutive && win.every((item) => item.status === 'observed' && item.value !== null)) {
        rolling_12m = Number((win.reduce((acc, item) => acc + (item.value ?? 0), 0) / 12).toFixed(1));
      }
    }

    return {
      period: r.period,
      year,
      month,
      season: seasonLookup.get(month) ?? 'unknown',
      days,
      value: v,
      daily_rate,
      status: r.status,
      mom_pct,
      yoy_diff,
      yoy_pct,
      rolling_12m,
    };
  });

  const obs = monthly.filter((m) => m.status === 'observed' && m.value !== null);
  const obsVals = obs.map((m) => m.value as number);
  const obsDaily = obs.map((m) => m.daily_rate as number);
  const maxVal = obsVals.length ? Math.max(...obsVals) : null;
  const minVal = obsVals.length ? Math.min(...obsVals) : null;

  const month_profile: MonthProfile[] = Array.from({ length: 12 }, (_, idx) => {
    const mo = idx + 1;
    const mRows = obs.filter((m) => m.month === mo);
    if (!mRows.length) {
      return { month: mo, n_years: 0, median: null, mean: null, min: null, max: null, q25: null, q75: null, mean_daily_rate: null, median_daily_rate: null };
    }
    const vals = mRows.map((m) => m.value as number);
    const dr = mRows.map((m) => m.daily_rate as number);
    return {
      month: mo,
      n_years: mRows.length,
      median: Number(median(vals).toFixed(1)),
      mean: Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)),
      min: Math.min(...vals),
      max: Math.max(...vals),
      q25: null,
      q75: null,
      mean_daily_rate: Number((dr.reduce((a, b) => a + b, 0) / dr.length).toFixed(2)),
      median_daily_rate: Number(median(dr).toFixed(2)),
    };
  });

  const years = Array.from(new Set(monthly.map((m) => m.year))).sort((a, b) => a - b);
  const seasonal_summary: SeasonSummary[] = seasons.map((s) => {
    const completeYears: number[] = [];
    const incompleteYears: number[] = [];
    const dailyMeans: number[] = [];
    const monthlyMeans: number[] = [];
    years.forEach((y) => {
      const sRows = monthly.filter((m) => m.year === y && s.months.includes(m.month) && m.status === 'observed' && m.value !== null);
      if (sRows.length === s.months.length) {
        completeYears.push(y);
        const totV = sRows.reduce((a, b) => a + (b.value ?? 0), 0);
        const totD = sRows.reduce((a, b) => a + b.days, 0);
        dailyMeans.push(totV / totD);
        monthlyMeans.push(totV / s.months.length);
      } else {
        incompleteYears.push(y);
      }
    });
    return {
      season_id: s.id,
      label: s.label,
      month_span: s.month_span,
      months_in_season: s.months.length,
      complete_years_count: completeYears.length,
      complete_years: completeYears,
      incomplete_years: incompleteYears,
      mean_daily_count: dailyMeans.length ? Number((dailyMeans.reduce((a, b) => a + b, 0) / dailyMeans.length).toFixed(2)) : null,
      median_daily_count: dailyMeans.length ? Number(median(dailyMeans).toFixed(2)) : null,
      mean_monthly_count: monthlyMeans.length ? Number((monthlyMeans.reduce((a, b) => a + b, 0) / monthlyMeans.length).toFixed(1)) : null,
    };
  });

  const validRates = seasonal_summary.map((s) => s.mean_daily_count).filter((v): v is number => v !== null && v > 0);
  const seasonal_amplitude_ratio =
    validRates.length >= 2 ? Number((Math.max(...validRates) / Math.min(...validRates)).toFixed(3)) : null;

  return {
    total_observed: obsVals.reduce((a, b) => a + b, 0),
    observed_months: obs.length,
    expected_months: calendarInterval.length,
    coverage_pct: Number(((obs.length / Math.max(1, calendarInterval.length)) * 100).toFixed(2)),
    mean_monthly: obsVals.length ? Number((obsVals.reduce((a, b) => a + b, 0) / obsVals.length).toFixed(1)) : null,
    median_monthly: obsVals.length ? Number(median(obsVals).toFixed(1)) : null,
    mean_daily: obsDaily.length ? Number((obsDaily.reduce((a, b) => a + b, 0) / obsDaily.length).toFixed(2)) : null,
    peak_value: maxVal,
    peak_periods: maxVal !== null ? obs.filter((m) => m.value === maxVal).map((m) => m.period) : [],
    trough_value: minVal,
    trough_periods: minVal !== null ? obs.filter((m) => m.value === minVal).map((m) => m.period) : [],
    fy2019_20_total: null,
    fy2018_19_total: null,
    fy2019_20_yoy_pct: null,
    seasonal_amplitude_ratio,
    monthly,
    month_profile,
    seasonal_summary,
  };
}

/** Build an isolated Active Dataset from either the verified official bundle OR user-imported CSV rows. */
export function buildActiveDataset(
  officialBundle: WardlineBundle,
  importedRows: ImportedObservation[] | null,
  importedFilename: string
): WardlineBundle {
  if (!importedRows || importedRows.length === 0) {
    return officialBundle;
  }

  const indicators: Record<string, IndicatorMeta> = {};
  const states: Record<string, Record<string, SeriesAnalytics>> = {};
  const national: Record<string, SeriesAnalytics> = {};
  const regional_rankings: Record<string, RegionalRankRow[]> = {};
  const forecasts: Record<string, Record<string, ForecastEntry>> = {};

  const allPeriodsSorted = importedRows.map((r) => r.period).sort();
  const minPeriod = allPeriodsSorted[0];
  const maxPeriod = allPeriodsSorted[allPeriodsSorted.length - 1];
  const fullInterval = expandCalendarInterval(minPeriod, maxPeriod);

  const geoMap = new Map<string, string>();
  importedRows.forEach((r) => geoMap.set(r.geo_id, r.geo_name));
  const states_directory = Array.from(geoMap.entries()).map(([geo_id, geo_name]) => ({ geo_id, geo_name }));

  const indIds = Array.from(new Set(importedRows.map((r) => r.indicator_id)));
  indIds.forEach((indId) => {
    const indRows = importedRows.filter((r) => r.indicator_id === indId);
    const sample = indRows[0];
    indicators[indId] = {
      indicator_id: indId,
      short_label: sample.raw_indicator,
      raw_indicator: sample.raw_indicator,
      category: 'User-Imported Series',
      unit: sample.unit,
      facility_scope: 'user_imported_unverified',
      e1_codes: 'N/A',
      e2_codes: 'N/A',
      format_break_note: `Computed exclusively from imported CSV "${importedFilename}" (geo_level=${sample.geo_level}, stratum=all). Calendar interval ${minPeriod} to ${maxPeriod} (${fullInterval.length} expected months).`,
      is_primary_inpatient_proxy: false,
    };

    states[indId] = {};
    const rankings: RegionalRankRow[] = [];

    states_directory.forEach(({ geo_id, geo_name }) => {
      const gRows = indRows.filter((r) => r.geo_id === geo_id);
      if (!gRows.length) return;
      const ser = computeImportedSeries(gRows, officialBundle.seasons, fullInterval);
      states[indId][geo_id] = { geo_id, geo_name, ...ser };
      rankings.push({
        geo_id,
        geo_name,
        observed_months: ser.observed_months,
        expected_months: ser.expected_months,
        coverage_pct: ser.coverage_pct,
        median_district_completeness: null,
        total_observed_8yr: ser.total_observed,
        fy2019_20_total: null,
        fy2019_20_yoy_pct: null,
        seasonal_amplitude_ratio: ser.seasonal_amplitude_ratio,
        peak_periods: ser.peak_periods,
      });
    });

    // Aggregate across disjoint geographies at the same geo_level per calendar month
    const aggRows: ImportedObservation[] = fullInterval.map((period) => {
      const list = indRows.filter((r) => r.period === period);
      const obsList = list.filter((x) => x.status === 'observed' && x.value !== null);
      return {
        period,
        geo_level: sample.geo_level,
        geo_id: 'ALL_IMPORTED',
        geo_name: 'All Imported Geographies',
        indicator_id: indId,
        raw_indicator: sample.raw_indicator,
        unit: sample.unit,
        stratum: 'all',
        value: obsList.length ? obsList.reduce((a, b) => a + (b.value ?? 0), 0) : null,
        status: obsList.length ? 'observed' : 'missing',
      };
    });
    const natSer = computeImportedSeries(aggRows, officialBundle.seasons, fullInterval);
    // Attach explicit reporting unit counts per month for partial geographic coverage awareness
    natSer.monthly.forEach((m) => {
      const obsCount = indRows.filter((r) => r.period === m.period && r.status === 'observed' && r.value !== null).length;
      m.states_reporting = obsCount;
      m.coverage_status = obsCount === states_directory.length ? 'complete_all_imported_units' : 'partial_reporting_sum';
    });
    national[indId] = natSer;
    regional_rankings[indId] = rankings.sort((a, b) => b.total_observed_8yr - a.total_observed_8yr);

    forecasts[indId] = {
      IN: {
        ready: false,
        geo_id: 'IN',
        geo_name: 'Imported Scope',
        indicator_id: indId,
        reason: `Forecasting is disabled in IMPORTED · UNVERIFIED mode ("${importedFilename}"). Official HMIS archive forecasts are never attributed to user-imported data.`,
      },
    };
  });

  return {
    ...officialBundle,
    mode: 'imported_unverified',
    source: {
      source_id: `imported:${importedFilename}`,
      vintage: `User CSV (${importedFilename})`,
      attribution: `User-imported CSV "${importedFilename}" (unverified; independent verification required before reporting findings).`,
      doi: '',
      license: 'User-supplied',
      raw_sha256: 'client_side_session_only',
      normalized_rows: importedRows.length,
      observed_rows: importedRows.filter((r) => r.status === 'observed').length,
      period_min: minPeriod,
      period_max: maxPeriod,
      states_count: states_directory.length,
    },
    indicators,
    analytics: {
      national,
      regional_rankings,
      states,
      pb_br_spotlight: {},
      format_break_2017: [],
      states_directory,
    },
    forecasts,
  };
}
