import React, { useState } from 'react';
import { ImportedObservation, SeriesAnalytics, WardlineBundle } from '../types/wardline';
import { fmtIN, parseWardlineCsv, sanitizeCsvCell } from '../utils/format';

interface Props {
  bundle: WardlineBundle;
  activeSeries: SeriesAnalytics;
  activeGeoName: string;
  activeIndicatorLabel: string;
  activeIndicatorUnit: string;
  importedRows: ImportedObservation[] | null;
  onImport: (rows: ImportedObservation[], filename: string) => void;
  onResetImport: () => void;
}

export const DataInspectorView: React.FC<Props> = ({
  bundle,
  activeSeries,
  activeGeoName,
  activeIndicatorLabel,
  activeIndicatorUnit,
  importedRows,
  onImport,
  onResetImport,
}) => {
  const [importMsg, setImportMsg] = useState<string>(
    bundle.mode === 'imported_unverified'
      ? `Active dataset: ${bundle.source.vintage} (${bundle.source.normalized_rows} rows).`
      : 'Official verified MoHFW HMIS bundle active.'
  );
  const [importError, setImportError] = useState<string | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    try {
      if (file.size > 5 * 1024 * 1024) {
        throw new Error('File exceeds 5 MB client-side safety limit.');
      }
      const text = await file.text();
      const parsed = parseWardlineCsv(text);
      onImport(parsed.rows, file.name);
      setImportMsg(
        `Loaded ${parsed.rows.length} validated rows (${parsed.format}) from "${file.name}". All KPIs, charts, tables, and exports now reflect this imported dataset.`
      );
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Invalid CSV file.');
    } finally {
      e.target.value = '';
    }
  };

  const handleExport = () => {
    const header = [
      'period',
      'geo_name',
      'indicator',
      'value',
      'daily_rate',
      'status',
      'yoy_pct',
      'unit',
      'daily_rate_unit',
      'data_mode',
      'source_attribution',
      'limitations',
    ];
    const isOfficial = bundle.mode === 'official';
    const limitation = isOfficial
      ? 'Historical aggregate reporting; coverage varies by period; general all-cause inpatient admissions are unavailable.'
      : 'User-imported aggregate observations; provenance and reporting completeness are unverified.';
    const lines = [
      header.join(','),
      ...activeSeries.monthly.map((m) =>
        [
          sanitizeCsvCell(m.period),
          sanitizeCsvCell(activeGeoName),
          sanitizeCsvCell(activeIndicatorLabel),
          sanitizeCsvCell(m.value),
          sanitizeCsvCell(m.daily_rate),
          sanitizeCsvCell(m.status),
          sanitizeCsvCell(m.yoy_pct),
          sanitizeCsvCell(activeIndicatorUnit),
          sanitizeCsvCell(`${activeIndicatorUnit}/day`),
          sanitizeCsvCell(bundle.mode),
          sanitizeCsvCell(bundle.source.attribution),
          sanitizeCsvCell(limitation),
        ].join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wardline-india-${bundle.mode}-${activeGeoName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section className="view-enter" aria-label="Data quality, provenance, and CSV import export inspector">
      <div className="hero">
        <div>
          <div className="eyebrow">06 / Provenance, Quality &amp; Reproducibility</div>
          <h1>Evidence, lineage &amp; audit trail.</h1>
          <p className="hero-sub">
            Inspect active dataset provenance, cryptographic hashes, and 100%-row schema validation, or import a custom
            monthly CSV locally in your browser.
          </p>
        </div>
        <span className={`status-badge ${bundle.mode === 'imported_unverified' ? 'warn' : 'accent'}`}>
          {bundle.mode === 'imported_unverified'
            ? 'IMPORTED · UNVERIFIED'
            : `${bundle.quality.reconciliation_row_checks.length + bundle.quality.reconciliation_derived_checks.length} RECONCILIATIONS PASS`}
        </span>
      </div>

      <div className="grid-equal">
        <article className="panel">
          <div className="eyebrow">Active Dataset Provenance</div>
          <h2>Dataset Lineage &amp; License</h2>
          <p className="panel-desc">{bundle.source.attribution}</p>
          <div className="table-wrap">
            <table>
              <tbody className="tabular">
                <tr>
                  <th>Data Mode</th>
                  <td><strong>{bundle.mode}</strong></td>
                </tr>
                <tr>
                  <th>Source ID</th>
                  <td>{bundle.source.source_id}</td>
                </tr>
                <tr>
                  <th>Vintage</th>
                  <td>{bundle.source.vintage}</td>
                </tr>
                {bundle.source.doi && (
                  <tr>
                    <th>DOI</th>
                    <td>
                      <a href={bundle.source.doi} target="_blank" rel="noopener noreferrer">
                        {bundle.source.doi} ↗
                      </a>
                    </td>
                  </tr>
                )}
                <tr>
                  <th>License</th>
                  <td>{bundle.source.license}</td>
                </tr>
                <tr>
                  <th>Raw Archive SHA-256</th>
                  <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{bundle.source.raw_sha256}</td>
                </tr>
                <tr>
                  <th>Active Rows</th>
                  <td>
                    {fmtIN(bundle.source.normalized_rows)} ({fmtIN(bundle.source.observed_rows)} observed)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <div className="eyebrow">Local Client-Side I/O · Zero Server Uploads</div>
          <h2>CSV Import &amp; Provenance Export</h2>
          <p className="panel-desc">
            Import a normalized monthly CSV (<code>period,value</code> or full WARDLINE schema). Quoted RFC-4180 fields,
            invalid dates, unknown statuses, negative counts, and contradictory metadata are strictly validated.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input type="file" accept=".csv,text/csv" aria-label="Import monthly CSV" onChange={handleFile} />
            <div role="status" aria-live="polite" style={{ fontSize: '13px', color: importError ? 'var(--danger-ink)' : 'var(--accent-text)' }}>
              {importError ? `Import rejected: ${importError}` : importMsg}
            </div>
            <div className="filter-bar">
              <button className="btn primary" onClick={handleExport}>
                Export Active Slice CSV
              </button>
              {importedRows && (
                <button
                  className="btn"
                  onClick={() => {
                    onResetImport();
                    setImportMsg('Restored verified official MoHFW HMIS archive.');
                  }}
                >
                  Restore Official HMIS Data
                </button>
              )}
            </div>
          </div>
        </article>
      </div>

      {bundle.mode === 'official' ? (
        <article className="panel">
          <div className="eyebrow">Independent Source Reconciliation (100% Schema Validated: {fmtIN(bundle.quality.schema_checked_rows)} rows)</div>
          <h2>Raw Archive vs. Normalized Contract Verification</h2>
          {bundle.quality.source_reconciled_rows !== undefined && (
            <p className="panel-desc">
              {fmtIN(bundle.quality.source_reconciled_rows)} observations were matched to exact derivative rows,
              values and completeness flags. The table shows selected checks.
            </p>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Check Type</th>
                  <th>Target</th>
                  <th>Raw Archive Value</th>
                  <th>Normalized Value</th>
                  <th>Row Locator</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {bundle.quality.reconciliation_row_checks.map((c) => (
                  <tr key={`${c.geo_id}-${c.period}-${c.indicator_id}`}>
                    <td>Single Row</td>
                    <td>
                      {c.geo_id} · {c.period} · {c.indicator_id}
                    </td>
                    <td>{fmtIN(c.raw_source_value)}</td>
                    <td>{fmtIN(c.normalized_value)}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{c.row_locator ?? '—'}</td>
                    <td>
                      <span className="status-badge">{c.exact_match ? 'EXACT MATCH' : 'MISMATCH'}</span>
                    </td>
                  </tr>
                ))}
                {bundle.quality.reconciliation_derived_checks.map((c) => (
                  <tr key={c.metric}>
                    <td>8-Year Sum</td>
                    <td>{c.metric}</td>
                    <td>{fmtIN(c.raw_derived_sum)}</td>
                    <td>{fmtIN(c.normalized_sum)}</td>
                    <td>aggregate</td>
                    <td>
                      <span className="status-badge">{c.exact_match ? 'EXACT MATCH' : 'MISMATCH'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ) : (
        <article className="panel">
          <div className="eyebrow">Active Imported Slice Preview</div>
          <h2>Imported Monthly Observations ({activeGeoName} · {activeIndicatorLabel})</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Value</th>
                  <th>Daily Rate</th>
                  <th>Status</th>
                  <th>YoY %</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {activeSeries.monthly.map((m) => (
                  <tr key={m.period}>
                    <td>{m.period}</td>
                    <td>{fmtIN(m.value)}</td>
                    <td>{fmtIN(m.daily_rate)}</td>
                    <td>{m.status}</td>
                    <td>{m.yoy_pct !== null ? `${m.yoy_pct > 0 ? '+' : ''}${m.yoy_pct.toFixed(1)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}
    </section>
  );
};
