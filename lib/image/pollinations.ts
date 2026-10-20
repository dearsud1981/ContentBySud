import type { Tone } from '../schemas';
import { truncateLine } from '../text';
import type { ImageSize } from './palette';

/**
 * Optional "AI artwork (free)" background from Pollinations.ai. It is a plain
 * image URL (no key, no SDK). Any failure or a slow response falls back to the
 * canvas design without bothering the user.
 */

export const POLLINATIONS_TIMEOUT_MS = 10_000;
const POLLINATIONS_BASE = 'https://image.pollinations.ai/prompt/';

const TONE_STYLE: Record<Tone, string> = {
  professional: 'clean modern editorial style, calm blue and teal palette, soft light',
  witty: 'playful colorful pop-art style, vibrant purple pink and orange palette',
  urgent: 'dramatic high-energy style, bold red and orange palette, dynamic motion',
};

export function artworkPrompt(idea: string, tone: Tone, visualConcept?: string): string {
  const subject = truncateLine(visualConcept?.trim() || idea, 240);
  return `${subject}. ${TONE_STYLE[tone]}. Abstract background artwork, no text, no letters, no words, no logos, no watermark.`;
}

export function pollinationsUrl(prompt: string, size: ImageSize, seed: number): string {
  const params = new URLSearchParams({
    width: String(size.width),
    height: String(size.height),
    seed: String(seed % 1_000_000_000),
    nologo: 'true',
    safe: 'true',
  });
  return `${POLLINATIONS_BASE}${encodeURIComponent(prompt)}?${params.toString()}`;
}

/** Loads a CORS-enabled image, resolving to null on error or timeout (never rejects). */
export function loadImageWithTimeout(
  url: string,
  timeoutMs: number = POLLINATIONS_TIMEOUT_MS,
): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (result: HTMLImageElement | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      if (!result) image.src = '';
      resolve(result);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    image.onload = () => finish(image.naturalWidth > 0 ? image : null);
    image.onerror = () => finish(null);
    image.src = url;
  });
}
