import {
  InstagramPostSchema,
  LinkedInPostSchema,
  RULES,
  XPostSchema,
  type InstagramPost,
  type LinkedInPost,
  type Platform,
  type RawInstagramPost,
  type RawPost,
  type Tone,
  type XPost,
} from './schemas';
import {
  capitalize,
  countWords,
  extractKeywords,
  extractPhrases,
  fitHashtags,
  sanitizeMultiline,
  splitTrailingHashtags,
  titleCase,
  trimToWords,
  truncateLine,
} from './text';
import { enforceTweet } from './twitter';

/**
 * Turns raw drafts (from an LLM or the offline templates) into posts that are
 * guaranteed to satisfy every platform rule that can be enforced in code.
 */

export interface PostContext {
  idea: string;
  tone: Tone;
}

const GENERIC_TAGS: Record<Tone, readonly string[]> = {
  professional: [
    'Leadership',
    'Strategy',
    'Growth',
    'Innovation',
    'Business',
    'Productivity',
    'CareerGrowth',
    'Insights',
  ],
  witty: [
    'Creativity',
    'WorkLife',
    'Ideas',
    'Growth',
    'Innovation',
    'Inspiration',
    'Community',
    'RealTalk',
  ],
  urgent: [
    'ActNow',
    'Growth',
    'Innovation',
    'Momentum',
    'Leadership',
    'Strategy',
    'Execution',
    'Results',
  ],
};

const INSTAGRAM_TAGS: readonly string[] = [
  'InstaDaily',
  'ContentCreator',
  'Inspiration',
  'Motivation',
  'Community',
  'Creative',
  'Explore',
  'SmallBusiness',
  'Entrepreneur',
  'DailyInspiration',
  'Trending',
  'IdeasThatMatter',
];

/** Relevant hashtags derived from the idea first, then tone-appropriate general tags. */
export function hashtagPool(idea: string, tone: Tone, platform: Platform): string[] {
  // Two-word phrases and acronyms are usually the most specific tags, so they lead.
  const phrases = extractPhrases(idea, 4).map((words) => words.map(capitalize).join(''));
  const keywords = extractKeywords(idea, 6);
  const acronyms = keywords.filter((word) => word === word.toUpperCase());
  const others = keywords
    .filter((word) => word !== word.toUpperCase())
    .sort((a, b) => b.length - a.length)
    .map(capitalize);
  const fromIdea = [...phrases.slice(0, 2), ...acronyms, ...others, ...phrases.slice(2)];
  if (platform === 'instagram') return [...fromIdea, ...GENERIC_TAGS[tone], ...INSTAGRAM_TAGS];
  return [...fromIdea, ...GENERIC_TAGS[tone]];
}

const CLOSING_QUESTIONS: Record<Tone, string> = {
  professional: 'What has your experience been with this?',
  witty: 'Tell me I am not the only one. What would you add?',
  urgent: 'What is the one step you will take this week?',
};

function endsWithQuestion(body: string): boolean {
  const paragraphs = body.split(/\n{2,}/);
  const last = paragraphs[paragraphs.length - 1] ?? '';
  return /\?["'”’)]*\s*$/.test(last.trim());
}

/** Headline for images: short, single line, falls back to the idea itself. */
export function headlineFrom(raw: string | undefined, idea: string): string {
  const cleaned = sanitizeMultiline(raw ?? '')
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/#[\p{L}\p{N}_]+/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length > 0) return truncateLine(cleaned, RULES.headlineMaxChars);
  const words = idea
    .split(/\s+/)
    .slice(0, 10)
    .join(' ')
    .replace(/[.,;:!?]+$/, '');
  return truncateLine(titleCase(words), RULES.headlineMaxChars);
}

function cleanBody(raw: string): { body: string; inlineTags: string[] } {
  const sanitized = sanitizeMultiline(raw);
  const { body, hashtags } = splitTrailingHashtags(sanitized);
  return { body: body.length > 0 ? body : sanitized, inlineTags: hashtags };
}

export function finalizeLinkedIn(raw: RawPost, ctx: PostContext): LinkedInPost {
  const { body: initial, inlineTags } = cleanBody(raw.body);
  let body = initial;
  if (endsWithQuestion(body)) {
    body = trimToWords(body, RULES.linkedin.maxWords);
  }
  if (!endsWithQuestion(body)) {
    const question = CLOSING_QUESTIONS[ctx.tone];
    body = `${trimToWords(body, RULES.linkedin.maxWords - countWords(question))}\n\n${question}`;
  }
  const hashtags = fitHashtags(
    [...raw.hashtags, ...inlineTags],
    RULES.linkedin.minHashtags,
    RULES.linkedin.maxHashtags,
    hashtagPool(ctx.idea, ctx.tone, 'linkedin'),
  );
  return LinkedInPostSchema.parse({
    headline: headlineFrom(raw.headline, ctx.idea),
    body,
    hashtags,
    text: `${body}\n\n${hashtags.join(' ')}`,
  });
}

export function finalizeX(raw: RawPost, ctx: PostContext): XPost {
  const { body, inlineTags } = cleanBody(raw.body);
  const hashtags = fitHashtags(
    [...raw.hashtags, ...inlineTags],
    RULES.x.minHashtags,
    RULES.x.maxHashtags,
    [],
  );
  const tweet = enforceTweet(body, hashtags);
  return XPostSchema.parse({ headline: headlineFrom(raw.headline, ctx.idea), ...tweet });
}

export function finalizeInstagram(raw: RawInstagramPost, ctx: PostContext): InstagramPost {
  const { body: caption, inlineTags } = cleanBody(raw.body);
  const body = trimToWords(caption, RULES.instagram.maxWordsExclusive - 1);
  const hashtags = fitHashtags(
    [...raw.hashtags, ...inlineTags],
    RULES.instagram.minHashtags,
    RULES.instagram.maxHashtags,
    hashtagPool(ctx.idea, ctx.tone, 'instagram'),
  );
  const visualConcept = truncateLine(
    sanitizeMultiline(raw.visualConcept).replace(/^visual concept:\s*/i, ''),
    RULES.visualConceptMaxChars,
  );
  return InstagramPostSchema.parse({
    headline: headlineFrom(raw.headline, ctx.idea),
    body,
    hashtags,
    visualConcept,
    text: `${body}\n\n${hashtags.join(' ')}`,
  });
}
