import { z } from 'zod';
import { countWords, sanitizeIdea } from './text';
import { tweetLength, X_MAX_HASHTAGS, X_MAX_LENGTH } from './twitter';

export const TONES = ['professional', 'witty', 'urgent'] as const;
export type Tone = (typeof TONES)[number];

export const PLATFORMS = ['linkedin', 'x', 'instagram'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PROVIDERS = ['gemini', 'groq', 'offline'] as const;
export type ProviderName = (typeof PROVIDERS)[number];

export const IDEA_MIN_LENGTH = 3;
export const IDEA_MAX_LENGTH = 500;

export const RULES = {
  linkedin: { minWords: 150, maxWords: 250, minHashtags: 3, maxHashtags: 5 },
  x: { maxLength: X_MAX_LENGTH, minHashtags: 0, maxHashtags: X_MAX_HASHTAGS },
  instagram: { maxWordsExclusive: 150, minHashtags: 10, maxHashtags: 15 },
  headlineMaxChars: 90,
  visualConceptMaxChars: 200,
} as const;

/** User idea: sanitized first, then length-checked so the limit applies to visible text. */
export const IdeaSchema = z
  .string({ required_error: 'Please enter an idea.', invalid_type_error: 'Idea must be text.' })
  .max(IDEA_MAX_LENGTH * 4, `Keep your idea under ${IDEA_MAX_LENGTH} characters.`)
  .transform(sanitizeIdea)
  .pipe(
    z
      .string()
      .min(IDEA_MIN_LENGTH, `Please describe your idea in at least ${IDEA_MIN_LENGTH} characters.`)
      .max(IDEA_MAX_LENGTH, `Keep your idea under ${IDEA_MAX_LENGTH} characters.`),
  );

export const ToneSchema = z.enum(TONES, {
  errorMap: () => ({ message: 'Choose a tone: Professional, Witty or Urgent.' }),
});
export const PlatformSchema = z.enum(PLATFORMS, {
  errorMap: () => ({ message: 'Unknown platform.' }),
});

export const GenerateRequestSchema = z
  .object({
    idea: IdeaSchema,
    tone: ToneSchema,
    /** When set, only this platform is regenerated. */
    platform: PlatformSchema.optional(),
    /** Changes the draft on regenerate while keeping results reproducible. */
    variation: z.number().int().min(0).max(10_000).default(0),
  })
  .strict();
export type GenerateRequestInput = z.input<typeof GenerateRequestSchema>;
export type GenerateRequest = z.output<typeof GenerateRequestSchema>;

/* ----------------------------- Raw LLM output ----------------------------- */

const RawText = (max: number) => z.string().trim().min(1).max(max);

export const RawPostSchema = z.object({
  headline: RawText(300),
  body: RawText(5000),
  hashtags: z.array(z.string().max(80)).max(40).default([]),
});
export const RawInstagramPostSchema = RawPostSchema.extend({
  visualConcept: RawText(600),
});
export const RawPostsSchema = z.object({
  linkedin: RawPostSchema,
  x: RawPostSchema,
  instagram: RawInstagramPostSchema,
});
export type RawPost = z.infer<typeof RawPostSchema>;
export type RawInstagramPost = z.infer<typeof RawInstagramPostSchema>;
export type RawPosts = z.infer<typeof RawPostsSchema>;

/** Schema for a raw LLM response that covers only the requested platforms. */
export function rawPostsSchemaFor(platforms: readonly Platform[]) {
  const mask = Object.fromEntries(platforms.map((p) => [p, true])) as Partial<
    Record<Platform, true>
  >;
  return RawPostsSchema.pick(mask);
}

/* ---------------------------- Final (normalized) --------------------------- */

const Hashtag = z.string().regex(/^#[\p{L}\p{N}_]{2,40}$/u, 'Invalid hashtag');
const Headline = z.string().min(1).max(RULES.headlineMaxChars);

export const LinkedInPostSchema = z.object({
  headline: Headline,
  body: z
    .string()
    .min(1)
    .refine((body) => countWords(body) <= RULES.linkedin.maxWords, {
      message: `LinkedIn posts must be at most ${RULES.linkedin.maxWords} words.`,
    }),
  hashtags: z.array(Hashtag).min(RULES.linkedin.minHashtags).max(RULES.linkedin.maxHashtags),
  text: z.string().min(1),
});

export const XPostSchema = z.object({
  headline: Headline,
  body: z.string().min(1),
  hashtags: z.array(Hashtag).max(RULES.x.maxHashtags),
  text: z
    .string()
    .min(1)
    .refine((text) => tweetLength(text) <= X_MAX_LENGTH, {
      message: `X posts must be at most ${X_MAX_LENGTH} characters.`,
    }),
});

export const InstagramPostSchema = z.object({
  headline: Headline,
  body: z
    .string()
    .min(1)
    .refine((body) => countWords(body) < RULES.instagram.maxWordsExclusive, {
      message: `Instagram captions must be under ${RULES.instagram.maxWordsExclusive} words.`,
    }),
  hashtags: z.array(Hashtag).min(RULES.instagram.minHashtags).max(RULES.instagram.maxHashtags),
  visualConcept: z.string().min(1).max(RULES.visualConceptMaxChars),
  text: z.string().min(1),
});

export type LinkedInPost = z.infer<typeof LinkedInPostSchema>;
export type XPost = z.infer<typeof XPostSchema>;
export type InstagramPost = z.infer<typeof InstagramPostSchema>;
export type AnyPost = LinkedInPost | XPost | InstagramPost;

export const PostsSchema = z.object({
  linkedin: LinkedInPostSchema,
  x: XPostSchema,
  instagram: InstagramPostSchema,
});
export type Posts = z.infer<typeof PostsSchema>;

export const GenerateResponseSchema = z.object({
  posts: PostsSchema.partial().refine((posts) => Object.keys(posts).length > 0, {
    message: 'Response contained no posts.',
  }),
  provider: z.enum(PROVIDERS),
  notice: z.string().nullable(),
});
export type GenerateResponse = z.infer<typeof GenerateResponseSchema>;

export const ErrorResponseSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
