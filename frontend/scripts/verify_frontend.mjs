import fs from 'fs';
import path from 'path';
import assert from 'assert';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { createServer } from 'vite';

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function luminance([r, g, b]) {
  const a = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

function contrastRatio(hex1, hex2) {
  const l1 = luminance(hexToRgb(hex1));
  const l2 = luminance(hexToRgb(hex2));
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return Number(((hi + 0.05) / (lo + 0.05)).toFixed(2));
}

function parseCssThemeTokens(cssText) {
  const themes = {};
  for (const t of ['industrial', 'sage', 'midnight', 'blue']) {
    const re = new RegExp(`body\\[data-theme='${t}'\\]\\s*\\{([\\s\\S]*?)\\}`, 'm');
    const m = cssText.match(re);
    assert(m, `Could not find CSS block for theme ${t}`);
    const vars = {};
    for (const line of m[1].split('\n')) {
      const vm = line.match(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/);
      if (vm) vars[vm[1]] = vm[2].toUpperCase();
    }
    themes[t] = vars;
  }
  return themes;
}

async function main() {
  const server = await createServer({
    root: path.resolve('.'),
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  });

  const results = {
    version: '1.4.2',
    ssr_official_views: {},
    visual_intelligence_v130_tests: {},
    def09_strata_geo_unit_tests: {},
    def10_temporal_coverage_tests: {},
    csv_security_and_schema: {},
    wcag_css_token_contrast: {},
    browser_qa: 'Run scripts/pages_acceptance.mjs for the separate browser suite.',
  };

  try {
    const bundle = JSON.parse(fs.readFileSync('public/data/wardline_india_bundle.json', 'utf-8'));

    const { OverviewView } = await server.ssrLoadModule('/src/views/OverviewView.tsx');
    const { SeasonalAtlasView } = await server.ssrLoadModule('/src/views/SeasonalAtlasView.tsx');
    const { RegionalExplorerView } = await server.ssrLoadModule('/src/views/RegionalExplorerView.tsx');
    const { ServiceView } = await server.ssrLoadModule('/src/views/ServiceView.tsx');
    const { ForecastView } = await server.ssrLoadModule('/src/views/ForecastView.tsx');
    const { DataInspectorView } = await server.ssrLoadModule('/src/views/DataInspectorView.tsx');
    const { SpatialLabView } = await server.ssrLoadModule('/src/views/SpatialLabView.tsx');
    const { MethodologyView } = await server.ssrLoadModule('/src/views/MethodologyView.tsx');
    const { PresentationModeView } = await server.ssrLoadModule('/src/views/PresentationModeView.tsx');
    const { parseWardlineCsv, sanitizeCsvCell } = await server.ssrLoadModule('/src/utils/format.ts');
    const { buildActiveDataset } = await server.ssrLoadModule('/src/utils/activeDataset.ts');
    const { buildTerrainMatrix, buildGrowthSeries, buildCoverageMatrix, detectWebGLCapability, computeTerrainBarHeight } = await server.ssrLoadModule('/src/viz/selectors.ts');
    const { SvgHeatmap } = await server.ssrLoadModule('/src/components/SvgHeatmap.tsx');
    const { buildExportCsvString } = await server.ssrLoadModule('/src/viz/exportUtils.ts');

    const ind = bundle.indicators.inst_del;
    const nat = bundle.analytics.national.inst_del;
    const periodRange = `${bundle.source.period_min} to ${bundle.source.period_max}`;

    // 1. Official SSR render check on ALL 9 views
    const viewChecks = [
      ['overview', React.createElement(OverviewView, { series: nat, indicator: ind, geoName: 'All-India (34 harmonised units)', mode: 'official', periodMin: bundle.source.period_min, periodMax: bundle.source.period_max, onNavigate: () => {} }), ['Hospital', 'Daily Rate', 'Fixed cohort', 'APR 2017 HMIS FORMAT SHIFT']],
      ['seasonal', React.createElement(SeasonalAtlasView, { series: nat, indicator: ind, geoName: 'All-India (34 harmonised units)', theme: 'industrial', mode: 'official', attribution: bundle.source.attribution, periodRange }), ['V04', 'V06', 'V07', 'V08', 'Seasonal Clock', 'Historical Growth Explorer']],
      ['regional', React.createElement(RegionalExplorerView, { bundle, indicatorId: 'inst_del', indicator: ind, onSelectGeo: () => {} }), ['Punjab (PB)', 'Bihar (BR)', 'V05', 'V09', 'Regional Comparison Wall', 'Reporting Coverage Observatory']],
      ['services', React.createElement(ServiceView, { bundle, geoId: 'IN', geoName: 'All-India (34 harmonised units)', onSelectIndicator: () => {} }), ['NO FABRICATION POLICY', 'All-Cause General Inpatient Department (IPD) Attendance']],
      ['forecast', React.createElement(ForecastView, { bundle, reduceMotion: false }), ['Chronologically validated demand forecasting', 'RETROSPECTIVE HOLDOUT', 'LOCKED (DEV CV)', 'XAI TIMELINE']],
      ['data', React.createElement(DataInspectorView, { bundle, activeSeries: nat, activeGeoName: 'All-India', activeIndicatorLabel: ind.short_label, activeIndicatorUnit: ind.unit, importedRows: null, onImport: () => {}, onResetImport: () => {} }), ['26 RECONCILIATIONS PASS', '10.5281/zenodo.23657569', 'EXACT MATCH']],
      ['spatial', React.createElement(SpatialLabView, { bundle, series: nat, indicatorId: 'inst_del', indicator: ind, geoName: 'All-India (34 harmonised units)', theme: 'industrial', reduceMotion: false, onSelectGeo: () => {} }), ['V01', 'V02', 'Regional Comparison Matrix', '2D FALLBACK ACTIVE', 'Automatically displaying the equivalent 2D Calendar Matrix']],
      ['methodology', React.createElement(MethodologyView, { bundle, reduceMotion: false }), ['D01', 'D02', 'D03', 'D04', 'D05', 'D06', 'D07', 'D08', 'EDUCATIONAL FIXTURE']],
      ['presentation', React.createElement(PresentationModeView, { bundle, series: nat, indicatorId: 'inst_del', indicator: ind, geoName: 'All-India (34 harmonised units)', theme: 'industrial', reduceMotion: false, onExit: () => {}, onSelectGeo: () => {} }), ['CHAPTER 1 / 12', '5-Min CA1 Route', 'WARDLINE INDIA']],
    ];

    for (const [name, el, mustContain] of viewChecks) {
      const html = ReactDOMServer.renderToStaticMarkup(el);
      for (const token of mustContain) {
        assert(html.includes(token), `Official view "${name}" missing expected content: ${token}`);
      }
      results.ssr_official_views[name] = { status: 'PASS', html_bytes: html.length, svg_count: (html.match(/<svg/g) || []).length };
    }

    // 2. v1.3.0 Visual Intelligence selector, atlas, WebGL fallback & export tests
    const terrain = buildTerrainMatrix(nat, 'daily_rate');
    assert.strictEqual(terrain.months.length, 12);
    assert.strictEqual(terrain.years.length, 9);
    assert.strictEqual(terrain.observedCount, 96);
    // Missing months in 2012-01..2012-03 & 2020-04..2020-12 must stay strictly null (never interpolated)
    assert.strictEqual(terrain.cells[0][0].value, null);
    assert.strictEqual(terrain.cells[0][0].normalizedHeight, null);
    results.visual_intelligence_v130_tests.terrain_matrix_zero_interpolation = 'PASS';

    // Zero-denominator safeguard in buildGrowthSeries
    const syntheticZeroSeries = {
      ...nat,
      monthly: [
        { period: '2023-01', year: 2023, month: 1, season: 'winter', days: 31, value: 0, daily_rate: 0, status: 'observed', mom_pct: null, yoy_diff: null, yoy_pct: null, rolling_12m: null },
        { period: '2024-01', year: 2024, month: 1, season: 'winter', days: 31, value: 120, daily_rate: 3.87, status: 'observed', mom_pct: null, yoy_diff: null, yoy_pct: null, rolling_12m: null },
      ],
    };
    const growthZero = buildGrowthSeries(syntheticZeroSeries, 'monthly');
    assert.strictEqual(growthZero[1].yoyDiff, 120);
    assert.strictEqual(growthZero[1].yoyPct, null);
    results.visual_intelligence_v130_tests.growth_zero_denominator_guard = 'PASS';

    const cov = buildCoverageMatrix(bundle, 'inst_del');
    assert.strictEqual(cov.rows.length, 34);
    assert(cov.rows.some((r) => r.geo_id === 'PB' && r.observedMonths === 96));
    assert(cov.rows.some((r) => r.geo_id === 'BR' && r.observedMonths === 96));
    results.visual_intelligence_v130_tests.coverage_matrix_34_units = 'PASS';

    const glCap = detectWebGLCapability();
    assert.strictEqual(glCap.supported, false);
    results.visual_intelligence_v130_tests.webgl_ssr_fallback_detected = 'PASS';

    // Check reporting-unit parity and reject a stale or unrestricted runtime.
    const bundleGeoIds = new Set(bundle.analytics.states_directory.map((s) => s.geo_id));
    assert.strictEqual(bundleGeoIds.size, 34);
    for (const id of ['AP_TG', 'JK', 'DNH_DD']) assert(bundleGeoIds.has(id));
    for (const indicator of Object.keys(bundle.indicators)) {
      assert.deepEqual(new Set(Object.keys(bundle.analytics.states[indicator])), bundleGeoIds);
    }
    assert.doesNotMatch(JSON.stringify(bundle), /"(?:population_2019|fy2019_20_per_100k|gid1_members|source_isos|svg_path|polygons)"\s*:/);
    results.visual_intelligence_v130_tests.public_reporting_units = 'PASS';

    // Provenance-stamped CSV export & formula guard
    const csvOut = buildExportCsvString(
      ['period', 'label', 'value'],
      [['2019-04', '=CMD()', 100]],
      {
        vizId: 'V06',
        title: 'Calendar Matrix',
        indicatorLabel: ind.short_label,
        geoName: 'Punjab',
        periodRange,
        mode: 'official',
        attribution: bundle.source.attribution,
        limitations: 'Test limitation',
      }
    );
    assert(csvOut.includes('# WARDLINE INDIA Research Export') && csvOut.includes("'=CMD()"));
    results.visual_intelligence_v130_tests.export_csv_provenance_and_injection_guard = 'PASS';

    // DEF-13: SvgHeatmap metric parity (daily_rate vs monthly)
    const hmDaily = ReactDOMServer.renderToStaticMarkup(React.createElement(SvgHeatmap, { series: nat.monthly, unit: ind.unit, mode: 'daily_rate' }));
    const hmMonthly = ReactDOMServer.renderToStaticMarkup(React.createElement(SvgHeatmap, { series: nat.monthly, unit: ind.unit, mode: 'monthly' }));
    assert(hmDaily.includes('Daily rate') && hmMonthly.includes('Monthly count'), 'DEF-13 SvgHeatmap metric parity failed');
    results.visual_intelligence_v130_tests.def13_heatmap_metric_parity = 'PASS';

    // DEF-14: Zero-baseline geometry heights (0 -> 0, missing -> null, max -> maxBarHeight)
    const hZero = computeTerrainBarHeight({ year: 2020, month: 1, period: '2020-01', season: 'winter', days: 31, value: 0, rawValue: 0, dailyRate: 0, status: 'observed', normalizedHeight: 0 }, 5.4);
    const hMissing = computeTerrainBarHeight({ year: 2020, month: 2, period: '2020-02', season: 'winter', days: 29, value: null, rawValue: null, dailyRate: null, status: 'missing', normalizedHeight: null }, 5.4);
    const hFull = computeTerrainBarHeight({ year: 2020, month: 3, period: '2020-03', season: 'pre_monsoon', days: 31, value: 100, rawValue: 100, dailyRate: 3.2, status: 'observed', normalizedHeight: 1 }, 5.4);
    assert.strictEqual(hZero, 0);
    assert.strictEqual(hMissing, null);
    assert.strictEqual(hFull, 5.4);
    results.visual_intelligence_v130_tests.def14_zero_baseline_geometry_exact = 'PASS';

    // DEF-15: Imported dataset in Presentation Mode never inherits official 34-unit / 2.69% benchmarks
    const { buildActiveDataset: _bad } = { buildActiveDataset };


    // 3. DEF-09: Strata overlap, geo_level overlap, non-additive units
    const def09Rejects = [
      ['male_female_strata_rejected', 'period,geo_level,geo_id,indicator_id,unit,stratum,value,status\n2024-01,state_ut,PB,ipd,admissions,all,100,observed\n2024-01,state_ut,PB,ipd,admissions,female,60,observed'],
      ['age_group_stratum_rejected', 'period,geo_level,geo_id,indicator_id,unit,stratum,value,status\n2024-01,state_ut,PB,ipd,admissions,age_0_14,40,observed'],
      ['facility_tier_stratum_rejected', 'period,geo_level,geo_id,indicator_id,unit,stratum,value,status\n2024-01,state_ut,PB,ipd,admissions,dh,80,observed'],
      ['national_plus_state_geo_overlap_rejected', 'period,geo_level,geo_id,indicator_id,unit,stratum,value,status\n2024-01,national,IN,ipd,admissions,all,500,observed\n2024-01,state_ut,PB,ipd,admissions,all,100,observed'],
      ['percentage_unit_rejected', 'period,geo_level,geo_id,indicator_id,unit,stratum,value,status\n2024-01,state_ut,PB,occ,percentage,all,85,observed'],
      ['rate_per_100k_unit_rejected', 'period,geo_level,geo_id,indicator_id,unit,stratum,value,status\n2024-01,state_ut,PB,adm_rate,per_100k,all,42,observed'],
    ];
    for (const [label, csv] of def09Rejects) {
      let rejected = false;
      try { parseWardlineCsv(csv); } catch { rejected = true; }
      assert(rejected, `DEF-09 test "${label}" should have been rejected`);
      results.def09_strata_geo_unit_tests[label] = 'PASS';
    }

    // 4. DEF-10: Sparse calendar coverage, missing month insertion, observed zero vs missing
    const sparseCsv = [
      '\uFEFFperiod,geo_level,geo_id,geo_name,indicator_id,raw_indicator,unit,stratum,value,status',
      '2024-01,district,PB_LDH,"District Hospital, Ludhiana",custom_ipd,General IPD Admissions,admissions,all,1200,observed',
      '2024-03,district,PB_LDH,"District Hospital, Ludhiana",custom_ipd,General IPD Admissions,admissions,all,0,observed',
      '2024-01,district,PB_AMR,"District Hospital, Amritsar",custom_ipd,General IPD Admissions,admissions,all,800,observed',
    ].join('\n');

    const parsed = parseWardlineCsv(sparseCsv);
    const activeImported = buildActiveDataset(bundle, parsed.rows, 'punjab_sparse_ipd.csv');
    const natImp = activeImported.analytics.national.custom_ipd;
    const ldhImp = activeImported.analytics.states.custom_ipd.PB_LDH;

    assert.strictEqual(ldhImp.expected_months, 3);
    assert.strictEqual(ldhImp.observed_months, 2);
    assert.strictEqual(ldhImp.monthly[1].period, '2024-02');
    assert.strictEqual(ldhImp.monthly[1].status, 'missing');
    assert.strictEqual(ldhImp.monthly[2].status, 'observed');
    assert.strictEqual(ldhImp.monthly[2].value, 0);
    assert.strictEqual(natImp.monthly[0].value, 2000);
    assert.strictEqual(natImp.monthly[2].coverage_status, 'partial_reporting_sum');

    // Also verify imported dataset renders in V04/V07 small-sample dot-plot mode and SpatialLabView without crashing
    const impSeasonalHtml = ReactDOMServer.renderToStaticMarkup(
      React.createElement(SeasonalAtlasView, {
        series: natImp,
        indicator: activeImported.indicators.custom_ipd,
        geoName: 'All Imported (2 units)',
        theme: 'industrial',
        mode: activeImported.mode,
        attribution: activeImported.source.attribution,
        periodRange: '2024-01 to 2024-03',
      })
    );
    assert(impSeasonalHtml.includes('Small-sample dot-plot mode active'));
    results.visual_intelligence_v130_tests.imported_small_sample_dot_plot = 'PASS';

    const impPresHtml = ReactDOMServer.renderToStaticMarkup(React.createElement(PresentationModeView, { bundle: activeImported, series: natImp, indicatorId: 'custom_ipd', indicator: activeImported.indicators.custom_ipd, geoName: 'All Imported (2 units)', theme: 'industrial', reduceMotion: false, initialChapter: 9, onExit: () => {}, onSelectGeo: () => {} }));
    assert(!impPresHtml.includes('2.69%') && !impPresHtml.includes('Punjab (PB)'), 'DEF-15: Imported presentation leaked official figures');
    results.visual_intelligence_v130_tests.def15_presentation_imported_isolation = 'PASS';

    results.def10_temporal_coverage_tests = {
      calendar_interval_expected_3_months: 'PASS',
      omitted_month_2024_02_marked_missing: 'PASS',
      observed_zero_distinct_from_missing: 'PASS',
      partial_geographic_coverage_tracked: 'PASS',
    };

    // 5. General CSV security & schema tests
    for (const [label, csv] of [
      ['negative_value', 'period,value\n2024-01,-5'],
      ['duplicate_key', 'period,value\n2024-01,10\n2024-01,20'],
      ['unknown_status', 'period,value,status\n2024-01,10,pending'],
      ['invalid_date', 'period,value\n2024-13,10'],
      ['unterminated_quote', 'period,geo_name,value\n2024-01,"Ludhiana,10'],
      ['official_mode_claim', 'period,value,mode\n2024-01,10,official'],
    ]) {
      let rejected = false;
      try { parseWardlineCsv(csv); } catch { rejected = true; }
      assert(rejected, `CSV test "${label}" should have been rejected`);
      results.csv_security_and_schema[label] = 'PASS';
    }
    assert.strictEqual(sanitizeCsvCell('=SUM(A1:A2)'), "'=SUM(A1:A2)");
    assert.strictEqual(sanitizeCsvCell(' -1+1'), "' -1+1");
    assert.strictEqual(sanitizeCsvCell(-1.36), '-1.36');
    assert.strictEqual(sanitizeCsvCell(Number.NaN), '');
    results.csv_security_and_schema.formula_injection_escaped = 'PASS';

    // 6. CSS-Token-Derived WCAG 2.2 AA Contrast Verification
    const cssText = fs.readFileSync('src/styles/tokens.css', 'utf-8');
    const parsedThemes = parseCssThemeTokens(cssText);
    for (const [tName, vars] of Object.entries(parsedThemes)) {
      const checks = [
        ['ink_on_canvas', vars['--ink'], vars['--canvas']],
        ['muted_on_canvas', vars['--muted-ink'], vars['--canvas']],
        ['on_accent_on_accent', vars['--on-accent'], vars['--accent']],
        ['accent_text_on_canvas', vars['--accent-text'], vars['--canvas']],
        ['chart_ink_on_panel', vars['--chart-panel-ink'], vars['--chart-panel-bg']],
      ];
      results.wcag_css_token_contrast[tName] = {};
      for (const [cname, fg, bg] of checks) {
        const ratio = contrastRatio(fg, bg);
        assert(ratio >= 4.5, `WCAG AA fail in ${tName}.${cname}: ${fg} on ${bg} = ${ratio} < 4.5`);
        results.wcag_css_token_contrast[tName][cname] = { fg, bg, ratio, status: 'PASS' };
      }
    }

    const output = path.resolve(process.env.WARDLINE_EVIDENCE ?? '../evidence/final_local_acceptance');
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, 'FRONTEND_LOGIC_REPORT.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
