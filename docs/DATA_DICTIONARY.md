# Data dictionary

The [observation contract](../contracts/monthly-observation.schema.json) defines the normalized row. The identity is `period` (calendar month, YYYY-MM), `geo_id` (harmonized reporting unit) and `indicator_id`. `value` is a nonnegative count for observed cells and null for unavailable cells. `status` is `observed`, `not_reported` or `missing`. Other fields hold the count unit, time and geography grain, source identity, reporting status, raw label and source row locator.

| ID | Measure |
|---|---|
| `inst_del` | Institutional deliveries |
| `opd` | Outpatient attendance |
| `anc_reg` | Antenatal care registrations |
| `diarr_u5` | Reported under-five diarrhoea cases |
| `penta3` | Pentavalent/DPT third doses |
| `mcv1` | Measles/MR first doses, with a source definition transition |
| `fic` | Fully immunised children |

The [import template](../data/monthly-import-template.csv) is an example contract for institutional CSVs. Imported rows stay in a separate, unverified browser session. Source row locators refer to the aggregate derivative and contain no patient identifiers.
