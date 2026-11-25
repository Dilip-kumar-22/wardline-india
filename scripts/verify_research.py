"""Audit raw-to-runtime research results without importing pipeline internals for the oracle."""
import argparse
import calendar
import csv
import hashlib
import io
import json
import os
import statistics
import sys
import zipfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import jsonschema
import numpy as np


ROOT = Path(__file__).resolve().parent.parent
RAW = 'data/raw/zenodo_23657569/elnino-hmis-services-india-v1.0.1.zip'
BUNDLE = 'frontend/public/data/wardline_india_bundle.json'
EXPECTED_RAW = '9b87896f923b30a364f04d2ad890f3b2f12197ebcd9dcd184e34fa943b3eedbe'
EXPECTED_BASELINE = '2e42077db7bfffe2e17d2d4953291dfa48060f8ec59e50dcb4e39070936a992c'
UNITS = {'inst_del': 'deliveries', 'opd': 'attendances', 'anc_reg': 'registrations',
         'diarr_u5': 'cases', 'penta3': 'doses', 'mcv1': 'doses', 'fic': 'children'}
SEASONS = {'winter': (1, 2), 'pre_monsoon': (3, 4, 5), 'sw_monsoon': (6, 7, 8, 9),
           'post_monsoon': (10, 11, 12)}
PERIODS = [f'{i // 12}-{i % 12 + 1:02d}' for i in range(2012 * 12 + 3, 2020 * 12 + 3)]
MODELS = ('last_value_naive', 'seasonal_naive', 'ridge_seasonal_lag', 'additive_holt_winters')
HEADLINES = {('inst_del', 'IN'): (3.37, 2.69), ('inst_del', 'PB'): (3.06, 2.32),
             ('inst_del', 'BR'): (10.27, 7.20), ('opd', 'IN'): (5.73, 2.82),
             ('anc_reg', 'IN'): (4.76, 4.05), ('anc_reg', 'PB'): (6.02, 6.02)}


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def reject_non_finite(token):
    raise ValueError(f'Non-finite JSON token: {token}')


def dict_rows(data):
    return list(csv.DictReader(io.StringIO(data.decode('utf-8'), newline='')))


def zip_entry(archive, suffix):
    candidates = [name for name in archive.namelist() if name.endswith('/' + suffix)]
    require(len(candidates) == 1, f'Expected one archive entry for {suffix}, found {candidates}')
    return candidates[0]


def source_reconciliation(root, bundle):
    raw_bytes = (root / RAW).read_bytes()
    require(sha(raw_bytes) == EXPECTED_RAW, 'Upstream SHA-256 mismatch')
    with zipfile.ZipFile(io.BytesIO(raw_bytes)) as archive:
        members = archive.namelist()
        require(archive.testzip() is None, 'Upstream ZIP member CRC mismatch')
        source = zip_entry(archive, 'hmis_state_month.csv')
        raw = dict_rows(archive.read(source))
        states = dict_rows(archive.read(zip_entry(archive, 'state_frame.csv')))
        crosswalk = dict_rows(archive.read(zip_entry(archive, 'hmis_item_crosswalk.csv')))
        license_text = archive.read(zip_entry(archive, 'DATA_LICENSE.md')).decode()
        require('Creative Commons Attribution 4.0 International' in license_text, 'Derivative license missing')
        require('The raw HMIS workbooks are not redistributed' in license_text, 'Workbook redistribution boundary missing')
        spreadsheet_entries = [name for name in members if name.lower().endswith(('.xls', '.xlsx'))]
        require(all('/tests/' in name and 'synthetic_' in name for name in spreadsheet_entries),
                'Unexpected workbook in archive')

    names = {row['unit_id']: row['unit_name'] for row in states}
    require(len(names) == len(states) == 34, 'Invalid geography frame')
    require(len(raw) == 3264, 'Raw state-month row count')
    raw_keys = {(row['unit_id'], f"{row['year']}-{int(row['month']):02d}") for row in raw}
    require(raw_keys == {(geo, period) for geo in names for period in PERIODS}, 'Raw calendar or geography mismatch')
    columns = {(item['indicator'], item['era']): item['item_codes'] for item in crosswalk}
    for indicator, unit in UNITS.items():
        require(bundle['indicators'][indicator]['unit'] == unit, f'Bundle unit mismatch {indicator}')
        for era in ('E1', 'E2'):
            actual_codes = bundle['indicators'][indicator][era.lower() + '_codes'].split(' (')[0]
            require(actual_codes.split(' + ') == columns[indicator, era].split('|'), f'Incorrect codes {indicator} {era}')

    normalized = (root / 'data/processed/hmis_normalized_monthly.csv').read_bytes()
    norm = dict_rows(normalized)
    completeness_rows = dict_rows((root / 'data/processed/hmis_completeness.csv').read_bytes())
    completeness = {(row['geo_id'], row['period'], row['indicator_id']): row for row in completeness_rows}
    schema_path = root / 'contracts/monthly-observation.schema.json'
    validator = jsonschema.Draft202012Validator(json.loads(schema_path.read_text(encoding='utf-8')))
    statuses, keys, canonical = Counter(), set(), set()
    by_series = defaultdict(dict)
    min_observed, max_masked, zeros = 1, 0, 0
    for row in norm:
        indicator = row['indicator_id']
        geo, period = row['geo_id'], row['period']
        key = geo, period, indicator
        canonical_key = tuple(row[field] for field in ('source_id', 'vintage', 'period', 'geo_level',
                                                     'geo_id', 'facility_scope', 'indicator_id', 'stratum'))
        require(key not in keys and canonical_key not in canonical, f'Duplicate observation {key}')
        keys.add(key)
        canonical.add(canonical_key)
        prefix, original_row = row['row_locator'].split(':row_')
        offset = int(original_row) - 2
        require(prefix == 'hmis_state_month.csv' and 0 <= offset < len(raw), f'Invalid locator {key}')
        upstream = raw[offset]
        require((upstream['unit_id'], f"{upstream['year']}-{int(upstream['month']):02d}") == key[:2], f'Wrong locator {key}')
        require(row['geo_name'] == names[geo] and row['unit'] == UNITS[indicator], f'Geography/unit mismatch {key}')
        require(row['raw_indicator'] == bundle['indicators'][indicator]['raw_indicator'], f'Definition mismatch {key}')
        site_count = upstream['comp_' + indicator]
        flag = upstream['flag_' + indicator]
        expected = upstream[indicator]
        val = int(row['value']) if row['value'] else None
        expected_status = 'observed' if expected else ('not_reported' if 'comp_lt' in flag else 'missing')
        require(val == (int(float(expected)) if expected else None) and row['status'] == expected_status,
                f'Status or value mismatch {key}')
        require(not expected or float(expected).is_integer(), f'Nonintegral upstream count {key}')
        comp = completeness[key]
        if site_count:
            require(float(comp['completeness']) == float(site_count), f'Completeness mismatch {key}')
        else:
            require(not comp['completeness'], f'Unexpected completeness {key}')
        require(comp['flag'] == flag, f'Completeness flag mismatch {key}')
        if expected_status == 'observed':
            require(site_count and float(site_count) >= 0.9, f'Observed row below threshold {key}')
            min_observed = min(min_observed, float(site_count))
            zeros += val == 0
        elif expected_status == 'not_reported':
            require(site_count and float(site_count) < 0.9, f'Not-reported row above threshold {key}')
            max_masked = max(max_masked, float(site_count))
        validator.validate({**row, 'parent_geo_id': row['parent_geo_id'] or None, 'value': val})
        statuses[expected_status] += 1
        by_series[indicator, geo][period] = val, expected_status

    require(len(norm) == len(keys) == len(completeness) == len(completeness_rows) == 22848,
            'Incomplete or duplicate normalized cross product')
    require(statuses == {'observed': 22294, 'not_reported': 508, 'missing': 46}, 'Unexpected status counts')
    require(set(by_series) == {(indicator, geo) for indicator in UNITS for geo in names}, 'Missing series')
    require(all(list(sorted(s)) == PERIODS for s in by_series.values()), 'Unreconciled series calendar')
    require(set(names) == {entry['geo_id'] for entry in bundle['analytics']['states_directory']}, 'Runtime reporting-unit mismatch')
    return by_series, {
        'upstream_archive_sha256': sha(raw_bytes), 'archive_entries': len(members), 'raw_member': source,
        'upstream_state_month_rows': len(raw), 'geographic_units': len(names), 'calendar_months': len(PERIODS),
        'indicator_count': len(UNITS), 'matched_e1_e2_crosswalks': 2 * len(UNITS),
        'spreadsheet_members_are_synthetic_fixtures': spreadsheet_entries,
        'original_government_workbooks_authenticated': False, 'normalized_csv_sha256': sha(normalized),
        'unique_keys': len(keys), 'rows_reconciled_to_exact_source_locator_and_value': len(norm),
        'rows_independently_schema_validated': len(norm), 'completeness_flags_and_values_reconciled': len(completeness),
        'statuses': dict(statuses), 'observed_zero': zeros, 'minimum_observed_completeness': min_observed,
        'maximum_not_reported_completeness': max_masked, 'source_period_first': PERIODS[0], 'source_period_last': PERIODS[-1],
        'licenses': ['CC BY 4.0 for harmonized derivative', 'GODL-India for underlying HMIS', 'MIT for upstream code'],
    }


def percentile(values, fraction):
    ordered = sorted(values)
    position = fraction * (len(ordered) - 1)
    lower = int(position)
    return ordered[lower] + (position - lower) * (ordered[min(lower + 1, len(ordered) - 1)] - ordered[lower])


def descriptive_metrics(rows, series, label):
    values = [rows[p][0] for p in PERIODS]
    observed = [v for v in values if v is not None]
    require(series['observed_months'] == len(observed) and series['total_observed'] == sum(observed), label + ' aggregate')
    require(series['median_monthly'] == (statistics.median(observed) if observed else None), label + ' median')
    require(series['coverage_pct'] == round(100 * len(observed) / 96, 2), label + ' coverage')
    require(len(series['monthly']) == 96 and len(series['month_profile']) == 12 and len(series['seasonal_summary']) == 4,
            label + ' incomplete published analytics')
    for i, row in enumerate(series['monthly']):
        period, value = PERIODS[i], values[i]
        year, month = map(int, period.split('-'))
        days = calendar.monthrange(year, month)[1]
        previous = values[i - 12] if i >= 12 else None
        rolling = values[max(0, i - 11):i + 1]
        season = next(key for key, months in SEASONS.items() if month in months)
        expected = {'period': period, 'value': value, 'status': rows[period][1], 'days': days, 'season': season,
                    'daily_rate': round(value / days, 2) if value is not None else None,
                    'yoy_diff': value - previous if value is not None and previous is not None else None,
                    'yoy_pct': round(100 * (value - previous) / previous, 2) if value is not None and previous else None,
                    'rolling_12m': round(statistics.mean(rolling), 1) if len(rolling) == 12 and None not in rolling else None}
        for field, want in expected.items():
            require(row[field] == want, f'{label} {period} {field}: {row[field]} != {want}')
    for profile in series['month_profile']:
        month_values = [values[i] for i, p in enumerate(PERIODS)
                        if int(p[-2:]) == profile['month'] and values[i] is not None]
        require(profile['n_years'] == len(month_values), label + ' profile sample count')
        for field, fraction in (('q25', 0.25), ('median', 0.5), ('q75', 0.75)):
            want = round(percentile(month_values, fraction), 1) if month_values else None
            require(profile[field] == want, f'{label} month {profile["month"]} {field}')
    for season in series['seasonal_summary']:
        months = SEASONS[season['season_id']]
        present = {int(p[:4]): [rows.get(f'{p[:4]}-{m:02d}', (None, None))[0] for m in months] for p in PERIODS}
        complete = {year: vals for year, vals in present.items() if None not in vals}
        require(season['complete_years'] == sorted(complete), label + ' incomplete season handling')
        rates = [sum(vals) / sum(calendar.monthrange(year, m)[1] for m in months) for year, vals in complete.items()]
        want = round(statistics.mean(rates), 2) if rates else None
        require(season['mean_daily_count'] == want, f'{label} {season["season_id"]} mean daily count')


def aggregate_reconciliation(by_series, bundle):
    aggregated = {}
    institutions = None
    analytics = bundle['analytics']
    for indicator in UNITS:
        states = {geo: series for (ind, geo), series in by_series.items() if ind == indicator}
        for geo, rows in states.items():
            published = analytics['states'][indicator][geo]
            descriptive_metrics(rows, published, f'{indicator}/{geo}')
            fy = [v for p, (v, _) in rows.items() if '2019-04' <= p <= '2020-03']
            fy_total = sum(fy) if len(fy) == 12 and None not in fy else None
            require(published['fy2019_20_total'] == fy_total, f'{indicator}/{geo} fiscal-year count')
        cohort = [geo for geo, rows in sorted(states.items()) if all(v is not None for v, _ in rows.values())]
        nat = analytics['national'][indicator]
        variables = {}
        fixed = {}
        coverage_counts = Counter()
        for row in nat['monthly']:
            period = row['period']
            values = [rows[period][0] for rows in states.values() if rows[period][0] is not None]
            coverage_counts[len(values)] += 1
            variables[period] = (sum(values), 'observed') if len(values) >= 30 else (None, 'not_reported')
            fixed[period] = sum(states[geo][period][0] for geo in cohort) if cohort else None
            require(row['fixed_cohort_value'] == fixed[period], f'{indicator} {period} fixed-cohort sum')
            require(row['states_reporting'] == len(values), f'{indicator} {period} reporting count')
            require(row['coverage_status'] == ('complete_34_of_34' if len(values) == 34 else 'partial_reporting_sum'),
                    f'{indicator} {period} coverage classification')
        descriptive_metrics(variables, nat, f'{indicator}/IN variable coverage')
        require(nat['national_comparability']['fixed_cohort_state_ids'] == cohort, f'{indicator} cohort membership')
        aggregated[indicator] = fixed
        if indicator == 'inst_del':
            institutions = {'possible_units': len(states), 'complete_months': coverage_counts[34],
                            'partial_months': 96 - coverage_counts[34], 'fixed_cohort_units': len(cohort),
                            'fixed_cohort_unit_ids': cohort, 'monthly_reporting_counts': dict(sorted(coverage_counts.items())),
                            'punjab_eight_year_total': sum(v for v, _ in states['PB'].values()),
                            'bihar_eight_year_total': sum(v for v, _ in states['BR'].values())}
    require([institutions[k] for k in ('possible_units', 'complete_months', 'partial_months', 'fixed_cohort_units')]
            == [34, 49, 47, 29], 'Institutional-delivery coverage reference mismatch')
    return aggregated, institutions


def model_predictions(name, values, tag_periods, cutoff):
    train = values[:cutoff]
    if name == 'seasonal_naive':
        return list(train[-12:])
    if name == 'last_value_naive':
        return [train[-1]] * 12
    if name == 'additive_holt_winters':
        level = statistics.mean(train[:12])
        slope = (statistics.mean(train[12:24]) - level) / 12
        seasonal = [train[i] - level for i in range(12)]
        for i in range(12, cutoff):
            cycle = i % 12
            revised = 0.25 * (train[i] - seasonal[cycle]) + 0.75 * (level + slope)
            slope = 0.05 * (revised - level) + 0.95 * slope
            seasonal[cycle] = 0.25 * (train[i] - revised) + 0.75 * seasonal[cycle]
            level = revised
        return [max(0, level + (h + 1) * slope + seasonal[(cutoff + h) % 12]) for h in range(12)]

    def features(i, values_so_far):
        year, month = map(int, tag_periods[i].split('-'))
        return [i, values_so_far[i - 1], values_so_far[i - 12], (year, month) >= (2017, 4),
                *(month == m for m in range(2, 13))]

    x = np.array([features(i, train) for i in range(12, cutoff)], dtype=float)
    means, scales = x.mean(axis=0), x.std(axis=0)
    scales[scales == 0] = 1
    design = (x - means) / scales
    targets = np.array(train[12:], dtype=float)
    response_mean = targets.mean()
    # Solve augmented least squares independently of production's normal equation.
    augmented = np.vstack((design, np.sqrt(10) * np.eye(design.shape[1])))
    y = np.concatenate((targets - response_mean, np.zeros(design.shape[1])))
    coefficients = np.linalg.lstsq(augmented, y, rcond=None)[0]
    history = list(train)
    for i in range(cutoff, cutoff + 12):
        prediction = response_mean + ((features(i, history) - means) / scales) @ coefficients
        history.append(max(0, float(prediction)))
    return history[-12:]


def error_metrics(actual, predicted):
    errors = [a - p for a, p in zip(actual, predicted)]
    denominator = sum(map(abs, actual))
    return {'mae': round(statistics.mean(map(abs, errors)), 1),
            'rmse': round(statistics.mean(e * e for e in errors) ** 0.5, 1),
            'wape_pct': round(100 * sum(map(abs, errors)) / denominator, 2) if denominator else None}


def forecast_reconciliation(root, by_series, aggregated, bundle):
    rows = []
    sys.path.insert(0, os.fspath(root))
    from pipeline.forecast import evaluate_series

    for (indicator, geo), reference in HEADLINES.items():
        values = [aggregated[indicator][p] if geo == 'IN' else by_series[indicator, geo][p][0] for p in PERIODS]
        want = bundle['forecasts'][indicator][geo]
        dev_predictions = {name: model_predictions(name, values, PERIODS, 60) + model_predictions(name, values, PERIODS, 72)
                           for name in MODELS}
        dev_metrics = {name: error_metrics(values[60:84], pred) for name, pred in dev_predictions.items()}
        candidate = min(MODELS[2:], key=lambda name: dev_metrics[name]['mae'])
        selected = candidate if dev_metrics[candidate]['mae'] < dev_metrics['seasonal_naive']['mae'] else 'seasonal_naive'
        holdout_predictions = {name: model_predictions(name, values, PERIODS, 84) for name in MODELS}
        holdout = {name: error_metrics(values[84:], pred) for name, pred in holdout_predictions.items()}
        band = round(percentile([abs(a - b) for a, b in zip(values[60:84], dev_predictions[selected])], 0.8), 1)
        actual = holdout['seasonal_naive']['wape_pct'], holdout[selected]['wape_pct']
        label = f'{indicator}/{geo}'
        require(actual == reference, f'{label} expected headline {reference}, got {actual}')
        require(selected == want['selected_model'] and dev_metrics == want['cv_metrics'], f'{label} development CV drift')
        require(holdout == want['holdout_metrics'], f'{label} retrospective metrics drift')
        require(band == want['empirical_abs_error_p80_halfwidth'], f'{label} development error band drift')
        require(len(want['holdout_series']) == 12, f'{label} incomplete retrospective series')
        for i, record in enumerate(want['holdout_series']):
            require(record['period'] == PERIODS[84 + i] and record['actual'] == values[84 + i], f'{label} holdout identity')
            require(all(record[name] == round(holdout_predictions[name][i]) for name in MODELS), f'{label} rounded prediction')
        perturbed_values = values[:84] + [v * 7 + i for i, v in enumerate(values[84:])]
        original = evaluate_series(PERIODS, values)
        perturbed = evaluate_series(PERIODS, perturbed_values)
        for key in ('selected_model', 'cv_metrics', 'empirical_abs_error_p80_halfwidth'):
            require(original[key] == perturbed[key], f'{label} holdout value perturbation changed {key}')
        require(original['holdout_metrics'] != perturbed['holdout_metrics'], f'{label} perturbation did not reach evaluator')
        rows.append({'indicator': indicator, 'geography': geo, 'model': selected,
                     'development_metrics': dev_metrics, 'retrospective_metrics': holdout,
                     'seasonal_naive_wape_pct': actual[0], 'selected_wape_pct': actual[1],
                     'development_empirical_error_p80_halfwidth': band, 'holdout_value_perturbation_passed': True})

    require(evaluate_series(PERIODS[:72], [100] * 72)['ready'], '72 consecutive months must be ready')
    require(not evaluate_series(PERIODS[:71], [100] * 71)['ready'], '71 months must be rejected')
    require(not evaluate_series(PERIODS[:36] + PERIODS[37:73], [100] * 72)['ready'], 'Gapped series accepted')
    require(error_metrics([0, 0], [1, 2]) == {'mae': 1.5, 'rmse': 1.6, 'wape_pct': None}, 'Zero-denominator oracle')
    return {'status': 'PASS', 'headline_rows': rows, 'holdout_value_perturbations': len(rows),
            'readiness_checks': {'72_months_accepted': True, '71_months_rejected': True, 'calendar_gap_rejected': True},
            'ridge_alpha': 10, 'holt_winters_alpha_beta_gamma': [0.25, 0.05, 0.25],
            'hyperparameter_search_implemented': False, 'last_value_naive_role': 'comparator',
            'selection_criterion': 'candidate must beat seasonal naive on rounded development CV MAE',
            'final_evaluation_scope': 'FY 2019–20 retrospective benchmark previously inspected during v1.0.0',
            'selection_isolation_scope': 'Holdout values for a fixed series. Official national cohort membership uses observed availability over the complete 96-month archive.',
            'empirical_band_scope': 'Uncalibrated 80th percentile of absolute development CV residuals'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=ROOT)
    parser.add_argument('--baseline-archive', type=Path)
    parser.add_argument('--output-dir', type=Path, default=ROOT / 'evidence' / 'research')
    args = parser.parse_args()
    root = args.root.resolve()
    bundle_bytes = (root / BUNDLE).read_bytes()
    bundle = json.loads(bundle_bytes, parse_constant=reject_non_finite)
    by_series, integrity = source_reconciliation(root, bundle)
    aggregated, institution = aggregate_reconciliation(by_series, bundle)
    forecasts = forecast_reconciliation(root, by_series, aggregated, bundle)
    integrity.update({'status': 'PASS', 'bundle_sha256': sha(bundle_bytes), 'strict_bundle_json': True,
                      'regional_series_recomputed': len(by_series), 'national_series_recomputed': len(aggregated),
                      'institutional_deliveries': institution})
    if args.baseline_archive:
        with zipfile.ZipFile(args.baseline_archive) as archive:
            original_bytes = archive.read(BUNDLE)
            original_csv = archive.read('data/processed/hmis_normalized_monthly.csv')
        require(sha(original_bytes) == EXPECTED_BASELINE, 'Preserved v1.4.1 bundle SHA-256 mismatch')
        original = json.loads(original_bytes, parse_constant=reject_non_finite)
        prior_analytics = original['analytics']
        for indicator in UNITS:
            regional = [
                *prior_analytics['regional_rankings'][indicator],
                *prior_analytics['states'][indicator].values(),
                *prior_analytics['pb_br_spotlight'][indicator].values(),
            ]
            for entry in regional:
                entry.pop('population_2019', None)
                entry.pop('fy2019_20_per_100k', None)
        for field in ('schema_version', 'mode', 'source', 'seasons', 'unavailable_dimensions', 'analytics', 'forecasts'):
            require(original[field] == bundle[field], f'Substantive v1.4.1 bundle drift in {field}')
        metadata_differences = [f'{ind}.{field}' for ind, meta in bundle['indicators'].items() for field, value in meta.items()
                                if original['indicators'][ind][field] != value]
        require(set(metadata_differences) in (set(), {'mcv1.short_label', 'mcv1.raw_indicator', 'mcv1.format_break_note'}),
                f'Unexpected indicator metadata drift: {metadata_differences}')
        if metadata_differences:
            break_note = bundle['indicators']['mcv1']['format_break_note']
            require('0–11 months' in break_note and '9–11 months' in break_note, 'Measles/MR crosswalk ages not explained')
        quality = dict(bundle['quality'])
        full_source_reconciliations = quality.pop('source_reconciled_rows', None)
        require(quality == original['quality'] and full_source_reconciliations in (22848, None), 'Unexpected quality-report drift')
        current_csv = (root / 'data/processed/hmis_normalized_monthly.csv').read_bytes()
        old_rows, regenerated_rows = dict_rows(original_csv), dict_rows(current_csv)
        require(len(old_rows) == len(regenerated_rows) == 22848, 'Baseline normalized CSV row count changed')
        changed_raw_labels = 0
        for old, regenerated in zip(old_rows, regenerated_rows):
            if metadata_differences and old['indicator_id'] == 'mcv1':
                require(regenerated['raw_indicator'] == bundle['indicators']['mcv1']['raw_indicator'], 'Measles/MR source label drift')
                changed_raw_labels += old['raw_indicator'] != regenerated['raw_indicator']
                old['raw_indicator'] = regenerated['raw_indicator']
            require(old == regenerated, f'Unexplained drift in normalized CSV at {old["row_locator"]}')
        require(changed_raw_labels == (3264 if metadata_differences else 0), 'Unexpected count of definition changes in normalized rows')
        integrity['baseline_comparison'] = {
            'baseline_sha256': sha(original_bytes), 'research_values_equal': True,
            'bundled_quality_additional_source_reconciled_rows': full_source_reconciliations,
            'indicator_metadata_changes': metadata_differences,
            'normalized_rows_with_corrected_raw_indicator_label': changed_raw_labels,
            'normalized_csv_line_endings_changed': (b'\r\n' in original_csv) != (b'\r\n' in current_csv),
            'publication_timestamp_equal': original['generated_utc'] == bundle['generated_utc'],
        }
    args.output_dir.mkdir(parents=True, exist_ok=True)
    generated = datetime.now(timezone.utc).isoformat()
    for name, report in (('DATA_INTEGRITY_REPORT.json', integrity), ('FORECAST_VERIFICATION.json', forecasts)):
        report['verified_utc'] = generated
        (args.output_dir / name).write_text(json.dumps(report, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    print(f"Reconciled {integrity['unique_keys']} source observations, {len(by_series)} regional series, "
          f"{len(aggregated)} national series, and {len(forecasts['headline_rows'])} headline forecasts.")


if __name__ == '__main__':
    main()
