import type { Platform, Tone } from '../schemas';

export interface ImageSize {
  width: number;
  height: number;
}

/** Exact upload sizes recommended by each platform. */
export const IMAGE_SIZES: Record<Platform, ImageSize> = {
  linkedin: { width: 1200, height: 627 },
  x: { width: 1600, height: 900 },
  instagram: { width: 1080, height: 1350 },
};

export interface Palette {
  from: string;
  to: string;
  accent: string;
  accentAlt: string;
}

/** Gradient stops are dark enough for white text to pass WCAG AA (4.5:1) on their own. */
export const TONE_PALETTES: Record<Tone, readonly Palette[]> = {
  professional: [
    { from: '#0B1F3A', to: '#0E5E6F', accent: '#38BDF8', accentAlt: '#5EEAD4' },
    { from: '#111827', to: '#1E3A8A', accent: '#60A5FA', accentAlt: '#A5B4FC' },
    { from: '#042F2E', to: '#115E59', accent: '#2DD4BF', accentAlt: '#99F6E4' },
  ],
  witty: [
    { from: '#4C1D95', to: '#BE185D', accent: '#F9A8D4', accentAlt: '#FDE68A' },
    { from: '#5B21B6', to: '#C2410C', accent: '#FDBA74', accentAlt: '#C4B5FD' },
    { from: '#701A75', to: '#3730A3', accent: '#F0ABFC', accentAlt: '#67E8F9' },
  ],
  urgent: [
    { from: '#7F1D1D', to: '#C2410C', accent: '#FDBA74', accentAlt: '#FDE047' },
    { from: '#18181B', to: '#B91C1C', accent: '#F87171', accentAlt: '#FBBF24' },
    { from: '#881337', to: '#B45309', accent: '#FCA5A5', accentAlt: '#FCD34D' },
  ],
};

export const LIGHT_TEXT = '#FFFFFF';
export const DARK_TEXT = '#0F172A';

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.replace(/./g, (c) => c + c) : value;
  const num = Number.parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

/** WCAG relative luminance. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colors (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [light, dark] = la > lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

/** Picks the text color with the best worst-case contrast across the background colors. */
export function pickTextColor(backgrounds: readonly string[]): string {
  const worst = (text: string): number =>
    Math.min(...backgrounds.map((bg) => contrastRatio(text, bg)));
  return worst(LIGHT_TEXT) >= worst(DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT;
}

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}
