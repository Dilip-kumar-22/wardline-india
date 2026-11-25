"""Configuration, official MoHFW HMIS indicator metadata, and IMD seasonal bins."""
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
RAW_ZIP_PATH = ROOT_DIR / "data" / "raw" / "zenodo_23657569" / "elnino-hmis-services-india-v1.0.1.zip"
EXPECTED_RAW_SHA256 = "9b87896f923b30a364f04d2ad890f3b2f12197ebcd9dcd184e34fa943b3eedbe"
CONTRACTS_DIR = ROOT_DIR / "contracts"
PROCESSED_DIR = ROOT_DIR / "data" / "processed"
MANIFESTS_DIR = ROOT_DIR / "data" / "manifests"
FRONTEND_DATA_DIR = ROOT_DIR / "frontend" / "public" / "data"

SOURCE_ID = "mohfw_hmis_zenodo_23657569"
VINTAGE = "v1.0.1 (HMIS FY2012-13 to FY2019-20; archived 2026-10)"
SOURCE_ATTRIBUTION = (
    "Health Management Information System (HMIS), Ministry of Health and Family Welfare, "
    "Government of India; via data.gov.in / hmis.mohfw.gov.in; Government Open Data License – India. "
    "Harmonised state-month panel archived under CC BY 4.0 (Siddalingaiah H S, 2026, DOI: 10.5281/zenodo.23657569)."
)

# IMD seasonal convention (project analytical convention; cited in state/SOURCES.md S07)
SEASONS = [
    {"id": "winter", "label": "Winter", "months": [1, 2], "month_span": "Jan–Feb"},
    {"id": "pre_monsoon", "label": "Pre-Monsoon", "months": [3, 4, 5], "month_span": "Mar–May"},
    {"id": "sw_monsoon", "label": "Southwest Monsoon", "months": [6, 7, 8, 9], "month_span": "Jun–Sep"},
    {"id": "post_monsoon", "label": "Post-Monsoon", "months": [10, 11, 12], "month_span": "Oct–Dec"},
]

MONTH_TO_SEASON = {m: s["id"] for s in SEASONS for m in s["months"]}

INDICATORS = {
    "inst_del": {
        "indicator_id": "inst_del",
        "short_label": "Institutional Deliveries",
        "raw_indicator": "Number of Institutional Deliveries conducted (Including C-Sections)",
        "category": "Inpatient Obstetric Utilization",
        "unit": "deliveries",
        "facility_scope": "public_and_private_reporting_facilities",
        "e1_codes": "2.2 + 2.3 (Public + Private)",
        "e2_codes": "2.2 (Combined)",
        "format_break_note": "Harmonised across April 2017 HMIS format change by summing E1 public (2.2) + private (2.3) to match E2 combined (2.2).",
        "is_primary_inpatient_proxy": True,
    },
    "opd": {
        "indicator_id": "opd",
        "short_label": "Outpatient Attendance (OPD)",
        "raw_indicator": "Outpatient Attendance (Allopathic + AYUSH)",
        "category": "Outpatient Utilization",
        "unit": "attendances",
        "facility_scope": "all_reporting_facilities",
        "e1_codes": "14.12.1 (OPD Attendance All)",
        "e2_codes": "14.2.1 + 14.2.2 (Allopathic + AYUSH)",
        "format_break_note": "E2 sums Allopathic (14.2.1) and AYUSH (14.2.2) outpatient attendance to approximate E1 OPD Attendance All (14.12.1).",
        "is_primary_inpatient_proxy": False,
    },
    "anc_reg": {
        "indicator_id": "anc_reg",
        "short_label": "Antenatal Care (ANC) Registrations",
        "raw_indicator": "Total number of pregnant women registered for ANC",
        "category": "Maternal Care",
        "unit": "registrations",
        "facility_scope": "all_reporting_facilities",
        "e1_codes": "1.1",
        "e2_codes": "1.1",
        "format_break_note": "Item definition unchanged across the April 2017 HMIS format transition.",
        "is_primary_inpatient_proxy": False,
    },
    "diarr_u5": {
        "indicator_id": "diarr_u5",
        "short_label": "Under-5 Diarrhoea Cases",
        "raw_indicator": "Childhood Diseases - Diarrhoea (0–5 years)",
        "category": "Paediatric Morbidity",
        "unit": "cases",
        "facility_scope": "all_reporting_facilities",
        "e1_codes": "12.7 (Diarrhoea & dehydration <5 yrs)",
        "e2_codes": "10.11 (Childhood diseases - Diarrhoea)",
        "format_break_note": "Wording changed in April 2017 (E1 12.7 vs E2 10.11; inpatient items 10.12/14.4.7 excluded in E2). Interpret pre/post-2017 level shifts with caution.",
        "is_primary_inpatient_proxy": False,
    },
    "penta3": {
        "indicator_id": "penta3",
        "short_label": "Pentavalent 3 / DPT3 Immunisation",
        "raw_indicator": "Child Immunisation - Pentavalent 3 (0–11 months)",
        "category": "Child Immunisation",
        "unit": "doses",
        "facility_scope": "all_reporting_facilities",
        "e1_codes": "10.1.04C + 10.1.04 (Penta3 + DPT3)",
        "e2_codes": "9.1.8 (Pentavalent 3)",
        "format_break_note": "E1 combines Pentavalent 3 and DPT3 during national phased rollout; E2 uses 9.1.8.",
        "is_primary_inpatient_proxy": False,
    },
    "mcv1": {
        "indicator_id": "mcv1",
        "short_label": "Measles / MR 1st Dose",
        "raw_indicator": "Child Immunisation - MR / Measles 1st Dose",
        "category": "Child Immunisation",
        "unit": "doses",
        "facility_scope": "all_reporting_facilities",
        "e1_codes": "10.1.12",
        "e2_codes": "9.2.1 + 9.2.2 (MR + Measles 1st dose)",
        "format_break_note": "E1 reports first measles doses for infants aged 0–11 months (10.1.12). E2 sums MR (9.2.1) and measles (9.2.2) first doses for ages 9–11 months. Account for both changes when comparing counts across April 2017.",
        "is_primary_inpatient_proxy": False,
    },
    "fic": {
        "indicator_id": "fic",
        "short_label": "Fully Immunised Children (9–11m)",
        "raw_indicator": "Children aged 9–11 months fully immunised (Male + Female)",
        "category": "Child Immunisation",
        "unit": "children",
        "facility_scope": "all_reporting_facilities",
        "e1_codes": "10.1.13.c",
        "e2_codes": "9.2.4.a + 9.2.4.b",
        "format_break_note": "E2 sums male (9.2.4.a) and female (9.2.4.b) to match E1 total (10.1.13.c).",
        "is_primary_inpatient_proxy": False,
    },
}

UNAVAILABLE_DIMENSIONS = [
    {
        "id": "general_ipd_attendance",
        "label": "All-Cause General Inpatient Department (IPD) Attendance",
        "reason": "Direct downloads from hmis.mohfw.gov.in (timeout) and data.gov.in (HTTP 503) were blocked in the build environment. The verified Zenodo/MoHFW HMIS archive (DOI: 10.5281/zenodo.23657569) covers Institutional Deliveries (inpatient obstetric utilization) and OPD Attendance, not general all-cause IPD.",
        "resolution": "Import an official MoHFW HMIS monthly IPD CSV export via the Data & Methods tab using the monthly-observation.schema.json contract.",
    },
    {
        "id": "facility_tier_breakdown",
        "label": "Facility-Tier Breakdown (DH / SDH / CHC / PHC)",
        "reason": "The verified state-month panel aggregates across reporting facilities within each state/UT without separating District Hospitals, Sub-District Hospitals, CHCs, and PHCs.",
        "resolution": "Unavailable in current verified release; never fabricated or inferred.",
    },
    {
        "id": "patient_demographics_age_sex_diagnosis",
        "label": "Individual Patient Demographics (Age, Sex, ICD-10 Diagnosis)",
        "reason": "Public MoHFW HMIS releases are aggregate monthly facility counts, not patient-level electronic health records.",
        "resolution": "Aggregate utilization indicators cannot be disaggregated to unique patients, bed occupancy, or clinical diagnoses.",
    },
]
