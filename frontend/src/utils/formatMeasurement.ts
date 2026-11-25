const measurementFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export function formatMeasurement(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : measurementFormat.format(value);
}
