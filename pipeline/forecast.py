"""Chronological forecasting lab with strict development-only model selection and calendar continuity validation."""
import json
import math
import re
from typing import Dict, List, Optional

import numpy as np
import pandas as pd

from .analyze import month_index
from .config import PROCESSED_DIR

# Enforce >= 72 contiguous calendar months so 2-fold rolling-origin CV (cutoffs at n-36, n-24)
# always has >= 36 training months and a 12-month final holdout window.
MIN_CONTIGUOUS_MONTHS = 72
HORIZON = 12
PERIOD_PATTERN = re.compile(r"[0-9]{4}-(?:0[1-9]|1[0-2])")


def compute_metrics(actual: np.ndarray, pred: np.ndarray) -> Dict[str, Optional[float]]:
    actual = np.asarray(actual, dtype=float)
    pred = np.asarray(pred, dtype=float)
    if actual.ndim != 1 or actual.size == 0 or actual.shape != pred.shape:
        raise ValueError("Metrics require equally sized nonempty one-dimensional series.")
    if not np.isfinite(actual).all() or not np.isfinite(pred).all():
        raise ValueError("Metrics require finite observations and predictions.")
    err = actual - pred
    mae = float(np.mean(np.abs(err)))
    rmse = float(np.sqrt(np.mean(err ** 2)))
    actual_sum = float(np.sum(np.abs(actual)))
    wape = float(np.sum(np.abs(err)) / actual_sum * 100.0) if actual_sum > 0 else None
    if not math.isfinite(mae) or not math.isfinite(rmse) or (wape is not None and not math.isfinite(wape)):
        raise ValueError("Non-finite value encountered in metric calculation.")
    return {
        "mae": round(mae, 1),
        "rmse": round(rmse, 1),
        "wape_pct": round(wape, 2) if wape is not None else None,
    }


def forecast_last_value(train_y: np.ndarray, h: int = HORIZON) -> np.ndarray:
    return np.repeat(float(train_y[-1]), h)


def forecast_seasonal_naive(train_y: np.ndarray, h: int = HORIZON) -> np.ndarray:
    out = np.zeros(h, dtype=float)
    for step in range(h):
        out[step] = float(train_y[-12 + (step % 12)])
    return np.maximum(0.0, out)


def _build_ridge_row(t_idx: int, month: int, lag1: float, lag12: float, is_e2: float) -> np.ndarray:
    row = [float(t_idx), float(lag1), float(lag12), float(is_e2)]
    for m in range(2, 13):
        row.append(1.0 if month == m else 0.0)
    return np.array(row, dtype=float)


def forecast_ridge_recursive(
    train_y: np.ndarray,
    train_months: List[int],
    train_e2: List[int],
    future_months: List[int],
    future_e2: List[int],
    alpha: float = 10.0,
) -> np.ndarray:
    n = len(train_y)
    X_list = []
    y_list = []
    for t in range(12, n):
        X_list.append(_build_ridge_row(t, train_months[t], train_y[t - 1], train_y[t - 12], train_e2[t]))
        y_list.append(float(train_y[t]))
    X = np.vstack(X_list)
    y = np.array(y_list, dtype=float)

    x_mean = X.mean(axis=0)
    x_std = X.std(axis=0)
    x_std[x_std == 0] = 1.0
    Xs = (X - x_mean) / x_std

    y_mean = y.mean()
    yc = y - y_mean

    p = Xs.shape[1]
    coef = np.linalg.solve(Xs.T @ Xs + alpha * np.eye(p), Xs.T @ yc)

    history = list(train_y.astype(float))
    preds = []
    for step in range(len(future_months)):
        t_idx = n + step
        lag1 = history[-1]
        lag12 = history[-12]
        feat = _build_ridge_row(t_idx, future_months[step], lag1, lag12, future_e2[step])
        feat_s = (feat - x_mean) / x_std
        yhat = float(max(0.0, y_mean + feat_s @ coef))
        preds.append(yhat)
        history.append(yhat)
    return np.array(preds, dtype=float)


def forecast_additive_hw(train_y: np.ndarray, h: int = HORIZON, alpha: float = 0.25, beta: float = 0.05, gamma: float = 0.25) -> np.ndarray:
    y = np.asarray(train_y, dtype=float)
    m = 12
    level = float(np.mean(y[:m]))
    trend = float((np.mean(y[m:2 * m]) - np.mean(y[:m])) / m) if len(y) >= 2 * m else 0.0
    seasonals = [float(y[i] - level) for i in range(m)]

    for i in range(m, len(y)):
        s_idx = i % m
        last_level = level
        level = alpha * (y[i] - seasonals[s_idx]) + (1.0 - alpha) * (level + trend)
        trend = beta * (level - last_level) + (1.0 - beta) * trend
        seasonals[s_idx] = gamma * (y[i] - level) + (1.0 - gamma) * seasonals[s_idx]

    preds = []
    for step in range(1, h + 1):
        s_idx = (len(y) + step - 1) % m
        preds.append(max(0.0, level + step * trend + seasonals[s_idx]))
    return np.array(preds, dtype=float)


def has_calendar_continuity(periods: List[str]) -> bool:
    if any(PERIOD_PATTERN.fullmatch(period) is None for period in periods):
        return False
    for i in range(1, len(periods)):
        if month_index(periods[i]) - month_index(periods[i - 1]) != 1:
            return False
    return True


def evaluate_series(periods: List[str], values: List[int], geo_id: str = "") -> Dict:
    """Run readiness check, strict development-only CV model selection, and locked test evaluation."""
    n = len(periods)
    if n != len(values):
        raise ValueError("periods and values length mismatch.")

    if not has_calendar_continuity(periods):
        return {
            "ready": False,
            "reason": "Supplied series contains invalid or non-consecutive calendar months.",
        }

    if n < MIN_CONTIGUOUS_MONTHS:
        return {
            "ready": False,
            "reason": f"Only {n} contiguous calendar months available; minimum {MIN_CONTIGUOUS_MONTHS} required for 2-fold rolling-origin CV plus 12-month test window.",
        }

    y = np.array(values, dtype=float)
    months = [int(p[5:7]) for p in periods]
    e2_flags = [1 if p >= "2017-04" else 0 for p in periods]

    # 1. Development window (0 .. n-12) rolling-origin CV cutoffs: strictly >= 36m training each
    cv_cutoffs = [n - 36, n - 24]
    models = ["last_value_naive", "seasonal_naive", "ridge_seasonal_lag", "additive_holt_winters"]

    cv_errors = {m: [] for m in models}
    cv_actuals = []
    cv_preds = {m: [] for m in models}

    for cut in cv_cutoffs:
        tr_y = y[:cut]
        te_y = y[cut:cut + HORIZON]
        tr_m, te_m = months[:cut], months[cut:cut + HORIZON]
        tr_e2, te_e2 = e2_flags[:cut], e2_flags[cut:cut + HORIZON]

        p_lv = forecast_last_value(tr_y, HORIZON)
        p_sn = forecast_seasonal_naive(tr_y, HORIZON)
        p_ri = forecast_ridge_recursive(tr_y, tr_m, tr_e2, te_m, te_e2)
        p_hw = forecast_additive_hw(tr_y, HORIZON)

        cv_actuals.extend(te_y.tolist())
        for name, pr in zip(models, [p_lv, p_sn, p_ri, p_hw]):
            cv_preds[name].extend(pr.tolist())
            cv_errors[name].extend((te_y - pr).tolist())

    cv_metrics = {m: compute_metrics(np.array(cv_actuals), np.array(cv_preds[m])) for m in models}

    # 2. LOCK MODEL SELECTION EXCLUSIVELY ON DEVELOPMENT CV (ZERO HOLDOUT / TEST LEAKAGE)
    sn_cv_mae = cv_metrics["seasonal_naive"]["mae"]
    candidates = ["ridge_seasonal_lag", "additive_holt_winters"]
    best_cand = min(candidates, key=lambda m: cv_metrics[m]["mae"])
    if cv_metrics[best_cand]["mae"] < sn_cv_mae:
        selected_model = best_cand
        selection_reason = (
            f"Locked {best_cand} exclusively from development-window 2-fold rolling-origin CV "
            f"(CV MAE {cv_metrics[best_cand]['mae']:,.1f} < seasonal_naive {sn_cv_mae:,.1f}) before evaluating final test window."
        )
    else:
        selected_model = "seasonal_naive"
        selection_reason = (
            f"Locked seasonal_naive baseline exclusively from development-window CV: "
            f"best candidate ({best_cand}, CV MAE {cv_metrics[best_cand]['mae']:,.1f}) did not beat seasonal_naive ({sn_cv_mae:,.1f})."
        )

    # 3. Evaluate the LOCKED model against baselines on final 12-month chronological test window
    cut_final = n - HORIZON
    tr_y = y[:cut_final]
    ho_y = y[cut_final:]
    tr_m, ho_m = months[:cut_final], months[cut_final:]
    tr_e2, ho_e2 = e2_flags[:cut_final], e2_flags[cut_final:]
    ho_periods = periods[cut_final:]

    ho_preds = {
        "last_value_naive": forecast_last_value(tr_y, HORIZON),
        "seasonal_naive": forecast_seasonal_naive(tr_y, HORIZON),
        "ridge_seasonal_lag": forecast_ridge_recursive(tr_y, tr_m, tr_e2, ho_m, ho_e2),
        "additive_holt_winters": forecast_additive_hw(tr_y, HORIZON),
    }
    holdout_metrics = {m: compute_metrics(ho_y, ho_preds[m]) for m in models}
    beat_sn_on_test = holdout_metrics[selected_model]["mae"] < holdout_metrics["seasonal_naive"]["mae"]

    # Uncalibrated empirical residual quantile from development CV errors of the locked model (no test leakage!)
    dev_abs_err = np.abs(np.array(cv_errors[selected_model]))
    p80_hw = float(np.quantile(dev_abs_err, 0.80))

    # Refit locked model on all n observed months for exploratory 12-month projection
    last_y, last_m = int(periods[-1][:4]), int(periods[-1][5:7])
    fut_periods, fut_months, fut_e2 = [], [], []
    cy, cm = last_y, last_m
    for _ in range(HORIZON):
        cm += 1
        if cm > 12:
            cm = 1
            cy += 1
        fut_periods.append(f"{cy:04d}-{cm:02d}")
        fut_months.append(cm)
        fut_e2.append(1)

    if selected_model == "ridge_seasonal_lag":
        fut_pred = forecast_ridge_recursive(y, months, e2_flags, fut_months, fut_e2)
    elif selected_model == "additive_holt_winters":
        fut_pred = forecast_additive_hw(y, HORIZON)
    else:
        fut_pred = forecast_seasonal_naive(y, HORIZON)

    return {
        "ready": True,
        "evaluation_type": "retrospective_holdout_inspected_in_v1_0_0",
        "contiguous_months": n,
        "train_start": periods[0],
        "train_cutoff": periods[cut_final - 1],
        "holdout_start": ho_periods[0],
        "holdout_end": ho_periods[-1],
        "horizon_months": HORIZON,
        "rolling_cv_folds": len(cv_cutoffs),
        "selected_model": selected_model,
        "selection_reason": selection_reason,
        "locked_model_beat_seasonal_naive_on_test": bool(beat_sn_on_test),
        "cv_metrics": cv_metrics,
        "holdout_metrics": holdout_metrics,
        "empirical_abs_error_p80_halfwidth": round(p80_hw, 1),
        "interval_calibration_status": "uncalibrated_empirical_dev_cv_residual_p80",
        "holdout_series": [
            {
                "period": ho_periods[i],
                "actual": int(round(ho_y[i])),
                "seasonal_naive": int(round(ho_preds["seasonal_naive"][i])),
                "ridge_seasonal_lag": int(round(ho_preds["ridge_seasonal_lag"][i])),
                "additive_holt_winters": int(round(ho_preds["additive_holt_winters"][i])),
                "last_value_naive": int(round(ho_preds["last_value_naive"][i])),
            }
            for i in range(HORIZON)
        ],
        "future_projection": [
            {
                "period": fut_periods[i],
                "point": int(round(fut_pred[i])),
                "lower_p80_uncalibrated": int(round(max(0.0, fut_pred[i] - p80_hw))),
                "upper_p80_uncalibrated": int(round(fut_pred[i] + p80_hw)),
            }
            for i in range(HORIZON)
        ],
        "caveat": (
            "Retrospective evaluation: FY 2019–20 was inspected during v1.0.0 development and is no longer an unseen test set. "
            "Model selection in v1.1.0 is locked strictly on development-window CV before test evaluation. "
            "Exploratory FY 2020–21 projections do not model COVID-19 lockdown disruptions."
        ),
    }


def run_forecasts() -> Dict:
    analytics = json.loads((PROCESSED_DIR / "analytics_summary.json").read_text(encoding="utf-8"))
    results = {}

    target_geos = [
        ("IN", "All-India (34 harmonised units)"),
        ("PB", "Punjab"),
        ("BR", "Bihar"),
        ("MH", "Maharashtra"),
        ("UP", "Uttar Pradesh"),
        ("TN", "Tamil Nadu"),
        ("KL", "Kerala"),
    ]
    target_inds = ["inst_del", "opd", "anc_reg", "diarr_u5", "penta3"]

    for ind_id in target_inds:
        results[ind_id] = {}
        for geo_id, geo_name in target_geos:
            if geo_id == "IN":
                nat = analytics["national"][ind_id]
                comp_info = nat["national_comparability"]
                if comp_info["complete_34_of_34_months"] < 96:
                    # Use fixed-cohort 100%-complete series for national forecast eligibility so changing state composition cannot distort forecasts
                    monthly = nat["monthly"]
                    periods = [m["period"] for m in monthly if m["fixed_cohort_value"] is not None]
                    values = [int(m["fixed_cohort_value"]) for m in monthly if m["fixed_cohort_value"] is not None]
                    res = evaluate_series(periods, values, geo_id=geo_id)
                    res["geographic_composition_note"] = (
                        f"Evaluated on fixed cohort of {comp_info['fixed_cohort_states_count']}/34 states with 96/96 complete months "
                        f"to prevent variable reporting coverage from distorting forecast trends."
                    )
                else:
                    monthly = nat["monthly"]
                    periods = [m["period"] for m in monthly if m["status"] == "observed" and m["value"] is not None]
                    values = [int(m["value"]) for m in monthly if m["status"] == "observed" and m["value"] is not None]
                    res = evaluate_series(periods, values, geo_id=geo_id)
            else:
                monthly = analytics["states"][ind_id][geo_id]["monthly"]
                trailing = []
                for m in reversed(monthly):
                    if m["status"] == "observed" and m["value"] is not None:
                        trailing.append(m)
                    else:
                        break
                trailing.reverse()
                periods = [m["period"] for m in trailing]
                values = [int(m["value"]) for m in trailing]
                res = evaluate_series(periods, values, geo_id=geo_id)

            res["geo_id"] = geo_id
            res["geo_name"] = geo_name
            res["indicator_id"] = ind_id
            results[ind_id][geo_id] = res

    results["general_ipd_attendance"] = {
        "IN": {
            "ready": False,
            "geo_id": "IN",
            "geo_name": "All-India",
            "indicator_id": "general_ipd_attendance",
            "reason": "General all-cause IPD attendance is not included in the verified Zenodo/MoHFW HMIS archive (direct HMIS/OGD downloads returned timeout/HTTP 503). Forecasting is withheld rather than simulated.",
        }
    }

    (PROCESSED_DIR / "forecast_results.json").write_text(json.dumps(results, indent=2, allow_nan=False), encoding="utf-8")
    return results
