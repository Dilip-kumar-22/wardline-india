import { ThemeId } from '../types/wardline';
import { ThemeVizPalette } from './types';

export const THEME_VIZ_PALETTES: Record<ThemeId, ThemeVizPalette> = {
  industrial: {
    theme: 'industrial',
    canvas: '#EFEBE0',
    surface: '#F6F3EA',
    ink: '#1E2622',
    mutedInk: '#4F5A53',
    border: '#C9C5B8',
    accent: '#F2662B',
    accentText: '#B84212',
    onAccent: '#1E2622',
    panelBg: '#1E2622',
    panelInk: '#EFEBE0',
    panelMuted: '#B6BCB7',
    panelGrid: '#39443E',
    missingFill: '#333D37',
    zeroFill: '#6B7770',
    rampLow: '#2E3A34',
    rampMid: '#8C6E4A',
    rampHigh: '#F2662B',
    seasonColors: {
      winter: '#8C9E95',
      pre_monsoon: '#C69553',
      sw_monsoon: '#F2662B',
      post_monsoon: '#5A7366',
    },
  },
  sage: {
    theme: 'sage',
    canvas: '#F4F3EC',
    surface: '#FFFEFA',
    ink: '#203C35',
    mutedInk: '#52665B',
    border: '#DEDFD5',
    accent: '#176C55',
    accentText: '#176C55',
    onAccent: '#FFFFFF',
    panelBg: '#FFFEFA',
    panelInk: '#203C35',
    panelMuted: '#52665B',
    panelGrid: '#DEDFD5',
    missingFill: '#E5E6DC',
    zeroFill: '#8AA196',
    rampLow: '#DCEBE4',
    rampMid: '#63A892',
    rampHigh: '#176C55',
    seasonColors: {
      winter: '#6B8E82',
      pre_monsoon: '#A26028',
      sw_monsoon: '#176C55',
      post_monsoon: '#3E6B5C',
    },
  },
  midnight: {
    theme: 'midnight',
    canvas: '#141D1D',
    surface: '#1C2928',
    ink: '#E2E9DF',
    mutedInk: '#A0B2A8',
    border: '#354441',
    accent: '#9BD0AB',
    accentText: '#9BD0AB',
    onAccent: '#14251C',
    panelBg: '#1C2928',
    panelInk: '#E2E9DF',
    panelMuted: '#A0B2A8',
    panelGrid: '#354441',
    missingFill: '#263533',
    zeroFill: '#556B66',
    rampLow: '#253936',
    rampMid: '#568D77',
    rampHigh: '#9BD0AB',
    seasonColors: {
      winter: '#729489',
      pre_monsoon: '#E6AC6C',
      sw_monsoon: '#9BD0AB',
      post_monsoon: '#588B76',
    },
  },
  blue: {
    theme: 'blue',
    canvas: '#EEF2F5',
    surface: '#FFFFFF',
    ink: '#233E54',
    mutedInk: '#506B7F',
    border: '#D5DFE6',
    accent: '#276B94',
    accentText: '#276B94',
    onAccent: '#FFFFFF',
    panelBg: '#FFFFFF',
    panelInk: '#233E54',
    panelMuted: '#506B7F',
    panelGrid: '#D5DFE6',
    missingFill: '#E1E7EC',
    zeroFill: '#8AA0B0',
    rampLow: '#DCE8F2',
    rampMid: '#6EA3C4',
    rampHigh: '#276B94',
    seasonColors: {
      winter: '#6E8EA3',
      pre_monsoon: '#945D2C',
      sw_monsoon: '#276B94',
      post_monsoon: '#3E6480',
    },
  },
};

export function getThemePalette(theme: ThemeId): ThemeVizPalette {
  return THEME_VIZ_PALETTES[theme] ?? THEME_VIZ_PALETTES.industrial;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Deterministic 3-stop perceptual ramp interpolation for quantitative encodings. */
export function interpolateRamp(t: number, palette: ThemeVizPalette): string {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  const [r1, g1, b1] = hexToRgb(clamped < 0.5 ? palette.rampLow : palette.rampMid);
  const [r2, g2, b2] = hexToRgb(clamped < 0.5 ? palette.rampMid : palette.rampHigh);
  const localT = clamped < 0.5 ? clamped * 2 : (clamped - 0.5) * 2;
  return rgbToHex(r1 + (r2 - r1) * localT, g1 + (g2 - g1) * localT, b1 + (b2 - b1) * localT);
}

export function getMotionConfig(reduceMotion: boolean) {
  return {
    enabled: !reduceMotion,
    durationMs: reduceMotion ? 0 : 240,
    staggerMs: reduceMotion ? 0 : 18,
    easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  };
}
