export type ThemeId = 'industrial' | 'sage' | 'midnight' | 'blue';
export type ViewId = 'overview' | 'seasonal' | 'regional' | 'services' | 'forecast' | 'data' | 'spatial' | 'methodology' | 'presentation';

export interface SeasonDef {
  id: string;
  label: string;
  months: number[];
  month_span: string;
}

export interface IndicatorMeta {
  indicator_id: string;
  short_label: string;
  raw_indicator: string;
  category: string;
  unit: string;
  facility_scope: string;
  e1_codes: string;
  e2_codes: string;
  format_break_note: string;
  is_primary_inpatient_proxy: boolean;
}

export interface UnavailableDimension {
  id: string;
  label: string;
  reason: string;
  resolution: string;
}

export interface MonthlyPoint {
  period: string;
  year: number;
  month: number;
  season: string;
  days: number;
  value: number | null;
  daily_rate: number | null;
  status: 'observed' | 'missing' | 'suppressed' | 'not_reported';
  mom_pct: number | null;
  yoy_diff: number | null;
  yoy_pct: number | null;
  rolling_12m: number | null;
  states_reporting?: number;
  coverage_status?: string;
  fixed_cohort_value?: number | null;
}

export interface MonthProfile {
  month: number;
  n_years: number;
  median: number | null;
  mean: number | null;
  min: number | null;
  max: number | null;
  q25: number | null;
  q75: number | null;
  mean_daily_rate: number | null;
  median_daily_rate: number | null;
}

export interface SeasonSummary {
  season_id: string;
  label: string;
  month_span: string;
  months_in_season: number;
  complete_years_count: number;
  complete_years: number[];
  incomplete_years: number[];
  mean_daily_count: number | null;
  median_daily_count: number | null;
  mean_monthly_count: number | null;
}

export interface NationalComparability {
  total_units: number;
  complete_34_of_34_months: number;
  partial_reporting_months: number;
  fixed_cohort_states_count: number;
  fixed_cohort_state_ids: string[];
  fixed_cohort_fy2019_20_total: number | null;
  fixed_cohort_fy2019_20_yoy_pct: number | null;
  fixed_cohort_seasonal_ratio: number | null;
  note: string;
}

export interface SeriesAnalytics {
  geo_id?: string;
  geo_name?: string;
  median_district_completeness?: number | null;
  total_observed: number;
  observed_months: number;
  expected_months: number;
  coverage_pct: number;
  mean_monthly: number | null;
  median_monthly: number | null;
  mean_daily: number | null;
  peak_value: number | null;
  peak_periods: string[];
  trough_value: number | null;
  trough_periods: string[];
  fy2019_20_total: number | null;
  fy2018_19_total: number | null;
  fy2019_20_yoy_pct: number | null;
  seasonal_amplitude_ratio: number | null;
  monthly: MonthlyPoint[];
  month_profile: MonthProfile[];
  seasonal_summary: SeasonSummary[];
  national_comparability?: NationalComparability;
}

export interface RegionalRankRow {
  geo_id: string;
  geo_name: string;
  observed_months: number;
  expected_months: number;
  coverage_pct: number;
  median_district_completeness: number | null;
  total_observed_8yr: number;
  fy2019_20_total: number | null;
  fy2019_20_yoy_pct: number | null;
  seasonal_amplitude_ratio: number | null;
  peak_periods: string[];
}

export interface ForecastModelMetric {
  mae: number;
  rmse: number;
  wape_pct: number | null;
}

export interface ForecastEntry {
  ready: boolean;
  evaluation_type?: string;
  geo_id: string;
  geo_name: string;
  indicator_id: string;
  reason?: string;
  geographic_composition_note?: string;
  contiguous_months?: number;
  train_start?: string;
  train_cutoff?: string;
  holdout_start?: string;
  holdout_end?: string;
  horizon_months?: number;
  rolling_cv_folds?: number;
  selected_model?: string;
  selection_reason?: string;
  locked_model_beat_seasonal_naive_on_test?: boolean;
  cv_metrics?: Record<string, ForecastModelMetric>;
  holdout_metrics?: Record<string, ForecastModelMetric>;
  empirical_abs_error_p80_halfwidth?: number;
  interval_calibration_status?: string;
  holdout_series?: Array<{
    period: string;
    actual: number;
    seasonal_naive: number;
    ridge_seasonal_lag: number;
    additive_holt_winters: number;
    last_value_naive: number;
  }>;
  future_projection?: Array<{
    period: string;
    point: number;
    lower_p80_uncalibrated: number;
    upper_p80_uncalibrated: number;
  }>;
  caveat?: string;
}

export interface WardlineBundle {
  schema_version: string;
  mode: 'official' | 'imported_unverified';
  generated_utc: string;
  source: {
    source_id: string;
    vintage: string;
    attribution: string;
    doi: string;
    license: string;
    raw_sha256: string;
    normalized_rows: number;
    observed_rows: number;
    period_min: string;
    period_max: string;
    states_count: number;
  };
  seasons: SeasonDef[];
  indicators: Record<string, IndicatorMeta>;
  unavailable_dimensions: UnavailableDimension[];
  quality: {
    schema_checked_rows: number;
    source_reconciled_rows?: number;
    schema_errors: number;
    duplicate_canonical_keys: number;
    calendar_continuity_verified?: boolean;
    all_reconciliations_passed: boolean;
    reconciliation_row_checks: Array<{
      geo_id: string;
      period: string;
      indicator_id: string;
      raw_source_value: number | null;
      normalized_value: number | null;
      row_locator?: string;
      exact_match: boolean;
    }>;
    reconciliation_derived_checks: Array<{
      metric: string;
      raw_derived_sum: number;
      normalized_sum: number;
      exact_match: boolean;
    }>;
    indicator_quality: Record<
      string,
      {
        total_state_months: number;
        observed: number;
        not_reported_below_90pct: number;
        missing: number;
        observed_pct: number;
        median_district_completeness: number;
        zero_observed_count: number;
      }
    >;
    state_quality: Array<{
      geo_id: string;
      geo_name: string;
      inst_del_observed_months: number;
      opd_observed_months: number;
      total_expected_months: number;
      median_district_completeness: number;
      n_districts_reported: number | null;
    }>;
  };
  analytics: {
    national: Record<string, SeriesAnalytics>;
    regional_rankings: Record<string, RegionalRankRow[]>;
    states: Record<string, Record<string, SeriesAnalytics>>;
    pb_br_spotlight: Record<
      string,
      {
        punjab: {
          geo_id: string;
          geo_name: string;
          observed_months: number;
          total_8yr: number;
          fy2019_20_total: number | null;
          fy2019_20_yoy_pct: number | null;
          seasonal_amplitude_ratio: number | null;
          peak_periods: string[];
          seasonal_summary: SeasonSummary[];
        };
        bihar: {
          geo_id: string;
          geo_name: string;
          observed_months: number;
          total_8yr: number;
          fy2019_20_total: number | null;
          fy2019_20_yoy_pct: number | null;
          seasonal_amplitude_ratio: number | null;
          peak_periods: string[];
          seasonal_summary: SeasonSummary[];
        };
      }
    >;
    format_break_2017: Array<Record<string, string | number>>;
    states_directory: Array<{ geo_id: string; geo_name: string }>;
  };
  forecasts: Record<string, Record<string, ForecastEntry>>;
}

export interface ImportedObservation {
  period: string;
  geo_level: 'national' | 'state_ut' | 'district' | 'subdistrict' | 'facility';
  geo_id: string;
  geo_name: string;
  indicator_id: string;
  raw_indicator: string;
  unit: string;
  stratum: string;
  value: number | null;
  status: 'observed' | 'missing' | 'suppressed' | 'not_reported';
}
