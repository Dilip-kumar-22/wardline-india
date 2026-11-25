# Methodology

WARDLINE INDIA analyzes seven historical service-utilization indicators. It filters the harmonized HMIS derivative to April 2012–March 2020 and normalizes values to one observation per indicator, reporting unit and month. The source includes historical continuity units that pool Andhra Pradesh and Telangana, Jammu and Kashmir and Ladakh, and Dadra and Nagar Haveli and Daman and Diu.

The completeness gate masks insufficiently reported state-months as `not_reported`. Records without a source value outside that mask are `missing`. Both are excluded from rate arithmetic. Observed zero is a valid count. Daily rates divide by the actual calendar days in each month, including leap days. National fixed-cohort series compare the same fully observed units for each indicator. Cohort size differs by indicator and the selected units do not imply nationwide coverage.

Forecasts compare last-value naive, seasonal naive, ridge with seasonal lags and fixed-parameter additive Holt–Winters. Two expanding, 12-month development validation folds precede the FY 2019–20 retrospective test. An alternative is selected only if it beats seasonal naive on development MAE. The pipeline reports retrospective MAE, RMSE and WAPE. The empirical error band uses development residuals and has no calibrated prediction-interval guarantee. Cohort availability is defined over the full archive, and model selection is checked independently of holdout values for the fixed series.

| Historical comparison | Seasonal naive WAPE | Selected model WAPE |
|---|---:|---:|
| Institutional deliveries, national fixed cohort | 3.37% | 2.69% |
| Institutional deliveries, Punjab | 3.06% | 2.32% |
| Institutional deliveries, Bihar | 10.27% | 7.20% |
| OPD attendance, national fixed cohort | 5.73% | 2.82% |
| ANC registration, national fixed cohort | 4.76% | 4.05% |
| ANC registration, Punjab | 6.02% | 6.02% |

The checks in `scripts/verify_research.py` independently recompute source and forecast values. See [data sources](DATA_SOURCES.md) and [limitations](LIMITATIONS.md).
