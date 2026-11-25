"""Descriptive, seasonal, regional, and fixed-cohort national comparability analytics."""
import calendar
import json
from typing import Dict

import numpy as np
import pandas as pd

from .config import INDICATORS, MONTH_TO_SEASON, PROCESSED_DIR, SEASONS


def days_in_period(period: str) -> int:
    y, m = int(period[:4]), int(period[5:7])
    return calendar.monthrange(y, m)[1]


def month_index(period: str) -> int:
    return int(period[:4]) * 12 + int(period[5:7])


def compute_series_metrics(df_series: pd.DataFrame) -> Dict:
    """Compute monthly series, daily rates, strictly-consecutive rolling windows, MoM, YoY, seasonal profiles."""
    df = df_series.sort_values("period").reset_index(drop=True).copy()
    df["year"] = df["period"].str[:4].astype(int)
    df["month"] = df["period"].str[5:7].astype(int)
    df["days"] = df["period"].map(days_in_period)
    df["season"] = df["month"].map(MONTH_TO_SEASON)

    monthly = []
    val_map = {}
    for _, r in df.iterrows():
        v = None if pd.isna(r["value"]) else int(r["value"])
        val_map[str(r["period"])] = v

    for i, r in df.iterrows():
        p = str(r["period"])
        v = val_map[p]
        d = int(r["days"])
        daily = round(v / d, 2) if v is not None else None
        cur_m_idx = month_index(p)

        # MoM only for strictly adjacent calendar month
        mom_pct = None
        if i > 0 and v is not None:
            prev_p = str(df.loc[i - 1, "period"])
            prev_v = val_map[prev_p]
            if cur_m_idx - month_index(prev_p) == 1 and prev_v is not None and prev_v > 0:
                mom_pct = round((v - prev_v) / prev_v * 100.0, 2)

        # The absolute difference remains defined when the observed prior value is zero.
        yoy_pct = None
        yoy_diff = None
        prior_p = f"{int(p[:4]) - 1:04d}-{int(p[5:7]):02d}"
        prior_v = val_map.get(prior_p)
        if v is not None and prior_v is not None:
            yoy_diff = v - prior_v
            if prior_v > 0:
                yoy_pct = round(yoy_diff / prior_v * 100.0, 2)

        # Rolling 12-month mean ONLY when all 12 consecutive calendar months are observed
        roll12 = None
        if i >= 11:
            window_periods = [str(df.loc[j, "period"]) for j in range(i - 11, i + 1)]
            is_consecutive = all(
                month_index(window_periods[k]) - month_index(window_periods[k - 1]) == 1
                for k in range(1, 12)
            )
            window_vals = [val_map[wp] for wp in window_periods]
            if is_consecutive and all(x is not None for x in window_vals):
                roll12 = round(float(np.mean(window_vals)), 1)

        monthly.append({
            "period": p,
            "year": int(r["year"]),
            "month": int(r["month"]),
            "season": r["season"],
            "days": d,
            "value": v,
            "daily_rate": daily,
            "status": str(r["status"]),
            "mom_pct": mom_pct,
            "yoy_diff": yoy_diff,
            "yoy_pct": yoy_pct,
            "rolling_12m": roll12,
        })

    observed_vals = [m["value"] for m in monthly if m["value"] is not None]
    observed_daily = [m["daily_rate"] for m in monthly if m["daily_rate"] is not None]

    peaks = []
    troughs = []
    if observed_vals:
        max_v = max(observed_vals)
        min_v = min(observed_vals)
        peaks = [m["period"] for m in monthly if m["value"] == max_v]
        troughs = [m["period"] for m in monthly if m["value"] == min_v]

    month_profile = []
    for mo in range(1, 13):
        mo_rows = [m for m in monthly if m["month"] == mo and m["value"] is not None]
        if mo_rows:
            vals = [m["value"] for m in mo_rows]
            drates = [m["daily_rate"] for m in mo_rows]
            month_profile.append({
                "month": mo,
                "n_years": len(mo_rows),
                "median": round(float(np.median(vals)), 1),
                "mean": round(float(np.mean(vals)), 1),
                "min": int(min(vals)),
                "max": int(max(vals)),
                "q25": round(float(np.percentile(vals, 25)), 1),
                "q75": round(float(np.percentile(vals, 75)), 1),
                "mean_daily_rate": round(float(np.mean(drates)), 2),
                "median_daily_rate": round(float(np.median(drates)), 2),
            })
        else:
            month_profile.append({"month": mo, "n_years": 0, "median": None, "mean": None, "min": None, "max": None, "q25": None, "q75": None, "mean_daily_rate": None, "median_daily_rate": None})

    seasonal_summary = []
    years = sorted(df["year"].unique().tolist())
    for s in SEASONS:
        complete_seasons_daily = []
        complete_seasons_monthly = []
        complete_years = []
        incomplete_years = []
        for y in years:
            s_rows = [m for m in monthly if m["year"] == y and m["month"] in s["months"] and m["value"] is not None]
            if len(s_rows) == len(s["months"]):
                complete_years.append(y)
                total_v = sum(m["value"] for m in s_rows)
                total_d = sum(m["days"] for m in s_rows)
                complete_seasons_daily.append(total_v / total_d)
                complete_seasons_monthly.append(total_v / len(s["months"]))
            else:
                incomplete_years.append(y)
        seasonal_summary.append({
            "season_id": s["id"],
            "label": s["label"],
            "month_span": s["month_span"],
            "months_in_season": len(s["months"]),
            "complete_years_count": len(complete_years),
            "complete_years": complete_years,
            "incomplete_years": incomplete_years,
            "mean_daily_count": round(float(np.mean(complete_seasons_daily)), 2) if complete_seasons_daily else None,
            "median_daily_count": round(float(np.median(complete_seasons_daily)), 2) if complete_seasons_daily else None,
            "mean_monthly_count": round(float(np.mean(complete_seasons_monthly)), 1) if complete_seasons_monthly else None,
        })

    valid_season_rates = [s["mean_daily_count"] for s in seasonal_summary if s["mean_daily_count"] is not None and s["mean_daily_count"] > 0]
    seasonal_ratio = round(max(valid_season_rates) / min(valid_season_rates), 3) if len(valid_season_rates) >= 2 else None

    fy1920 = [m["value"] for m in monthly if "2019-04" <= m["period"] <= "2020-03" and m["value"] is not None]
    fy1819 = [m["value"] for m in monthly if "2018-04" <= m["period"] <= "2019-03" and m["value"] is not None]
    fy1920_total = int(sum(fy1920)) if len(fy1920) == 12 else None
    fy1819_total = int(sum(fy1819)) if len(fy1819) == 12 else None
    fy_yoy_pct = round((fy1920_total - fy1819_total) / fy1819_total * 100.0, 2) if (fy1920_total is not None and fy1819_total and fy1819_total > 0) else None

    return {
        "total_observed": int(sum(observed_vals)) if observed_vals else 0,
        "observed_months": len(observed_vals),
        "expected_months": len(monthly),
        "coverage_pct": round(len(observed_vals) / max(1, len(monthly)) * 100.0, 2),
        "mean_monthly": round(float(np.mean(observed_vals)), 1) if observed_vals else None,
        "median_monthly": round(float(np.median(observed_vals)), 1) if observed_vals else None,
        "mean_daily": round(float(np.mean(observed_daily)), 2) if observed_daily else None,
        "peak_value": int(max(observed_vals)) if observed_vals else None,
        "peak_periods": peaks,
        "trough_value": int(min(observed_vals)) if observed_vals else None,
        "trough_periods": troughs,
        "fy2019_20_total": fy1920_total,
        "fy2018_19_total": fy1819_total,
        "fy2019_20_yoy_pct": fy_yoy_pct,
        "seasonal_amplitude_ratio": seasonal_ratio,
        "monthly": monthly,
        "month_profile": month_profile,
        "seasonal_summary": seasonal_summary,
    }


def run_analytics() -> Dict:
    norm_df = pd.read_csv(PROCESSED_DIR / "hmis_normalized_monthly.csv", dtype={"value": "Int64"})
    comp_df = pd.read_csv(PROCESSED_DIR / "hmis_completeness.csv")
    break_df = pd.read_csv(PROCESSED_DIR / "hmis_break_ratio_2017.csv")
    state_df = pd.read_csv(PROCESSED_DIR / "reporting_units.csv")

    national_by_indicator = {}
    states_by_indicator = {}
    regional_rankings = {}

    for ind_id in INDICATORS:
        ind_df = norm_df[norm_df["indicator_id"] == ind_id].copy()

        # Identify fixed-cohort states with 96/96 observed months for this indicator
        obs_counts = ind_df[ind_df["status"] == "observed"].groupby("geo_id").size()
        fixed_cohort_ids = sorted(obs_counts[obs_counts == 96].index.tolist())

        nat_rows = []
        meta_by_period = {}
        for period, grp in ind_df.groupby("period"):
            obs_grp = grp[grp["status"] == "observed"]
            n_rep = len(obs_grp)
            cohort_grp = obs_grp[obs_grp["geo_id"].isin(fixed_cohort_ids)]
            cohort_sum = int(cohort_grp["value"].sum()) if len(cohort_grp) == len(fixed_cohort_ids) and len(fixed_cohort_ids) > 0 else None

            cov_status = "complete_34_of_34" if n_rep == 34 else "partial_reporting_sum"
            if n_rep >= 30:
                nat_rows.append({
                    "period": period,
                    "value": int(obs_grp["value"].sum()),
                    "status": "observed",
                })
            else:
                nat_rows.append({
                    "period": period,
                    "value": pd.NA,
                    "status": "not_reported",
                })
            meta_by_period[str(period)] = {
                "states_reporting": int(n_rep),
                "coverage_status": cov_status,
                "fixed_cohort_value": cohort_sum,
            }

        nat_df = pd.DataFrame(nat_rows)
        nat_metrics = compute_series_metrics(nat_df)
        complete_34_months = 0
        partial_months = 0
        for m in nat_metrics["monthly"]:
            pm = meta_by_period[m["period"]]
            m["states_reporting"] = pm["states_reporting"]
            m["coverage_status"] = pm["coverage_status"]
            m["fixed_cohort_value"] = pm["fixed_cohort_value"]
            if pm["coverage_status"] == "complete_34_of_34":
                complete_34_months += 1
            else:
                partial_months += 1

        # Fixed-cohort sensitivity series metrics
        fc_df = pd.DataFrame([
            {
                "period": m["period"],
                "value": m["fixed_cohort_value"] if m["fixed_cohort_value"] is not None else pd.NA,
                "status": "observed" if m["fixed_cohort_value"] is not None else "missing",
            }
            for m in nat_metrics["monthly"]
        ])
        fc_metrics = compute_series_metrics(fc_df)

        nat_metrics["national_comparability"] = {
            "total_units": 34,
            "complete_34_of_34_months": complete_34_months,
            "partial_reporting_months": partial_months,
            "fixed_cohort_states_count": len(fixed_cohort_ids),
            "fixed_cohort_state_ids": fixed_cohort_ids,
            "fixed_cohort_fy2019_20_total": fc_metrics["fy2019_20_total"],
            "fixed_cohort_fy2019_20_yoy_pct": fc_metrics["fy2019_20_yoy_pct"],
            "fixed_cohort_seasonal_ratio": fc_metrics["seasonal_amplitude_ratio"],
            "note": "Variable-coverage months (<34/34 states) are marked partial_reporting_sum. Use fixed-cohort sensitivity metrics for strict longitudinal comparability.",
        }
        national_by_indicator[ind_id] = nat_metrics

        rankings = []
        state_series = {}
        for geo_id, grp in ind_df.groupby("geo_id"):
            geo_id_s = str(geo_id)
            geo_name = str(grp["geo_name"].iloc[0])
            sm = compute_series_metrics(grp)
            c_sub = comp_df[(comp_df["geo_id"] == geo_id_s) & (comp_df["indicator_id"] == ind_id)]
            med_comp = round(float(c_sub["completeness"].median()), 4) if len(c_sub) else None
            rankings.append({
                "geo_id": geo_id_s,
                "geo_name": geo_name,
                "observed_months": sm["observed_months"],
                "expected_months": sm["expected_months"],
                "coverage_pct": sm["coverage_pct"],
                "median_district_completeness": med_comp,
                "total_observed_8yr": sm["total_observed"],
                "fy2019_20_total": sm["fy2019_20_total"],
                "fy2019_20_yoy_pct": sm["fy2019_20_yoy_pct"],
                "seasonal_amplitude_ratio": sm["seasonal_amplitude_ratio"],
                "peak_periods": sm["peak_periods"],
            })

            state_series[geo_id_s] = {
                "geo_id": geo_id_s,
                "geo_name": geo_name,
                "median_district_completeness": med_comp,
                **sm,
            }

        rankings.sort(key=lambda x: (x["fy2019_20_total"] is not None, x["fy2019_20_total"] or -1), reverse=True)
        regional_rankings[ind_id] = rankings
        states_by_indicator[ind_id] = state_series

    pb_br_spotlight = {}
    for ind_id in INDICATORS:
        pb = states_by_indicator[ind_id]["PB"]
        br = states_by_indicator[ind_id]["BR"]
        pb_br_spotlight[ind_id] = {
            "punjab": {
                "geo_id": "PB",
                "geo_name": "Punjab",
                "observed_months": pb["observed_months"],
                "total_8yr": pb["total_observed"],
                "fy2019_20_total": pb["fy2019_20_total"],
                "fy2019_20_yoy_pct": pb["fy2019_20_yoy_pct"],
                "seasonal_amplitude_ratio": pb["seasonal_amplitude_ratio"],
                "peak_periods": pb["peak_periods"],
                "seasonal_summary": pb["seasonal_summary"],
            },
            "bihar": {
                "geo_id": "BR",
                "geo_name": "Bihar",
                "observed_months": br["observed_months"],
                "total_8yr": br["total_observed"],
                "fy2019_20_total": br["fy2019_20_total"],
                "fy2019_20_yoy_pct": br["fy2019_20_yoy_pct"],
                "seasonal_amplitude_ratio": br["seasonal_amplitude_ratio"],
                "peak_periods": br["peak_periods"],
                "seasonal_summary": br["seasonal_summary"],
            },
        }

    analytics_out = {
        "national": national_by_indicator,
        "regional_rankings": regional_rankings,
        "states": states_by_indicator,
        "pb_br_spotlight": pb_br_spotlight,
        "format_break_2017": break_df.to_dict(orient="records"),
        "states_directory": state_df[["unit_id", "unit_name"]].rename(columns={"unit_id": "geo_id", "unit_name": "geo_name"}).to_dict(orient="records"),
    }
    (PROCESSED_DIR / "analytics_summary.json").write_text(json.dumps(analytics_out, indent=2, allow_nan=False), encoding="utf-8")
    return analytics_out
