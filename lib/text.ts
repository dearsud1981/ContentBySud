/**
 * Pure text helpers shared by the client, the API route and the offline generator.
 * Nothing in here touches the network or Node-only APIs.
 */

// C0/C1 control characters (except tab and newline) and bidi overrides that can
// be used to visually disguise text. The zero-width joiner (U+200D) is kept
// because emoji sequences depend on it.
const UNSAFE_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​‎‏‪-‮⁦-⁩﻿]/g;
const HTML_TAG = /<\/?[a-zA-Z!][^>]*>/g;

/** Removes markup and unsafe characters while keeping paragraph breaks. */
export function sanitizeMultiline(input: string): string {
  return input
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(HTML_TAG, ' ')
    .replace(UNSAFE_CHARS, '')
    .replace(/[<>]/g, '')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Sanitizes free-form user input and collapses it onto a single line. */
export function sanitizeIdea(input: string): string {
  return sanitizeMultiline(input).replace(/\s+/g, ' ').trim();
}

/** Counts words, ignoring tokens that contain no letters or digits (emoji, dashes). */
export function countWords(text: string): number {
  return text.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

const SENTENCE_END = /[.!?…]["'”’)\]]*$/;

/**
 * Trims text to at most `maxWords` words. Prefers to cut at the end of a
 * sentence; falls back to a word boundary with an ellipsis.
 */
export function trimToWords(text: string, maxWords: number): string {
  if (countWords(text) <= maxWords) return text;
  const parts = text.split(/(\s+)/);
  let words = 0;
  let cutIndex = 0;
  let lastSentenceCut = -1;
  let wordsAtSentenceCut = 0;
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i] ?? '';
    if (/^\s+$/.test(part)) continue;
    const isWord = /[\p{L}\p{N}]/u.test(part);
    if (isWord && words + 1 > maxWords) break;
    if (isWord) words += 1;
    cutIndex = i + 1;
    if (SENTENCE_END.test(part)) {
      lastSentenceCut = cutIndex;
      wordsAtSentenceCut = words;
    }
  }
  if (lastSentenceCut > 0 && wordsAtSentenceCut >= maxWords * 0.5) {
    return parts.slice(0, lastSentenceCut).join('').trim();
  }
  const cut = parts
    .slice(0, cutIndex)
    .join('')
    .trim()
    .replace(/[\s,;:–—-]+$/, '');
  return `${cut}…`;
}

const STOPWORDS = new Set(
  (
    'a about above after again against all also am an and any are as at be because been before being ' +
    'below between both but by can could did do does doing down during each even ever every few for from ' +
    'further get gets getting got had has have having he her here hers herself him himself his how i if in ' +
    'into is it its itself just let lets like make makes made me more most much must my myself new next no nor ' +
    'not now of off on once one only or other our ours ourselves out over own per really same she should so ' +
    'some still such than that the their theirs them themselves then there these they this those through ' +
    'to too under until up upon us use used using very via was we well were what when where which while who ' +
    'whom why will with within without would yet you your yours yourself yourselves week weeks today ' +
    'tomorrow year years month months day days way ways thing things lot lots want wants need needs going ' +
    'launch launching launched share sharing post posts idea ideas'
  ).split(' '),
);

// Descriptive or verb-like words that make weak standalone hashtags but work inside phrases.
const WEAK_KEYWORDS = new Set(
  (
    'free weekly daily monthly yearly small big large great good best better top real simple easy fast quick ' +
    'every many first last early late latest huge major minor local global full whole special ready ' +
    'teach teaches teaching learn learns learning help helps helping start starts starting build builds ' +
    'building create creates creating show shows showing try tries trying keep keeps run runs running ' +
    'work works working think thinks know knows find finds take takes give gives tell tells said says'
  ).split(' '),
);

function tokenize(text: string): string[] {
  return (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).map((raw) =>
    raw.replace(/['’]s$/, '').replace(/['’-]+$/, ''),
  );
}

/** Uppercase acronyms such as "AI" or "SEO" keep their case and may be two letters long. */
function isAcronym(token: string): boolean {
  return /^[A-Z][A-Z0-9]{1,5}$/.test(token);
}

function isContentWord(token: string): boolean {
  const lower = token.toLowerCase();
  if (isAcronym(token)) return !STOPWORDS.has(lower);
  return lower.length >= 3 && !STOPWORDS.has(lower) && !/^\d+$/.test(lower);
}

/**
 * Extracts distinctive keywords from an idea, in order of first appearance.
 * Acronyms keep their case; everything else is lowercased.
 */
export function extractKeywords(text: string, limit = 6): string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const token of tokenize(text)) {
    if (!isContentWord(token)) continue;
    const keyword = isAcronym(token) ? token : token.toLowerCase();
    if (!isAcronym(token) && WEAK_KEYWORDS.has(keyword)) continue;
    if (seen.has(keyword.toLowerCase())) continue;
    seen.add(keyword.toLowerCase());
    keywords.push(keyword);
    if (keywords.length >= limit) break;
  }
  return keywords;
}

/** Two-word phrases of adjacent content words, e.g. "small business" → ["small", "business"]. */
export function extractPhrases(text: string, limit = 4): string[][] {
  const tokens = tokenize(text);
  const phrases: string[][] = [];
  const seen = new Set<string>();
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const first = tokens[i] ?? '';
    const second = tokens[i + 1] ?? '';
    if (!isContentWord(first) || !isContentWord(second)) continue;
    if (WEAK_KEYWORDS.has(second.toLowerCase())) continue;
    // "AI marketing" makes a good tag; "weekly AI" does not.
    if (isAcronym(second)) continue;
    const key = `${first} ${second}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    phrases.push([first, second]);
    if (phrases.length >= limit) break;
  }
  return phrases;
}

/** Converts arbitrary text (with or without a leading #) into a clean hashtag. */
export function toHashtag(raw: string): string | null {
  const words = raw
    .replace(/^#+/, '')
    .split(/[^\p{L}\p{N}_]+/u)
    .filter(Boolean);
  if (words.length === 0) return null;
  const tag =
    words.length === 1
      ? (words[0] ?? '')
      : words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join('');
  if (/^\d+$/.test(tag) || tag.length < 2 || tag.length > 40) return null;
  return `#${tag}`;
}

/** Capitalizes the first letter of a keyword-derived hashtag body, e.g. "coffee" → "Coffee". */
export function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * Normalizes, de-duplicates and sizes a hashtag list to [min, max], topping up
 * from `fallbackPool` when the source has too few usable tags.
 */
export function fitHashtags(
  source: readonly string[],
  min: number,
  max: number,
  fallbackPool: readonly string[],
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  const add = (candidate: string): void => {
    const tag = toHashtag(candidate);
    if (!tag) return;
    const key = tag.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(tag);
  };
  for (const tag of source) {
    if (result.length >= max) break;
    add(tag);
  }
  for (const tag of fallbackPool) {
    if (result.length >= min) break;
    add(tag);
  }
  return result.slice(0, max);
}

/** Pulls hashtags out of free text and returns the text without trailing hashtag-only lines. */
export function splitTrailingHashtags(text: string): { body: string; hashtags: string[] } {
  const lines = text.split('\n');
  const hashtags: string[] = [];
  while (lines.length > 0) {
    const last = (lines[lines.length - 1] ?? '').trim();
    if (last === '') {
      lines.pop();
      continue;
    }
    const tokens = last.split(/\s+/);
    if (tokens.every((token) => token.startsWith('#'))) {
      hashtags.unshift(...tokens);
      lines.pop();
      continue;
    }
    break;
  }
  return { body: lines.join('\n').trim(), hashtags };
}

/** Shortens a single line to at most `maxChars` characters at a word boundary. */
export function truncateLine(text: string, maxChars: number): string {
  const line = text.replace(/\s+/g, ' ').trim();
  if (line.length <= maxChars) return line;
  const slice = line.slice(0, maxChars - 1);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > maxChars * 0.5 ? slice.slice(0, lastSpace) : slice;
  return `${cut.replace(/[\s,;:–—-]+$/, '')}…`;
}

/** Title-cases a short phrase, keeping acronyms and small connector words intact. */
export function titleCase(text: string): string {
  const small = new Set([
    'a',
    'an',
    'and',
    'as',
    'at',
    'but',
    'by',
    'for',
    'in',
    'of',
    'on',
    'or',
    'the',
    'to',
    'vs',
    'with',
  ]);
  return text
    .split(' ')
    .map((word, index) => {
      if (word.length === 0) return word;
      if (word === word.toUpperCase() && /[A-Z]/.test(word)) return word;
      const lower = word.toLowerCase();
      if (index > 0 && small.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}
