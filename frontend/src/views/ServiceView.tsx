import React from 'react';
import { WardlineBundle } from '../types/wardline';
import { fmtCompactIN, fmtIN, fmtPct } from '../utils/format';

interface Props {
  bundle: WardlineBundle;
  geoId: string;
  geoName: string;
  onSelectIndicator: (indId: string) => void;
}

export const ServiceView: React.FC<Props> = ({ bundle, geoId, geoName, onSelectIndicator }) => {
  const indicatorIds = Object.keys(bundle.indicators);

  return (
    <section className="view-enter" aria-label="Healthcare services and facility utilization analysis">
      <div className="hero">
        <div>
          <div className="eyebrow">04 / Service &amp; Indicator Analysis · {geoName}</div>
          <h1>Separate service pathways, zero conflation.</h1>
          <p className="hero-sub">
            Each MoHFW HMIS service indicator is reported in its native unit and never stacked or summed across
            incompatible domains (e.g., OPD attendances are never added to institutional deliveries).
          </p>
        </div>
        <span className="status-badge">7 VERIFIED INDICATORS</span>
      </div>

      <article className="panel">
        <div className="eyebrow">Verified HMIS Service Indicators · {geoName}</div>
        <h2>Indicator Portfolio &amp; April 2017 Format Continuity</h2>
        <p className="panel-desc">Click any indicator row to focus the Overview and Seasonal Atlas on that measure.</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Indicator</th>
                <th>Category</th>
                <th>FY 2019–20 Total</th>
                <th>YoY</th>
                <th>Seasonal Ratio</th>
                <th>HMIS Codes (E1 → E2)</th>
                <th>Valid Months</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {indicatorIds.map((id) => {
                const meta = bundle.indicators[id];
                const ser = geoId === 'IN' ? bundle.analytics.national[id] : bundle.analytics.states[id]?.[geoId];
                return (
                  <tr
                    key={id}
                    className="clickable-row"
                    onClick={() => onSelectIndicator(id)}
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && onSelectIndicator(id)}
                  >
                    <td>
                      <strong>{meta.short_label}</strong>
                    </td>
                    <td>{meta.category}</td>
                    <td>{ser ? fmtCompactIN(ser.fy2019_20_total) : '—'} ({ser ? fmtIN(ser.fy2019_20_total) : '—'})</td>
                    <td>{ser ? fmtPct(ser.fy2019_20_yoy_pct, true) : '—'}</td>
                    <td>{ser?.seasonal_amplitude_ratio ? `${ser.seasonal_amplitude_ratio.toFixed(2)}×` : '—'}</td>
                    <td>{meta.e1_codes} → {meta.e2_codes}</td>
                    <td>{ser ? `${ser.observed_months}/${ser.expected_months}` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </article>

      <article className="panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">Explicitly Unavailable Dimensions</div>
            <h2>Why Certain Breakdowns Are Withheld</h2>
          </div>
          <span className="status-badge warn">NO FABRICATION POLICY</span>
        </div>
        <div className="grid-equal">
          {bundle.unavailable_dimensions.map((u) => (
            <div className="unavailable-box" key={u.id}>
              <strong style={{ display: 'block', marginBottom: '6px' }}>{u.label}</strong>
              <p style={{ margin: '0 0 8px' }}>{u.reason}</p>
              <div style={{ fontSize: '12px', color: 'var(--muted-ink)' }}>
                <strong>Resolution:</strong> {u.resolution}
              </div>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
};
