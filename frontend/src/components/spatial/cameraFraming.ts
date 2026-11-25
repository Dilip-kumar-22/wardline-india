export function fittedVerticalFov(baseFov: number, aspect: number): number {
  const halfFovRadians = baseFov * Math.PI / 360;
  // Keep enough horizontal field of view for the full scene on narrow panels.
  return 2 * Math.atan(Math.tan(halfFovRadians) / Math.min(1, aspect / 1.2)) * 180 / Math.PI;
}
