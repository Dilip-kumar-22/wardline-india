# Data sources and acquisition

The study uses the April 2012 through March 2020 HMIS panel in Siddalingaiah H S's Zenodo v1.0.1 archive. The public build reads the panel and its format-break summary. It uses only the reporting code and name columns of the reference table. The 34 units include AP_TG, JK, and DNH_DD, which pool historical reporting areas for continuity.

Acquire the exact 3,460,316-byte ZIP with `python -m pipeline acquire`, or place a separately acquired copy at `data/raw/zenodo_23657569/elnino-hmis-services-india-v1.0.1.zip`. Expected SHA-256:

```text
9b87896f923b30a364f04d2ad890f3b2f12197ebcd9dcd184e34fa943b3eedbe
```

The mixed-license ZIP and original lookup table are research inputs acquired directly from upstream. The public distribution uses the separable HMIS observations, calendar-day rates, reporting coverage and retrospective forecasts. It excludes GADM identifiers, population-derived values, and political geometry.

The license in the upstream archive covers the HMIS derivative under CC BY 4.0 with the applicable GODL-India attribution. The pipeline reconciles to that derivative. Original government workbook authentication was outside this verification. [Zenodo record](https://doi.org/10.5281/zenodo.23657569) · [Upstream data license](https://github.com/hssling/elnino-hmis-services-india/blob/main/DATA_LICENSE.md) · [Third-party notices](../THIRD_PARTY_NOTICES.md)
