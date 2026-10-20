/**
 * X (Twitter) length rules. X counts "weighted" characters: most Latin-script
 * characters count as 1, while CJK characters and emoji count as 2, and every
 * URL counts as 23. This mirrors the twitter-text v3 configuration so that a
 * post that passes here is accepted by X.
 */

export const X_MAX_LENGTH = 280;
export const X_MAX_HASHTAGS = 2;
const URL_WEIGHT = 23;
const ELLIPSIS = '…';

// Code point ranges that count as a single character (twitter-text v3).
const LIGHT_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0000, 0x10ff],
  [0x2000, 0x200d],
  [0x2010, 0x201f],
  [0x2032, 0x2037],
];

const URL_PATTERN = /https?:\/\/[^\s]+/g;
const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

function graphemes(text: string): string[] {
  if (segmenter) return Array.from(segmenter.segment(text), (part) => part.segment);
  return Array.from(text);
}

function codePointWeight(codePoint: number): number {
  return LIGHT_RANGES.some(([start, end]) => codePoint >= start && codePoint <= end) ? 1 : 2;
}

function graphemeWeight(grapheme: string): number {
  if (EMOJI.test(grapheme)) return 2;
  let weight = 0;
  for (const char of grapheme) weight += codePointWeight(char.codePointAt(0) ?? 0);
  return weight;
}

function plainWeight(text: string): number {
  let weight = 0;
  for (const grapheme of graphemes(text)) weight += graphemeWeight(grapheme);
  return weight;
}

/** Returns the weighted length X uses to enforce its 280 character limit. */
export function tweetLength(input: string): number {
  const text = input.normalize('NFC');
  let total = 0;
  let lastIndex = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const index = match.index ?? 0;
    total += plainWeight(text.slice(lastIndex, index)) + URL_WEIGHT;
    lastIndex = index + match[0].length;
  }
  return total + plainWeight(text.slice(lastIndex));
}

/** Cuts text so that it (plus an ellipsis) fits within `limit`, preferring word boundaries. */
export function truncateToTweetLength(text: string, limit: number): string {
  if (tweetLength(text) <= limit) return text;
  const budget = limit - tweetLength(ELLIPSIS);
  if (budget <= 0) return '';
  let used = 0;
  let cut = '';
  for (const grapheme of graphemes(text)) {
    const weight = graphemeWeight(grapheme);
    if (used + weight > budget) break;
    used += weight;
    cut += grapheme;
  }
  const lastSpace = cut.search(/\s\S*$/);
  if (lastSpace > cut.length * 0.6) cut = cut.slice(0, lastSpace);
  let result = `${cut.replace(/[\s,;:–—-]+$/, '')}${ELLIPSIS}`;
  // URLs are weighted differently from their raw characters; tighten until it fits.
  while (tweetLength(result) > limit && cut.length > 0) {
    cut = cut.replace(/\s*\S+\s*$/, '');
    result = cut ? `${cut}${ELLIPSIS}` : '';
  }
  return result;
}

export interface TweetParts {
  body: string;
  hashtags: string[];
  text: string;
}

function composeTweet(body: string, hashtags: readonly string[]): string {
  return [body, hashtags.join(' ')].filter((part) => part.length > 0).join('\n\n');
}

/**
 * Builds the final X post from a body and hashtags, guaranteeing at most two
 * hashtags and at most 280 weighted characters. Hashtags are dropped before the
 * body is shortened, so the message itself is preserved whenever possible.
 */
export function enforceTweet(body: string, hashtags: readonly string[]): TweetParts {
  const cleanBody = body.trim();
  const tags = hashtags.slice(0, X_MAX_HASHTAGS);

  for (let count = tags.length; count >= 0; count -= 1) {
    const kept = tags.slice(0, count);
    const text = composeTweet(cleanBody, kept);
    if (tweetLength(text) <= X_MAX_LENGTH) return { body: cleanBody, hashtags: kept, text };
  }

  // The body alone is too long: keep up to one hashtag and shorten the body.
  const kept = tags.slice(0, 1);
  const reserved = kept.length > 0 ? tweetLength(`\n\n${kept.join(' ')}`) : 0;
  const shortened = truncateToTweetLength(cleanBody, X_MAX_LENGTH - reserved);
  return { body: shortened, hashtags: kept, text: composeTweet(shortened, kept) };
}
