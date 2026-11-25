import React, { useState } from 'react';
import { WardlineBundle } from '../types/wardline';
import { fmtIN } from '../utils/format';

interface Props {
  bundle: WardlineBundle;
  reduceMotion: boolean;
}

const PIPELINE_STAGES = [
  {
    id: 'acquire',
    num: '01',
    label: 'Acquire',
    detail: 'Verified retrieval of MoHFW HMIS Zenodo archive (SHA-256 verified, CC BY 4.0 / GODL-India, truthful WARDLINE-INDIA/1.3.0 User-Agent).',
  },
  {
    id: 'normalize',
    num: '02',
    label: 'Normalize',
    detail: 'Melts 34 harmonized state-month panels × 7 indicators into 22,848 canonical rows with exact calendar days & IMD season tags.',
  },
  {
    id: 'validate',
    num: '03',
    label: 'Validate',
    detail: '100% JSON Schema validation (22,848/22,848), zero duplicate canonical keys, 26 raw-source reconciliations + mutation rejection tests.',
  },
  {
    id: 'analyze',
    num: '04',
    label: 'Analyze',
    detail: 'Computes daily-rate normalization, complete-season summaries, fixed-cohort All-India comparability, and zero-denominator-safe YoY metrics.',
  },
  {
    id: 'forecast',
    num: '05',
    label: 'Forecast',
    detail: 'Enforces ≥72 contiguous months, locks model strictly on 2-fold Dev-CV before touching FY 2019–20 holdout, tags P80 bands uncalibrated.',
  },
  {
    id: 'visualize',
    num: '06',
    label: 'Visualize',
    detail: 'Consumes active-dataset contract across 2D SVG, lazy-loaded Three.js seasonal terrain, and guided Presentation Mode.',
  },
];

export const MethodologyView: React.FC<Props> = ({ bundle }) => {
  const [activeStage, setActiveStage] = useState(0);
  const [zeroDemoMode, setZeroDemoMode] = useState<'missing' | 'zero'>('missing');
  const [normView, setNormView] = useState<'raw' | 'daily'>('raw');
  const [coverageScenario, setCoverageScenario] = useState<'raw_sum' | 'fixed_cohort'>('raw_sum');
  const [predShift, setPredShift] = useState(12);

  // D07 Educational fixture (explicitly labeled)
  const fixtureActual = [100, 120, 140, 110];
  const fixturePred = fixtureActual.map((v, i) => v + (i % 2 === 0 ? predShift : -Math.round(predShift * 0.7)));
  const fixtureAbsErrs = fixtureActual.map((v, i) => Math.abs(v - fixturePred[i]));
  const fixtureMae = fixtureAbsErrs.reduce((a, b) => a + b, 0) / fixtureActual.length;
  const fixtureWape = (fixtureAbsErrs.reduce((a, b) => a + b, 0) / fixtureActual.reduce((a, b) => a + b, 0)) * 100;

  return (
    <section className="view-enter" aria-label="Interactive research methodology diagrams">
      <div className="hero">
        <div>
          <div className="eyebrow">08 / Research Methodology · Interactive Visual Explainers (D01–D08)</div>
          <h1>How the evidence pipeline works.</h1>
          <p className="hero-sub">
            Eight custom interactive diagrams explaining WARDLINE INDIA’s data provenance, calendar normalization,
            missingness semantics, fixed-cohort comparability, leakage-free forecasting, and responsible AI guardrails.
          </p>
        </div>
        <span className="status-badge">D01–D08 INTERACTIVE</span>
      </div>

      {/* D01 — Complete Research Pipeline */}
      <article className="panel dark-stage">
        <div className="eyebrow">D01 · Complete End-to-End Research Pipeline (Live Repository Metrics)</div>
        <h2>Source Acquisition → Visual Intelligence</h2>
        <p className="panel-desc">Click any pipeline stage to inspect its exact verification gate.</p>
        <svg viewBox="0 0 840 110" role="img" aria-label="D01 six-stage research pipeline diagram" style={{ width: '100%', height: 'auto', display: 'block' }}>
          {PIPELINE_STAGES.map((st, idx) => {
            const x = 14 + idx * 138;
            const isSel = activeStage === idx;
            return (
              <g key={st.id} onClick={() => setActiveStage(idx)} style={{ cursor: 'pointer' }}>
                <rect
                  x={x}
                  y="18"
                  width="118"
                  height="68"
                  rx="2"
                  fill={isSel ? 'var(--accent)' : 'rgba(239,235,224,0.08)'}
                  stroke={isSel ? 'var(--accent)' : 'var(--chart-panel-grid)'}
                  strokeWidth="1.5"
                />
                <text x={x + 12} y="38" fontSize="10" fontWeight="700" fill={isSel ? 'var(--on-accent)' : 'var(--chart-panel-muted)'}>
                  {st.num}
                </text>
                <text x={x + 12} y="62" fontSize="14" fontWeight="700" fill={isSel ? 'var(--on-accent)' : 'var(--chart-panel-ink)'}>
                  {st.label}
                </text>
                {idx < PIPELINE_STAGES.length - 1 && (
                  <path d={`M${x + 120},52 L${x + 135},52`} stroke="var(--accent)" strokeWidth="2" markerEnd="none" />
                )}
              </g>
            );
          })}
        </svg>
        <div className="insight-box" style={{ background: 'rgba(239,235,224,0.08)', color: 'inherit' }}>
          <strong>
            Stage {PIPELINE_STAGES[activeStage].num} ({PIPELINE_STAGES[activeStage].label}):
          </strong>{' '}
          {PIPELINE_STAGES[activeStage].detail}
        </div>
      </article>

      <div className="grid-equal">
        {/* D02 — Data Preprocessing */}
        <article className="panel">
          <div className="eyebrow">D02 · Data Preprocessing &amp; Canonical Schema</div>
          <h2>Raw Source Row → Normalized Observation</h2>
          <p className="panel-desc">Every HMIS cell is mapped to a traceable canonical contract with source locator.</p>
          <svg viewBox="0 0 540 165" role="img" aria-label="D02 preprocessing transformation diagram" style={{ width: '100%', height: 'auto', display: 'block' }}>
            <rect x="8" y="14" width="215" height="135" fill="var(--canvas)" stroke="var(--border)" rx="2" />
            <text x="18" y="34" fontSize="10" fontWeight="700" fill="var(--muted-ink)">RAW ZENODO PANEL ROW</text>
            <text x="18" y="56" fontSize="11" fill="var(--ink)" className="tabular">state_std: &quot;PB&quot;</text>
            <text x="18" y="76" fontSize="11" fill="var(--ink)" className="tabular">ym: &quot;2019-10&quot; (31 days)</text>
            <text x="18" y="96" fontSize="11" fill="var(--ink)" className="tabular">inst_del: 34,218</text>
            <text x="18" y="116" fontSize="11" fill="var(--ink)" className="tabular">district_comp: 1.00 (≥90%)</text>
            <text x="18" y="136" fontSize="10" fill="var(--accent-text)">line #2294 · SHA-256 verified</text>

            <path d="M230,82 L286,82" stroke="var(--accent)" strokeWidth="2.5" />
            <polygon points="284,76 296,82 284,88" fill="var(--accent)" />

            <rect x="302" y="14" width="230" height="135" fill="var(--chart-panel-bg)" stroke="var(--chart-panel-bg)" rx="2" />
            <text x="314" y="34" fontSize="10" fontWeight="700" fill="var(--accent)">NORMALIZED CONTRACT</text>
            <text x="314" y="54" fontSize="11" fill="var(--chart-panel-ink)" className="tabular">geo_id: PB · stratum: all</text>
            <text x="314" y="72" fontSize="11" fill="var(--chart-panel-ink)" className="tabular">period: 2019-10 · post_monsoon</text>
            <text x="314" y="90" fontSize="11" fill="var(--chart-panel-ink)" className="tabular">value: 34,218 · daily: 1,103.8</text>
            <text x="314" y="108" fontSize="11" fill="var(--chart-panel-ink)" className="tabular">status: observed</text>
            <text x="314" y="128" fontSize="10" fill="var(--chart-panel-muted)">Validated: {fmtIN(bundle.quality.schema_checked_rows)}/22,848 rows</text>
          </svg>
        </article>

        {/* D03 — Missing Data vs Observed Zero */}
        <article className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">D03 · Missing vs. Observed Zero (EDUCATIONAL FIXTURE)</div>
              <h2>Why Missing ≠ Zero</h2>
            </div>
            <div className="filter-bar">
              <button
                type="button"
                className={`btn viz-action-btn ${zeroDemoMode === 'missing' ? 'primary' : ''}`}
                onClick={() => setZeroDemoMode('missing')}
              >
                Month 2 = MISSING
              </button>
              <button
                type="button"
                className={`btn viz-action-btn ${zeroDemoMode === 'zero' ? 'primary' : ''}`}
                onClick={() => setZeroDemoMode('zero')}
              >
                Month 2 = ZERO (0)
              </button>
            </div>
          </div>
          <svg viewBox="0 0 500 135" role="img" aria-label="D03 educational comparison of missing data versus observed zero" style={{ width: '100%', height: 'auto', display: 'block' }}>
            {[
              { m: 'Jan', v: 100, isGap: false },
              { m: 'Feb', v: zeroDemoMode === 'zero' ? 0 : null, isGap: zeroDemoMode === 'missing' },
              { m: 'Mar', v: 100, isGap: false },
            ].map((bar, i) => {
              const x = 36 + i * 110;
              return (
                <g key={bar.m}>
                  {bar.isGap ? (
                    <rect x={x} y="24" width="64" height="80" fill="none" stroke="var(--danger-ink)" strokeDasharray="4 3" strokeWidth="1.8" />
                  ) : (
                    <rect x={x} y={104 - (bar.v ?? 0) * 0.8} width="64" height={Math.max(4, (bar.v ?? 0) * 0.8)} fill={bar.v === 0 ? 'var(--accent)' : 'var(--ink)'} />
                  )}
                  <text x={x + 32} y="122" textAnchor="middle" fontSize="11" fill="var(--ink)" fontWeight="700">
                    {bar.m}: {bar.isGap ? 'GAP' : bar.v}
                  </text>
                </g>
              );
            })}
            <rect x="370" y="24" width="122" height="80" fill="var(--accent-surface)" stroke="var(--accent)" rx="2" />
            <text x="431" y="48" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--muted-ink)">COMPUTED MEAN</text>
            <text x="431" y="78" textAnchor="middle" fontSize="22" fontWeight="700" fill="var(--ink)" className="tabular">
              {zeroDemoMode === 'missing' ? '100.0' : '66.7'}
            </text>
            <text x="431" y="96" textAnchor="middle" fontSize="10" fill="var(--muted-ink)">
              {zeroDemoMode === 'missing' ? 'Divided by n=2' : 'Divided by n=3'}
            </text>
          </svg>
          <p className="panel-desc" style={{ marginTop: '8px', marginBottom: 0 }}>
            <strong>Explicit Educational Fixture (not HMIS results):</strong> Treating an unreported month as zero falsely depresses the mean by 33.3%.
          </p>
        </article>
      </div>

      <div className="grid-equal">
        {/* D04 — Seasonal Normalization */}
        <article className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">D04 · Calendar-Day Normalization (EDUCATIONAL FIXTURE)</div>
              <h2>Eliminating the 28-Day February Artifact</h2>
            </div>
            <div className="filter-bar">
              <button type="button" className={`btn viz-action-btn ${normView === 'raw' ? 'primary' : ''}`} onClick={() => setNormView('raw')}>
                Raw Monthly Total
              </button>
              <button type="button" className={`btn viz-action-btn ${normView === 'daily' ? 'primary' : ''}`} onClick={() => setNormView('daily')}>
                Mean Daily Rate
              </button>
            </div>
          </div>
          <svg viewBox="0 0 500 140" role="img" aria-label="D04 calendar normalization fixture comparing Feb and Mar" style={{ width: '100%', height: 'auto', display: 'block' }}>
            {[
              { label: 'Feb (28d)', raw: 2800, daily: 100 },
              { label: 'Mar (31d)', raw: 3100, daily: 100 },
              { label: 'Apr (30d)', raw: 3000, daily: 100 },
            ].map((item, i) => {
              const x = 40 + i * 145;
              const h = normView === 'raw' ? (item.raw / 3200) * 84 : 78;
              return (
                <g key={item.label}>
                  <rect x={x} y={104 - h} width="84" height={h} fill={i === 1 && normView === 'raw' ? 'var(--accent)' : 'var(--ink)'} />
                  <text x={x + 42} y={98 - h} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--ink)" className="tabular">
                    {normView === 'raw' ? fmtIN(item.raw) : `${item.daily}/day`}
                  </text>
                  <text x={x + 42} y="124" textAnchor="middle" fontSize="11" fill="var(--muted-ink)">
                    {item.label}
                  </text>
                </g>
              );
            })}
          </svg>
          <p className="panel-desc" style={{ marginTop: '8px', marginBottom: 0 }}>
            <strong>Educational Fixture:</strong> Identical daily demand (100/day) looks like a <strong>+10.7% March surge</strong> in raw monthly counts. Dividing by exact calendar days (28/29/30/31) removes the artifact.
          </p>
        </article>

        {/* D05 — National Reporting Coverage */}
        <article className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">D05 · National Reporting Coverage (EDUCATIONAL FIXTURE)</div>
              <h2>Fixed-Cohort vs. Variable-Coverage Sums</h2>
            </div>
            <div className="filter-bar">
              <button type="button" className={`btn viz-action-btn ${coverageScenario === 'raw_sum' ? 'primary' : ''}`} onClick={() => setCoverageScenario('raw_sum')}>
                Variable Sum
              </button>
              <button type="button" className={`btn viz-action-btn ${coverageScenario === 'fixed_cohort' ? 'primary' : ''}`} onClick={() => setCoverageScenario('fixed_cohort')}>
                Fixed Cohort
              </button>
            </div>
          </div>
          <svg viewBox="0 0 500 140" role="img" aria-label="D05 fixed cohort versus variable reporting coverage diagram" style={{ width: '100%', height: 'auto', display: 'block' }}>
            {[
              { m: 'M1 (34/34)', raw: 100, fixed: 92 },
              { m: 'M2 (31/34)', raw: 81, fixed: 93 },
              { m: 'M3 (34/34)', raw: 101, fixed: 94 },
            ].map((pt, i) => {
              const x = 44 + i * 145;
              const val = coverageScenario === 'raw_sum' ? pt.raw : pt.fixed;
              const h = (val / 110) * 86;
              const isDrop = coverageScenario === 'raw_sum' && i === 1;
              return (
                <g key={pt.m}>
                  <rect x={x} y={104 - h} width="84" height={h} fill={isDrop ? 'var(--danger-ink)' : 'var(--accent)'} />
                  <text x={x + 42} y={98 - h} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--ink)" className="tabular">
                    {val}
                  </text>
                  <text x={x + 42} y="124" textAnchor="middle" fontSize="10.5" fill="var(--muted-ink)">
                    {pt.m}
                  </text>
                </g>
              );
            })}
          </svg>
          <p className="panel-desc" style={{ marginTop: '8px', marginBottom: 0 }}>
            <strong>Educational Fixture:</strong> When 3 states drop below the 90% district completeness gate in M2, the raw sum plunges artificially; holding a fixed cohort reveals steady true growth.
          </p>
        </article>
      </div>

      <div className="grid-equal">
        {/* D06 & D07 — Chronological Evaluation & Error Metrics */}
        <article className="panel">
          <div className="eyebrow">D06 &amp; D07 · Chronological Evaluation &amp; Error Metrics (EDUCATIONAL FIXTURE)</div>
          <h2>Interactive MAE &amp; WAPE Explainer</h2>
          <p className="panel-desc">
            Adjust prediction error magnitude to see how MAE and WAPE respond across a 4-month fixture (Actuals: 100, 120, 140, 110).
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <label htmlFor="d07-slider" style={{ fontSize: '12px', fontWeight: 700 }}>
              Error shift (±{predShift}):
            </label>
            <input
              id="d07-slider"
              type="range"
              min={0}
              max={40}
              value={predShift}
              onChange={(e) => setPredShift(Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <span className="status-badge tabular">MAE: {fixtureMae.toFixed(1)} · WAPE: {fixtureWape.toFixed(1)}%</span>
          </div>
          <svg viewBox="0 0 500 130" role="img" aria-label="D07 interactive MAE and WAPE error explainer" style={{ width: '100%', height: 'auto', display: 'block' }}>
            {fixtureActual.map((act, i) => {
              const x = 40 + i * 115;
              const yAct = 104 - (act / 180) * 85;
              const yPred = 104 - (fixturePred[i] / 180) * 85;
              return (
                <g key={i}>
                  <line x1={x + 24} x2={x + 24} y1={yAct} y2={yPred} stroke="var(--danger-ink)" strokeWidth="2.5" strokeDasharray="3 2" />
                  <circle cx={x + 24} cy={yAct} r="5.5" fill="var(--ink)" />
                  <circle cx={x + 24} cy={yPred} r="5.5" fill="var(--accent)" />
                  <text x={x + 24} y="120" textAnchor="middle" fontSize="10" fill="var(--muted-ink)" className="tabular">
                    M{i + 1} |e|={fixtureAbsErrs[i]}
                  </text>
                </g>
              );
            })}
          </svg>
          <p className="panel-desc" style={{ marginTop: '6px', marginBottom: 0 }}>
            <strong>D06 Chronological Rule:</strong> Models never see future observations or test-window scores during selection. Random K-fold splitting is forbidden for time series.
          </p>
        </article>

        {/* D08 — Responsible AI */}
        <article className="panel">
          <div className="eyebrow">D08 · Responsible AI &amp; Scientific Integrity Guardrails</div>
          <h2>Preventing Misleading Healthcare Claims</h2>
          <div style={{ display: 'grid', gap: '10px', marginTop: '10px', fontSize: '13px' }}>
            <div className="insight-box" style={{ marginTop: 0 }}>
              <strong>1. Scope Honesty (No Proxy Fabrication):</strong> General all-cause IPD, age/sex, and facility-tier breakdowns remain explicitly withheld because official HMIS public panels lack them.
            </div>
            <div className="insight-box" style={{ marginTop: 0 }}>
              <strong>2. Uncalibrated Uncertainty Disclosure:</strong> Dev-CV P80 error bands are empirical historical half-widths, never claimed as calibrated 80% statistical prediction intervals.
            </div>
            <div className="insight-box" style={{ marginTop: 0 }}>
              <strong>3. Retrospective vs. Operational Boundary:</strong> FY 2012–2020 evaluations measure historical pattern predictability and cannot be cited as verified 2026 hospital demand forecasts.
            </div>
            <div className="insight-box" style={{ marginTop: 0 }}>
              <strong>4. Imported Data Isolation:</strong> User CSV uploads run in an isolated <code>IMPORTED · UNVERIFIED</code> state with stratum/geo/unit guards and withheld forecasting unless ≥72 contiguous months pass.
            </div>
          </div>
        </article>
      </div>
    </section>
  );
};
