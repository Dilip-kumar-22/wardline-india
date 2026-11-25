"""Full-dataset schema validation (100% of rows), continuity checks, and expanded source reconciliation."""
import io
import json
import zipfile
from numbers import Integral
from typing import Dict, List

import jsonschema
import pandas as pd

from .config import CONTRACTS_DIR, INDICATORS, PROCESSED_DIR, RAW_ZIP_PATH, SOURCE_ID, VINTAGE


def reconcile_source_rows(norm_df, comp_df, raw_df, geo_names, expected_periods):
    raw_rows = {
        (row["unit_id"], f"{row['year']:04d}-{row['month']:02d}"): (row_number, row)
        for row_number, row in enumerate(raw_df.to_dict("records"), start=2)
    }
    expected_raw_keys = {(geo, period) for geo in geo_names for period in expected_periods}
    if set(raw_rows) != expected_raw_keys or len(raw_df) != len(raw_rows):
        raise ValueError("Raw source state-month grid is incomplete or duplicated")

    comp_keys = ["geo_id", "period", "indicator_id"]
    comp_index = pd.MultiIndex.from_frame(comp_df[comp_keys])
    norm_index = pd.MultiIndex.from_frame(norm_df[comp_keys])
    if not comp_index.is_unique or len(comp_index) != len(norm_index) or not comp_index.difference(norm_index).empty:
        raise ValueError("Completeness grid does not match normalized observation keys")
    completeness = comp_df.set_index(comp_keys).to_dict("index")

    for observation in norm_df.itertuples(index=False):
        geo, period, indicator = observation.geo_id, observation.period, observation.indicator_id
        key = (geo, period, indicator)
        row_number, raw = raw_rows[(geo, period)]
        meta = INDICATORS[indicator]
        gated = raw[indicator]
        flag = raw[f"flag_{indicator}"]
        coverage = raw[f"comp_{indicator}"]
        status = "observed" if pd.notna(gated) else "not_reported" if pd.notna(flag) and "comp_lt" in flag else "missing"
        metadata = {
            "row_locator": f"hmis_state_month.csv:row_{row_number}",
            "geo_name": geo_names[geo], "geo_level": "state_ut", "parent_geo_id": "IN",
            "source_id": SOURCE_ID, "vintage": VINTAGE, "facility_scope": meta["facility_scope"],
            "raw_indicator": meta["raw_indicator"], "unit": meta["unit"], "stratum": "all",
            "publication_status": "provisional", "mode": "official", "status": status,
        }
        for field, expected in metadata.items():
            actual = getattr(observation, field)
            if pd.isna(actual) or actual != expected:
                raise ValueError(f"Source reconciliation mismatch for {key}: {field}")
        if pd.isna(gated) != pd.isna(observation.value) or pd.notna(gated) and observation.value != gated:
            raise ValueError(f"Source reconciliation mismatch for {key}: value")

        details = completeness[key]
        for field, expected in {
            "completeness": coverage, "flag": flag, "n_districts": raw[f"n_districts_{indicator}"],
            "raw_value": raw[f"{indicator}_raw"], "gated_value": gated,
        }.items():
            actual = details[field]
            if pd.isna(actual) != pd.isna(expected) or pd.notna(expected) and actual != expected:
                raise ValueError(f"Completeness mismatch for {key}: {field}")
        if status == "observed" and (pd.isna(coverage) or coverage < 0.90):
            raise ValueError(f"Observed record is below the district completeness threshold for {key}")
        if status == "not_reported" and (pd.isna(coverage) or coverage >= 0.90):
            raise ValueError(f"Not-reported record fails the district completeness threshold for {key}")


def validate_dataframe(
    norm_df: pd.DataFrame,
    comp_df: pd.DataFrame,
    raw_df: pd.DataFrame,
    state_df: pd.DataFrame,
    schema: Dict,
) -> Dict:
    validator = jsonschema.Draft202012Validator(schema)
    unexpected_columns = set(norm_df.columns) - set(schema["properties"])
    if unexpected_columns:
        raise ValueError(f"Schema validation failed: unexpected columns {sorted(unexpected_columns)}")

    # 1. Canonical key uniqueness check
    key_cols = ["source_id", "vintage", "period", "geo_level", "geo_id", "facility_scope", "indicator_id", "stratum"]
    dup_count = int(norm_df.duplicated(subset=key_cols).sum())
    if dup_count > 0:
        raise ValueError(f"Duplicate canonical keys detected: {dup_count}")

    # 2. Geographic identifier & indicator identity checks
    geo_names = dict(zip(state_df["unit_id"], state_df["unit_name"]))
    valid_geos = set(geo_names)
    if len(valid_geos) != 34 or len(state_df) != len(valid_geos):
        raise ValueError("Expected 34 unique reporting units in the geographic frame")
    unknown_geos = set(norm_df["geo_id"].astype(str)) - valid_geos
    if unknown_geos:
        raise ValueError(f"Unexpected geo_id values detected: {sorted(unknown_geos)}")

    valid_inds = set(INDICATORS.keys())
    unknown_inds = set(norm_df["indicator_id"].astype(str)) - valid_inds
    if unknown_inds:
        raise ValueError(f"Unexpected indicator_id values detected: {sorted(unknown_inds)}")

    # 3. Expected 34 x 96 x 7 = 22,848 coverage and calendar continuity check
    expected_periods = [f"{y:04d}-{m:02d}" for y in range(2012, 2021) for m in range(1, 13) if "2012-04" <= f"{y:04d}-{m:02d}" <= "2020-03"]
    if len(expected_periods) != 96:
        raise ValueError(f"Expected 96 calendar periods, got {len(expected_periods)}")

    groups = norm_df.groupby(["geo_id", "indicator_id"])
    if set(groups.groups) != {(geo, ind) for geo in valid_geos for ind in valid_inds}:
        raise ValueError("Normalized series grid does not cover each reporting unit and indicator")
    for (geo_id, ind_id), grp in groups:
        periods = sorted(grp["period"].astype(str).tolist())
        if periods != expected_periods:
            raise ValueError(f"Calendar continuity mismatch for {geo_id} {ind_id}: {len(periods)} periods")

    # 4. Validate 100% of normalized rows against JSON Schema
    schema_errors: List[str] = []
    for row in norm_df.itertuples(index=False):
        value = row.value
        if pd.isna(value):
            value = None
        elif isinstance(value, Integral) and not isinstance(value, bool):
            value = int(value)
        obj = {
            "source_id": str(row.source_id),
            "vintage": str(row.vintage),
            "period": str(row.period),
            "geo_level": str(row.geo_level),
            "geo_id": str(row.geo_id),
            "geo_name": str(row.geo_name),
            "parent_geo_id": None if pd.isna(row.parent_geo_id) else str(row.parent_geo_id),
            "facility_scope": str(row.facility_scope),
            "indicator_id": str(row.indicator_id),
            "raw_indicator": str(row.raw_indicator),
            "unit": str(row.unit),
            "stratum": str(row.stratum),
            "value": value,
            "status": str(row.status),
            "row_locator": str(row.row_locator),
            "publication_status": str(row.publication_status),
            "mode": str(row.mode),
        }
        errs = list(validator.iter_errors(obj))
        if errs:
            schema_errors.append(f"{obj['geo_id']} {obj['period']} {obj['indicator_id']}: {errs[0].message}")
            if len(schema_errors) >= 10:
                break

    if schema_errors:
        raise ValueError(f"Schema validation failed ({len(schema_errors)}+ errors): {schema_errors[:3]}")

    # 5. Reconcile every observation and completeness record with its exact source row.
    reconcile_source_rows(norm_df, comp_df, raw_df, geo_names, expected_periods)

    # 6. Preserve the sampled row and derived eight-year checks displayed by the application.
    raw_df = raw_df.copy()
    raw_df["_orig_csv_row"] = raw_df.index + 2

    row_checks = []
    probe_specs = [
        ("PB", 2012, 4, "inst_del"),
        ("PB", 2016, 2, "inst_del"),
        ("PB", 2019, 10, "inst_del"),
        ("BR", 2012, 4, "inst_del"),
        ("BR", 2019, 10, "inst_del"),
        ("BR", 2020, 3, "opd"),
        ("PB", 2019, 8, "opd"),
        ("MH", 2018, 9, "inst_del"),
        ("UP", 2019, 10, "inst_del"),
        ("KL", 2017, 4, "opd"),
        ("TN", 2018, 1, "anc_reg"),
        ("AP_TG", 2015, 7, "inst_del"),
        ("JK", 2016, 11, "opd"),
        ("AN", 2012, 4, "diarr_u5"),
        ("GJ", 2019, 12, "penta3"),
        ("RJ", 2018, 6, "mcv1"),
        ("WB", 2019, 3, "fic"),
        ("DL", 2019, 9, "opd"),
    ]
    for geo, yr, mo, ind in probe_specs:
        raw_match = raw_df[(raw_df["unit_id"] == geo) & (raw_df["year"] == yr) & (raw_df["month"] == mo)]
        if len(raw_match) != 1:
            raise ValueError(f"Raw probe row missing or non-unique for {geo} {yr}-{mo}")
        r0 = raw_match.iloc[0]
        raw_val = None if pd.isna(r0[ind]) else int(round(float(r0[ind])))
        expected_loc = f"hmis_state_month.csv:row_{int(r0['_orig_csv_row'])}"
        period = f"{yr:04d}-{mo:02d}"
        norm_match = norm_df[(norm_df["geo_id"] == geo) & (norm_df["period"] == period) & (norm_df["indicator_id"] == ind)]
        if len(norm_match) != 1:
            raise ValueError(f"Normalized probe row missing for {geo} {period} {ind}")
        n0 = norm_match.iloc[0]
        norm_val = None if pd.isna(n0["value"]) else int(n0["value"])
        loc_match = str(n0["row_locator"]) == expected_loc
        val_match = raw_val == norm_val
        row_checks.append({
            "geo_id": geo,
            "period": period,
            "indicator_id": ind,
            "raw_source_value": raw_val,
            "normalized_value": norm_val,
            "row_locator": str(n0["row_locator"]),
            "exact_match": bool(val_match and loc_match),
        })
        if not (val_match and loc_match):
            raise ValueError(f"Reconciliation mismatch for {geo} {period} {ind}: val={val_match}, loc={loc_match}")

    derived_checks = []
    for geo, ind in [
        ("PB", "inst_del"),
        ("BR", "inst_del"),
        ("PB", "opd"),
        ("BR", "opd"),
        ("MH", "inst_del"),
        ("UP", "inst_del"),
        ("KL", "anc_reg"),
        ("TN", "penta3"),
    ]:
        raw_sum = int(round(float(raw_df[raw_df["unit_id"] == geo][ind].dropna().sum())))
        norm_sum = int(norm_df[(norm_df["geo_id"] == geo) & (norm_df["indicator_id"] == ind) & (norm_df["status"] == "observed")]["value"].sum())
        derived_checks.append({
            "metric": f"{geo}_{ind}_8yr_total",
            "raw_derived_sum": raw_sum,
            "normalized_sum": norm_sum,
            "exact_match": raw_sum == norm_sum,
        })
        if raw_sum != norm_sum:
            raise ValueError(f"Derived sum mismatch for {geo} {ind}: raw={raw_sum}, norm={norm_sum}")

    # 7. Indicator & State quality summaries
    indicator_quality = {}
    for ind_id in INDICATORS:
        sub = norm_df[norm_df["indicator_id"] == ind_id]
        csub = comp_df[comp_df["indicator_id"] == ind_id]
        obs = int((sub["status"] == "observed").sum())
        not_rep = int((sub["status"] == "not_reported").sum())
        miss = int((sub["status"] == "missing").sum())
        indicator_quality[ind_id] = {
            "total_state_months": len(sub),
            "observed": obs,
            "not_reported_below_90pct": not_rep,
            "missing": miss,
            "observed_pct": round(obs / len(sub) * 100, 2),
            "median_district_completeness": round(float(csub["completeness"].median()), 4),
            "zero_observed_count": int(((sub["status"] == "observed") & (sub["value"] == 0)).sum()),
        }

    state_quality = []
    for geo_id, grp in norm_df.groupby("geo_id"):
        geo_name = str(grp["geo_name"].iloc[0])
        inst_sub = grp[grp["indicator_id"] == "inst_del"]
        opd_sub = grp[grp["indicator_id"] == "opd"]
        c_inst = comp_df[(comp_df["geo_id"] == geo_id) & (comp_df["indicator_id"] == "inst_del")]
        state_quality.append({
            "geo_id": str(geo_id),
            "geo_name": geo_name,
            "inst_del_observed_months": int((inst_sub["status"] == "observed").sum()),
            "opd_observed_months": int((opd_sub["status"] == "observed").sum()),
            "total_expected_months": 96,
            "median_district_completeness": round(float(c_inst["completeness"].median()), 4),
            "n_districts_reported": int(c_inst["n_districts"].median()) if c_inst["n_districts"].notna().any() else None,
        })

    return {
        "schema_checked_rows": len(norm_df),
        "schema_errors": len(schema_errors),
        "duplicate_canonical_keys": dup_count,
        "calendar_continuity_verified": True,
        "source_reconciled_rows": len(norm_df),
        "reconciliation_row_checks": row_checks,
        "reconciliation_derived_checks": derived_checks,
        "all_reconciliations_passed": all(x["exact_match"] for x in row_checks) and all(x["exact_match"] for x in derived_checks),
        "indicator_quality": indicator_quality,
        "state_quality": sorted(state_quality, key=lambda x: x["geo_name"]),
    }


def validate_and_reconcile() -> Dict:
    schema = json.loads((CONTRACTS_DIR / "monthly-observation.schema.json").read_text(encoding="utf-8"))
    norm_df = pd.read_csv(PROCESSED_DIR / "hmis_normalized_monthly.csv", dtype={"value": "Int64"})
    comp_df = pd.read_csv(PROCESSED_DIR / "hmis_completeness.csv")
    state_df = pd.read_csv(PROCESSED_DIR / "reporting_units.csv")

    with zipfile.ZipFile(RAW_ZIP_PATH) as zf:
        prefix = zf.namelist()[0].split("/")[0] + "/"
        raw_df = pd.read_csv(io.BytesIO(zf.read(prefix + "data/derived/hmis/hmis_state_month.csv")))

    report = validate_dataframe(norm_df, comp_df, raw_df, state_df, schema)
    (PROCESSED_DIR / "quality_report.json").write_text(json.dumps(report, indent=2, allow_nan=False), encoding="utf-8")
    return report
