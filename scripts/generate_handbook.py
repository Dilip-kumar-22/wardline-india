#!/usr/bin/env python3
"""Generate deepened handbook.html and WARDLINE_INDIA_COMPLETE_HANDBOOK.md
from verified schemas, validated bundle outputs, charts, and all 22,848 normalized HMIS observations.
Uses local research inputs to generate the public handbook.
"""
from __future__ import annotations

import base64
import csv
import html
import json
import subprocess
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUNDLE = json.loads((ROOT / "frontend/public/data/wardline_india_bundle.json").read_text(encoding="utf-8"))
SCHEMA = json.loads((ROOT / "contracts/monthly-observation.schema.json").read_text(encoding="utf-8"))
CSV_PATH = ROOT / "data/processed/hmis_normalized_monthly.csv"
CHARTS_DIR = ROOT / "handbook/diagrams"

OUT_HTML = ROOT / "frontend/public/handbook.html"
OUT_MD = ROOT / "handbook/COMPLETE_HANDBOOK.md"

BASELINE_RELEASE = "v1.4.2 verified research-source snapshot"
RELEASE_VERSION = "1.4.2"
CURRENT_RELEASE = f"v{RELEASE_VERSION}"


def git_head() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, text=True, stderr=subprocess.DEVNULL
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return "unavailable in source extract"


def fmt_in(v) -> str:
    if v is None:
        return "—"
    if isinstance(v, float):
        return f"{v:,.2f}"
    return f"{int(v):,}"


def chart_data_uri(filename: str) -> str:
    p = CHARTS_DIR / filename
    if not p.exists():
        return ""
    b64 = base64.b64encode(p.read_bytes()).decode("ascii")
    return f"data:image/png;base64,{b64}"


def load_observations_and_stats():
    """Load all 22,848 observations plus dynamically computed status & inst_del coverage counts."""
    rows = []
    status_counts: Counter[str] = Counter()
    inst_by_month: dict[str, list[bool]] = {}
    inst_by_unit: dict[str, list[bool]] = {}
    unit_map: dict[str, str] = {}

    with CSV_PATH.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            val_raw = r["value"].strip()
            val = int(float(val_raw)) if val_raw != "" else None
            st = r["status"].strip()
            status_counts[st] += 1
            unit_map[r["indicator_id"]] = r["unit"]
            if r["indicator_id"] == "inst_del":
                inst_by_month.setdefault(r["period"], []).append(st == "observed")
                inst_by_unit.setdefault(r["geo_id"], []).append(st == "observed")
            # Compact array: [period, geo_id, indicator_id, value, status, full_row_locator]
            rows.append([
                r["period"],
                r["geo_id"],
                r["indicator_id"],
                val,
                st,
                r["row_locator"],
            ])

    total_rows = len(rows)
    obs_cnt = status_counts["observed"]
    nr_cnt = status_counts["not_reported"]
    miss_cnt = status_counts["missing"]
    unavail_cnt = nr_cnt + miss_cnt
    assert total_rows == 22848 and obs_cnt == 22294 and nr_cnt == 508 and miss_cnt == 46 and unavail_cnt == 554

    complete_34_months = sum(1 for vals in inst_by_month.values() if len(vals) == 34 and all(vals))
    partial_months = sum(1 for vals in inst_by_month.values() if not (len(vals) == 34 and all(vals)))
    fixed_cohort_units = sum(1 for vals in inst_by_unit.values() if len(vals) == 96 and all(vals))
    assert len(inst_by_unit) == 34 and complete_34_months == 49 and partial_months == 47 and fixed_cohort_units == 29

    stats = {
        "total_rows": total_rows,
        "observed": obs_cnt,
        "not_reported": nr_cnt,
        "missing": miss_cnt,
        "unavailable": unavail_cnt,
        "inst_del_units": len(inst_by_unit),
        "inst_del_complete_months": complete_34_months,
        "inst_del_partial_months": partial_months,
        "inst_del_fixed_cohort_units": fixed_cohort_units,
        "unit_map": unit_map,
    }
    return rows, stats


def build_student_dictionary() -> list[dict]:
    """Student-friendly, schema-grounded data dictionary (FINAL-07)."""
    details = [
        ("source_id", "string", "Canonical identifier of the upstream verified dataset package.",
         "mohfw_hmis_zenodo_23657569", "Non-empty slug; constant for official HMIS rows", "Required non-null",
         "Set during normalize.py; prevents mixing unverified CSVs with official MoHFW records."),
        ("vintage", "string", "Exact archive version, financial-year coverage, and archival release date.",
         "v1.0.1 (HMIS FY2012-13 to FY2019-20; archived 2026-10)", "Versioned provenance string", "Required non-null",
         "Stamps every exported CSV/JSON slice so evaluators know the exact historical snapshot."),
        ("period", "string", "Calendar month of reporting in strict ISO YYYY-MM format.",
         "2019-10", "Regex ^\\d{4}-(0[1-9]|1[0-2])$; 96 contiguous months 2012-04..2020-03", "Required non-null",
         "Used with calendar.monthrange(y,m) to compute exact 28/29/30/31-day daily rates and IMD seasons."),
        ("geo_level", "string", "Administrative resolution of the geographic unit.",
         "state_ut", "Contract: national, state_ut, district, subdistrict, facility", "Required non-null",
         "DEF-09 enforces a single consistent geo_level across imported CSVs to prevent double-counting."),
        ("geo_id", "string", "Boundary-harmonized geographic code for 2012–2020 continuity.",
         "PB", "34 harmonized Indian state/UT codes (including pooled AP_TG, JK, DNH_DD)", "Required non-null",
         "Stable identifier for linking observations to their reporting unit."),
        ("geo_name", "string", "Human-readable formal name of the state, UT, or pooled continuity unit.",
         "Punjab", "Non-empty formal name string", "Required non-null",
         "Displayed in tooltips, tables, rankings, and Presentation Mode."),
        ("parent_geo_id", "string or null", "Parent administrative territory code for hierarchical grouping.",
         "IN", "String or null. Official HMIS rows use IN", "Optional in schema",
         "Supports national aggregation without overlapping sub-national hierarchies."),
        ("facility_scope", "string", "Reporting facility universe included in the monthly aggregate count.",
         "public_and_private_reporting_facilities", "Non-empty string", "Required non-null",
         "Clarifies that HMIS captures reporting facilities only; facility-tier splits (DH/CHC/PHC) are unavailable."),
        ("indicator_id", "string", "Canonical machine key for one of the 7 verified utilization indicators.",
         "inst_del", "Official keys: inst_del, opd, anc_reg, diarr_u5, penta3, mcv1, fic", "Required non-null",
         "Drives indicator routing, units, chart titles, and forecasting eligibility."),
        ("raw_indicator", "string", "Descriptive indicator label assigned by the project's mapping.",
         "Number of Institutional Deliveries conducted (Including C-Sections)", "Non-empty label. The derivative CSV uses short indicator codes", "Required non-null",
         "Preserves clinical definition fidelity (e.g., confirming inst_del includes C-sections)."),
        ("unit", "string", "Measurement unit for additive count validation and axis labeling.",
         "deliveries", "Official units: deliveries, attendances, registrations, cases, doses, children", "Required non-null",
         "DEF-09 rejects non-additive percentage or per-100k units during CSV import so sums remain valid."),
        ("stratum", "string", "Subgroup disaggregation tag (age/sex/tier); fixed to aggregate 'all' in HMIS.",
         "all", "Official archive and validated CSV imports require stratum='all'", "Required non-null",
         "DEF-09 blocks overlapping aggregate and subgroup rows in imported datasets."),
        ("value", "integer or null", "Monthly total utilization count for the state-month-indicator cell.",
         "35998", "Integer 0 through 9007199254740991 when observed, otherwise null", "Null iff status != observed",
         "Divided by exact calendar days D(y,m) to produce Mean Daily Rate; observed 0 is strictly preserved."),
        ("status", "string", "Data-quality observation state distinguishing true counts from unavailable cells.",
         "observed", "Contract: observed, not_reported, missing, suppressed. This derivative has no suppressed rows", "Required non-null",
         "Prevents missing/masked cells from being treated as 0 in means, rolling averages, or 3D bar heights."),
        ("row_locator", "string", "Pre-sort line pointer tracing each normalized row back to the raw Zenodo CSV.",
         "hmis_state_month.csv:row_3176", "Filename + 1-indexed source row number", "Required non-null",
         "Audited by validate.py across 26 source-to-normalized reconciliation checks. Note: points to the verified Zenodo state-month CSV, not raw facility-level MoHFW registers."),
        ("publication_status", "string", "Upstream statistical release status as archived in the Zenodo panel.",
         "provisional", "Contract: provisional, final, unknown", "Optional in schema. Official HMIS rows use provisional",
         "Documents that HMIS monthly state aggregates reflect archived MoHFW reporting."),
        ("mode", "string", "Provenance trust boundary separating official HMIS data from user uploads.",
         "official", "Contract: official, imported_unverified, fixture", "Optional in schema. Official HMIS rows use official",
         "Client CSV parser strictly rejects uploaded files claiming mode='official'."),
    ]
    return [
        {"name": n, "type": t, "meaning": m, "rep": rep, "allowed": al, "missing": ms, "rule": rl}
        for (n, t, m, rep, al, ms, rl) in details
    ]


def build_python_modules() -> list[dict]:
    return [
        {
            "file": "pipeline/acquire.py",
            "functions": "acquire_raw_archive(), sha256_file()",
            "inputs": "Zenodo record URL (DOI 10.5281/zenodo.23657569), expected SHA-256 checksum",
            "outputs": "data/raw/zenodo_23657569/elnino-hmis-services-india-v1.0.1.zip (3,460,316 bytes), with verification metadata returned to the caller",
            "logic": "Checks local raw archive first; if absent, downloads with truthful WARDLINE-INDIA User-Agent and validates exact SHA-256 before extraction.",
            "math": "Cryptographic SHA-256 digest verification over 64 KiB streaming chunks.",
            "exceptions": "Raises RuntimeError on HTTP failure or ValueError on SHA-256 mismatch (blocks corrupted ingestion).",
            "tests": "Verified indirectly by full pipeline reconciliation in test_official_full_validation_reconciliation_and_mutation_rejection.",
            "example": "Computes 9b87896f923b30a364f04d2ad890f3b2f12197ebcd9dcd184e34fa943b3eedbe for elnino-hmis-services-india-v1.0.1.zip.",
        },
        {
            "file": "pipeline/normalize.py",
            "functions": "load_raw_archive(), normalize_hmis()",
            "inputs": "Raw wide CSV hmis_state_month.csv (3,264 state-month rows) inside the Zenodo archive",
            "outputs": "data/processed/hmis_normalized_monthly.csv (22,848 long-format rows)",
            "logic": "Assigns 1-indexed pre-sort row_locator (hmis_state_month.csv:row_N), melts 7 indicator columns into canonical schema rows, preserves observed 0, distinguishes completeness-masked (<90% district gate -> not_reported, 508 rows) from blank/absent cells (missing, 46 rows), and sorts deterministically.",
            "math": "34 harmonized units × 96 months × 7 indicators = 22,848 rows (22,294 observed + 508 not_reported + 46 missing = 554 unavailable).",
            "exceptions": "Rejects negative counts. Full period and schema checks run during validation.",
            "tests": "Row counts, status separation, and pre-sort row_locator integrity verified by test_pipeline.py.",
            "example": "Raw row 3176 (Punjab, 2019-10, inst_del = 35998) emits value=35998, status='observed', row_locator='hmis_state_month.csv:row_3176'.",
        },
        {
            "file": "pipeline/validate.py",
            "functions": "validate_dataframe(), validate_and_reconcile()",
            "inputs": "hmis_normalized_monthly.csv, contracts/monthly-observation.schema.json, raw Zenodo CSV",
            "outputs": "data/processed/quality_report.json (22,848 schema checks and 26 source reconciliations)",
            "logic": "Validates 100% of rows via jsonschema, checks 0 duplicate canonical keys (geo_id, period, indicator_id, stratum), verifies value-null/status consistency, and reconciles 26 spot-checked + aggregate sums directly against the raw Zenodo file.",
            "math": "Set-cardinality duplicate check |keys| == 22,848; exact integer equality sum(normalized) == sum(raw).",
            "exceptions": "Raises AssertionError/ValidationError on any schema breach, duplicate key, or reconciliation drift.",
            "tests": "Mutation test in test_pipeline.py corrupts an observed value and geo_id and proves validate.py rejects both.",
            "example": "Reconciles Punjab 8-year inst_del sum = 2,912,447 and Bihar 8-year inst_del sum = 13,039,349 against raw CSV.",
        },
        {
            "file": "pipeline/analyze.py",
            "functions": "days_in_period(), compute_series_metrics(), run_analytics()",
            "inputs": "Validated hmis_normalized_monthly.csv and reporting completeness",
            "outputs": "data/processed/analytics_summary.json. The completeness CSV is generated by normalization.",
            "logic": "Computes exact calendar-day daily rates, gap-safe 12-month rolling averages, zero-safe YoY %, IMD 4-season complete-year profiles, 34-unit coverage matrices, 29-unit inst_del fixed-cohort national series, and Punjab vs Bihar count comparison.",
            "math": "r(t) = V(t) / D(y,m); D(y,m) via calendar.monthrange(y,m)[1]; complete-season averages require all season months observed.",
            "exceptions": "Suppresses YoY % (returns None) whenever V(t-12) <= 0 or unavailable; never bridges gaps in 12m rolling means.",
            "tests": "test_leap_year_calendar_days and test_hand_computed_fixture_seasons_yoy_ties_and_rolling_gap.",
            "example": "Punjab 2019-10 inst_del: 35,998 / 31 = 1,161.23 deliveries/day. February 2016 and February 2020 have 29 days.",
        },
        {
            "file": "pipeline/forecast.py",
            "functions": "evaluate_series(), forecast_ridge_recursive(), forecast_additive_hw(), run_forecasts()",
            "inputs": "Monthly count series from analytics_summary.json",
            "outputs": "data/processed/forecast_results.json (strict RFC-8259 JSON via allow_nan=False)",
            "logic": "Requires at least 72 contiguous observed months. Across two rolling-origin development folds, selects the better of Ridge and Holt-Winters only if its MAE is below seasonal naive. Locks the selection before retrospective evaluation and derives uncalibrated P80 half-widths from development residuals.",
            "math": "WAPE = 100 * sum(|y - yhat|) / sum(|y|); Ridge solves (X^T X + alpha I) w = X^T y; Additive Holt-Winters updates level l_t, trend b_t, seasonal s_t.",
            "exceptions": "Withholds forecast (ready=False) if series <72 months or contains any internal calendar gap; guards zero-sum WAPE.",
            "tests": "test_model_selection_independence_from_holdout_and_strict_json & test_forecast_readiness_continuity_and_zero_wape_guard.",
            "example": "All-India fixed-cohort (29 units) inst_del locks Ridge (Test WAPE 2.69% vs Seasonal Naive 3.37%).",
        },
        {
            "file": "pipeline/publish.py",
            "functions": "publish_bundle(), run_all()",
            "inputs": "quality_report.json, analytics_summary.json, forecast_results.json and the source manifest",
            "outputs": "frontend/public/data/wardline_india_bundle.json and manifest.json with its SHA-256 checksum",
            "logic": "Assembles the single offline frontend runtime contract with explicit unavailable_dimensions list (General IPD, demographics, facility tiers) and writes with allow_nan=False.",
            "math": "Computes the bundle SHA-256 over its bytes. The generation timestamp can change the checksum between equivalent builds.",
            "exceptions": "Fails fast on NaN/Infinity tokens or missing upstream stage files.",
            "tests": "Clean-extract checksum parity check in release packaging scripts.",
            "example": "Produces 5.90 MB self-contained JSON bundle consumed directly by React without any backend server.",
        },
    ]


def build_viz_catalogue() -> list[dict]:
    return [
        {
            "id": "V01", "name": "3D Seasonal Terrain", "component": "frontend/src/components/spatial/SeasonalTerrain3D.tsx (+ SvgHeatmap.tsx 2D fallback)",
            "dataset": "Active dataset selected geography × indicator matrix (12 calendar months × 9 years).",
            "coords": "X = Month (Jan–Dec), Z = Year (2012–2020), Y = zero-baseline height via computeTerrainBarHeight().",
            "encoding": "Extruded rectangular prisms colored by 3-stop theme ramp; flat zero markers for observed 0; recessed empty cells for missing/masked.",
            "scale": "Strict zero-baseline linear scale [0, V_max] mapped to [0, 5.4] world units (DEF-14).",
            "calc": "Height H = 0 when V = 0; null when missing; (V / V_max) × 5.4 when V > 0; supports Daily Rate and Monthly Count parity (DEF-13).",
            "interaction": "Orbit/zoom, Perspective/Top/Front/Reset presets, Perspective ↔ Orthographic camera toggle, click/hover cell readout, 3D↔2D switch, WebGL Canvas PNG export.",
            "interpret": "Read ridge alignment across years (same month column) to spot recurring seasonal peaks and March 2020 drops.",
            "misconception": "Perspective mode foreshortens rear years—always switch to Orthographic or 2D Heatmap for exact height comparison.",
            "limits": "Requires WebGL2 (auto-falls back to 2D Heatmap on WebGL1/context loss); SVG export disabled in 3D mode (DEF-17).",
        },
        {
            "id": "V02", "name": "Regional Comparison Matrix", "component": "RegionalComparisonWall.tsx",
            "dataset": "Active monthly series. Official mode covers 34 historical HMIS reporting units.",
            "coords": "Time runs left to right in an aligned chart for each region.",
            "encoding": "Monthly counts or calendar-day-normalized rates, with gaps for unavailable observations.",
            "scale": "Shared scale for magnitude comparison or independent scales for shape comparison.",
            "calc": "Reads counts and daily rates from each active reporting series.",
            "interaction": "Filter, sort, pin regions or open a regional series.",
            "interpret": "Check matched dates and coverage when comparing regional utilization.",
            "misconception": "Independent scales can make different volumes look similar.",
            "limits": "Reporting units cover aggregate service utilization only.",
        },
        {
            "id": "V04", "name": "Radial Seasonal Clock", "component": "frontend/src/components/viz/SeasonalClockSvg.tsx",
            "dataset": "Active geography × indicator monthly series across 2012–2020.",
            "coords": "Polar coordinates: angle θ = calendar month (Jan–Dec clockwise), radius r = year ring (innermost = earliest).",
            "encoding": "Wedge fill encodes normalized daily rate or monthly count; outer arcs delineate IMD 4 seasons.",
            "scale": "Continuous theme intensity ramp; hatched wedges mark missing/masked months.",
            "calc": "Maps each (year, month) cell using the active metric mode (DEF-13 parity with V06).",
            "interaction": "Filter by IMD season (Winter/Pre-Monsoon/SW Monsoon/Post-Monsoon), inspect exact wedge values, export CSV/SVG/PNG.",
            "interpret": "Strong radial bands along specific angles indicate stable multi-year calendar seasonality.",
            "misconception": "Outer rings have larger pixel area than inner rings—rely on color intensity and exact numeric tooltips, not wedge area.",
            "limits": "Polar area distortion; pair with V06 Calendar Rhythm Matrix for equal-area cell comparison.",
        },
        {
            "id": "V05", "name": "Regional Comparison Wall", "component": "frontend/src/components/viz/RegionalComparisonWall.tsx",
            "dataset": "All active geographies (34 HMIS units or imported CSV units) for selected indicator.",
            "coords": "Small-multiple grid: X = time (96 months), Y = daily rate (shared or independent scale).",
            "encoding": "Sparkline/area paths with coverage badges flagging <90% reporting completeness.",
            "scale": "Toggleable Shared Y-scale (volume comparison) vs explicitly labeled Independent Y-scales (shape comparison).",
            "calc": "Plots exact daily rates with line breaks across missing/masked months.",
            "interaction": "Search states, pin/unpin comparison units, toggle Shared vs Independent Y-scales.",
            "interpret": "Use Independent Y-scales to compare seasonal timing between Punjab and Bihar despite 4.5× volume difference.",
            "misconception": "Reading independent-scale panels as equal magnitude without checking each panel's Y-axis max label.",
            "limits": "Aggregate state series mask district-level hospital disparities.",
        },
        {
            "id": "V06", "name": "Calendar Rhythm Matrix", "component": "frontend/src/components/SvgHeatmap.tsx",
            "dataset": "Active geography × indicator year-by-month grid.",
            "coords": "Columns = Calendar Months (Jan–Dec), Rows = Years (2012–2020).",
            "encoding": "Equal-area rectangular cells: color ramp for positive counts, distinct outline for observed 0, diagonal hatch for unavailable.",
            "scale": "Linear 0-to-max in either Daily Rate or Monthly Count mode (DEF-13).",
            "calc": "Direct cell lookup; zero-baseline color mapping.",
            "interaction": "Hover/focus cell inspection, mode toggle, CSV/SVG/PNG export.",
            "interpret": "Vertical color stripes show consistent calendar seasonality; horizontal shifts reveal multi-year growth or E1→E2 regime changes.",
            "misconception": "Assuming hatched cells are zero utilization—they are unavailable/masked records.",
            "limits": "Color perception is less precise than aligned line charts; use tooltips for exact figures.",
        },
        {
            "id": "V07", "name": "Seasonal Distribution Explorer", "component": "frontend/src/components/viz/SeasonalDistributionSvg.tsx",
            "dataset": "Active geography × indicator grouped by calendar month (Jan–Dec).",
            "coords": "X = Month (Jan–Dec), Y = Daily Rate distribution across observed years.",
            "encoding": "Box-and-whisker (Q25, Median, Q75, 1.5×IQR whiskers, outlier dots) when n >= 4; raw dot-plot fallback when n < 4.",
            "scale": "Zero-anchored or auto-bounded linear Y-axis in daily rate units.",
            "calc": "Linear interpolation quartiles + Tukey 1.5×IQR fence rule.",
            "interaction": "Inspect per-month median, IQR, min/max, and flagged outlier years (such as March 2020).",
            "interpret": "Narrow boxes indicate predictable seasonal months; wide boxes or outlier dots flag structural shocks.",
            "misconception": "Computing quartiles on n < 4 points—prevented automatically by WARDLINE's dot-plot switch.",
            "limits": "Small sample size (at most 8 years per month) limits parametric normality assumptions.",
        },
        {
            "id": "V08", "name": "Historical Growth Explorer", "component": "frontend/src/components/viz/HistoricalGrowthSvg.tsx",
            "dataset": "Active geography × indicator chronological series.",
            "coords": "X = Period (YYYY-MM), Y = Growth metric (YoY %, YoY diff, Base-100 index, or 12m rolling mean).",
            "encoding": "Line/bar path with dashed reference line (0% or Base 100) and April 2017 E1→E2 marker.",
            "scale": "Signed linear scale (YoY) or positive linear scale (Base 100 / Rolling Mean).",
            "calc": "YoY % = 100×(V(t)−V(t−12))/V(t−12) iff V(t−12) > 0; 12m rolling requires 12 contiguous observed months.",
            "interaction": "Switch between 4 growth modes, inspect monthly tooltips, export CSV/SVG/PNG.",
            "interpret": "Separates long-term expansion from seasonal oscillation.",
            "misconception": "Percent jumps from tiny baselines can look dramatic—always inspect Absolute YoY Diff alongside YoY %.",
            "limits": "First 12 months have no YoY or 12m rolling value by definition.",
        },
        {
            "id": "V09", "name": "Reporting Coverage Observatory", "component": "frontend/src/components/viz/CoverageObservatory.tsx",
            "dataset": "All 34 units × 96 months observation status matrix + fixed-cohort comparison.",
            "coords": "Rows = Geographic Units, Columns = Financial Years / Months.",
            "encoding": "Categorical status encoding: observed, observed zero, not_reported (<90% gate), missing.",
            "scale": "Completeness percentage [0%, 100%] per unit and per month.",
            "calc": "Counts 49 complete 34-unit months, 47 partial months, and 29 fixed-cohort units for inst_del.",
            "interaction": "Inspect unit completeness percentages and compare variable-coverage vs fixed-cohort national curves.",
            "interpret": "Explains why raw national sums dip when a state falls below 90% district reporting.",
            "misconception": "Treating the 29-unit fixed cohort as a full 34-unit nationwide total.",
            "limits": "Does not measure sub-district reporting accuracy above the 90% gate.",
        },
    ]


def build_viva_bank(stats: dict):
    """105 project-specific CSE276 CA1 viva questions & honest answers across 15 topics (FINAL-05/06/08 corrected)."""
    obs = f"{stats['observed']:,}"
    nr = f"{stats['not_reported']:,}"
    miss = f"{stats['missing']:,}"
    unav = f"{stats['unavailable']:,}"
    raw = [
        # 1. Project Fundamentals (7)
        ("Project Fundamentals", "Basic", "What is the exact assigned CSE276 CA1 topic for WARDLINE INDIA?",
         "Analysis of Hospital Admission Data for Identifying Patient Trends and Seasonal Healthcare Demand Patterns."),
        ("Project Fundamentals", "Basic", "What does WARDLINE INDIA actually deliver relative to that topic?",
         f"An offline-capable, reproducible healthcare utilization analytics platform using 22,848 verified monthly state-level MoHFW HMIS records (Apr 2012 – Mar 2020; {obs} observed, {nr} completeness-threshold masked not_reported, and {miss} missing = {unav} combined unavailable) across 34 harmonized states/UTs and 7 service indicators, plus a validated CSV importer for local hospital IPD exports."),
        ("Project Fundamentals", "Intermediate", "Why did you not invent or simulate Inpatient Department (IPD) admission counts?",
         "Scientific integrity (No-Fabrication Policy). The verified Zenodo MoHFW HMIS derivative used by WARDLINE does not include general all-cause IPD admissions or patient demographics, and acquisition attempts for compatible multi-year Indian IPD tables were unsuccessful. Fabricating IPD or substituting OPD for IPD would invalidate academic credibility."),
        ("Project Fundamentals", "Intermediate", "What is the Editorial Industrial design system used in WARDLINE INDIA?",
         "Charcoal (#1E2622), Cream (#EFEBE0), Orange (#F2662B), Muted Grey (#4F5A53), Accessible Orange Text (#B84212), with self-hosted Anton display and Archivo interface typography, plus Botanical Sage, Midnight Lab, and Clinical Blue themes."),
        ("Project Fundamentals", "Basic", "Why is offline capability important for this platform?",
         "Academic demonstrations and district health reviews cannot rely on live external APIs. The built runnable app bundles its validated JSON dataset locally."),
        ("Project Fundamentals", "Advanced", "What distinguishes WARDLINE INDIA from a standard student BI dashboard?",
         "Strict data contracts (100% JSON Schema validation), 26 raw-source reconciliations, mutation tests, calendar-day normalization, fixed-cohort national comparability, chronologically validated development-selected forecasting with retrospective evaluation, and a progressive WebGL2 3D laboratory."),
        ("Project Fundamentals", "Professor Cross-Question", "If your dataset lacks general all-cause IPD admissions, how is your project still valid for CSE276 CA1?",
         "We preserve the assigned topic, transparently document the narrower verified utilization scope across 7 official HMIS indicators, explicitly withhold IPD with an Unavailable state, and submit a formal faculty-approval request (FINAL_ACADEMIC_SCOPE_NOTE.md) alongside a validated CSV importer for institutional IPD records."),

        # 2. Healthcare Terminology (7)
        ("Healthcare Terminology", "Basic", "What is IPD (Inpatient Department) vs OPD (Outpatient Department)?",
         "IPD tracks admitted patients occupying a hospital bed overnight or longer; OPD tracks ambulatory visits where patients receive consultation/treatment without overnight admission."),
        ("Healthcare Terminology", "Basic", "Why are Institutional Deliveries (inst_del) not equivalent to all-cause IPD admissions?",
         "Institutional deliveries measure obstetric childbirth admissions (public + reporting private facilities), representing only one clinical specialty rather than total medical/surgical inpatient bed demand."),
        ("Healthcare Terminology", "Basic", "What are the 7 verified indicators in WARDLINE INDIA?",
         "inst_del (Institutional Deliveries), opd (Outpatient Attendance), anc_reg (ANC Registrations), diarr_u5 (Under-5 Diarrhoea), penta3 (Pentavalent/DPT 3rd Dose), mcv1 (Measles/MR 1st Dose), and fic (Fully Immunised Children)."),
        ("Healthcare Terminology", "Intermediate", "What is the difference between aggregate facility counts and individual patient records?",
         "Aggregate counts report monthly totals per state (e.g., 35,998 deliveries in Punjab in Oct 2019), containing zero patient IDs, ages, sexes, diagnoses, or lengths of stay."),
        ("Healthcare Terminology", "Intermediate", "Why does OPD attendance often show sharper seasonal swings than routine immunization?",
         "Acute respiratory, febrile, and waterborne illnesses fluctuate seasonally across the calendar year, whereas routine childhood immunization schedules follow birth cohorts (noting these are observed calendar associations, not causal meteorological proof)."),
        ("Healthcare Terminology", "Basic", "What does ANC Registration (anc_reg) measure?",
         "Total pregnant women registered for Antenatal Care checkups across reporting health facilities in a given state-month."),
        ("Healthcare Terminology", "Advanced", "Why must percentage indicators or rates per 100k never be summed across states?",
         "Percentages and per-capita rates are non-additive intensive ratios; summing them produces meaningless totals. Only raw additive counts can be summed before dividing by pooled population."),

        # 3. Dataset (7)
        ("Dataset", "Basic", "What is the authoritative origin of the dataset?",
         "Government of India Ministry of Health and Family Welfare (MoHFW) Health Management Information System (HMIS), accessed via the archived Zenodo derivative by H S Siddalingaiah (2026), DOI 10.5281/zenodo.23657569 (v1.0.1)."),
        ("Dataset", "Basic", "What licenses govern the data and code?",
         "Upstream MoHFW HMIS is under Government Open Data License – India (GODL-India); derived aggregate tables on Zenodo are CC BY 4.0; code is MIT."),
        ("Dataset", "Intermediate", "What is the exact observation status breakdown across the 22,848 normalized rows?",
         f"22,848 total rows = {obs} observed + {nr} not_reported (completeness-threshold masked below the 90% district gate) + {miss} missing (blank/absent in source) = {unav} combined unavailable observations."),
        ("Dataset", "Intermediate", "Why are there 34 geographic units instead of 36?",
         "To preserve 2012–2020 longitudinal continuity across state reorganizations: Andhra Pradesh + Telangana are pooled as AP_TG, Jammu & Kashmir + Ladakh as JK, and Dadra & Nagar Haveli + Daman & Diu as DNH_DD."),
        ("Dataset", "Intermediate", "Why does the CSV panel end in 2020-03 while the Zenodo design spec mentions 2020-02?",
         "hmis_state_month.csv stores all 96 months (Apr 2012–Mar 2020) for complete FY 2019–20 accounting, whereas the upstream paper's primary regression excludes March 2020 (95 months) coinciding with India's 25 March 2020 COVID-19 lockdown."),
        ("Dataset", "Advanced", "What happens when district reporting completeness in a state-month falls below 90%?",
         f"The upstream HMIS quality gate masks the observation as not_reported ({nr} cells across 22,848 rows, alongside {miss} missing cells = {unav} combined unavailable) so incomplete district reporting does not masquerade as a genuine utilization drop."),
        ("Dataset", "Professor Cross-Question", "Does the absence of IPD in WARDLINE mean MoHFW HMIS never publishes IPD statistics?",
         "No. MoHFW HMIS portals and bulletins publish various inpatient statistics elsewhere, but the verified CC BY 4.0 Zenodo derivative used here does not include general IPD, and independent acquisition attempts for compatible multi-year public IPD tables were unsuccessful."),

        # 4. Research Methodology (7)
        ("Research Methodology", "Basic", "Why does WARDLINE INDIA divide monthly totals by exact calendar days (28/29/30/31)?",
         "Without calendar-day normalization, February (28 days) appears ~9.7% lower than March (31 days) even when true daily healthcare demand is identical."),
        ("Research Methodology", "Basic", "Which seasonal classification does WARDLINE INDIA use?",
         "India Meteorological Department (IMD) 4-season convention: Winter (Jan–Feb), Pre-Monsoon (Mar–May), SW Monsoon (Jun–Sep), and Post-Monsoon (Oct–Dec)."),
        ("Research Methodology", "Intermediate", "Why does complete-season averaging exclude incomplete calendar years?",
         "If a year only has 1 or 2 months of a 4-month season (e.g., 2012 starts in April, missing Jan–Feb Winter), including partial seasons biases seasonal comparisons."),
        ("Research Methodology", "Intermediate", "What is the April 2017 HMIS format break (E1 to E2)?",
         "In FY 2017–18 (April 2017), MoHFW transitioned HMIS reporting definitions from Format E1 to E2. WARDLINE INDIA flags this structural break on charts and includes an E2 regime indicator in Ridge forecasting."),
        ("Research Methodology", "Intermediate", "Why is an observed zero kept separate from a missing observation?",
         "An observed zero means zero events were verified; a missing observation means no valid report exists. Treating missing as zero falsely depresses averages and corrupts rolling means."),
        ("Research Methodology", "Advanced", "What is a fixed-cohort national comparison and what are the exact institutional-delivery cohort counts?",
         f"When units drop below the 90% gate in specific months, raw national sums drop artificially. For inst_del across {stats['inst_del_units']} possible units, {stats['inst_del_complete_months']} months have complete 34-unit reporting, {stats['inst_del_partial_months']} months have partial reporting, and {stats['inst_del_fixed_cohort_units']} units form the fixed cohort (96/96 observed). Fixed-cohort totals cover those 29 units only, not all 34 nationwide."),
        ("Research Methodology", "Professor Cross-Question", "Do IMD seasonal demand differences prove that monsoon rainfall causes hospital visits?",
         "No. IMD seasonal bins reveal recurring calendar-month associations, not causal meteorological proof. Local climate timing, agricultural/holiday calendars, and reporting cycles also vary across India."),

        # 5. Data Engineering (7)
        ("Data Engineering", "Basic", "What is the SHA-256 checksum of the raw Zenodo archive and why do we verify it?",
         "9b87896f923b30a364f04d2ad890f3b2f12197ebcd9dcd184e34fa943b3eedbe. Checking it on acquisition guarantees bit-exact provenance and protects against silent file corruption."),
        ("Data Engineering", "Intermediate", "How does normalize.py preserve traceability back to the raw CSV?",
         "Every normalized row stores a full row_locator (e.g., hmis_state_month.csv:row_2294) computed before sorting so auditors can trace any normalized number back to its exact Zenodo CSV line."),
        ("Data Engineering", "Intermediate", "How does validate.py test that the validator itself actually catches bugs?",
         "Mutation testing: test_pipeline.py intentionally corrupts an observed value and a geo_id in a copy of the data and asserts that validate.py rejects both."),
        ("Data Engineering", "Intermediate", "What security protections exist in the client-side CSV importer?",
         "Strict RFC-4180 parsing (rejects unterminated quotes), negative-value rejection, duplicate canonical key rejection, DEF-09 strata/geo-level/unit overlap rejection, non-official mode enforcement, and CSV formula-injection escaping ('=...)."),
        ("Data Engineering", "Advanced", "How was DEF-10 (sparse temporal coverage in imported CSVs) fixed?",
         "activeDataset.ts expands every calendar month in [minPeriod, maxPeriod] inclusive, explicitly materializing omitted months as status='missing' (value=null) while preserving observed 0 as status='observed'."),
        ("Data Engineering", "Advanced", "How was DEF-09 (overlapping strata and geographies) fixed?",
         "Imported CSVs are strictly constrained to stratum='all', single consistent geo_level across rows, and additive count units (rejecting percentages and per_100k rates)."),
        ("Data Engineering", "Basic", "Why is allow_nan=False used when writing JSON bundles?",
         "Python's json module writes invalid NaN/Infinity tokens by default, which break strict browser JSON.parse(). allow_nan=False guarantees RFC-8259 compliant JSON."),

        # 6. Python (7)
        ("Python", "Basic", "Which Python modules make up the WARDLINE INDIA pipeline?",
         "pipeline/acquire.py, normalize.py, validate.py, analyze.py, forecast.py, publish.py, orchestrated via pipeline/__main__.py."),
        ("Python", "Basic", "How is the pipeline executed from scratch?",
         "From an extracted research-source archive: python3 -m pipeline all (or stage-by-stage: acquire, normalize, validate, analyze, forecast, publish)."),
        ("Python", "Intermediate", "How does Python verify calendar days in leap years?",
         "Using calendar.monthrange(year, month)[1], which returns 29 for 2016-02 and 2020-02, and 28 for non-leap Februaries."),
        ("Python", "Intermediate", "Why did you pin Python dependencies in requirements.txt?",
         "To guarantee deterministic reproduction of pandas, numpy, scipy, jsonschema, and requests across independent machines and reviewer environments."),
        ("Python", "Advanced", "How does validate.py enforce 100%-row schema compliance?",
         "It validates all 22,848 rows against contracts/monthly-observation.schema.json using jsonschema, checks 0 duplicate (geo_id, period, indicator_id, stratum) keys, and runs 26 raw-vs-normalized reconciliations."),
        ("Python", "Basic", "How are the offline academic charts and handbook generated?",
         "scripts/generate_academic_charts.py (Matplotlib PNG+SVG) and scripts/generate_handbook.py (reads bundle + 22,848 CSV rows + embedded charts)."),
        ("Python", "Intermediate", "Why do release tests run inside tempfile.TemporaryDirectory()?",
         "Clean-extract testing extracts the final ZIPs into an isolated temporary folder outside the dev workspace to prove no hidden local path dependencies exist."),

        # 7. Statistics (7)
        ("Statistics", "Basic", "How is Mean Daily Rate defined?",
         "Daily Rate = Monthly Observed Value / Exact Days in Month (28, 29, 30, or 31)."),
        ("Statistics", "Basic", "What is the Seasonal Amplitude Ratio?",
         "Peak Mean Daily Rate across complete seasons divided by Trough Mean Daily Rate, measuring seasonal swing magnitude."),
        ("Statistics", "Intermediate", "How does V07 Seasonal Distribution Explorer define statistical outliers?",
         "Tukey 1.5×IQR rule: points below Q25 − 1.5×IQR or above Q75 + 1.5×IQR."),
        ("Statistics", "Intermediate", "Why does V07 switch to a dot plot when n < 4 years per month?",
         "Quartiles and IQR boxes are unstable and misleading when sample size n < 4; raw dot plots show exact observations honestly."),
        ("Statistics", "Intermediate", "What zero-denominator safeguard protects Year-over-Year (YoY %) calculations?",
         "If the prior-year baseline observation is null or <= 0, YoY % is strictly suppressed (null) rather than dividing by zero or producing Inf."),
        ("Statistics", "Advanced", "How is the 12-month rolling average computed?",
         "Only when all 12 consecutive calendar months are present with observed non-null values (no calendar gaps allowed inside the 12-month window)."),
        ("Statistics", "Professor Cross-Question", "Why report both Mean and Median in seasonal and monthly summaries?",
         "Monthly healthcare counts can be skewed by epidemic spikes or sharp shocks (e.g., March 2020). Median and IQR resist outliers, while Mean reflects total cumulative load."),

        # 8. Artificial Intelligence (7)
        ("Artificial Intelligence", "Basic", "What makes the forecasting module an AI / Machine Learning component?",
         "It implements chronologically validated, development-selected forecasting with retrospective evaluation using trend, lags 1 and 12, month-of-year indicators and the E2 format-break feature in L2-regularized Ridge, alongside exponential smoothing and rolling-origin cross-validation."),
        ("Artificial Intelligence", "Basic", "What are the 4 models evaluated in WARDLINE INDIA?",
         "1) Seasonal Naive (same month last year), 2) Last-Value Naive (last training observation), 3) Ridge Regression (trend, lags 1/12, month and E2), and 4) Additive Holt-Winters Exponential Smoothing."),
        ("Artificial Intelligence", "Intermediate", "Why are Seasonal Naive and Last-Value Naive included?",
         "As rigorous baseline benchmarks. A complex ML model is only justified if it beats simple seasonal persistence in out-of-sample development validation."),
        ("Artificial Intelligence", "Intermediate", "Why does Ridge Regression use L2 regularization?",
         "The Ridge design has 15 predictors: trend, two lags, 11 month dummies and the E2 regime. Ridge shrinks coefficients to reduce sensitivity to a short training history."),
        ("Artificial Intelligence", "Advanced", "What is the readiness gate for forecasting (>=72 contiguous months)?",
         "A series must have at least 72 contiguous observed calendar months (no gaps) to support 2-fold 12-month rolling-origin Dev-CV plus a 12-month retrospective evaluation window."),
        ("Artificial Intelligence", "Advanced", "Why are empirical P80 bands labeled 'uncalibrated'?",
         "They use the 80th percentile of historical Dev-CV absolute residuals as a symmetric half-width rather than formal conformal prediction or parametric Gaussian coverage calibration."),
        ("Artificial Intelligence", "Professor Cross-Question", "Why is K-fold random cross-validation invalid for hospital time series?",
         "Random K-fold shuffles future observations into training folds, leaking future temporal structure and trends into past predictions."),

        # 9. Forecasting (7)
        ("Forecasting", "Basic", "What are MAE and WAPE, and why is WAPE preferred over MAPE when zeroes occur?",
         "MAE is Mean Absolute Error (in original units). WAPE = sum(|actual - pred|) / sum(|actual|) × 100%, which weights errors by volume and avoids division-by-zero when a single month is 0 (unlike MAPE)."),
        ("Forecasting", "Intermediate", "What was the holdout-selection bug in v1.0.0 and how was it fixed?",
         "v1.0.0 compared holdout scores to pick the best model (data leakage). v1.1.0+ locks the selected model strictly from 2-fold rolling-origin Dev-CV MAE BEFORE ever evaluating the FY 2019–20 retrospective evaluation window."),
        ("Forecasting", "Intermediate", "What test proves model selection is independent of the retrospective evaluation window?",
         "test_model_selection_independence_from_holdout_and_strict_json in tests/test_pipeline.py perturbs holdout values and asserts selected_model remains identical."),
        ("Forecasting", "Intermediate", "What are the verified All-India fixed-cohort retrospective WAPE results?",
         "For inst_del (29 fixed units): Ridge 2.69% vs Seasonal Naive 3.37%. For opd: Additive Holt-Winters 2.82% vs Seasonal Naive 5.73%. For anc_reg: Ridge 4.05% vs Seasonal Naive 4.76%. These represent fixed-cohort subsets, not complete 34-unit nationwide forecasts."),
        ("Forecasting", "Basic", "When does WARDLINE INDIA retain Seasonal Naive instead of an ML model?",
         "Whenever no candidate beats Seasonal Naive on Dev-CV MAE (e.g., Punjab ANC Registrations retains Seasonal Naive at 6.02% Test WAPE)."),
        ("Forecasting", "Professor Cross-Question", "Can these 2012–2020 models be used as verified 2026 hospital admission forecasts?",
         "No. The FY 2019–20 window is a retrospective historical evaluation ending in March 2020; post-2020 health system changes make 2012–2020 models invalid for 2026 operational forecasting without fresh data."),
        ("Forecasting", "Advanced", "Why is the FY 2019–20 evaluation window called retrospective rather than pristine unseen data?",
         "Because the researchers inspected the full 2012–2020 dataset during exploratory analysis and schema design; calling it 'chronologically validated, development-selected forecasting with retrospective evaluation' avoids overclaiming true prospective deployment."),

        # 10. Graph Interpretation (7)
        ("Graph Interpretation", "Basic", "What does V04 (Radial Seasonal Clock) show?",
         "Concentric rings represent years (innermost earliest) and 12 angular wedges represent Jan–Dec, ringed by IMD season arcs, highlighting recurring seasonal phase."),
        ("Graph Interpretation", "Basic", "What does V06 (Calendar Rhythm Matrix) encode, and how did DEF-13 improve it?",
         "Year × Month grid where hatched cells denote unavailable records and outlined cells denote observed zeroes. DEF-13 synchronized SvgHeatmap to support both Daily Rate and Monthly Count parity with V01/V04."),
        ("Graph Interpretation", "Intermediate", "Why does V05 (Regional Comparison Wall) offer both Shared and Independent Y-scales?",
         "Shared Y-scales compare absolute volume across states (e.g., UP vs Sikkim), while clearly labeled Independent Y-scales reveal seasonal shape in smaller states without flattening them."),
        ("Graph Interpretation", "Intermediate", "Why compare 34 regions with aligned monthly charts?",
         "3D bar grids suffer from severe perspective occlusion and foreshortening, making accurate cross-state comparison impossible. V05 coordinated 2D small multiples solve this cleanly."),
        ("Graph Interpretation", "Basic", "How do you read V08 (Historical Growth Explorer)?",
         "Toggles between YoY % change, Absolute YoY diff, Base-100 index, and 12m rolling mean, with dashed zero/100 reference lines and strict breaks across missing months."),
        ("Graph Interpretation", "Intermediate", "What does V09 (Reporting Coverage Observatory) prove?",
         "It maps observed, zero, not_reported (<90% district gate), and missing months across all 34 units (e.g., 49 complete and 47 partial months for inst_del), proving why fixed-cohort baselines prevent coverage distortion."),
        ("Graph Interpretation", "Advanced", "What 5 questions does VizFrame answer on every research chart?",
         "1) What question it answers, 2) What data it uses, 3) What its encoding represents, 4) What the viewer can conclude, and 5) What limitations apply."),

        # 11. Three.js (7)
        ("Three.js", "Basic", "Why did you choose direct Three.js 0.170.0 instead of React Three Fiber v9?",
         "R3F v9 targets React 19 and is incompatible with React 18.3.1. Direct Three.js inside React.lazy gives zero initial-bundle cost, deterministic GPU disposal, and strict WebGL 2 control."),
        ("Three.js", "Intermediate", "What are the axes and coordinates of V01 (Seasonal Terrain)?",
         "X-axis = Calendar Month (Jan–Dec), Z-depth = Historical Year (2012–2020), Y-height = proportional zero-baseline utilization (maxBarHeight = 5.4), color = 3-stop theme ramp."),
        ("Three.js", "Intermediate", "How was DEF-14 (zero-baseline geometry) fixed in SeasonalTerrain3D?",
         "Observed zeroes now have exact quantitative height 0 (computeTerrainBarHeight returns 0) rendered as flat non-quantitative markers, distinct from missing gaps (null) and positive bars."),
        ("Three.js", "Intermediate", "How does Three.js reduce GPU usage and prevent memory leaks?",
         "Demand-driven rendering (no idle requestAnimationFrame loop), IntersectionObserver pausing off-screen, DPR capped at 2, and unmount disposal of all geometries, materials, OrbitControls, listeners, and renderer."),
        ("Three.js", "Basic", "Why provide Perspective AND Orthographic camera modes in V01?",
         "Perspective gives natural spatial depth, whereas Orthographic removes foreshortening distortion so bar heights can be compared accurately."),
        ("Three.js", "Intermediate", "How did DEF-16 improve WebGL capability detection?",
         "Three.js 0.170.0 requires WebGL 2. detectWebGLCapability() rejects WebGL 1-only environments and triggers automatic 2D heatmap fallback on init failure or webglcontextlost."),
        ("Three.js", "Advanced", "How does DEF-17 enable PNG export from a WebGL 3D canvas?",
         "WebGLRenderer sets preserveDrawingBuffer: true, and downloadCanvasPngExport composites the WebGL canvas onto an offscreen 2D canvas with a provenance metadata footer; SVG export is disabled in 3D mode."),

        # 12. React and TypeScript (7)
        ("React and TypeScript", "Basic", "How does buildActiveDataset() in activeDataset.ts work?",
         "When official mode is active, it returns the verified bundle; when a user uploads a CSV, it dynamically recomputes all national/state series, seasonal profiles, rankings, and readiness checks purely from imported rows."),
        ("React and TypeScript", "Intermediate", "How does App.tsx ensure lazy-loaded Three.js doesn't bloat initial page load?",
         "SeasonalTerrain3D is imported with React.lazy + Suspense, deferring Three.js until the 3D Spatial Lab is opened."),
        ("React and TypeScript", "Basic", "How are themes implemented in tokens.css?",
         "CSS custom properties on body[data-theme='industrial'|'sage'|'midnight'|'blue'], persisted in localStorage, with all 20 contrast pairs verified >= 4.5:1 (WCAG 2.2 AA)."),
        ("React and TypeScript", "Intermediate", "How does Presentation Mode preserve presenter state when inspecting 3D charts (DEF-15)?",
         "App.tsx tracks presChapter state and passes initialChapter + onChapterChange to PresentationModeView so jumping to 07 / 3D Spatial Lab and returning resumes at the exact chapter."),
        ("React and TypeScript", "Intermediate", "How does WARDLINE INDIA honor prefers-reduced-motion?",
         "Initializes reduceMotion from window.matchMedia('(prefers-reduced-motion: reduce)'), toggles body.reduce-motion, disables OrbitControls damping, and stops timeline auto-play."),
        ("React and TypeScript", "Basic", "How are the 34 HMIS reporting units kept comparable across years?",
         "The source uses stable reporting units across the study period, including pooled AP_TG, JK and DNH_DD."),
        ("React and TypeScript", "Professor Cross-Question", "Why use a regional comparison matrix?",
         "Aligned monthly series make comparison easier at a common scale and show unavailable observations as gaps."),

        # 13. System Architecture (7)
        ("System Architecture", "Basic", "Trace the end-to-end data flow from Zenodo to the browser.",
         "Zenodo ZIP -> acquire.py (SHA-256) -> normalize.py (22,848 CSV rows) -> validate.py (schema + 26 reconciliations) -> analyze.py + forecast.py -> publish.py (wardline_india_bundle.json) -> React fetch -> buildActiveDataset -> SVG/Three.js."),
        ("System Architecture", "Intermediate", "Where are data contracts stored and enforced?",
         "contracts/monthly-observation.schema.json enforces Python output in validate.py, while frontend/src/types/wardline.ts and src/viz/types.ts enforce TypeScript compile-time contracts."),
        ("System Architecture", "Intermediate", "How are official and imported datasets isolated in the UI?",
         "The evidence ribbon switches to IMPORTED · UNVERIFIED, imported regions are displayed as a separate set of series, and Presentation Mode Chapter 10 never displays official benchmarks for imported files (DEF-15)."),
        ("System Architecture", "Basic", "What is the role of VizFrame.tsx?",
         "A unified wrapper that gives every visualization a 5-point analytical brief toggle, consistent dark/light Editorial Industrial framing, and provenance-stamped CSV/SVG/PNG export buttons."),
        ("System Architecture", "Intermediate", "Why are D01–D08 educational fixtures explicitly labeled?",
         "To prevent evaluators or students from confusing illustrative teaching numbers (e.g., Feb 28d=2,800 vs Mar 31d=3,100) with actual MoHFW HMIS findings."),
        ("System Architecture", "Basic", "How can readers identify a reproducible public snapshot?",
         "Record the source revision and match the source and runnable archive SHA-256 values before reproducing a release."),
        ("System Architecture", "Advanced", "Why keep fonts and analytical data local?",
         "@fontsource/anton, @fontsource/archivo, and wardline_india_bundle.json are local assets, ensuring 100% offline execution."),

        # 14. Testing (7)
        ("Testing", "Basic", "What does the Python unittest suite verify?",
         "It covers leap-year calendar days, hand-computed seasonal/YoY/rolling fixtures, holdout-selection independence, strict JSON, forecast readiness, and full-row schema, source reconciliation and mutation rejection."),
        ("Testing", "Intermediate", "What does frontend/scripts/verify_frontend.mjs verify?",
         "SSR rendering of all 9 views, v1.3.0/v1.4.0 selectors (DEF-13..16), 6 DEF-09 overlap rejections, 4 DEF-10 sparse calendar tests, 7 CSV security tests, and 20 WCAG 2.2 AA CSS-token contrast checks."),
        ("Testing", "Intermediate", "Where do I find the actual results of browser and WebGL verification?",
         "See the testing guide for browser checks and their coverage."),
        ("Testing", "Basic", "How were FINAL-02 and FINAL-03 addressed in the Playwright QA scripts?",
         "Run the commands in docs/TESTING.md from the source archive root. Browser checks exercise the production build with Playwright pinned in the frontend lockfile. Read the individual recorded outcomes for browser and WebGL evidence."),
        ("Testing", "Intermediate", "What does clean-extract verification prove?",
         "Extracting runnable and source ZIPs (and reconstructing multi-part source archives) into fresh temporary directories and running tests/checksums proves zero dependency on the developer's local workspace."),
        ("Testing", "Basic", "What is WCAG 2.2 AA contrast and what is the minimum ratio?",
         "4.5:1 for normal text and 3.0:1 for large text. In Editorial Industrial, Charcoal on Cream is 13.01:1 and Accessible Orange #B84212 on Cream is 4.61:1."),
        ("Testing", "Professor Cross-Question", "Does passing SSR verification prove that WebGL 3D Terrain works in Chrome?",
         "No. SSR verifies TypeScript/React rendering and data selectors, not live WebGL2 GPU shaders or mouse orbit controls. That requires running windows_browser_qa.ps1 locally on Windows from an extracted source archive."),

        # 15. Limitations & Difficult Professor Cross-Questions (7)
        ("Limitations & Cross-Questions", "Professor Cross-Question", "Why are WAPE values around 2.7%–7.2% relatively low compared to single-hospital forecasting?",
         "National and large-state monthly aggregates sum thousands of facilities, smoothing individual hospital noise so calendar seasonality dominates. Disaggregated district or single-hospital IPD data would exhibit much higher variance."),
        ("Limitations & Cross-Questions", "Professor Cross-Question", "Why didn't you use Deep Learning (LSTM / Transformer) for forecasting?",
         "With only 72–84 monthly training points per series, deep sequence models severely overfit compared to parsimonious Ridge Regression and Additive Holt-Winters Exponential Smoothing."),
        ("Limitations & Cross-Questions", "Basic", "List the 4 main limitations of WARDLINE INDIA.",
         f"1) No general all-cause IPD or patient demographics in the verified derivative; 2) Historical 2012–2020 window (not 2026 operational forecasts); 3) Aggregate state-month resolution (no district conclusions); 4) {unav} unavailable cells ({nr} completeness-masked <90% + {miss} missing)."),
        ("Limitations & Cross-Questions", "Intermediate", "Why does WARDLINE INDIA prohibit drawing conclusions about individual districts from the 34 reporting units?",
         "Ecological fallacy: state-level monthly totals mask large intra-state variation between urban tertiary hospitals and rural primary health centres."),
        ("Limitations & Cross-Questions", "Professor Cross-Question", "How do you prevent a user from uploading misleading CSV data and presenting it as official MoHFW results?",
         "The CSV parser rejects any file claiming mode='official', switches the global evidence ribbon to IMPORTED · UNVERIFIED, and strips official benchmarks in Presentation Mode."),
        ("Limitations & Cross-Questions", "Intermediate", "Why is March 2020 included in the bundle if it shows a sharp discontinuity?",
         "Excluding it silently would create an artificial 95-month financial year. Keeping all 96 months preserves FY 2019–20 accounting completeness while explicitly annotating the March 2020 discontinuity."),
        ("Limitations & Cross-Questions", "Basic", "What is the immediate future work for WARDLINE INDIA?",
         "Obtaining formal faculty approval on the narrower verified utilization scope (or ingesting compatible post-2020 / IPD CSV exports via the client validator) and executing windows_browser_qa.ps1 locally on Windows."),
    ]
    return raw


def generate():
    head_sha = git_head()
    obs_rows, stats = load_observations_and_stats()
    viva = build_viva_bank(stats)
    assert len(viva) == 105, f"Expected 105 viva questions, got {len(viva)}"
    dict_rows = build_student_dictionary()
    py_modules = build_python_modules()
    viz_cards = build_viz_catalogue()

    ind_meta = BUNDLE["indicators"]
    fc_in_inst = BUNDLE["forecasts"]["inst_del"]["IN"]
    fc_in_opd = BUNDLE["forecasts"]["opd"]["IN"]
    fc_in_anc = BUNDLE["forecasts"]["anc_reg"]["IN"]
    pb_inst = BUNDLE["analytics"]["pb_br_spotlight"]["inst_del"]["punjab"]
    br_inst = BUNDLE["analytics"]["pb_br_spotlight"]["inst_del"]["bihar"]
    days_in_fy = sum(
        month["days"] for month in BUNDLE["analytics"]["states"]["inst_del"]["PB"]["monthly"]
        if "2019-04" <= month["period"] <= "2020-03"
    )
    pb_opd = BUNDLE["analytics"]["pb_br_spotlight"]["opd"]["punjab"]
    br_opd = BUNDLE["analytics"]["pb_br_spotlight"]["opd"]["bihar"]

    diagrams = [
        ("diagram_02_chronological_forecasting.png", "Chronological development and retrospective forecast evaluation"),
    ]

    # =========================================================================
    # 1. MARKDOWN EDITION (Substantively Equivalent to HTML — FINAL-07)
    # =========================================================================
    md_parts = [
        f"# WARDLINE INDIA — Complete Project Handbook ({CURRENT_RELEASE})",
        "",
        f"- **Baseline Release:** `{BASELINE_RELEASE}`",
        f"- **Application Source / Artifact Revision:** `{CURRENT_RELEASE}` (Git HEAD at generation: `{head_sha}`)",
        "- **Course:** WARDLINE INDIA project study guide",
        "- **Assigned Topic (Preserved Verbatim):** *Analysis of Hospital Admission Data for Identifying Patient Trends and Seasonal Healthcare Demand Patterns*",
        "- **Target Audience:** Three-person B.Tech CSE (AI & ML) project team preparing for CA1 evaluation & academic viva defense.",
        "",
        f"> **Academic Scope & Honesty Notice:** The verified MoHFW HMIS Zenodo derivative (`22,848` state-month-indicator rows, Apr 2012–Mar 2020: `{stats['observed']:,}` observed, `{stats['not_reported']:,}` completeness-threshold masked `not_reported`, and `{stats['missing']:,}` `missing` = `{stats['unavailable']:,}` combined unavailable) supports public-sector healthcare service utilization research across 7 indicators, **not** general all-cause inpatient (IPD) admissions or patient-level demographics. Acquisition attempts for compatible multi-year IPD tables were unsuccessful (this does not imply MoHFW never publishes IPD statistics elsewhere). No synthetic IPD data is fabricated; academic scope approval remains a separate faculty decision.",
        "",
        "## H01 — Project Fundamentals",
        "- **Assigned Topic:** Analysis of Hospital Admission Data for Identifying Patient Trends and Seasonal Healthcare Demand Patterns.",
        "- **Verified Implementation:** Reproducible 6-stage Python ETL/analytics/forecasting pipeline (`pipeline/`) + offline React 18 / TypeScript / Vite / Three.js 0.170.0 web platform (`frontend/`) + 18-chapter offline handbook (`handbook.html` & `.md`).",
        f"- **Exact Observation Status Breakdown (FINAL-05):** `{stats['total_rows']:,}` total rows = **`{stats['observed']:,}` observed** (`97.575%`) + **`{stats['not_reported']:,}` not_reported** (completeness-threshold masked `<90%` district gate, `2.223%`) + **`{stats['missing']:,}` missing** (`0.201%`) = **`{stats['unavailable']:,}` combined unavailable** (`2.425%`).",
        f"- **Institutional Deliveries Fixed-Cohort Accounting (FINAL-06):** `{stats['inst_del_units']}` possible harmonized units · `{stats['inst_del_complete_months']}` months with complete `34/34` reporting · `{stats['inst_del_partial_months']}` months with partial reporting · `{stats['inst_del_fixed_cohort_units']}` units in the fixed cohort (`96/96` contiguous observed months). Fixed-cohort series and forecasts cover those `29` units only, not complete `34`-unit nationwide totals.",
        "",
        "## H02 — Healthcare Terminology",
        "| Term | Clinical / Administrative Meaning | Present in Verified HMIS Derivative? |",
        "| :--- | :--- | :--- |",
        "| **IPD (Inpatient)** | Overnight hospital admissions occupying a ward or ICU bed | **No** (Absent from verified derivative; explicitly withheld as Unavailable) |",
        "| **OPD (`opd`)** | Ambulatory Outpatient Attendance (Allopathic + AYUSH) | **Yes** (`3,264` state-months) |",
        "| **Institutional Deliveries (`inst_del`)** | Facility childbirths including C-sections | **Yes** (`3,264` state-months) |",
        "| **ANC Registrations (`anc_reg`)** | Pregnant women registered for antenatal care | **Yes** (`3,264` state-months) |",
        "| **Under-5 Diarrhoea (`diarr_u5`)** | Childhood diarrhoeal cases treated (<5 yrs) | **Yes** (`3,264` state-months) |",
        "| **Immunization (`penta3`, `mcv1`, `fic`)** | Pentavalent-3, Measles/MR-1, Fully Immunised Children | **Yes** (`9,792` state-months) |",
        "",
        "## H03 — Dataset Encyclopedia",
        f"- **Upstream Government Attribution:** {BUNDLE['source']['attribution']}",
        "- **Zenodo Derivative:** Siddalingaiah, H S (2026), *El Niño and essential health services in India* (`v1.0.1`), DOI `https://doi.org/10.5281/zenodo.23657569`.",
        "- **Licenses:** Derived aggregate tables **CC BY 4.0**, code **MIT**, upstream **GODL-India**.",
        f"- **Raw Archive SHA-256:** `{BUNDLE['source']['raw_sha256']}` (`3,460,316` bytes).",
        f"- **Coverage:** `{BUNDLE['source']['period_min']}` to `{BUNDLE['source']['period_max']}` (`96` months), `34` boundary-harmonised units (`AP_TG`, `JK`, `DNH_DD` pooled).",
        "- **March 2020 Endpoint:** `hmis_state_month.csv` includes all 96 months through `2020-03` for full FY 2019–20 accounting; March 2020 is explicitly annotated as coinciding with India's 25 March 2020 national lockdown.",
        "",
        "## H04 — Complete Student-Friendly Data Dictionary (17 Contract Fields)",
        "| Field | Type | Purpose & Meaning | Sample | Permitted Values / Units | Missing & Validation Rule |",
        "| :--- | :--- | :--- | :--- | :--- | :--- |",
    ]
    for d in dict_rows:
        cells = [f"`{d['name']}`", f"`{d['type']}`", d['meaning'], f"`{d['rep']}`", d['allowed'], f"{d['missing']} — {d['rule']}"]
        md_parts.append("| " + " | ".join(cell.replace("|", r"\|") for cell in cells) + " |")

    md_parts += [
        "",
        "## H05 — Complete 22,848-Observation Explorer",
        f"All `{stats['total_rows']:,}` normalized observations (`{stats['observed']:,}` observed, `{stats['not_reported']:,}` completeness-threshold masked `not_reported`, `{stats['missing']:,}` `missing`) from `data/processed/hmis_normalized_monthly.csv` are embedded inside `handbook.html` (`#h05`) with interactive filtering by geography, indicator, status, and search query, displaying original monthly count, calendar-normalized daily rate, indicator unit, reporting status, and full `hmis_state_month.csv:row_N` source locator. *Provenance limitation:* `row_locator` traces back to the verified Zenodo state-month CSV; raw facility-level MoHFW portal registers are not publicly distributed inside the archive.",
        "",
        "## H06 — Python Data Pipeline (Deep Module Reference)",
    ]
    for m in py_modules:
        md_parts += [
            f"### `{m['file']}`",
            f"- **Important Functions:** `{m['functions']}`",
            f"- **Inputs:** {m['inputs']}",
            f"- **Outputs:** {m['outputs']}",
            f"- **Processing Logic:** {m['logic']}",
            f"- **Mathematical Calculations:** {m['math']}",
            f"- **Exceptions / Guards:** {m['exceptions']}",
            f"- **Tests:** {m['tests']}",
            f"- **Worked Example:** {m['example']}",
            "",
        ]

    md_parts += [
        "## H07 — Exploratory Data Analysis & Fixed-Cohort Comparability (FINAL-06)",
        "- **Why Calendar-Day Normalization Matters:** February (28 days) has `9.7%` fewer days than March (31 days). Dividing monthly counts by exact `D(y,m) in {28, 29, 30, 31}` eliminates false calendar troughs.",
        "- **Mathematically Valid Fixed-Cohort Illustration (FINAL-06):** Suppose `29` continuously reporting units record `80` (Month 1), `81` (Month 2), and `82` (Month 3) — steady `+1.25%` monthly growth. Suppose `5` intermittently reporting units record `20` in Month 1, fall below the `90%` completeness gate in Month 2 (masked), and return with `20` in Month 3. Variable-coverage national totals are `100 -> 81 -> 102` (an artificial `-19.0%` drop in Month 2), whereas the fixed cohort (`80 -> 81 -> 82`) satisfies `Fixed Cohort <= Variable Total` in every month (`80 <= 100`, `81 <= 81`, `82 <= 102`) and reveals the true upward trend.",
        f"- **Actual Institutional Deliveries (`inst_del`) Coverage:** `{stats['inst_del_units']}` possible units, `{stats['inst_del_complete_months']}` complete 34-unit months, `{stats['inst_del_partial_months']}` partial months, and `{stats['inst_del_fixed_cohort_units']}` fixed-cohort units. Fixed-cohort forecasts apply strictly to those `29` units, not all `34` units nationwide.",
        "",
        "## H08 — Every Frontend Visualization Explained (`V01`–`V09`)",
    ]
    for v in viz_cards:
        md_parts += [
            f"### {v['id']} — {v['name']}",
            f"- **Source Component:** `{v['component']}`",
            f"- **Dataset Selection:** {v['dataset']}",
            f"- **Coordinate Mapping:** {v['coords']}",
            f"- **Visual Encoding:** {v['encoding']}",
            f"- **Numerical Scale:** {v['scale']}",
            f"- **Calculation:** {v['calc']}",
            f"- **Interaction Behavior:** {v['interaction']}",
            f"- **Correct Interpretation:** {v['interpret']}",
            f"- **Common Misconceptions:** {v['misconception']}",
            f"- **Limitations:** {v['limits']}",
            "",
        ]

    md_parts += [
        "## H09 — AI & Forecasting (Practical Model Guide)",
        "- **Methodology Framing:** **Chronologically validated, development-selected forecasting with retrospective evaluation** (NOT pristine unseen prospective deployment and NOT a verified 2026 operational forecast).",
        "- **Readiness Gate:** Requires `>=72` contiguous observed calendar months (zero internal gaps).",
        "- **Supported Models & Implementation (`pipeline/forecast.py`):**",
        "  1. **Seasonal Naive (`seasonal_naive`):** Predicts `yhat[t] = y[t-12]`. Zero learned parameters; hard-to-beat baseline for stable seasonal cycles.",
        "  2. **Last-Value Naive (`last_value_naive`):** Predicts `yhat[t] = y[T_train]` (flat persistence). Detects whether a series has seasonality at all.",
        "  3. **Ridge Regression (`ridge_seasonal_lag`):** Uses time index, lags 1 and 12, 11 month-of-year indicators and the April 2017 regime flag. Training-only standardization and target centering precede the L2 solve (`alpha=10`). Predictions feed the lags for the next step.",
        "  4. **Additive Holt-Winters (`additive_holt_winters`):** Triple exponential smoothing updates level, trend and a 12-month additive seasonal term with fixed coefficients `alpha=0.25`, `beta=0.05`, `gamma=0.25`.",
        "- **Chronological Locking Protocol:** The better of Ridge and Holt-Winters is selected only if it strictly beats seasonal naive on pooled MAE across the two rolling-origin development folds. Last-value naive is a comparator. FY 2019–20 (`2019-04..2020-03`) evaluates the locked model retrospectively.",
        f"- **Verified Retrospective FY 2019–20 Test WAPE (Fixed-Cohort 29-Unit All-India & State Spotlights):** `inst_del` All-India Fixed Ridge `{fc_in_inst['holdout_metrics'][fc_in_inst['selected_model']]['wape_pct']:.2f}%` (vs `{fc_in_inst['holdout_metrics']['seasonal_naive']['wape_pct']:.2f}%` Naive); `opd` All-India Fixed Holt-Winters `{fc_in_opd['holdout_metrics'][fc_in_opd['selected_model']]['wape_pct']:.2f}%` (vs `{fc_in_opd['holdout_metrics']['seasonal_naive']['wape_pct']:.2f}%` Naive); `anc_reg` All-India Fixed Ridge `{fc_in_anc['holdout_metrics'][fc_in_anc['selected_model']]['wape_pct']:.2f}%` (vs `{fc_in_anc['holdout_metrics']['seasonal_naive']['wape_pct']:.2f}%` Naive).",
        "",
        "## H10 — Frontend Engineering & Three.js Lifecycle",
        "- **Stack:** React, TypeScript and Vite, self-hosted `@fontsource/anton` and `@fontsource/archivo`, and lazy-loaded Three.js. See `frontend/package-lock.json` for exact dependency versions.",
        "- **Active Dataset Engine (`src/utils/activeDataset.ts`):** `buildActiveDataset()` runs identical analytics on either the official HMIS bundle or an isolated `IMPORTED · UNVERIFIED` browser CSV upload (with DEF-09 stratum/geo/unit checks and DEF-10 sparse-calendar gap materialization).",
        "- **Three.js GPU Lifecycle:** Strict WebGL2 check (`detectWebGLCapability()`), demand-driven rendering, DPR <= 2, `IntersectionObserver` off-screen pause, `webglcontextlost` automatic 2D fallback, `preserveDrawingBuffer: true` for Canvas PNG export, and full unmount disposal of geometries, materials, controls, listeners, and renderer.",
        "",
        "## H11 — Complete Software Architecture",
        "1. **Python ETL & Forecasting Pipeline:** `Zenodo ZIP -> acquire.py (SHA-256) -> normalize.py (22,848 rows) -> validate.py (schema + 26 checks) -> analyze.py -> forecast.py (Dev-CV lock) -> publish.py (wardline_india_bundle.json)`.",
        "2. **Browser Startup & Active Dataset:** `index.html -> fetch(wardline_india_bundle.json) -> buildActiveDataset(official | imported_unverified) -> 8 views and Presentation Mode`. The regional comparison matrix uses the same active dataset.",
        "3. **Visualization & Export Pipeline:** `Active Slice -> selectors.ts (zero-baseline + metric parity) -> VizFrame.tsx -> 2D SVG (CSV/SVG/PNG) or Lazy Three.js WebGL2 (CSV/Canvas PNG; SVG disabled) with stamped provenance footers`.",
        "Three diagrams of the pipeline, browser and validation timeline appear in `handbook.html` under `#h11`.",
        "",
        "## H12 — Mathematics & Formulas Reference (Worked Calculations)",
        "1. **Mean Daily Rate:** `r(t) = V(t) / D(y,m)`. Punjab `2019-10` `inst_del` has `V = 35,998`, `D(2019,10) = 31`, so `35,998 / 31 = 1,161.23 deliveries/day`. February 2020 uses `D = 29`.",
        "2. **Year-over-Year % Change (Zero-Safe):** `YoY%(t) = 100 × (V(t) − V(t−12)) / V(t−12)` strictly if `V(t−12) > 0` and observed; else `null`. *Worked Example:* If `V(t-12) = 0`, output is `null` (never `Infinity`).",
        "3. **12-Month Calendar-Continuous Rolling Mean:** `M_12(t) = (1/12) Σ_{k=0..11} V(t−k)` only when all 12 consecutive calendar months are observed (any gap forces `null`).",
        "4. **Weighted Absolute Percentage Error (WAPE):** `WAPE = 100 × Σ|y_t − ŷ_t| / Σ|y_t|`. *Worked Example:* If actuals `[100, 0, 100]` have predictions `[95, 5, 100]`, `Σ|err| = 10`, `Σ|y| = 200`, so `WAPE = 5.00%` (whereas MAPE would divide by zero on month 2).",
        "5. **Mean Absolute Error (MAE):** `MAE = (1/N) Σ|y_t − ŷ_t|`.",
        "6. **Ridge Regression Objective:** `min_w ||y_c − X_s w||_2^2 + α ||w||_2^2`, with training-only standardized predictors `X_s` and centered target `y_c`. Predictions add the training target mean back after the solve.",
        "7. **Tukey IQR Outlier Fences:** `IQR = Q75 − Q25`; lower fence `Q25 − 1.5×IQR`, upper fence `Q75 + 1.5×IQR` (reverts to dot plot when `n < 4`).",
        "8. **3D Zero-Baseline Prism Height (DEF-14):** `H(V) = 0` if `V = 0` (flat marker), `null` if unavailable, `(V / V_max) × 5.4` if `V > 0`. *Worked Example:* `V = 1,500`, `V_max = 3,000` -> `H = 2.700` world units.",
        "",
        "## H13 — Testing & Verification Summary",
        "- **Python tests:** `python -m unittest discover -s tests -v` evaluates schema and reconciliation, forecast selection, leap years and continuity.",
        "- **Frontend checks:** See the testing guide for dependency, build, logic, and browser checks.",
        "",
        "## H14 — Verified Research Findings",
        f"1. **Institutional Deliveries:** Punjab eight-year sum {fmt_in(pb_inst['total_8yr'])} (FY 2019–20 {fmt_in(pb_inst['fy2019_20_total'])}); Bihar eight-year sum {fmt_in(br_inst['total_8yr'])} (FY 2019–20 {fmt_in(br_inst['fy2019_20_total'])}).",
        f"2. **Outpatient Attendance (`opd`):** Punjab 8-yr sum `{fmt_in(pb_opd['total_8yr'])}`; Bihar 8-yr sum `{fmt_in(br_opd['total_8yr'])}`.",
        "3. **Calendar Normalization:** At equal daily intensity, a 28-day month has a 9.7% smaller total than a 31-day month. Dividing by each calendar month's days removes that arithmetic effect.",
        f"4. **Fixed-Cohort Comparability:** Across `inst_del`, `{stats['inst_del_fixed_cohort_units']}` of `{stats['inst_del_units']}` units have complete 96-month reporting (`{stats['inst_del_complete_months']}` full-panel months vs `{stats['inst_del_partial_months']}` partial months).",
        "5. **Retrospective Forecasting:** Seasonality-aware Ridge and Additive Holt-Winters outperform Seasonal Naive on fixed-cohort All-India `inst_del`, `opd`, and `anc_reg`, while Seasonal Naive is honestly retained where ML does not beat Dev-CV MAE (Punjab `anc_reg` `6.02%`).",
        "",
        "## H15 — Installation & Operation (Runnable vs Research-Source Distinction — FINAL-09)",
        f"- **From `WARDLINE-INDIA-v{RELEASE_VERSION}-runnable.zip` (compiled static app):**",
        "  ```powershell",
        f"  Expand-Archive -Path .\\WARDLINE-INDIA-v{RELEASE_VERSION}-runnable.zip -DestinationPath .\\wardline-v{RELEASE_VERSION}",
        f"  cd .\\wardline-v{RELEASE_VERSION}\\app",
        "  python -m http.server 4173",
        "  ```",
        f"- **From `WARDLINE-INDIA-v{RELEASE_VERSION}-source.zip` (pipeline, build and Windows acceptance):**",
        "  ```powershell",
        "  python -m unittest discover -s tests -v",
        "  ```",
        "",
        f"## H16 — Complete Viva Preparation ({len(viva)} Questions & Answers)",
    ]
    for i, (cat, diff, q, a) in enumerate(viva, 1):
        md_parts.append(f"{i}. **[{cat} · {diff}] {q}**  \n   *Answer:* {a}")

    md_parts += [
        "",
        "## H17 — Three-Person Team Preparation Guide",
        "- **Teammate 1 (Data, Provenance & Scope):** Master Zenodo DOI/SHA-256, GODL-India/CC BY 4.0, 34-unit boundary harmonization, exact status split (`22,294` observed / `508` not_reported / `46` missing = `554` unavailable), and honest IPD scope (`FINAL_ACADEMIC_SCOPE_NOTE.md`) (`H01`–`H05`).",
        "- **Teammate 2 (Analytics, Statistics & AI Forecasting):** Master daily-rate normalization, mathematically valid fixed-cohort accounting (`34` units / `49` complete / `47` partial / `29` fixed), zero-denominator YoY guards, Ridge/Holt-Winters/Seasonal Naive math, chronologically validated development-selected forecasting with retrospective evaluation, and WAPE/MAE (`H06`, `H07`, `H09`, `H12`, `H14`).",
        "- **Teammate 3 (Frontend, Three.js 3D & QA Verification):** Master React `buildActiveDataset`, `V01`–`V09` encodings, Three.js zero-baseline geometry & GPU disposal, WebGL2 context-loss fallback, Editorial Industrial WCAG contrast, and `verify_frontend.mjs` / Windows Playwright QA (`H08`, `H10`, `H11`, `H13`, `H15`).",
        "- **Shared Core (All 3 Teammates):** Exact CSE276 topic, why IPD is withheld rather than fabricated, why 2012–2020 retrospective evaluations are not 2026 operational forecasts, and the 5-minute Presentation Mode walkthrough.",
        "",
        "## H18 — Glossary & Rapid Revision",
        f"- **Verified Headline Numbers:** `34` harmonized units · `96` months (`2012-04`..`2020-03`) · `7` indicators · `22,848` rows (`{stats['observed']:,}` observed, `{stats['not_reported']:,}` not_reported, `{stats['missing']:,}` missing = `{stats['unavailable']:,}` unavailable) · `inst_del`: `49` complete / `47` partial months, `29` fixed-cohort units · `26` source reconciliations · `>=72m` forecast gate · `2.69%` All-India Fixed `inst_del` Ridge WAPE · `2.82%` `opd` Holt-Winters WAPE · `13.01:1` Charcoal/Cream contrast.",
    ]
    OUT_MD.write_text("\n".join(md_parts) + "\n", encoding="utf-8")

    # =========================================================================
    # 2. INTERACTIVE OFFLINE HTML EDITION
    # =========================================================================
    obs_json = json.dumps(obs_rows, separators=(",", ":"), allow_nan=False)
    unit_map_json = json.dumps(stats["unit_map"], separators=(",", ":"))
    viva_json = json.dumps([{"id": i + 1, "cat": c, "diff": d, "q": q, "a": a} for i, (c, d, q, a) in enumerate(viva)], separators=(",", ":"))
    dict_json = json.dumps(dict_rows, separators=(",", ":"))
    geo_options = "".join(
        f'<option value="{html.escape(s["geo_id"])}">{html.escape(s["geo_name"])} ({html.escape(s["geo_id"])})</option>'
        for s in BUNDLE["analytics"]["states_directory"]
    )
    ind_options = "".join(
        f'<option value="{html.escape(k)}">{html.escape(v["short_label"])} ({html.escape(k)})</option>'
        for k, v in ind_meta.items()
    )

    py_cards_html = "".join(
        f"""<div class="panel">
          <h3><code>{html.escape(m['file'])}</code></h3>
          <p><strong>Functions:</strong> <code>{html.escape(m['functions'])}</code></p>
          <p><strong>Inputs:</strong> {html.escape(m['inputs'])}<br><strong>Outputs:</strong> {html.escape(m['outputs'])}</p>
          <p><strong>Processing Logic:</strong> {html.escape(m['logic'])}</p>
          <p><strong>Math &amp; Guards:</strong> {html.escape(m['math'])} · <em>Exceptions:</em> {html.escape(m['exceptions'])}</p>
          <p><strong>Tests &amp; Worked Example:</strong> {html.escape(m['tests'])} — <em>Example:</em> {html.escape(m['example'])}</p>
        </div>"""
        for m in py_modules
    )

    viz_cards_html = "".join(
        f"""<div class="panel">
          <h3>{html.escape(v['id'])} · {html.escape(v['name'])}</h3>
          <p><strong>Component:</strong> <code>{html.escape(v['component'])}</code></p>
          <p><strong>Dataset &amp; Coordinates:</strong> {html.escape(v['dataset'])} | {html.escape(v['coords'])}</p>
          <p><strong>Encoding &amp; Scale:</strong> {html.escape(v['encoding'])} | {html.escape(v['scale'])}</p>
          <p><strong>Calculation &amp; Interaction:</strong> {html.escape(v['calc'])} | {html.escape(v['interaction'])}</p>
          <p><strong>Interpretation:</strong> {html.escape(v['interpret'])}<br><strong>Misconceptions &amp; Limits:</strong> {html.escape(v['misconception'])} | {html.escape(v['limits'])}</p>
        </div>"""
        for v in viz_cards
    )

    charts_gallery_html = '<div class="demo-grid">' + ''.join(
        f'<figure class="panel"><img src="{chart_data_uri(filename)}" alt="{caption}" '
        f'style="width:100%;height:auto"><figcaption>{caption}</figcaption></figure>'
        for filename, caption in diagrams
    ) + '</div>'

    html_doc = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WARDLINE INDIA v{RELEASE_VERSION} — Complete Project Handbook</title>
<style>
  :root {{
    --canvas: #EFEBE0; --surface: #F6F3EA; --ink: #1E2622; --muted: #4F5A53;
    --border: #C9C5B8; --accent: #F2662B; --accent-text: #B84212; --on-accent: #1E2622;
    --nav: #1E2622; --nav-ink: #EFEBE0;
  }}
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; background: var(--canvas); color: var(--ink); font-family: 'Archivo', system-ui, -apple-system, 'Segoe UI', sans-serif; font-size: 15px; line-height: 1.6; }}
  .tabular {{ font-variant-numeric: tabular-nums; }}
  .layout {{ display: grid; grid-template-columns: 270px minmax(0, 1fr); min-height: 100vh; }}
  .sidebar {{ position: sticky; top: 0; height: 100vh; overflow-y: auto; background: var(--nav); color: var(--nav-ink); padding: 22px 16px; }}
  .brand {{ font-family: 'Anton', Impact, sans-serif; font-size: 28px; letter-spacing: 0.03em; line-height: 1; }}
  .brand-sub {{ color: var(--accent); font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; font-weight: 700; margin: 6px 0 14px; display: block; }}
  .toc-search {{ width: 100%; padding: 8px 10px; border: 1px solid #39443E; background: #2A342E; color: var(--nav-ink); border-radius: 2px; margin-bottom: 12px; font-size: 13px; }}
  .toc-link {{ display: block; color: var(--nav-ink); text-decoration: none; padding: 6px 8px; font-size: 12.5px; border-radius: 2px; opacity: 0.88; }}
  .toc-link:hover {{ background: rgba(255,255,255,0.08); opacity: 1; }}
  .main {{ max-width: 1140px; width: 100%; min-width: 0; margin: 0 auto; padding: 28px 36px 64px; overflow-wrap: anywhere; }}
  .hero {{ border-bottom: 2px solid var(--ink); padding-bottom: 18px; margin-bottom: 24px; }}
  .eyebrow {{ font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); font-weight: 700; }}
  h1 {{ font-family: 'Anton', Impact, sans-serif; font-weight: 400; font-size: clamp(34px, 4.5vw, 56px); line-height: 1; text-transform: uppercase; margin: 8px 0 10px; }}
  h2 {{ font-size: 22px; margin: 34px 0 10px; padding-bottom: 6px; border-bottom: 2px solid var(--ink); }}
  h3 {{ font-size: 16px; margin: 14px 0 8px; color: var(--accent-text); }}
  .panel {{ background: var(--surface); border: 1px solid var(--border); padding: 18px; margin: 14px 0; border-radius: 2px; }}
  .callout {{ background: #E6E1D3; border-left: 3px solid var(--accent); padding: 12px 16px; margin: 14px 0; font-size: 13.5px; }}
  .btn {{ background: var(--surface); color: var(--ink); border: 1px solid var(--border); padding: 7px 12px; border-radius: 2px; cursor: pointer; font-size: 13px; font-weight: 600; }}
  .btn.primary {{ background: var(--accent); color: var(--on-accent); border-color: var(--accent); }}
  .controls {{ display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 10px 0; }}
  select, input[type="search"], input[type="number"], input[type="range"] {{ max-width: 100%; padding: 6px 10px; border: 1px solid var(--border); background: var(--surface); color: var(--ink); border-radius: 2px; font-size: 13px; }}
  #chapter-search {{ flex: 1 1 18rem; min-width: 0; }}
  #dict-search {{ width: min(100%, 300px); }}
  table {{ width: 100%; border-collapse: collapse; font-size: 13px; margin: 10px 0; }}
  th, td {{ text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }}
  th {{ background: var(--ink); color: var(--canvas); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }}
  .table-wrap {{ overflow-x: auto; border: 1px solid var(--border); }}
  #h04 table {{ min-width: 43rem; }}
  #h05 table {{ min-width: 44rem; }}
  #h05 th, #h05 td {{ white-space: nowrap; }}
  pre {{ background: var(--ink); color: var(--canvas); padding: 14px; border-radius: 2px; overflow-x: auto; font-size: 12.5px; position: relative; }}
  .copy-btn {{ position: absolute; top: 8px; right: 8px; background: var(--accent); color: var(--on-accent); border: 0; padding: 4px 8px; font-size: 11px; font-weight: 700; cursor: pointer; border-radius: 2px; }}
  .kpi-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(175px, 1fr)); gap: 14px; margin: 14px 0; }}
  .kpi {{ border-bottom: 1px solid var(--border); padding-bottom: 10px; }}
  .kpi-val {{ font-family: 'Anton', Impact, sans-serif; font-size: 30px; line-height: 1.05; }}
  .demo-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 310px), 1fr)); gap: 16px; }}
  .viva-card {{ border: 1px solid var(--border); background: var(--surface); padding: 14px; margin: 10px 0; border-radius: 2px; }}
  .badge {{ display: inline-block; padding: 2px 7px; font-size: 10.5px; font-weight: 700; text-transform: uppercase; background: #E6E1D3; border: 1px solid var(--border); border-radius: 2px; }}
  .badge.orange {{ background: var(--accent); color: var(--on-accent); border-color: var(--accent); }}
  details summary {{ cursor: pointer; font-weight: 700; padding: 6px 0; }}
  @media (max-width: 900px) {{ .layout {{ grid-template-columns: minmax(0, 1fr); }} .sidebar {{ position: static; height: auto; }} .main {{ padding: 20px 16px; }} }}
  @media print {{ .sidebar, .controls, .copy-btn, #global-search-bar {{ display: none !important; }} .layout {{ display: block; }} body {{ background: #fff; color: #000; font-size: 10.5pt; }} .panel {{ break-inside: avoid; border: 1px solid #999; }} }}
</style>
</head>
<body>
<div class="layout">
  <aside class="sidebar" aria-label="Handbook Navigation">
    <div class="brand">WARDLINE.</div>
    <span class="brand-sub">COMPLETE HANDBOOK · v{RELEASE_VERSION}</span>
    <input type="search" id="toc-filter" class="toc-search" placeholder="Filter chapters (H01–H18)..." aria-label="Filter chapters">
    <nav id="toc-list">
      <a class="toc-link" href="#h01">H01 · Project Fundamentals</a>
      <a class="toc-link" href="#h02">H02 · Healthcare Terminology</a>
      <a class="toc-link" href="#h03">H03 · Dataset Encyclopedia</a>
      <a class="toc-link" href="#h04">H04 · Searchable Data Dictionary</a>
      <a class="toc-link" href="#h05">H05 · 22,848-Row Explorer</a>
      <a class="toc-link" href="#h06">H06 · Python Data Pipeline</a>
      <a class="toc-link" href="#h07">H07 · Exploratory Data Analysis</a>
      <a class="toc-link" href="#h08">H08 · Every Graph Explained</a>
      <a class="toc-link" href="#h09">H09 · AI &amp; Forecasting</a>
      <a class="toc-link" href="#h10">H10 · Frontend Engineering</a>
      <a class="toc-link" href="#h11">H11 · Software Architecture</a>
      <a class="toc-link" href="#h12">H12 · Formulas &amp; Worked Math</a>
      <a class="toc-link" href="#h13">H13 · Testing &amp; Verification</a>
      <a class="toc-link" href="#h14">H14 · Research Findings</a>
      <a class="toc-link" href="#h15">H15 · Install &amp; Operation</a>
      <a class="toc-link" href="#h16">H16 · 105 Viva Questions</a>
      <a class="toc-link" href="#h17">H17 · 3-Person Study Guide</a>
      <a class="toc-link" href="#h18">H18 · Glossary &amp; Revision</a>
      <a class="toc-link" href="#demos">Interactive Lab</a>
    </nav>
  </aside>

  <main class="main">
    <header class="hero">
      <div class="eyebrow">WARDLINE INDIA project study guide · Baseline {html.escape(BASELINE_RELEASE)} → Release {html.escape(CURRENT_RELEASE)} (HEAD {html.escape(head_sha)})</div>
      <h1>WARDLINE INDIA Complete Handbook.</h1>
      <p>Offline guide with 18 chapters, eight interactive demonstrations, three architecture diagrams, a 17-field schema dictionary, all <strong>{stats['total_rows']:,}</strong> normalized HMIS derivative observations and <strong>{len(viva)}</strong> viva questions.</p>
      <div id="global-search-bar" class="controls">
        <input type="search" id="chapter-search" aria-label="Search chapter text" placeholder="Search chapter text (e.g. Ridge, fixed cohort, WAPE)">
        <button class="btn primary" onclick="window.print()">Print / Save PDF</button>
      </div>
      <div id="chapter-search-status" class="eyebrow"></div>
    </header>

    <section id="h01" class="chapter">
      <h2>H01 · Project Fundamentals &amp; Exact Status Breakdown</h2>
      <div class="kpi-grid tabular">
        <div class="kpi"><div class="kpi-val">{stats['total_rows']:,}</div><div class="eyebrow">Normalized Rows</div></div>
        <div class="kpi"><div class="kpi-val">{stats['observed']:,}</div><div class="eyebrow">Observed (97.58%)</div></div>
        <div class="kpi"><div class="kpi-val">{stats['not_reported']:,}</div><div class="eyebrow">Not Reported (&lt;90% Gate)</div></div>
        <div class="kpi"><div class="kpi-val">{stats['missing']:,}</div><div class="eyebrow">Missing (Source Blank)</div></div>
        <div class="kpi"><div class="kpi-val">{stats['unavailable']:,}</div><div class="eyebrow">Combined Unavailable</div></div>
      </div>
      <div class="callout">
        <strong>Assigned Topic vs. Verified Scope:</strong> The assigned topic is <em>"Analysis of Hospital Admission Data for Identifying Patient Trends and Seasonal Healthcare Demand Patterns."</em> Because the verified Zenodo MoHFW HMIS derivative covers 7 essential service-utilization indicators and does not include general all-cause Inpatient Department (IPD) admissions or patient-level demographics—and independent acquisition attempts for compatible multi-year IPD tables were unsuccessful—WARDLINE INDIA explicitly withholds General IPD without fabricating synthetic data or substituting OPD for IPD. Academic scope approval remains a separate faculty decision.
      </div>
    </section>

    <section id="h02" class="chapter">
      <h2>H02 · Healthcare Terminology</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Term</th><th>Clinical / Administrative Meaning</th><th>Verified Derivative Status</th></tr></thead>
        <tbody>
          <tr><td><strong>IPD (Inpatient)</strong></td><td>Overnight hospital admissions occupying ward or ICU beds</td><td>Absent from verified derivative; explicitly withheld as Unavailable</td></tr>
          <tr><td><strong>OPD (<code>opd</code>)</strong></td><td>Outpatient Attendance (Allopathic + AYUSH) — ambulatory visits</td><td>3,264 expected cells including unavailable values</td></tr>
          <tr><td><strong>Institutional Deliveries (<code>inst_del</code>)</strong></td><td>Childbirths conducted in public &amp; reporting private facilities (incl. C-sections)</td><td>3,264 expected cells including unavailable values</td></tr>
          <tr><td><strong>ANC Registrations (<code>anc_reg</code>)</strong></td><td>Pregnant women registered for antenatal care</td><td>3,264 expected cells including unavailable values</td></tr>
          <tr><td><strong>Under-5 Diarrhoea (<code>diarr_u5</code>)</strong></td><td>Childhood diarrhoeal cases treated</td><td>3,264 expected cells including unavailable values</td></tr>
          <tr><td><strong>Immunization (<code>penta3</code>, <code>mcv1</code>, <code>fic</code>)</strong></td><td>Pentavalent-3, Measles/MR 1st Dose, Fully Immunised Children. The derivative maps Measles/MR 1st Dose from E1 ages 0–11 months and E2 ages 9–11 months.</td><td>9,792 expected cells including unavailable values</td></tr>
        </tbody>
      </table></div>
    </section>

    <section id="h03" class="chapter">
      <h2>H03 · Dataset Encyclopedia</h2>
      <div class="panel">
        <p><strong>Upstream Government Attribution:</strong> {html.escape(BUNDLE['source']['attribution'])}</p>
        <p><strong>Harmonised Zenodo Derivative:</strong> Siddalingaiah, H S (2026), <em>El Niño and essential health services in India</em> (v1.0.1) · DOI: <code>10.5281/zenodo.23657569</code> · License: CC BY 4.0 (data), MIT (code) · Raw ZIP SHA-256: <code class="tabular">{html.escape(BUNDLE['source']['raw_sha256'])}</code></p>
        <p><strong>Exact Observation Status Accounting (FINAL-05):</strong> <code>{stats['observed']:,}</code> observed + <code>{stats['not_reported']:,}</code> completeness-threshold masked (<code>not_reported</code>, district completeness &lt;90%) + <code>{stats['missing']:,}</code> source-blank (<code>missing</code>) = <code>{stats['unavailable']:,}</code> combined unavailable out of <code>{stats['total_rows']:,}</code> total rows.</p>
        <p><strong>Reporting Unit Harmonization (34 Units):</strong> <code>AP_TG</code> (Andhra Pradesh + Telangana), <code>JK</code> (J&amp;K + Ladakh), and <code>DNH_DD</code> (Dadra &amp; Nagar Haveli + Daman &amp; Diu) pooled across 2012–2020.</p>
      </div>
    </section>

    <section id="h04" class="chapter">
      <h2>H04 · Searchable Student-Friendly Data Dictionary (17 Contract Fields)</h2>
      <div class="controls"><input type="search" id="dict-search" aria-label="Search data dictionary" placeholder="Search data dictionary fields, units or rules"></div>
      <div class="table-wrap" role="region" aria-label="Data dictionary table" tabindex="0"><table>
        <thead><tr><th>Field</th><th>Type</th><th>Purpose &amp; Meaning</th><th>Sample</th><th>Permitted Values / Units</th><th>Validation &amp; Missing Rule</th></tr></thead>
        <tbody id="dict-tbody"></tbody>
      </table></div>
    </section>

    <section id="h05" class="chapter">
      <h2>H05 · Complete 22,848-Observation Explorer (Expanded Offline Archive)</h2>
      <p>Inspect every normalized row with original monthly value, calendar-day normalized daily rate, indicator unit, reporting status (<code>observed</code>, <code>not_reported</code> [&lt;90% gate], <code>missing</code>), and full <code>hmis_state_month.csv:row_N</code> locator. <em>Provenance note:</em> locators trace to the verified Zenodo state-month CSV; raw facility-level MoHFW portal registers are not embedded in the public archive.</p>
      <div class="controls">
        <select id="obs-geo"><option value="">All 34 Geographies</option>{geo_options}</select>
        <select id="obs-ind"><option value="">All 7 Indicators</option>{ind_options}</select>
        <select id="obs-status">
          <option value="">All Statuses ({stats['total_rows']:,})</option>
          <option value="observed">observed ({stats['observed']:,})</option>
          <option value="not_reported">not_reported / &lt;90% masked ({stats['not_reported']:,})</option>
          <option value="missing">missing / source blank ({stats['missing']:,})</option>
        </select>
        <input type="search" id="obs-q" placeholder="Period (2019-10), value, or row_locator...">
        <span id="obs-count" class="badge orange tabular">{stats['total_rows']:,} matching rows</span>
      </div>
      <div class="table-wrap" role="region" aria-label="Observation results table" tabindex="0"><table>
        <thead><tr><th>Period</th><th>Geo ID</th><th>Indicator</th><th>Original Value</th><th>Daily Rate</th><th>Unit</th><th>Status</th><th>Full Source Locator</th></tr></thead>
        <tbody id="obs-tbody" class="tabular"></tbody>
      </table></div>
      <div class="controls">
        <button class="btn" id="obs-prev">← Previous 50</button>
        <span id="obs-page-info" class="tabular">Page 1</span>
        <button class="btn" id="obs-next">Next 50 →</button>
      </div>
    </section>

    <section id="h06" class="chapter">
      <h2>H06 · Python Data Pipeline (Complete Module-by-Module Breakdown)</h2>
      {py_cards_html}
    </section>

    <section id="h07" class="chapter">
      <h2>H07 · Exploratory Data Analysis &amp; Fixed-Cohort Accounting (FINAL-06)</h2>
      <div class="panel">
        <p><strong>Institutional Deliveries (<code>inst_del</code>) Coverage Verified Dynamically:</strong> Across <strong>{stats['inst_del_units']}</strong> possible harmonized reporting units and 96 months, <strong>{stats['inst_del_complete_months']}</strong> months have complete 34-unit reporting, <strong>{stats['inst_del_partial_months']}</strong> months have partial reporting, and <strong>{stats['inst_del_fixed_cohort_units']}</strong> units belong to the fixed cohort (96/96 contiguous observed months). Fixed-cohort national aggregates and forecasts cover those 29 continuously reporting units only — they are <strong>not</strong> complete 34-unit nationwide forecasts.</p>
        <p><strong>Mathematically Valid Fixed-Cohort Illustration:</strong> If 29 fixed-cohort units contribute <code>80 → 81 → 82</code> across 3 months while 5 intermittent units contribute <code>20 → [masked] → 20</code>, variable-coverage totals show <code>100 → 81 → 102</code> (a false −19% drop in Month 2), whereas the fixed cohort satisfies <code>Fixed Cohort ≤ Variable Total</code> in every month (<code>80 ≤ 100</code>, <code>81 ≤ 81</code>, <code>82 ≤ 102</code>) and preserves true upward movement.</p>
      </div>
      {charts_gallery_html}
    </section>

    <section id="h08" class="chapter">
      <h2>H08 · Every Frontend Visualization Explained (V01–V09)</h2>
      {viz_cards_html}
    </section>

    <section id="h09" class="chapter">
      <h2>H09 · AI &amp; Forecasting (Practical Model Guide)</h2>
      <div class="panel">
        <p><strong>Evaluation Standard:</strong> <em>Chronologically validated, development-selected forecasting with retrospective evaluation</em> (never claimed as pristine unseen deployment or verified 2026 operational forecasts).</p>
        <ul>
          <li><strong>Seasonal Naive (<code>seasonal_naive</code>):</strong> <code>ŷ[t] = y[t−12]</code>. Zero fitted parameters; primary seasonal persistence benchmark.</li>
          <li><strong>Last-Value Naive (<code>last_value_naive</code>):</strong> <code>ŷ[t] = y[T_train]</code>. Flat persistence benchmark.</li>
          <li><strong>Ridge Regression (<code>ridge_seasonal_lag</code>):</strong> Uses time index, lags 1 and 12, 11 month indicators and the April 2017 regime flag. Training-only scaling and target centering precede the L2 solve with <code>α=10</code>. Predictions feed later lags.</li>
          <li><strong>Additive Holt-Winters (<code>additive_holt_winters</code>):</strong> Updates level, trend and a 12-month seasonal term with fixed coefficients <code>α=0.25, β=0.05, γ=0.25</code>.</li>
        </ul>
        <p class="tabular"><strong>Verified Fixed-Cohort Retrospective FY 2019–20 Test WAPE:</strong> <code>inst_del</code> (29 fixed units) Ridge <strong>{fc_in_inst["holdout_metrics"][fc_in_inst["selected_model"]]["wape_pct"]:.2f}%</strong> (vs {fc_in_inst["holdout_metrics"]["seasonal_naive"]["wape_pct"]:.2f}% Naive) · <code>opd</code> Holt-Winters <strong>{fc_in_opd["holdout_metrics"][fc_in_opd["selected_model"]]["wape_pct"]:.2f}%</strong> (vs {fc_in_opd["holdout_metrics"]["seasonal_naive"]["wape_pct"]:.2f}% Naive) · <code>anc_reg</code> Ridge <strong>{fc_in_anc["holdout_metrics"][fc_in_anc["selected_model"]]["wape_pct"]:.2f}%</strong> (vs {fc_in_anc["holdout_metrics"]["seasonal_naive"]["wape_pct"]:.2f}% Naive).</p>
      </div>
    </section>

    <section id="h10" class="chapter">
      <h2>H10 · Frontend Engineering &amp; Three.js WebGL2 Lifecycle</h2>
      <div class="panel">
        <p><strong>Core Architecture:</strong> React, TypeScript and Vite with <code>buildActiveDataset()</code> in <code>frontend/src/utils/activeDataset.ts</code> and lazy-loaded Three.js. Exact versions appear in <code>frontend/package-lock.json</code>.</p>
        <p><strong>WebGL2 Safety &amp; Cleanup:</strong> <code>detectWebGLCapability()</code> requires WebGL2; <code>webglcontextlost</code> triggers automatic 2D fallback; <code>IntersectionObserver</code> pauses off-screen rendering; unmount hooks dispose geometries, materials, OrbitControls, event listeners, and renderer.</p>
      </div>
    </section>

    <section id="h11" class="chapter">
      <h2>H11 · Complete Software Architecture (3 System Diagrams)</h2>
      <div class="panel">
        <div class="eyebrow">Diagram 1 · Python 6-Stage Data &amp; Contract Pipeline</div>
        <svg viewBox="0 0 860 105" style="width:100%;height:auto;display:block;margin:8px 0;" role="img" aria-label="Python 6-stage pipeline diagram">
          <rect x="6" y="18" width="128" height="66" fill="#1E2622" rx="2"/><text x="70" y="44" text-anchor="middle" fill="#F2662B" font-size="11" font-weight="700">1. acquire.py</text><text x="70" y="64" text-anchor="middle" fill="#EFEBE0" font-size="10.5">Zenodo + SHA-256</text>
          <path d="M136,51 L150,51" stroke="#F2662B" stroke-width="2.5"/>
          <rect x="152" y="18" width="128" height="66" fill="#1E2622" rx="2"/><text x="216" y="44" text-anchor="middle" fill="#F2662B" font-size="11" font-weight="700">2. normalize.py</text><text x="216" y="64" text-anchor="middle" fill="#EFEBE0" font-size="10.5">22,848 Long Rows</text>
          <path d="M282,51 L296,51" stroke="#F2662B" stroke-width="2.5"/>
          <rect x="298" y="18" width="128" height="66" fill="#1E2622" rx="2"/><text x="362" y="44" text-anchor="middle" fill="#F2662B" font-size="11" font-weight="700">3. validate.py</text><text x="362" y="64" text-anchor="middle" fill="#EFEBE0" font-size="10.5">Schema + 26 Checks</text>
          <path d="M428,51 L442,51" stroke="#F2662B" stroke-width="2.5"/>
          <rect x="444" y="18" width="128" height="66" fill="#1E2622" rx="2"/><text x="508" y="44" text-anchor="middle" fill="#F2662B" font-size="11" font-weight="700">4. analyze.py</text><text x="508" y="64" text-anchor="middle" fill="#EFEBE0" font-size="10.5">IMD + 29-Unit Cohort</text>
          <path d="M574,51 L588,51" stroke="#F2662B" stroke-width="2.5"/>
          <rect x="590" y="18" width="128" height="66" fill="#1E2622" rx="2"/><text x="654" y="44" text-anchor="middle" fill="#F2662B" font-size="11" font-weight="700">5. forecast.py</text><text x="654" y="64" text-anchor="middle" fill="#EFEBE0" font-size="10.5">Dev-CV Lock + P80</text>
          <path d="M720,51 L734,51" stroke="#F2662B" stroke-width="2.5"/>
          <rect x="736" y="18" width="118" height="66" fill="#F2662B" rx="2"/><text x="795" y="44" text-anchor="middle" fill="#1E2622" font-size="11" font-weight="700">6. publish.py</text><text x="795" y="64" text-anchor="middle" fill="#1E2622" font-size="10.5">JSON + SHA-256</text>
        </svg>
        <div class="eyebrow" style="margin-top:14px;">Diagram 2 · Application Startup, Active Dataset Isolation &amp; Export Pipeline</div>
        <svg viewBox="0 0 860 125" style="width:100%;height:auto;display:block;margin:8px 0;" role="img" aria-label="Browser startup, active dataset, visualization, and export pipeline">
          <rect x="6" y="14" width="175" height="44" fill="#1E2622" rx="2"/><text x="93" y="40" text-anchor="middle" fill="#EFEBE0" font-size="11">Official HMIS JSON Bundle</text>
          <rect x="6" y="70" width="175" height="44" fill="#4F5A53" rx="2"/><text x="93" y="96" text-anchor="middle" fill="#EFEBE0" font-size="11">User CSV (DEF-09/10 Guard)</text>
          <path d="M183,36 L220,62 M183,92 L220,62" stroke="#F2662B" stroke-width="2"/>
          <rect x="222" y="28" width="185" height="68" fill="#1E2622" rx="2"/><text x="314" y="55" text-anchor="middle" fill="#F2662B" font-size="11.5" font-weight="700">buildActiveDataset()</text><text x="314" y="75" text-anchor="middle" fill="#EFEBE0" font-size="10.5">Official vs Imported Isolation</text>
          <path d="M409,62 L442,62" stroke="#F2662B" stroke-width="2.5"/>
          <rect x="444" y="14" width="190" height="44" fill="#F6F3EA" stroke="#1E2622" stroke-width="1.5" rx="2"/><text x="539" y="40" text-anchor="middle" fill="#1E2622" font-size="11">2D SVG Charts (V02/V04–V09)</text>
          <rect x="444" y="70" width="190" height="44" fill="#1E2622" rx="2"/><text x="539" y="96" text-anchor="middle" fill="#F2662B" font-size="11">Lazy Three.js WebGL2 (V01/V02)</text>
          <path d="M636,36 L672,62 M636,92 L672,62" stroke="#F2662B" stroke-width="2"/>
          <rect x="674" y="28" width="180" height="68" fill="#F2662B" rx="2"/><text x="764" y="55" text-anchor="middle" fill="#1E2622" font-size="11.5" font-weight="700">VizFrame Exports</text><text x="764" y="75" text-anchor="middle" fill="#1E2622" font-size="10.5">CSV / SVG (2D) / PNG + Stamp</text>
        </svg>
        <div class="eyebrow" style="margin-top:14px;">Diagram 3 · Chronologically Validated, Development-Selected Forecasting Protocol</div>
        <svg viewBox="0 0 860 95" style="width:100%;height:auto;display:block;margin:8px 0;" role="img" aria-label="Chronological rolling-origin CV and retrospective evaluation timeline">
          <rect x="10" y="20" width="380" height="24" fill="#1E2622"/><text x="200" y="36" text-anchor="middle" fill="#EFEBE0" font-size="10.5">Fold 1 Train (2012-04 .. 2017-03 · 60m)</text>
          <rect x="394" y="20" width="130" height="24" fill="#B84212"/><text x="459" y="36" text-anchor="middle" fill="#EFEBE0" font-size="10.5">Fold 1 Val (FY17-18)</text>
          <rect x="10" y="52" width="514" height="24" fill="#1E2622"/><text x="267" y="68" text-anchor="middle" fill="#EFEBE0" font-size="10.5">Fold 2 Train (2012-04 .. 2018-03 · 72m)</text>
          <rect x="528" y="52" width="130" height="24" fill="#B84212"/><text x="593" y="68" text-anchor="middle" fill="#EFEBE0" font-size="10.5">Fold 2 Val (FY18-19)</text>
          <line x1="664" y1="10" x2="664" y2="86" stroke="#F2662B" stroke-width="3" stroke-dasharray="5,3"/>
          <rect x="672" y="20" width="178" height="56" fill="#F2662B" rx="2"/><text x="761" y="44" text-anchor="middle" fill="#1E2622" font-size="11" font-weight="700">LOCKED MODEL TEST</text><text x="761" y="62" text-anchor="middle" fill="#1E2622" font-size="10">FY 2019–20 Retrospective</text>
        </svg>
      </div>
    </section>

    <section id="h12" class="chapter">
      <h2>H12 · Mathematics &amp; Formulas Reference (With Worked Calculations)</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Formula</th><th>Equation</th><th>Worked Calculation &amp; Edge-Case Guard</th></tr></thead>
        <tbody class="tabular">
          <tr><td><strong>Mean Daily Rate</strong></td><td><code>r(t) = V(t) / D(y, m)</code></td><td>Punjab 2019-10 <code>inst_del</code> gives <code>35,998 / 31 = 1,161.23/day</code>. February 2020 uses 29 days.</td></tr>
          <tr><td><strong>YoY % Change</strong></td><td><code>100 × (V(t) − V(t−12)) / V(t−12)</code></td><td>Strictly suppressed (<code>null</code>) whenever <code>V(t−12) ≤ 0</code> or unavailable</td></tr>
          <tr><td><strong>12m Rolling Mean</strong></td><td><code>(1/12) Σ V(t−k)</code> for <code>k=0..11</code></td><td>Requires 12 consecutive observed calendar months; any gap forces <code>null</code></td></tr>
          <tr><td><strong>WAPE (%)</strong></td><td><code>100 × Σ|y − ŷ| / Σ|y|</code></td><td>Actuals <code>[100,0,100]</code>, preds <code>[95,5,100]</code> → <code>10/200 = 5.00%</code> (zero-safe vs MAPE)</td></tr>
          <tr><td><strong>Ridge Objective</strong></td><td><code>min ||y_c − X_s w||₂² + α||w||₂²</code></td><td>Uses 15 predictors. Training statistics standardize <code>X_s</code> and center <code>y_c</code>. Add the training target mean back to predictions.</td></tr>
          <tr><td><strong>Tukey IQR Fences</strong></td><td><code>Q25 − 1.5·IQR</code> to <code>Q75 + 1.5·IQR</code></td><td>Switches automatically to raw dot-plot whenever <code>n &lt; 4</code> observations</td></tr>
          <tr><td><strong>3D Bar Height</strong></td><td><code>H = (V(t) / V_max) × 5.4</code></td><td>Observed <code>0 → H = 0</code> (flat marker); Missing → <code>null</code>; <code>1500/3000 → 2.700</code></td></tr>
        </tbody>
      </table></div>
    </section>

    <section id="h13" class="chapter">
      <h2>H13 · Testing &amp; Research Verification</h2>
      <p>The test suite covers data and forecasting, the production build, and browser exercises. See the project testing guide for commands and coverage.</p>
    </section>

    <section id="h14" class="chapter">
      <h2>H14 · Complete Verified Research Findings</h2>
      <ul class="tabular">
        <li><strong>Institutional Deliveries (<code>inst_del</code>):</strong> Punjab 8-yr sum <code>{fmt_in(pb_inst['total_8yr'])}</code>; Bihar 8-yr sum <code>{fmt_in(br_inst['total_8yr'])}</code>.</li>
        <li><strong>Outpatient Attendance (<code>opd</code>):</strong> Punjab 8-yr sum <code>{fmt_in(pb_opd['total_8yr'])}</code>; Bihar 8-yr sum <code>{fmt_in(br_opd['total_8yr'])}</code>.</li>
        <li><strong>Calendar Normalization &amp; Coverage:</strong> Eliminates the ~9.7% false 28-day February dip; distinguishes <code>{stats['inst_del_complete_months']}</code> complete 34-unit months vs <code>{stats['inst_del_partial_months']}</code> partial months and <code>{stats['inst_del_fixed_cohort_units']}</code> fixed-cohort units for <code>inst_del</code>.</li>
        <li><strong>March 2020 Discontinuity:</strong> Coincides with India's 25 March 2020 national lockdown at the end of FY 2019–20.</li>
      </ul>
    </section>

    <section id="h15" class="chapter">
      <h2>H15 · Windows PowerShell Installation &amp; Operation (Runnable vs Source)</h2>
      <pre><button class="copy-btn" aria-live="polite" onclick="copyCode(this)">Copy</button><code># A. STANDALONE RUNNABLE ARCHIVE (static serving)
Expand-Archive -Path .\WARDLINE-INDIA-v{RELEASE_VERSION}-runnable.zip -DestinationPath .\wardline-v{RELEASE_VERSION}
cd .\wardline-v{RELEASE_VERSION}\app
python -m http.server 4173

# B. RESEARCH-SOURCE ARCHIVE (run from the extracted source root)
python -m unittest discover -s tests -v</code></pre>
    </section>

    <section id="demos" class="chapter">
      <h2>Interactive Educational Lab</h2>
      <div class="demo-grid">
        <div class="panel">
          <div class="eyebrow">Demo 1 · Monthly vs Daily Normalization (Educational Fixture)</div>
          <p>Compare 2,800 events in Feb (28d) vs 3,100 events in Mar (31d):</p>
          <div class="controls"><button class="btn primary" onclick="setDemo1('raw')">Raw Monthly</button><button class="btn" onclick="setDemo1('daily')">Daily Rate</button></div>
          <div id="demo1-out" class="callout tabular"></div>
        </div>
        <div class="panel">
          <div class="eyebrow">Demo 2 · Missing vs Observed Zero (Educational Fixture)</div>
          <p>Series: Month 1 = 100, Month 2 = [toggle], Month 3 = 100:</p>
          <div class="controls"><button class="btn primary" onclick="setDemo2('missing')">Month 2 = MISSING</button><button class="btn" onclick="setDemo2('zero')">Month 2 = 0</button></div>
          <div id="demo2-out" class="callout tabular"></div>
        </div>
        <div class="panel">
          <div class="eyebrow">Demo 3 &amp; 4 · Coverage &amp; Valid Fixed Cohort (FINAL-06)</div>
          <p>29 fixed units (80→81→82) + 5 intermittent units (20→masked→20):</p>
          <div class="controls"><button class="btn primary" onclick="setDemo3('raw')">Variable Coverage Sum</button><button class="btn" onclick="setDemo3('fixed')">Fixed Cohort (29 Constant Units)</button></div>
          <div id="demo3-out" class="callout tabular"></div>
        </div>
        <div class="panel">
          <div class="eyebrow">Demo 5 · IMD Seasonal Classifier (Real Month Lookup)</div>
          <div class="controls">
            <select id="demo5-mo" onchange="updateDemo5()">
              <option value="1">January</option><option value="2">February</option><option value="3">March</option>
              <option value="4">April</option><option value="5">May</option><option value="6">June</option>
              <option value="7">July</option><option value="8" selected>August</option><option value="9">September</option>
              <option value="10">October</option><option value="11">November</option><option value="12">December</option>
            </select>
          </div>
          <div id="demo5-out" class="callout tabular"></div>
        </div>
        <div class="panel">
          <div class="eyebrow">Demo 6 · MAE &amp; WAPE Calculator (Educational Fixture)</div>
          <label>Error magnitude (±): <input type="range" id="demo6-err" min="0" max="40" value="10" oninput="updateDemo6()"></label>
          <div id="demo6-out" class="callout tabular"></div>
        </div>
        <div class="panel">
          <div class="eyebrow">Demo 7 &amp; 9 · Chronological CV &amp; Retrospective Evaluation</div>
          <div class="controls">
            <select id="demo7-step" onchange="updateDemo7()">
              <option value="1">Fold 1: Train 2012-04..2017-03 → Val 2017-04..2018-03</option>
              <option value="2">Fold 2: Train 2012-04..2018-03 → Val 2018-04..2019-03</option>
              <option value="3">Lock Best Dev-CV Model (Before Touching Test)</option>
              <option value="4" selected>Test: Evaluate FY 2019-20 (Retrospective)</option>
            </select>
          </div>
          <div id="demo7-out" class="callout"></div>
        </div>
        <div class="panel">
          <div class="eyebrow">Demo 8 · Data-to-3D Coordinate Mapper (DEF-14 Exact)</div>
          <label>Value (V): <input type="number" id="demo8-v" value="1500" min="0" max="3000" oninput="updateDemo8()"></label>
          <label>Max (V_max): <input type="number" id="demo8-max" value="3000" min="1" oninput="updateDemo8()"></label>
          <div id="demo8-out" class="callout tabular"></div>
        </div>
        <div class="panel">
          <div class="eyebrow">Demo 10 · Regional Volumes and Calendar-Day Rates (Punjab and Bihar)</div>
          <div class="controls"><button class="btn primary" onclick="setDemo10('raw')">Raw FY19–20 Volume</button><button class="btn" onclick="setDemo10('rate')">Mean Daily Count</button></div>
          <div id="demo10-out" class="callout tabular"></div>
        </div>
      </div>
    </section>

    <section id="h16" class="chapter">
      <h2>H16 · Complete Viva Preparation Bank ({len(viva)} Questions)</h2>
      <div class="controls">
        <select id="viva-cat"><option value="">All 15 Topics</option></select>
        <select id="viva-diff">
          <option value="">All Difficulty Levels</option>
          <option value="Basic">Basic</option><option value="Intermediate">Intermediate</option>
          <option value="Advanced">Advanced</option><option value="Professor Cross-Question">Professor Cross-Question</option>
        </select>
        <button class="btn" onclick="revealAllViva(true)">Reveal All</button>
        <button class="btn" onclick="revealAllViva(false)">Hide All</button>
        <span id="viva-count" class="badge orange tabular">{len(viva)} questions</span>
      </div>
      <div id="viva-list"></div>
    </section>

    <section id="h17" class="chapter">
      <h2>H17 · Three-Person Team Preparation Guide</h2>
      <div class="demo-grid">
        <div class="panel"><h3>Teammate 1 · Data &amp; Scope</h3><p>Owns Zenodo DOI/SHA-256 provenance, GODL-India &amp; CC BY 4.0 licensing, 34-unit boundary harmonization, exact status split ({stats['observed']:,}/{stats['not_reported']:,}/{stats['missing']:,}), and honest IPD scope note.</p></div>
        <div class="panel"><h3>Teammate 2 · Analytics &amp; AI</h3><p>Owns daily-rate normalization, IMD seasonal bins, fixed-cohort accounting ({stats['inst_del_complete_months']} complete / {stats['inst_del_partial_months']} partial / {stats['inst_del_fixed_cohort_units']} fixed), Ridge/Holt-Winters/Seasonal Naive math, chronologically validated Dev-CV locking, and WAPE/MAE.</p></div>
        <div class="panel"><h3>Teammate 3 · Frontend, 3D &amp; QA</h3><p>Owns React active-dataset engine, V01–V09 encodings, lazy Three.js 0.170.0 zero-baseline geometry &amp; GPU disposal, WebGL2 context-loss fallback, WCAG contrast, and Windows Playwright QA.</p></div>
      </div>
      <div class="callout"><strong>Common Core (All 3 Teammates):</strong> Exact CSE276 topic, why IPD is withheld rather than fabricated, why 2012–2020 retrospective evaluations are not 2026 operational forecasts, and the 5-minute Presentation Mode walkthrough.</div>
    </section>

    <section id="h18" class="chapter">
      <h2>H18 · Glossary &amp; Rapid Revision Checklist</h2>
      <div class="panel">
        <label><input type="checkbox"> State assigned CSE276 CA1 topic verbatim and explain narrower verified HMIS scope</label><br>
        <label><input type="checkbox"> Cite exact status breakdown: {stats['observed']:,} observed, {stats['not_reported']:,} not_reported (&lt;90% gate), {stats['missing']:,} missing ({stats['unavailable']:,} unavailable)</label><br>
        <label><input type="checkbox"> Explain inst_del coverage: {stats['inst_del_units']} units, {stats['inst_del_complete_months']} complete months, {stats['inst_del_partial_months']} partial months, {stats['inst_del_fixed_cohort_units']} fixed-cohort units</label><br>
        <label><input type="checkbox"> Use exact phrasing: chronologically validated, development-selected forecasting with retrospective evaluation</label><br>
        <label><input type="checkbox"> Demo V04 Clock, V01 3D Terrain (Orthographic + 2D fallback), V02 Regional Comparison Matrix, and CA1 Presentation Mode</label>
      </div>
    </section>
  </main>
</div>

<script id="obs-data" type="application/json">{obs_json}</script>
<script id="unit-map" type="application/json">{unit_map_json}</script>
<script id="viva-data" type="application/json">{viva_json}</script>
<script id="dict-data" type="application/json">{dict_json}</script>
<script>
const OBS = JSON.parse(document.getElementById('obs-data').textContent);
const UNIT_MAP = JSON.parse(document.getElementById('unit-map').textContent);
const VIVA = JSON.parse(document.getElementById('viva-data').textContent);
const DICT = JSON.parse(document.getElementById('dict-data').textContent);

function daysInMonth(p) {{
  const y = parseInt(p.slice(0,4), 10), m = parseInt(p.slice(5,7), 10);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}}

function renderDict() {{
  const q = document.getElementById('dict-search').value.toLowerCase();
  const rows = DICT.filter(d => !q || (d.name + d.type + d.meaning + d.allowed + d.rule).toLowerCase().includes(q));
  document.getElementById('dict-tbody').innerHTML = rows.map(d =>
    `<tr><td><code>${{d.name}}</code></td><td>${{d.type}}</td><td>${{d.meaning}}</td><td><code>${{d.rep}}</code></td><td>${{d.allowed}}</td><td>${{d.missing}} · ${{d.rule}}</td></tr>`
  ).join('');
}}
document.getElementById('dict-search').addEventListener('input', renderDict);
renderDict();

let obsPage = 0;
const PAGE_SIZE = 50;
function getFilteredObs() {{
  const g = document.getElementById('obs-geo').value;
  const ind = document.getElementById('obs-ind').value;
  const st = document.getElementById('obs-status').value;
  const q = document.getElementById('obs-q').value.trim().toLowerCase();
  return OBS.filter(r =>
    (!g || r[1] === g) && (!ind || r[2] === ind) && (!st || r[4] === st) &&
    (!q || r[0].includes(q) || String(r[3]).includes(q) || r[5].toLowerCase().includes(q))
  );
}}
function renderObs() {{
  const filtered = getFilteredObs();
  const maxPage = Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1);
  if (obsPage > maxPage) obsPage = maxPage;
  const slice = filtered.slice(obsPage * PAGE_SIZE, (obsPage + 1) * PAGE_SIZE);
  document.getElementById('obs-count').textContent = `${{filtered.length.toLocaleString('en-IN')}} matching rows`;
  document.getElementById('obs-page-info').textContent = `Page ${{obsPage + 1}} of ${{maxPage + 1}}`;
  document.getElementById('obs-tbody').innerHTML = slice.map(r => {{
    const d = daysInMonth(r[0]);
    const rate = r[3] !== null ? (r[3] / d).toFixed(2) : '—';
    const val = r[3] !== null ? r[3].toLocaleString('en-IN') : '—';
    const unit = UNIT_MAP[r[2]] || 'count';
    return `<tr><td>${{r[0]}}</td><td><strong>${{r[1]}}</strong></td><td><code>${{r[2]}}</code></td><td>${{val}}</td><td>${{rate}}/day</td><td>${{unit}}</td><td>${{r[4]}}</td><td><code>${{r[5]}}</code></td></tr>`;
  }}).join('');
}}
['obs-geo','obs-ind','obs-status','obs-q'].forEach(id => document.getElementById(id).addEventListener('input', () => {{ obsPage = 0; renderObs(); }}));
document.getElementById('obs-prev').addEventListener('click', () => {{ if (obsPage > 0) {{ obsPage--; renderObs(); }} }});
document.getElementById('obs-next').addEventListener('click', () => {{ obsPage++; renderObs(); }});
renderObs();

const cats = Array.from(new Set(VIVA.map(v => v.cat)));
document.getElementById('viva-cat').innerHTML += cats.map(c => `<option value="${{c}}">${{c}}</option>`).join('');
function renderViva() {{
  const c = document.getElementById('viva-cat').value;
  const d = document.getElementById('viva-diff').value;
  const items = VIVA.filter(v => (!c || v.cat === c) && (!d || v.diff === d));
  document.getElementById('viva-count').textContent = `${{items.length}} questions`;
  document.getElementById('viva-list').innerHTML = items.map(v =>
    `<div class="viva-card"><div style="margin-bottom:6px;"><span class="badge">${{v.cat}}</span> <span class="badge orange">${{v.diff}}</span></div><details><summary>Q${{v.id}}. ${{v.q}}</summary><p style="margin:8px 0 0;">${{v.a}}</p></details></div>`
  ).join('');
}}
function revealAllViva(open) {{ document.querySelectorAll('#viva-list details').forEach(el => el.open = open); }}
['viva-cat','viva-diff'].forEach(id => document.getElementById(id).addEventListener('change', renderViva));
renderViva();

document.getElementById('toc-filter').addEventListener('input', e => {{
  const q = e.target.value.toLowerCase();
  document.querySelectorAll('#toc-list a').forEach(a => a.style.display = a.textContent.toLowerCase().includes(q) ? 'block' : 'none');
}});
document.getElementById('chapter-search').addEventListener('input', e => {{
  const q = e.target.value.trim().toLowerCase();
  let shown = 0;
  document.querySelectorAll('main section.chapter').forEach(sec => {{
    const match = !q || sec.textContent.toLowerCase().includes(q);
    sec.style.display = match ? 'block' : 'none';
    if (match) shown++;
  }});
  document.getElementById('chapter-search-status').textContent = q ? `Showing ${{shown}} matching chapters for "${{q}}"` : '';
}});

async function copyCode(btn) {{
  try {{
    await navigator.clipboard.writeText(btn.parentElement.querySelector('code').textContent);
    btn.textContent = 'Copied!';
  }} catch {{
    btn.textContent = 'Copy unavailable. Select the command.';
  }}
  setTimeout(() => btn.textContent = 'Copy', 3000);
}}

function setDemo1(m) {{
  document.getElementById('demo1-out').innerHTML = m === 'raw'
    ? 'Feb (28d): <strong>2,800</strong> vs Mar (31d): <strong>3,100</strong> → Appears as a false <strong>+10.7% March surge</strong>.'
    : 'Feb (28d): <strong>100.0/day</strong> vs Mar (31d): <strong>100.0/day</strong> → True daily demand is <strong>identical (0.0% change)</strong>.';
}}
function setDemo2(m) {{
  document.getElementById('demo2-out').innerHTML = m === 'missing'
    ? 'Mean = (100 + 100) / 2 = <strong>100.0</strong> (Month 2 excluded as missing).'
    : 'Mean = (100 + 0 + 100) / 3 = <strong>66.7</strong> (Observed zero lowers mean by 33.3%).';
}}
function setDemo3(m) {{
  document.getElementById('demo3-out').innerHTML = m === 'raw'
    ? 'M1 (34/34 units): <strong>100</strong> → M2 (29/34 units, 5 masked): <strong>81 (−19.0% artificial drop)</strong> → M3 (34/34): <strong>102</strong>.'
    : 'Fixed Cohort (29 constant units): M1: <strong>80</strong> (≤100) → M2: <strong>81</strong> (≤81, <strong>+1.25% true growth</strong>) → M3: <strong>82</strong> (≤102).';
}}
function updateDemo5() {{
  const m = Number(document.getElementById('demo5-mo').value);
  const s = m <= 2 ? 'Winter (Jan–Feb)' : m <= 5 ? 'Pre-Monsoon (Mar–May)' : m <= 9 ? 'SW Monsoon (Jun–Sep)' : 'Post-Monsoon (Oct–Dec)';
  document.getElementById('demo5-out').innerHTML = `Month ${{m}} → IMD Season: <strong>${{s}}</strong>`;
}}
function updateDemo6() {{
  const e = Number(document.getElementById('demo6-err').value);
  const act = [100, 120, 140, 110];
  const errs = act.map((_, i) => i % 2 === 0 ? e : Math.round(e * 0.7));
  const sumErr = errs.reduce((a,b) => a+b, 0), sumAct = act.reduce((a,b) => a+b, 0);
  document.getElementById('demo6-out').innerHTML = `MAE = <strong>${{(sumErr/4).toFixed(2)}}</strong> · WAPE = <strong>${{(sumErr/sumAct*100).toFixed(2)}}%</strong>`;
}}
function updateDemo7() {{
  const st = document.getElementById('demo7-step').value;
  const msgs = {{
    '1': 'Fold 1 trains on 60m (2012-04..2017-03) and validates on 12m (2017-04..2018-03). Retrospective test window untouched.',
    '2': 'Fold 2 expands to 72m (2012-04..2018-03) and validates on 12m (2018-04..2019-03). Retrospective test window untouched.',
    '3': 'The better of Ridge and Holt-Winters must strictly beat seasonal naive on pooled development MAE. The resulting model is locked before retrospective evaluation.',
    '4': 'Locked model evaluates FY 2019-20 (retrospective). All-India fixed-cohort (29 units) inst_del Ridge WAPE = {fc_in_inst["holdout_metrics"][fc_in_inst["selected_model"]]["wape_pct"]:.2f}%.',
  }};
  document.getElementById('demo7-out').textContent = msgs[st];
}}
function updateDemo8() {{
  const v = Number(document.getElementById('demo8-v').value), mx = Math.max(1, Number(document.getElementById('demo8-max').value));
  const h = v <= 0 ? 0 : (v / mx) * 5.4;
  document.getElementById('demo8-out').innerHTML = v <= 0
    ? '3D Height = <strong>0.000 units</strong> (flat zero marker — zero exaggeration).'
    : `Normalized = ${{(v/mx).toFixed(3)}} → 3D Prism Height = <strong>${{h.toFixed(3)}} units</strong> (max 5.4).`;
}}
function setDemo10(m) {{
  document.getElementById('demo10-out').innerHTML = m === 'raw'
    ? 'FY19–20 <code>inst_del</code>: Bihar <strong>{fmt_in(br_inst["fy2019_20_total"])}</strong> vs Punjab <strong>{fmt_in(pb_inst["fy2019_20_total"])}</strong> (raw volume).'
    : 'FY19–20 <code>inst_del</code> Mean daily count: Bihar <strong>{fmt_in(br_inst["fy2019_20_total"] / days_in_fy)} / day</strong> vs Punjab <strong>{fmt_in(pb_inst["fy2019_20_total"] / days_in_fy)} / day</strong> across {days_in_fy} calendar days.';
}}
setDemo1('raw'); setDemo2('missing'); setDemo3('raw'); updateDemo5(); updateDemo6(); updateDemo7(); updateDemo8(); setDemo10('raw');
</script>
</body>
</html>"""

    OUT_HTML.write_text(html_doc, encoding="utf-8")
    print(f"Wrote {OUT_MD} ({OUT_MD.stat().st_size:,} bytes)")
    print(f"Wrote {OUT_HTML} ({OUT_HTML.stat().st_size:,} bytes, {len(obs_rows):,} observations, {len(viva)} viva Q&As)")


if __name__ == "__main__":
    generate()
