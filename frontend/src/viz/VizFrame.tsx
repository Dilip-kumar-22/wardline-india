import React, { useEffect, useRef, useState } from 'react';
import { downloadCanvasPngExport, downloadCsvExport, downloadPngExport, downloadSvgExport } from './exportUtils';
import { VizExportMeta, VizFraming } from './types';

interface VizFrameProps {
  framing: VizFraming;
  title: string;
  subtitle?: string;
  darkStage?: boolean;
  exportMeta?: VizExportMeta;
  csvData?: { headers: string[]; rows: Array<Array<string | number | null | undefined>> };
  controls?: React.ReactNode;
  children: React.ReactNode;
  footerLeft?: React.ReactNode;
  footerRight?: React.ReactNode;
}

export const VizFrame: React.FC<VizFrameProps> = ({
  framing,
  title,
  subtitle,
  darkStage = false,
  exportMeta,
  csvData,
  controls,
  children,
  footerLeft,
  footerRight,
}) => {
  const [showBrief, setShowBrief] = useState(false);
  const [hasSvg, setHasSvg] = useState(false);
  const [hasCanvas, setHasCanvas] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const findSvg = (): SVGSVGElement | null => bodyRef.current?.querySelector('svg') ?? null;
  const findCanvas = (): HTMLCanvasElement | null => bodyRef.current?.querySelector('canvas') ?? null;

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const check = () => {
      setHasSvg(Boolean(body.querySelector('svg')));
      setHasCanvas(Boolean(body.querySelector('canvas')));
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const baseSlug = `${framing.vizId.toLowerCase()}_${(exportMeta?.geoName ?? 'india')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')}`;

  return (
    <article className={`panel ${darkStage ? 'dark-stage' : ''}`} data-viz-id={framing.vizId}>
      <div className="panel-head">
        <div>
          <div className="eyebrow">
            {framing.vizId} · {framing.question}
          </div>
          <h2>{title}</h2>
          {subtitle && <p className="panel-desc" style={{ marginBottom: 0 }}>{subtitle}</p>}
        </div>
        <div className="filter-bar">
          {controls}
          {exportMeta && (
            <>
              {csvData && (
                <button
                  type="button"
                  className="btn viz-action-btn"
                  onClick={() => downloadCsvExport(`${baseSlug}.csv`, csvData.headers, csvData.rows, exportMeta)}
                  title="Download underlying observations as CSV with provenance header"
                >
                  CSV
                </button>
              )}
              <button
                type="button"
                className="btn viz-action-btn"
                disabled={!hasSvg}
                onClick={() => downloadSvgExport(findSvg(), `${baseSlug}.svg`, exportMeta)}
                title={
                  hasSvg
                    ? 'Download standalone vector SVG'
                    : 'Vector SVG export is unavailable in 3D WebGL canvas mode — switch to 2D view for SVG, or use PNG/CSV'
                }
              >
                {hasSvg ? 'SVG' : 'SVG (2D only)'}
              </button>
              <button
                type="button"
                className="btn viz-action-btn"
                disabled={!hasSvg && !hasCanvas}
                onClick={() => {
                  const svg = findSvg();
                  if (svg) {
                    downloadPngExport(svg, `${baseSlug}.png`, exportMeta, darkStage ? '#1E2622' : '#EFEBE0');
                    return;
                  }
                  const canvas = findCanvas();
                  if (canvas) {
                    downloadCanvasPngExport(canvas, `${baseSlug}_3d.png`, exportMeta, darkStage ? '#1E2622' : '#EFEBE0');
                  }
                }}
                title={
                  hasSvg
                    ? 'Download 2x PNG chart image'
                    : hasCanvas
                    ? 'Download WebGL 3D canvas snapshot as PNG'
                    : 'PNG export unavailable while loading'
                }
              >
                PNG
              </button>
            </>
          )}
          <button
            type="button"
            className="btn viz-action-btn"
            aria-expanded={showBrief}
            onClick={() => setShowBrief((v) => !v)}
          >
            {showBrief ? 'Hide Brief' : '5-Point Brief'}
          </button>
        </div>
      </div>

      {showBrief && (
        <div className="viz-brief-grid" role="region" aria-label={`Analytical brief for ${framing.vizId}`}>
          <div>
            <strong>1. Question:</strong> {framing.question}
          </div>
          <div>
            <strong>2. Data:</strong> {framing.dataSource}
          </div>
          <div>
            <strong>3. Encoding:</strong> {framing.encoding}
          </div>
          <div>
            <strong>4. Conclusion:</strong> {framing.conclusion}
          </div>
          <div>
            <strong>5. Limitations:</strong> {framing.limitations}
          </div>
        </div>
      )}

      <div ref={bodyRef}>{children}</div>

      <div className="panel-foot">
        <span>{footerLeft ?? framing.encoding}</span>
        <span>{footerRight ?? framing.limitations}</span>
      </div>
    </article>
  );
};
