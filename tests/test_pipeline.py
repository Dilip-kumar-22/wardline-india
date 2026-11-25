"""Automated verification & regression tests for WARDLINE INDIA v1.1.0 pipeline, analytics, and forecasting."""
import json
import unittest

import numpy as np
import pandas as pd

from pipeline.analyze import compute_series_metrics, days_in_period
from pipeline.config import CONTRACTS_DIR, FRONTEND_DATA_DIR, PROCESSED_DIR, RAW_ZIP_PATH
from pipeline.forecast import compute_metrics, evaluate_series, forecast_seasonal_naive
from pipeline.validate import validate_dataframe


class TestAnalyticsAndContracts(unittest.TestCase):
    def test_public_build_rejects_cached_withheld_fields(self):
        from pipeline.publish import validate_public_analytics

        validate_public_analytics({"monthly": [{"value": 0, "daily_rate": 0}]})
        for field in ("population_2019", "fy2019_20_per_100k", "gid1_members", "source_isos", "svg_path", "polygons"):
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, field):
                validate_public_analytics({"regions": [{field: None}]})

    def test_leap_year_calendar_days(self):
        self.assertEqual(days_in_period("2016-02"), 29)
        self.assertEqual(days_in_period("2020-02"), 29)
        self.assertEqual(days_in_period("2019-02"), 28)
        self.assertEqual(days_in_period("2019-04"), 30)
        self.assertEqual(days_in_period("2019-10"), 31)

    def test_hand_computed_fixture_seasons_yoy_ties_and_rolling_gap(self):
        rows = [
            {"period": "2018-01", "value": 3100, "status": "observed"},
            {"period": "2018-02", "value": 2800, "status": "observed"},
            {"period": "2018-03", "value": 0, "status": "observed"},
            {"period": "2018-04", "value": pd.NA, "status": "missing"},
            {"period": "2018-05", "value": 3100, "status": "observed"},
            {"period": "2019-01", "value": 3410, "status": "observed"},
            {"period": "2019-03", "value": 500, "status": "observed"},
        ]
        res = compute_series_metrics(pd.DataFrame(rows))
        self.assertEqual(res["peak_value"], 3410)
        self.assertEqual(res["peak_periods"], ["2019-01"])

        by_p = {m["period"]: m for m in res["monthly"]}
        self.assertEqual(by_p["2019-01"]["yoy_pct"], 10.0)
        self.assertEqual(by_p["2019-03"]["yoy_diff"], 500)
        self.assertIsNone(by_p["2019-03"]["yoy_pct"])
        self.assertIsNone(by_p["2018-04"]["value"])

        winter = [s for s in res["seasonal_summary"] if s["season_id"] == "winter"][0]
        self.assertEqual(winter["complete_years"], [2018])
        self.assertIn(2019, winter["incomplete_years"])
        self.assertEqual(winter["mean_daily_count"], 100.0)

        # Rolling 12m must be None if 12 rows exist but a calendar month is missing
        gapped_periods = [f"2018-{m:02d}" for m in range(1, 13) if m != 6] + ["2019-01", "2019-02"]
        gapped_df = pd.DataFrame([{"period": p, "value": 1000, "status": "observed"} for p in gapped_periods])
        gapped_res = compute_series_metrics(gapped_df)
        self.assertIsNone(gapped_res["monthly"][-1]["rolling_12m"])

    def test_forecast_readiness_continuity_and_zero_wape_guard(self):
        # 36, 48, and 60 months must all be rejected under MIN_CONTIGUOUS_MONTHS=72
        for length in (36, 48, 60):
            ps = [f"{2015 + i // 12:04d}-{(i % 12) + 1:02d}" for i in range(length)]
            out = evaluate_series(ps, [100 + i for i in range(length)])
            self.assertFalse(out["ready"], f"Length {length} should be rejected")

        # 72 contiguous months with a missing calendar month must be rejected
        ps_72 = [f"{2014 + i // 12:04d}-{(i % 12) + 1:02d}" for i in range(73) if i != 20]
        out_gap = evaluate_series(ps_72, [100] * len(ps_72))
        self.assertFalse(out_gap["ready"])

        # Calendar arithmetic alone can mistake December's fictitious 13th month for January.
        invalid_periods = [f"{2014 + i // 12:04d}-{(i % 12) + 1:02d}" for i in range(72)]
        invalid_periods[0] = "2013-13"
        self.assertFalse(evaluate_series(invalid_periods, [100] * 72)["ready"])

        # Zero actual sum -> WAPE must be None
        m = compute_metrics(np.array([0.0, 0.0]), np.array([1.0, 2.0]))
        self.assertIsNone(m["wape_pct"])
        self.assertEqual(m["mae"], 1.5)
        self.assertEqual(m["rmse"], 1.6)
        with self.assertRaisesRegex(ValueError, "equally sized"):
            compute_metrics(np.array([1.0]), np.array([1.0, 2.0]))
        with self.assertRaisesRegex(ValueError, "finite"):
            compute_metrics(np.array([1.0]), np.array([np.inf]))

        # Seasonal naive correctness
        train = np.arange(1, 25, dtype=float)
        np.testing.assert_array_equal(forecast_seasonal_naive(train, 12), np.arange(13, 25, dtype=float))

    def test_model_selection_independence_from_holdout_and_strict_json(self):
        # Build 84m synthetic seasonal series; perturb final 12 holdout months dramatically
        ps = [f"{2013 + i // 12:04d}-{(i % 12) + 1:02d}" for i in range(84)]
        base_vals = [int(1000 + 200 * np.sin(2 * np.pi * i / 12.0) + 5 * i) for i in range(84)]
        perturbed_vals = list(base_vals)
        for i in range(72, 84):
            perturbed_vals[i] = base_vals[i] * 5  # massive holdout shock

        res_base = evaluate_series(ps, base_vals)
        res_pert = evaluate_series(ps, perturbed_vals)
        self.assertTrue(res_base["ready"])
        self.assertTrue(res_pert["ready"])
        # Model selection must be IDENTICAL regardless of holdout values
        self.assertEqual(res_base["selected_model"], res_pert["selected_model"])
        self.assertEqual(res_base["cv_metrics"], res_pert["cv_metrics"])
        self.assertEqual(res_base["interval_calibration_status"], "uncalibrated_empirical_dev_cv_residual_p80")
        # Strict JSON (no NaN/Infinity)
        serialized = json.dumps(res_base, allow_nan=False)
        self.assertIn("empirical_abs_error_p80_halfwidth", serialized)

    def test_official_full_validation_reconciliation_and_mutation_rejection(self):
        qr = json.loads((PROCESSED_DIR / "quality_report.json").read_text(encoding="utf-8"))
        self.assertEqual(qr["schema_checked_rows"], 22848)
        self.assertEqual(qr["schema_errors"], 0)
        self.assertEqual(qr["duplicate_canonical_keys"], 0)
        self.assertTrue(qr["calendar_continuity_verified"])
        self.assertEqual(qr["source_reconciled_rows"], 22848)
        self.assertTrue(qr["all_reconciliations_passed"])
        self.assertEqual(len(qr["reconciliation_row_checks"]), 18)
        self.assertEqual(len(qr["reconciliation_derived_checks"]), 8)

        bundle = json.loads((FRONTEND_DATA_DIR / "wardline_india_bundle.json").read_text(encoding="utf-8"))
        self.assertEqual(bundle["schema_version"], "1.1.0")
        self.assertEqual(bundle["mode"], "official")
        self.assertFalse(bundle["forecasts"]["general_ipd_attendance"]["IN"]["ready"])

        # Mutation tests: corrupting a value or geo_id must fail validation
        import io, zipfile
        schema = json.loads((CONTRACTS_DIR / "monthly-observation.schema.json").read_text(encoding="utf-8"))
        norm_df = pd.read_csv(PROCESSED_DIR / "hmis_normalized_monthly.csv", dtype={"value": "Int64"})
        comp_df = pd.read_csv(PROCESSED_DIR / "hmis_completeness.csv")
        state_df = pd.read_csv(PROCESSED_DIR / "reporting_units.csv")
        with zipfile.ZipFile(RAW_ZIP_PATH) as zf:
            prefix = zf.namelist()[0].split("/")[0] + "/"
            raw_df = pd.read_csv(io.BytesIO(zf.read(prefix + "data/derived/hmis/hmis_state_month.csv")))

        corrupted_val = norm_df.copy()
        idx = corrupted_val[(corrupted_val["geo_id"] == "PB") & (corrupted_val["period"] == "2019-10") & (corrupted_val["indicator_id"] == "inst_del")].index[0]
        corrupted_val.loc[idx, "value"] = int(corrupted_val.loc[idx, "value"]) + 999
        with self.assertRaises(ValueError):
            validate_dataframe(corrupted_val, comp_df, raw_df, state_df, schema)

        corrupted_geo = norm_df.copy()
        corrupted_geo.loc[0, "geo_id"] = "INVALID_GEO"
        with self.assertRaises(ValueError):
            validate_dataframe(corrupted_geo, comp_df, raw_df, state_df, schema)

        # AN institutional deliveries are outside the legacy row and total probes.
        off_sample = norm_df.index[(norm_df["geo_id"] == "AN") & (norm_df["indicator_id"] == "inst_del")]
        first = off_sample[0]
        for field, value in {
            "value": int(norm_df.at[first, "value"]) + 1,
            "row_locator": "hmis_state_month.csv:row_3",
            "unit": "per 100k",
        }.items():
            with self.subTest(field=field):
                corrupt = norm_df.copy()
                corrupt.at[first, field] = value
                with self.assertRaises(ValueError):
                    validate_dataframe(corrupt, comp_df, raw_df, state_df, schema)

        fractional = norm_df.astype({"value": "Float64"})
        fractional.at[first, "value"] += 0.5
        with self.assertRaisesRegex(ValueError, "Schema validation failed"):
            validate_dataframe(fractional, comp_df, raw_df, state_df, schema)

        with self.assertRaisesRegex(ValueError, "series grid"):
            validate_dataframe(norm_df.drop(off_sample), comp_df, raw_df, state_df, schema)

        with self.assertRaisesRegex(ValueError, "unexpected columns"):
            validate_dataframe(norm_df.assign(unrecognized="value"), comp_df, raw_df, state_df, schema)

        with self.assertRaisesRegex(ValueError, "Completeness grid"):
            validate_dataframe(norm_df, comp_df.drop(comp_df.index[0]), raw_df, state_df, schema)

        bad_comp = comp_df.copy()
        bad_comp.at[0, "completeness"] = 0.01
        with self.assertRaisesRegex(ValueError, "Completeness mismatch"):
            validate_dataframe(norm_df, bad_comp, raw_df, state_df, schema)


if __name__ == "__main__":
    unittest.main()
