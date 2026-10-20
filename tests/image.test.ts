import { describe, expect, it } from 'vitest';
import { createDesign, designSeed } from '@/lib/image/design';
import { fitHeadline, safeArea, wrapText } from '@/lib/image/layout';
import {
  contrastRatio,
  IMAGE_SIZES,
  LIGHT_TEXT,
  pickTextColor,
  TONE_PALETTES,
} from '@/lib/image/palette';
import { artworkPrompt, pollinationsUrl } from '@/lib/image/pollinations';
import { renderPostImage } from '@/lib/image/render';
import { PLATFORMS, TONES } from '@/lib/schemas';
import { createRng, hashString } from '@/lib/seed';
import { createFakeCanvas } from './helpers';

const measure = (text: string, size: number): number => Array.from(text).length * size * 0.55;

describe('canvas sizes', () => {
  it('uses the exact platform sizes', () => {
    expect(IMAGE_SIZES).toEqual({
      linkedin: { width: 1200, height: 627 },
      x: { width: 1600, height: 900 },
      instagram: { width: 1080, height: 1350 },
    });
  });

  it.each(PLATFORMS)('renders %s at its exact size', (platform) => {
    const canvas = createFakeCanvas();
    const result = renderPostImage(canvas, {
      idea: 'Launch day',
      tone: 'urgent',
      platform,
      headline: 'Launch Day Is Here',
    });
    expect({ width: canvas.width, height: canvas.height }).toEqual(IMAGE_SIZES[platform]);
    expect(result.size).toEqual(IMAGE_SIZES[platform]);
    expect(canvas.texts.join(' ')).toBe('Launch Day Is Here');
  });
});

describe('seeded design', () => {
  it('hashes and seeds deterministically', () => {
    expect(hashString('hello')).toBe(hashString('hello'));
    expect(hashString('hello')).not.toBe(hashString('hellp'));
    const a = createRng(42);
    const b = createRng(42);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });

  it('gives the same idea the same design, ignoring case and spacing', () => {
    expect(createDesign('Coffee   culture', 'witty')).toEqual(
      createDesign('coffee culture', 'witty'),
    );
    expect(designSeed('Coffee culture')).toBe(designSeed(' coffee  CULTURE '));
  });

  it('gives different ideas different designs', () => {
    const ideas = Array.from({ length: 40 }, (_, i) => `Idea number ${i} about growth`);
    const fingerprints = new Set(
      ideas.map((idea) => JSON.stringify(createDesign(idea, 'professional'))),
    );
    expect(fingerprints.size).toBe(ideas.length);
  });

  it('uses the tone palette', () => {
    for (const tone of TONES) {
      const design = createDesign('Same idea', tone);
      expect(TONE_PALETTES[tone]).toContainEqual(design.palette);
    }
  });

  it('keeps every random value within range', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i += 1) {
      const n = rng.next();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
      const int = rng.int(3, 5);
      expect(int).toBeGreaterThanOrEqual(3);
      expect(int).toBeLessThanOrEqual(5);
    }
  });
});

describe('readable contrast', () => {
  it.each(TONES)('white text passes WCAG AA on every %s gradient stop', (tone) => {
    for (const palette of TONE_PALETTES[tone]) {
      expect(contrastRatio(LIGHT_TEXT, palette.from)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(LIGHT_TEXT, palette.to)).toBeGreaterThanOrEqual(4.5);
      expect(pickTextColor([palette.from, palette.to])).toBe(LIGHT_TEXT);
    }
  });

  it('picks dark text on light backgrounds', () => {
    expect(pickTextColor(['#FFFFFF', '#F1F5F9'])).not.toBe(LIGHT_TEXT);
  });
});

describe('headline layout', () => {
  it('wraps text within the max width and splits very long words', () => {
    const lines = wrapText(`Short words then ${'x'.repeat(80)}`, 40, 600, measure);
    for (const line of lines) expect(measure(line, 40)).toBeLessThanOrEqual(600);
    expect(lines.join('')).toContain('x'.repeat(10));
  });

  it.each(PLATFORMS)('fits short and long headlines inside the %s safe area', (platform) => {
    const size = IMAGE_SIZES[platform];
    const area = safeArea(size);
    expect(area.margin).toBeGreaterThan(0);
    for (const headline of [
      'Hi',
      'A Practical Look at Remote Work and Team Culture',
      'word '.repeat(60),
    ]) {
      const layout = fitHeadline(headline, area.width, area.height, measure, {
        maxFontSize: 120,
        minFontSize: 40,
      });
      expect(layout.width).toBeLessThanOrEqual(area.width);
      expect(layout.height).toBeLessThanOrEqual(area.height);
      expect(layout.fontSize).toBeGreaterThanOrEqual(40);
    }
  });

  it('shrinks the font for longer headlines', () => {
    const short = fitHeadline('Short', 800, 400, measure, { maxFontSize: 120, minFontSize: 30 });
    const long = fitHeadline('A much longer headline that needs several lines', 800, 400, measure, {
      maxFontSize: 120,
      minFontSize: 30,
    });
    expect(long.fontSize).toBeLessThan(short.fontSize);
  });
});

describe('pollinations', () => {
  it('builds a deterministic URL at the exact size with no text in the art', () => {
    const prompt = artworkPrompt('Coffee culture', 'witty');
    expect(prompt).toMatch(/no text/);
    const url = new URL(
      pollinationsUrl(prompt, IMAGE_SIZES.instagram, designSeed('Coffee culture')),
    );
    expect(url.hostname).toBe('image.pollinations.ai');
    expect(url.searchParams.get('width')).toBe('1080');
    expect(url.searchParams.get('height')).toBe('1350');
    expect(pollinationsUrl(prompt, IMAGE_SIZES.instagram, 1)).toBe(
      pollinationsUrl(prompt, IMAGE_SIZES.instagram, 1),
    );
  });
});
