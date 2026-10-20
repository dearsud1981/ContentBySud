import type { Tone } from '../schemas';
import { hashString, normalizeSeedText, createRng } from '../seed';
import { TONE_PALETTES, type Palette } from './palette';

/**
 * A resolution-independent description of an image background. Coordinates are
 * fractions of the canvas width/height and sizes are fractions of the shorter
 * side, so one design renders consistently at every platform size.
 */

export const PATTERNS = ['orbs', 'triangles', 'rings', 'grid', 'stripes'] as const;
export type PatternKind = (typeof PATTERNS)[number];

export type Shape =
  | { kind: 'circle'; x: number; y: number; size: number; color: string; alpha: number }
  | {
      kind: 'ring';
      x: number;
      y: number;
      size: number;
      width: number;
      color: string;
      alpha: number;
    }
  | {
      kind: 'triangle';
      x: number;
      y: number;
      size: number;
      rotation: number;
      color: string;
      alpha: number;
    }
  | {
      kind: 'square';
      x: number;
      y: number;
      size: number;
      rotation: number;
      color: string;
      alpha: number;
    }
  | { kind: 'dots'; spacing: number; radius: number; color: string; alpha: number }
  | {
      kind: 'stripes';
      angle: number;
      spacing: number;
      width: number;
      color: string;
      alpha: number;
    };

export interface Design {
  seed: number;
  palette: Palette;
  /** Gradient direction in radians. */
  gradientAngle: number;
  pattern: PatternKind;
  shapes: Shape[];
}

/** The seed depends only on the idea text, so the same idea always yields the same artwork. */
export function designSeed(idea: string): number {
  return hashString(normalizeSeedText(idea));
}

export function createDesign(idea: string, tone: Tone): Design {
  const seed = designSeed(idea);
  const rng = createRng(seed);
  const palette = rng.pick(TONE_PALETTES[tone]);
  const gradientAngle = rng.range(0, Math.PI * 2);
  const pattern = rng.pick(PATTERNS);
  const colors = [palette.accent, palette.accentAlt, '#FFFFFF'];
  const shapes: Shape[] = [];

  switch (pattern) {
    case 'orbs': {
      const count = rng.int(6, 10);
      for (let i = 0; i < count; i += 1) {
        shapes.push({
          kind: 'circle',
          x: rng.range(-0.1, 1.1),
          y: rng.range(-0.1, 1.1),
          size: rng.range(0.08, 0.42),
          color: rng.pick(colors),
          alpha: rng.range(0.08, 0.22),
        });
      }
      break;
    }
    case 'triangles': {
      const count = rng.int(10, 16);
      for (let i = 0; i < count; i += 1) {
        shapes.push({
          kind: 'triangle',
          x: rng.range(-0.05, 1.05),
          y: rng.range(-0.05, 1.05),
          size: rng.range(0.06, 0.3),
          rotation: rng.range(0, Math.PI * 2),
          color: rng.pick(colors),
          alpha: rng.range(0.07, 0.2),
        });
      }
      break;
    }
    case 'rings': {
      const cx = rng.range(0.6, 1.0);
      const cy = rng.range(0.0, 1.0);
      const count = rng.int(5, 9);
      for (let i = 0; i < count; i += 1) {
        shapes.push({
          kind: 'ring',
          x: cx,
          y: cy,
          size: 0.12 + i * rng.range(0.07, 0.12),
          width: rng.range(0.004, 0.02),
          color: rng.pick(colors),
          alpha: rng.range(0.12, 0.3),
        });
      }
      shapes.push({
        kind: 'circle',
        x: rng.range(0, 0.4),
        y: rng.range(0.6, 1.1),
        size: rng.range(0.15, 0.3),
        color: palette.accentAlt,
        alpha: 0.12,
      });
      break;
    }
    case 'grid': {
      shapes.push({
        kind: 'dots',
        spacing: rng.range(0.04, 0.07),
        radius: rng.range(0.003, 0.007),
        color: '#FFFFFF',
        alpha: rng.range(0.12, 0.22),
      });
      const count = rng.int(4, 7);
      for (let i = 0; i < count; i += 1) {
        shapes.push({
          kind: 'square',
          x: rng.range(0, 1),
          y: rng.range(0, 1),
          size: rng.range(0.08, 0.24),
          rotation: rng.range(0, Math.PI / 2),
          color: rng.pick(colors),
          alpha: rng.range(0.1, 0.22),
        });
      }
      break;
    }
    case 'stripes': {
      shapes.push({
        kind: 'stripes',
        angle: rng.range(-Math.PI / 3, Math.PI / 3),
        spacing: rng.range(0.05, 0.1),
        width: rng.range(0.01, 0.03),
        color: rng.pick(colors),
        alpha: rng.range(0.07, 0.14),
      });
      const count = rng.int(2, 4);
      for (let i = 0; i < count; i += 1) {
        shapes.push({
          kind: 'circle',
          x: rng.range(0, 1),
          y: rng.range(0, 1),
          size: rng.range(0.1, 0.3),
          color: rng.pick(colors),
          alpha: rng.range(0.1, 0.2),
        });
      }
      break;
    }
  }

  return { seed, palette, gradientAngle, pattern, shapes };
}
