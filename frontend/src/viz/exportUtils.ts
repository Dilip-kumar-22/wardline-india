import { VizExportMeta } from './types';
import { sanitizeCsvCell } from '../utils/format';

export function buildExportCsvString(
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
  meta: VizExportMeta
): string {
  const provenanceRows = [
    ['# WARDLINE INDIA Research Export', meta.vizId, meta.title],
    ['# Data Mode', meta.mode, meta.attribution],
    ['# Scope', meta.indicatorLabel, meta.geoName, meta.periodRange, ...(meta.metricLabel ? [meta.metricLabel] : [])],
    ['# Limitations', meta.limitations],
  ];
  const lines = [
    ...provenanceRows.map((r) => r.map(sanitizeCsvCell).join(',')),
    headers.map(sanitizeCsvCell).join(','),
    ...rows.map((r) => r.map(sanitizeCsvCell).join(',')),
  ];
  return lines.join('\n');
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsvExport(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
  meta: VizExportMeta
): void {
  const csv = buildExportCsvString(headers, rows, meta);
  triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8' }), filename);
}

/** Resolve CSS variables on cloned SVG so exported standalone SVG/PNG preserves Editorial Industrial styling. */
export function serializeStandaloneSvg(svgEl: SVGSVGElement, meta: VizExportMeta): string {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  const originals = [svgEl, ...svgEl.querySelectorAll<SVGElement>('*')];
  const copies = [clone, ...clone.querySelectorAll<SVGElement>('*')];
  clone.style.fontFamily = getComputedStyle(svgEl).fontFamily;
  originals.forEach((original, index) => {
    const copy = copies[index];
    const attributes = Array.from(original.attributes).filter(
      (attribute) => attribute.name !== 'style' && attribute.value.includes('var('),
    );
    const properties = Array.from(original.style).filter(
      (property) => original.style.getPropertyValue(property).includes('var('),
    );
    if (!attributes.length && !properties.length) return;
    const style = getComputedStyle(original);
    attributes.forEach(({ name }) => {
      const computed = style.getPropertyValue(name);
      if (computed) copy.setAttribute(name, computed);
    });
    properties.forEach((property) => {
      const computed = style.getPropertyValue(property);
      if (computed) copy.style.setProperty(property, computed, original.style.getPropertyPriority(property));
    });
  });

  const desc = document.createElementNS('http://www.w3.org/2000/svg', 'desc');
  desc.textContent = `${meta.vizId}: ${meta.title} | ${meta.indicatorLabel} | ${meta.geoName} (${meta.periodRange}) | ${meta.mode} | ${meta.metricLabel ? `${meta.metricLabel} | ` : ''}${meta.attribution} | Limitations: ${meta.limitations}`;
  clone.insertBefore(desc, clone.firstChild);

  let xml = new XMLSerializer().serializeToString(clone);
  if (!xml.includes('xmlns="http://www.w3.org/2000/svg"')) {
    xml = xml.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  return xml;
}

export function downloadSvgExport(svgEl: SVGSVGElement | null, filename: string, meta: VizExportMeta): void {
  if (!svgEl) return;
  const xml = serializeStandaloneSvg(svgEl, meta);
  triggerDownload(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }), filename);
}

function wrapCaption(ctx: CanvasRenderingContext2D, message: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of message.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function downloadCaptionedPng(
  source: CanvasImageSource,
  width: number,
  height: number,
  scale: number,
  filename: string,
  meta: VizExportMeta,
  bgColor: string,
): void {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const padding = 14;
  const lineHeight = 16;
  const font = '12px Archivo, sans-serif';
  const textWidth = width - padding * 2;
  ctx.font = font;
  const caption = [
    `WARDLINE INDIA · ${meta.vizId} · ${meta.title}`,
    `${meta.indicatorLabel} · ${meta.geoName} · ${meta.periodRange} · ${meta.mode.toUpperCase()}`,
    meta.metricLabel,
    `Source: ${meta.attribution}`,
    `Limitations: ${meta.limitations}`,
  ].filter((line): line is string => Boolean(line))
    .flatMap((line) => wrapCaption(ctx, line, textWidth));

  canvas.width = Math.round(width * scale);
  canvas.height = Math.round((height + padding * 2 + caption.length * lineHeight) * scale);
  ctx.scale(scale, scale);
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, canvas.height / scale);
  ctx.drawImage(source, 0, 0, width, height);
  ctx.fillStyle = bgColor === '#1E2622' ? '#EFEBE0' : '#4F5A53';
  ctx.font = font;
  caption.forEach((line, index) => {
    ctx.fillText(line, padding, height + padding + (index + 1) * lineHeight, textWidth);
  });
  canvas.toBlob((pngBlob) => {
    if (pngBlob) triggerDownload(pngBlob, filename);
  }, 'image/png');
}

export function downloadPngExport(
  svgEl: SVGSVGElement | null,
  filename: string,
  meta: VizExportMeta,
  bgColor = '#EFEBE0'
): void {
  if (!svgEl) return;
  const xml = serializeStandaloneSvg(svgEl, meta);
  const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.onload = () => {
    const vb = svgEl.viewBox.baseVal;
    const width = vb && vb.width > 0 ? vb.width : svgEl.clientWidth || 900;
    const height = vb && vb.height > 0 ? vb.height : svgEl.clientHeight || 480;
    downloadCaptionedPng(img, width, height, 2, filename, meta, bgColor);
    URL.revokeObjectURL(url);
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}

/** DEF-17: Export WebGL / HTML5 canvas as PNG with provenance footer strip. */
export function downloadCanvasPngExport(
  srcCanvas: HTMLCanvasElement | null,
  filename: string,
  meta: VizExportMeta,
  bgColor = '#1E2622'
): void {
  if (!srcCanvas || !srcCanvas.width || !srcCanvas.height) return;
  downloadCaptionedPng(srcCanvas, srcCanvas.width, srcCanvas.height, 1, filename, meta, bgColor);
}
