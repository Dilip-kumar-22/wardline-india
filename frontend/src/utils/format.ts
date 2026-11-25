import { ImportedObservation } from '../types/wardline';

export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const VALID_STATUSES = new Set(['observed', 'missing', 'suppressed', 'not_reported']);
const VALID_GEO_LEVELS = new Set(['national', 'state_ut', 'district', 'subdistrict', 'facility']);
const NON_ADDITIVE_UNIT_RE = /(%|percent|percentage|rate|per[_\s-]?100k|per[_\s-]?1000|ratio|index|proportion|mean|average)/i;

export function fmtIN(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return Math.round(n).toLocaleString('en-IN');
}

export function fmtCompactIN(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${(n / 1e5).toFixed(2)} L`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return Math.round(n).toLocaleString('en-IN');
}

export function fmtPct(n: number | null | undefined, signed = false): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const sign = signed && n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

export function fmtPeriod(period: string): string {
  const [y, m] = period.split('-');
  const idx = parseInt(m, 10) - 1;
  return `${MONTH_SHORT[idx] ?? m} ${y}`;
}

/** Mitigate CSV formula injection (=, +, -, @, tab, CR) on export. */
export function sanitizeCsvCell(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'number') return Number.isFinite(raw) ? String(raw) : '';
  const safe = /^[\t\r]|^\s*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

/** RFC-4180 compliant single-line quoted CSV parser. */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        if (cur.length > 0) {
          throw new Error('Malformed quoted CSV field.');
        }
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
  }
  if (inQuotes) {
    throw new Error('Unterminated quoted CSV field.');
  }
  fields.push(cur.trim());
  return fields;
}

/**
 * Validate and parse user-imported CSV with strict schema, stratum, geo-level,
 * and additive-count measurement semantics (DEF-09).
 */
export function parseWardlineCsv(rawText: string): { rows: ImportedObservation[]; format: string } {
  const cleaned = rawText.replace(/^\uFEFF/, '').trim();
  if (!cleaned) throw new Error('File is empty.');
  const lines = cleaned.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error('CSV must include a header row and at least one observation row.');
  if (lines.length > 50001) throw new Error('Row limit exceeded (maximum 50,000 rows).');

  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const periodIdx = header.indexOf('period');
  const valueIdx = header.indexOf('value');
  if (periodIdx === -1 || valueIdx === -1) {
    throw new Error('Header must include at least "period" (YYYY-MM) and "value" columns.');
  }

  const geoLevelIdx = header.indexOf('geo_level');
  const geoIdIdx = header.indexOf('geo_id');
  const geoNameIdx = header.indexOf('geo_name');
  const indIdx = header.indexOf('indicator_id');
  const rawIndIdx = header.indexOf('raw_indicator');
  const unitIdx = header.indexOf('unit');
  const stratumIdx = header.indexOf('stratum');
  const statusIdx = header.indexOf('status');
  const modeIdx = header.indexOf('mode');

  const seen = new Set<string>();
  const indicatorUnits = new Map<string, string>();
  const indicatorGeoLevels = new Map<string, string>();
  const geoIdToName = new Map<string, string>();
  const rows: ImportedObservation[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = parseCsvLine(lines[i]);
    if (parts.length !== header.length) {
      throw new Error(`Row ${i + 1}: expected ${header.length} columns, found ${parts.length}.`);
    }

    const period = parts[periodIdx] ?? '';
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      throw new Error(`Row ${i + 1}: invalid period "${period}" (expected YYYY-MM).`);
    }

    const geo_level_raw = geoLevelIdx >= 0 && parts[geoLevelIdx] ? parts[geoLevelIdx].toLowerCase() : 'state_ut';
    if (!VALID_GEO_LEVELS.has(geo_level_raw)) {
      throw new Error(`Row ${i + 1}: unknown geo_level "${geo_level_raw}".`);
    }

    const geo_name = geoNameIdx >= 0 && parts[geoNameIdx] ? parts[geoNameIdx] : 'Imported Geography';
    const geo_id =
      geoIdIdx >= 0 && parts[geoIdIdx]
        ? parts[geoIdIdx]
        : geo_name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 12) || 'IMP';
    const indicator_id = indIdx >= 0 && parts[indIdx] ? parts[indIdx] : 'imported_indicator';
    const raw_indicator = rawIndIdx >= 0 && parts[rawIndIdx] ? parts[rawIndIdx] : indicator_id;
    const unit = unitIdx >= 0 && parts[unitIdx] ? parts[unitIdx] : 'counts';
    const stratum = stratumIdx >= 0 && parts[stratumIdx] ? parts[stratumIdx].toLowerCase() : 'all';
    const statusRaw = statusIdx >= 0 && parts[statusIdx] ? parts[statusIdx].toLowerCase() : 'observed';

    // DEF-09: Restrict supported imports to stratum=all to prevent aggregate/subgroup double-counting
    if (stratum !== 'all') {
      throw new Error(
        `Row ${i + 1}: unsupported stratum "${stratum}". Imported datasets must use stratum="all" to prevent summing overlapping aggregate and subgroup observations.`
      );
    }

    // DEF-09: Reject non-additive rates/percentages/ratios from additive count pipelines
    if (NON_ADDITIVE_UNIT_RE.test(unit)) {
      throw new Error(
        `Row ${i + 1}: non-additive unit "${unit}" is not supported for additive count aggregation. Supply raw nonnegative integer counts.`
      );
    }

    if (!VALID_STATUSES.has(statusRaw)) {
      throw new Error(`Row ${i + 1}: unknown status "${statusRaw}" (allowed: observed, missing, suppressed, not_reported).`);
    }
    const status = statusRaw as ImportedObservation['status'];

    if (modeIdx >= 0 && parts[modeIdx].toLowerCase() === 'official') {
      throw new Error(`Row ${i + 1}: user-imported CSV cannot claim mode="official".`);
    }

    // DEF-09: Reject mixed/overlapping geography levels within the same indicator (e.g. national + state_ut)
    const prevGeoLevel = indicatorGeoLevels.get(indicator_id);
    if (prevGeoLevel && prevGeoLevel !== geo_level_raw) {
      throw new Error(
        `Row ${i + 1}: overlapping geo_level "${geo_level_raw}" mixed with "${prevGeoLevel}" for indicator "${indicator_id}". Keep a single non-overlapping geography level per indicator.`
      );
    }
    indicatorGeoLevels.set(indicator_id, geo_level_raw);

    const prevUnit = indicatorUnits.get(indicator_id);
    if (prevUnit && prevUnit !== unit) {
      throw new Error(`Row ${i + 1}: contradictory unit "${unit}" for indicator "${indicator_id}" (expected "${prevUnit}").`);
    }
    indicatorUnits.set(indicator_id, unit);

    const prevGeoName = geoIdToName.get(geo_id);
    if (prevGeoName && prevGeoName !== geo_name) {
      throw new Error(`Row ${i + 1}: contradictory geo_name "${geo_name}" for geo_id "${geo_id}" (expected "${prevGeoName}").`);
    }
    geoIdToName.set(geo_id, geo_name);

    const key = `${period}|${geo_id}|${indicator_id}|${stratum}`;
    if (seen.has(key)) {
      throw new Error(`Row ${i + 1}: duplicate canonical key (${key}).`);
    }
    seen.add(key);

    const valStr = parts[valueIdx] ?? '';
    let value: number | null = null;
    if (status === 'observed') {
      if (!/^\d+$/.test(valStr)) {
        throw new Error(`Row ${i + 1}: observed value "${valStr}" must be a nonnegative whole integer.`);
      }
      const num = Number(valStr);
      if (!Number.isSafeInteger(num)) {
        throw new Error(`Row ${i + 1}: integer overflow detected.`);
      }
      value = num;
    } else if (valStr !== '' && valStr.toLowerCase() !== 'null') {
      throw new Error(`Row ${i + 1}: non-observed status "${status}" must have empty or null value.`);
    }

    rows.push({
      period,
      geo_level: geo_level_raw as ImportedObservation['geo_level'],
      geo_id,
      geo_name,
      indicator_id,
      raw_indicator,
      unit,
      stratum,
      value,
      status,
    });
  }

  rows.sort((a, b) => a.period.localeCompare(b.period));
  return { rows, format: header.length >= 10 ? 'WARDLINE Normalized Contract' : 'Compact Monthly CSV' };
}
