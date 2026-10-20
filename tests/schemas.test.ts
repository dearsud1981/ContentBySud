import { describe, expect, it } from 'vitest';
import {
  GenerateRequestSchema,
  GenerateResponseSchema,
  IdeaSchema,
  InstagramPostSchema,
  LinkedInPostSchema,
  RawPostsSchema,
  rawPostsSchemaFor,
  XPostSchema,
} from '@/lib/schemas';

describe('IdeaSchema', () => {
  it('sanitizes markup, control characters and whitespace', () => {
    const result = IdeaSchema.parse('  <script>alert(1)</script>Launch   our\u0000 new\n\napp  ');
    expect(result).toBe('alert(1) Launch our new app');
    expect(result).not.toMatch(/[<>]/);
  });

  it('rejects ideas that are empty after sanitizing', () => {
    expect(IdeaSchema.safeParse('   <b></b>  ').success).toBe(false);
    expect(IdeaSchema.safeParse('ab').success).toBe(false);
  });

  it('enforces the 500 character limit', () => {
    expect(IdeaSchema.safeParse('a'.repeat(500)).success).toBe(true);
    const tooLong = IdeaSchema.safeParse('a'.repeat(501));
    expect(tooLong.success).toBe(false);
    expect(tooLong.error?.issues[0]?.message).toMatch(/500/);
  });

  it('rejects non-string input', () => {
    expect(IdeaSchema.safeParse(42).success).toBe(false);
  });
});

describe('GenerateRequestSchema', () => {
  it('accepts a valid request and defaults variation to 0', () => {
    const parsed = GenerateRequestSchema.parse({ idea: 'Remote work tips', tone: 'witty' });
    expect(parsed).toEqual({ idea: 'Remote work tips', tone: 'witty', variation: 0 });
  });

  it('accepts a single-platform regenerate request', () => {
    const parsed = GenerateRequestSchema.parse({
      idea: 'Remote work tips',
      tone: 'urgent',
      platform: 'x',
      variation: 3,
    });
    expect(parsed.platform).toBe('x');
  });

  it('rejects unknown tones, platforms and extra keys', () => {
    expect(GenerateRequestSchema.safeParse({ idea: 'Remote work', tone: 'angry' }).success).toBe(
      false,
    );
    expect(
      GenerateRequestSchema.safeParse({ idea: 'Remote work', tone: 'witty', platform: 'tiktok' })
        .success,
    ).toBe(false);
    expect(
      GenerateRequestSchema.safeParse({ idea: 'Remote work', tone: 'witty', apiKey: 'x' }).success,
    ).toBe(false);
    expect(
      GenerateRequestSchema.safeParse({ idea: 'Remote work', tone: 'witty', variation: -1 })
        .success,
    ).toBe(false);
  });
});

describe('raw LLM output schemas', () => {
  const raw = {
    linkedin: { headline: 'H', body: 'Body', hashtags: ['#a'] },
    x: { headline: 'H', body: 'Body', hashtags: [] },
    instagram: { headline: 'H', body: 'Body', hashtags: [], visualConcept: 'A picture' },
  };

  it('accepts a well-formed reply', () => {
    expect(RawPostsSchema.safeParse(raw).success).toBe(true);
  });

  it('rejects a reply missing a platform or a required field', () => {
    expect(RawPostsSchema.safeParse({ ...raw, x: undefined }).success).toBe(false);
    expect(
      RawPostsSchema.safeParse({ ...raw, instagram: { headline: 'H', body: 'B', hashtags: [] } })
        .success,
    ).toBe(false);
  });

  it('can validate a subset of platforms for regenerate', () => {
    expect(rawPostsSchemaFor(['x']).safeParse({ x: raw.x }).success).toBe(true);
    expect(rawPostsSchemaFor(['x']).safeParse({ linkedin: raw.linkedin }).success).toBe(false);
  });
});

describe('final post schemas', () => {
  it('enforces hashtag counts per platform', () => {
    const base = { headline: 'Title', body: 'Hello world?', text: 'Hello world?' };
    expect(LinkedInPostSchema.safeParse({ ...base, hashtags: ['#One', '#Two'] }).success).toBe(
      false,
    );
    expect(
      LinkedInPostSchema.safeParse({ ...base, hashtags: ['#One', '#Two', '#Three'] }).success,
    ).toBe(true);
    expect(XPostSchema.safeParse({ ...base, hashtags: ['#A1', '#B2', '#C3'] }).success).toBe(false);
    const ig = { ...base, visualConcept: 'Concept' };
    expect(
      InstagramPostSchema.safeParse({
        ...ig,
        hashtags: Array.from({ length: 9 }, (_, i) => `#Tag${i}`),
      }).success,
    ).toBe(false);
    expect(
      InstagramPostSchema.safeParse({
        ...ig,
        hashtags: Array.from({ length: 12 }, (_, i) => `#Tag${i}`),
      }).success,
    ).toBe(true);
    expect(
      InstagramPostSchema.safeParse({
        ...ig,
        hashtags: Array.from({ length: 16 }, (_, i) => `#Tag${i}`),
      }).success,
    ).toBe(false);
  });

  it('rejects X posts over 280 characters', () => {
    const text = 'a'.repeat(281);
    expect(XPostSchema.safeParse({ headline: 'T', body: text, hashtags: [], text }).success).toBe(
      false,
    );
  });

  it('rejects malformed hashtags', () => {
    const base = { headline: 'T', body: 'B', text: 'B' };
    expect(XPostSchema.safeParse({ ...base, hashtags: ['no-hash'] }).success).toBe(false);
    expect(XPostSchema.safeParse({ ...base, hashtags: ['#has space'] }).success).toBe(false);
  });

  it('requires at least one post in an API response', () => {
    expect(
      GenerateResponseSchema.safeParse({ posts: {}, provider: 'offline', notice: null }).success,
    ).toBe(false);
  });
});
