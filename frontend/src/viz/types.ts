import { ThemeId } from '../types/wardline';

export type VizId =
  | 'V01'
  | 'V02'
  | 'V04'
  | 'V05'
  | 'V06'
  | 'V07'
  | 'V08'
  | 'V09'
  | 'D01'
  | 'D02'
  | 'D03'
  | 'D04'
  | 'D05'
  | 'D06'
  | 'D07'
  | 'D08';

export type MetricMode = 'monthly' | 'daily_rate';

export interface VizFraming {
  vizId: VizId;
  question: string;
  dataSource: string;
  encoding: string;
  conclusion: string;
  limitations: string;
}

export interface VizExportMeta {
  vizId: VizId;
  title: string;
  indicatorLabel: string;
  geoName: string;
  periodRange: string;
  metricLabel?: string;
  mode: 'official' | 'imported_unverified';
  attribution: string;
  limitations: string;
}

export interface ThemeVizPalette {
  theme: ThemeId;
  canvas: string;
  surface: string;
  ink: string;
  mutedInk: string;
  border: string;
  accent: string;
  accentText: string;
  onAccent: string;
  panelBg: string;
  panelInk: string;
  panelMuted: string;
  panelGrid: string;
  missingFill: string;
  zeroFill: string;
  rampLow: string;
  rampMid: string;
  rampHigh: string;
  seasonColors: Record<string, string>;
}

export interface TerrainCell {
  year: number;
  month: number;
  period: string;
  season: string;
  days: number;
  value: number | null;
  rawValue: number | null;
  dailyRate: number | null;
  status: 'observed' | 'missing' | 'suppressed' | 'not_reported';
  normalizedHeight: number | null;
}

export interface TerrainMatrix {
  years: number[];
  months: number[];
  cells: TerrainCell[][];
  minValue: number;
  maxValue: number;
  observedCount: number;
  missingCount: number;
  zeroCount: number;
  mode: MetricMode;
}

export interface GrowthPoint {
  period: string;
  year: number;
  month: number;
  value: number | null;
  status: 'observed' | 'missing' | 'suppressed' | 'not_reported';
  yoyDiff: number | null;
  yoyPct: number | null;
  rolling12m: number | null;
  indexedBase100: number | null;
  baselinePeriod: string | null;
}

export interface CoverageUnitRow {
  geo_id: string;
  geo_name: string;
  observedMonths: number;
  expectedMonths: number;
  zeroMonths: number;
  missingMonths: number;
  notReportedMonths: number;
  coveragePct: number;
  byYear: Array<{
    year: number;
    observed: number;
    zeros: number;
    missing: number;
    notReported: number;
    expected: number;
    pct: number;
  }>;
}


export interface WebGLCapability {
  supported: boolean;
  version: 'webgl2' | 'webgl1' | 'none';
  reason?: string;
}
