"""Normalize verified Zenodo/MoHFW HMIS state-month archive into WARDLINE contract."""
import hashlib
import io
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Tuple

import pandas as pd

from .acquire import acquire_raw_archive
from .config import (
    EXPECTED_RAW_SHA256,
    INDICATORS,
    MANIFESTS_DIR,
    PROCESSED_DIR,
    RAW_ZIP_PATH,
    SOURCE_ATTRIBUTION,
    SOURCE_ID,
    VINTAGE,
)


def compute_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def load_raw_archive(zip_path: Path = RAW_ZIP_PATH) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, str]:
    if not zip_path.exists():
        acquire_raw_archive(zip_path)
    actual_sha = compute_sha256(zip_path)
    if actual_sha != EXPECTED_RAW_SHA256:
        raise ValueError(f"SHA-256 mismatch for {zip_path}: expected {EXPECTED_RAW_SHA256}, got {actual_sha}")

    with zipfile.ZipFile(zip_path) as zf:
        for member in zf.namelist():
            if member.startswith("/") or ".." in Path(member).parts:
                raise ValueError(f"Unsafe archive member path detected: {member}")
        prefix = zf.namelist()[0].split("/")[0] + "/"
        hmis_df = pd.read_csv(io.BytesIO(zf.read(prefix + "data/derived/hmis/hmis_state_month.csv")))
        state_df = pd.read_csv(
            io.BytesIO(zf.read(prefix + "pipeline/reference/state_frame.csv")),
            usecols=["unit_id", "unit_name"],
        )
        break_df = pd.read_csv(io.BytesIO(zf.read(prefix + "data/derived/hmis/break_ratio_2017.csv")))
    return hmis_df, state_df, break_df, actual_sha


def normalize_hmis(zip_path: Path = RAW_ZIP_PATH) -> Dict:
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    MANIFESTS_DIR.mkdir(parents=True, exist_ok=True)

    hmis_df, state_df, break_df, raw_sha = load_raw_archive(zip_path)
    state_name_map = dict(zip(state_df["unit_id"], state_df["unit_name"]))

    # Preserve exact original CSV 1-indexed row number (header = row 1, first data row = row 2) BEFORE sorting
    hmis_df = hmis_df.copy()
    hmis_df["_orig_csv_row"] = hmis_df.index + 2
    hmis_df = hmis_df.sort_values(["unit_id", "year", "month"]).reset_index(drop=True)

    records: List[Dict] = []
    masked_audit: List[Dict] = []
    completeness_rows: List[Dict] = []

    for _, row in hmis_df.iterrows():
        orig_row = int(row["_orig_csv_row"])
        unit_id = str(row["unit_id"])
        unit_name = state_name_map.get(unit_id, unit_id)
        year = int(row["year"])
        month = int(row["month"])
        period = f"{year:04d}-{month:02d}"
        fy = str(row["fy"])
        era = str(row["era"])
        status_max = str(row["status_date_max"]) if pd.notna(row["status_date_max"]) else "unknown"

        for ind_id, meta in INDICATORS.items():
            gated_val = row[ind_id]
            raw_val = row[f"{ind_id}_raw"]
            comp_val = row[f"comp_{ind_id}"]
            n_dist = row[f"n_districts_{ind_id}"]
            flag = row[f"flag_{ind_id}"]

            comp_float = float(comp_val) if pd.notna(comp_val) else None
            n_dist_int = int(n_dist) if pd.notna(n_dist) else None
            flag_str = str(flag) if pd.notna(flag) else None

            completeness_rows.append({
                "period": period,
                "fy": fy,
                "era": era,
                "geo_id": unit_id,
                "indicator_id": ind_id,
                "completeness": comp_float,
                "n_districts": n_dist_int,
                "flag": flag_str,
                "raw_value": int(round(raw_val)) if pd.notna(raw_val) else None,
                "gated_value": int(round(gated_val)) if pd.notna(gated_val) else None,
                "status_date_max": status_max,
            })

            if pd.notna(gated_val):
                int_val = int(round(float(gated_val)))
                if int_val < 0:
                    raise ValueError(f"Negative count at raw row {orig_row}, {unit_id} {period} {ind_id}: {int_val}")
                status = "observed"
                val_out = int_val
            else:
                status = "not_reported" if (flag_str and "comp_lt" in flag_str) else "missing"
                val_out = None
                masked_audit.append({
                    "period": period,
                    "geo_id": unit_id,
                    "geo_name": unit_name,
                    "indicator_id": ind_id,
                    "status": status,
                    "flag": flag_str or "raw_missing",
                    "completeness": comp_float,
                    "raw_value_unmasked": int(round(raw_val)) if pd.notna(raw_val) else None,
                    "row_locator": f"hmis_state_month.csv:row_{orig_row}",
                })

            records.append({
                "source_id": SOURCE_ID,
                "vintage": VINTAGE,
                "period": period,
                "geo_level": "state_ut",
                "geo_id": unit_id,
                "geo_name": unit_name,
                "parent_geo_id": "IN",
                "facility_scope": meta["facility_scope"],
                "indicator_id": ind_id,
                "raw_indicator": meta["raw_indicator"],
                "unit": meta["unit"],
                "stratum": "all",
                "value": val_out,
                "status": status,
                "row_locator": f"hmis_state_month.csv:row_{orig_row}",
                "publication_status": "provisional",
                "mode": "official",
            })

    norm_df = pd.DataFrame(records)
    norm_csv = PROCESSED_DIR / "hmis_normalized_monthly.csv"
    norm_df_csv = norm_df.copy()
    norm_df_csv["value"] = norm_df_csv["value"].astype("Int64")
    norm_df_csv.to_csv(norm_csv, index=False)

    comp_df = pd.DataFrame(completeness_rows)
    comp_df.to_csv(PROCESSED_DIR / "hmis_completeness.csv", index=False)

    masked_df = pd.DataFrame(masked_audit)
    masked_df.to_csv(PROCESSED_DIR / "masked_and_rejected_rows.csv", index=False)

    break_df.to_csv(PROCESSED_DIR / "hmis_break_ratio_2017.csv", index=False)
    state_df.to_csv(PROCESSED_DIR / "reporting_units.csv", index=False)

    manifest = {
        "generated_utc": datetime.now(timezone.utc).isoformat(),
        "source_id": SOURCE_ID,
        "vintage": VINTAGE,
        "attribution": SOURCE_ATTRIBUTION,
        "license": "Government Open Data License - India (GODL-India) & CC BY 4.0",
        "source_doi": "https://doi.org/10.5281/zenodo.23657569",
        "raw_archive": {
            "path": "data/raw/zenodo_23657569/elnino-hmis-services-india-v1.0.1.zip",
            "bytes": zip_path.stat().st_size,
            "sha256": raw_sha,
        },
        "normalized_rows": len(norm_df),
        "observed_rows": int((norm_df["status"] == "observed").sum()),
        "masked_or_missing_rows": int((norm_df["status"] != "observed").sum()),
        "states_count": int(norm_df["geo_id"].nunique()),
        "indicators_count": int(norm_df["indicator_id"].nunique()),
        "period_min": str(norm_df["period"].min()),
        "period_max": str(norm_df["period"].max()),
        "normalized_csv_sha256": compute_sha256(norm_csv),
    }
    (MANIFESTS_DIR / "source_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest
