import type { ImageSize } from './palette';

/** Measures text width in pixels at a given font size. */
export type MeasureText = (text: string, fontSize: number) => number;

export interface SafeArea {
  x: number;
  y: number;
  width: number;
  height: number;
  margin: number;
}

/** 8% of the shorter side keeps text clear of platform crops and rounded previews. */
export function safeArea({ width, height }: ImageSize): SafeArea {
  const margin = Math.round(Math.min(width, height) * 0.08);
  return { x: margin, y: margin, width: width - margin * 2, height: height - margin * 2, margin };
}

function breakLongWord(
  word: string,
  fontSize: number,
  maxWidth: number,
  measure: MeasureText,
): string[] {
  const pieces: string[] = [];
  let current = '';
  for (const char of Array.from(word)) {
    if (current && measure(current + char, fontSize) > maxWidth) {
      pieces.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

/** Greedy word wrap; words wider than a line are split across lines. */
export function wrapText(
  text: string,
  fontSize: number,
  maxWidth: number,
  measure: MeasureText,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate, fontSize) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    if (measure(word, fontSize) <= maxWidth) {
      line = word;
    } else {
      const pieces = breakLongWord(word, fontSize, maxWidth, measure);
      lines.push(...pieces.slice(0, -1));
      line = pieces[pieces.length - 1] ?? '';
    }
  }
  if (line) lines.push(line);
  return lines;
}

export interface HeadlineLayout {
  fontSize: number;
  lineHeight: number;
  lines: string[];
  width: number;
  height: number;
}

export interface FitOptions {
  maxFontSize: number;
  minFontSize: number;
  lineHeightRatio?: number;
}

/**
 * Finds the largest font size at which the headline fits the box. If even the
 * minimum size overflows, the text is clipped to the lines that fit with an ellipsis.
 */
export function fitHeadline(
  text: string,
  maxWidth: number,
  maxHeight: number,
  measure: MeasureText,
  { maxFontSize, minFontSize, lineHeightRatio = 1.15 }: FitOptions,
): HeadlineLayout {
  const build = (fontSize: number, lines: string[]): HeadlineLayout => {
    const lineHeight = Math.round(fontSize * lineHeightRatio);
    return {
      fontSize,
      lineHeight,
      lines,
      width: Math.max(0, ...lines.map((l) => measure(l, fontSize))),
      height: lines.length * lineHeight,
    };
  };

  for (let size = Math.floor(maxFontSize); size >= minFontSize; size -= 2) {
    const layout = build(size, wrapText(text, size, maxWidth, measure));
    if (layout.height <= maxHeight && layout.width <= maxWidth) return layout;
  }

  const size = Math.ceil(minFontSize);
  const lineHeight = Math.round(size * lineHeightRatio);
  const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));
  const lines = wrapText(text, size, maxWidth, measure);
  if (lines.length <= maxLines) return build(size, lines);
  const kept = lines.slice(0, maxLines);
  let last = `${kept[maxLines - 1] ?? ''}…`;
  while (measure(last, size) > maxWidth && last.length > 1) {
    last = `${last.slice(0, -2).trimEnd()}…`;
  }
  kept[maxLines - 1] = last;
  return build(size, kept);
}
