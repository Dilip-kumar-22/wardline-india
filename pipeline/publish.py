"""Publish compact versioned frontend JSON bundle and CLI entry point."""
import json
from datetime import datetime, timezone

from .analyze import run_analytics
from .config import (
    FRONTEND_DATA_DIR,
    INDICATORS,
    MANIFESTS_DIR,
    PROCESSED_DIR,
    SEASONS,
    SOURCE_ATTRIBUTION,
    SOURCE_ID,
    UNAVAILABLE_DIMENSIONS,
    VINTAGE,
)
from .forecast import run_forecasts
from .normalize import compute_sha256, normalize_hmis
from .validate import validate_and_reconcile


WITHHELD_KEYS = frozenset({
    "population_2019", "fy2019_20_per_100k", "gid1_members", "source_isos", "svg_path", "polygons",
})


def validate_public_analytics(value: object) -> None:
    """Reject cached analytics from the private edition before publishing."""
    if isinstance(value, dict):
        unexpected = WITHHELD_KEYS.intersection(value)
        if unexpected:
            raise ValueError(f"Withheld fields in public analytics: {', '.join(sorted(unexpected))}")
        for child in value.values():
            validate_public_analytics(child)
    elif isinstance(value, list):
        for child in value:
            validate_public_analytics(child)


def publish_bundle() -> dict:
    FRONTEND_DATA_DIR.mkdir(parents=True, exist_ok=True)
    source_manifest = json.loads((MANIFESTS_DIR / "source_manifest.json").read_text(encoding="utf-8"))
    quality_report = json.loads((PROCESSED_DIR / "quality_report.json").read_text(encoding="utf-8"))
    analytics = json.loads((PROCESSED_DIR / "analytics_summary.json").read_text(encoding="utf-8"))
    forecasts = json.loads((PROCESSED_DIR / "forecast_results.json").read_text(encoding="utf-8"))
    validate_public_analytics(analytics)
    validate_public_analytics(forecasts)

    bundle = {
        "schema_version": "1.1.0",
        "mode": "official",
        "generated_utc": datetime.now(timezone.utc).isoformat(),
        "source": {
            "source_id": SOURCE_ID,
            "vintage": VINTAGE,
            "attribution": SOURCE_ATTRIBUTION,
            "doi": source_manifest["source_doi"],
            "license": source_manifest["license"],
            "raw_sha256": source_manifest["raw_archive"]["sha256"],
            "normalized_rows": source_manifest["normalized_rows"],
            "observed_rows": source_manifest["observed_rows"],
            "period_min": source_manifest["period_min"],
            "period_max": source_manifest["period_max"],
            "states_count": source_manifest["states_count"],
        },
        "seasons": SEASONS,
        "indicators": INDICATORS,
        "unavailable_dimensions": UNAVAILABLE_DIMENSIONS,
        "quality": quality_report,
        "analytics": analytics,
        "forecasts": forecasts,
    }

    bundle_path = FRONTEND_DATA_DIR / "wardline_india_bundle.json"
    bundle_path.write_text(json.dumps(bundle, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    bundle_sha = compute_sha256(bundle_path)

    pub_manifest = {
        "schema_version": "1.1.0",
        "bundle_file": "wardline_india_bundle.json",
        "bundle_bytes": bundle_path.stat().st_size,
        "bundle_sha256": bundle_sha,
        "source_raw_sha256": source_manifest["raw_archive"]["sha256"],
        "generated_utc": bundle["generated_utc"],
    }
    (FRONTEND_DATA_DIR / "manifest.json").write_text(json.dumps(pub_manifest, indent=2, allow_nan=False), encoding="utf-8")
    return pub_manifest


def run_all() -> dict:
    m = normalize_hmis()
    q = validate_and_reconcile()
    a = run_analytics()
    f = run_forecasts()
    p = publish_bundle()
    return {"manifest": m, "reconciled": q["all_reconciliations_passed"], "bundle": p}
