import { describe, expect, it } from 'vitest';
import { finalizeInstagram, finalizeLinkedIn } from '@/lib/posts';
import { RateLimiter } from '@/lib/rateLimit';
import {
  countWords,
  extractKeywords,
  fitHashtags,
  splitTrailingHashtags,
  toHashtag,
  trimToWords,
} from '@/lib/text';

describe('text helpers', () => {
  it('builds clean hashtags', () => {
    expect(toHashtag('eco friendly')).toBe('#EcoFriendly');
    expect(toHashtag('#AI')).toBe('#AI');
    expect(toHashtag('2024')).toBeNull();
    expect(toHashtag('!!!')).toBeNull();
  });

  it('dedupes and tops up hashtags to the minimum', () => {
    expect(fitHashtags(['#AI', 'ai', '#Tech'], 3, 5, ['Growth', 'More'])).toEqual([
      '#AI',
      '#Tech',
      '#Growth',
    ]);
    expect(fitHashtags(['a1', 'b2', 'c3', 'd4'], 0, 2, [])).toEqual(['#a1', '#b2']);
  });

  it('extracts keywords without stopwords', () => {
    expect(
      extractKeywords('We are launching the new coffee subscription for coffee lovers'),
    ).toEqual(['coffee', 'subscription', 'lovers']);
  });

  it('trims to a word limit, preferring sentence ends', () => {
    const text = 'One two three. Four five six. Seven eight nine ten.';
    expect(trimToWords(text, 7)).toBe('One two three. Four five six.');
    expect(countWords(trimToWords('a b c d e f g h i j', 4))).toBe(4);
  });

  it('moves trailing hashtag lines out of the body', () => {
    expect(splitTrailingHashtags('Hello there\n\n#One #Two')).toEqual({
      body: 'Hello there',
      hashtags: ['#One', '#Two'],
    });
  });
});

describe('LLM output normalization', () => {
  const ctx = { idea: 'Remote work culture', tone: 'professional' as const };

  it('caps LinkedIn at 250 words and guarantees a closing question', () => {
    const post = finalizeLinkedIn(
      { headline: 'Remote', body: 'Remote work is great. '.repeat(100), hashtags: [] },
      ctx,
    );
    expect(countWords(post.body)).toBeLessThanOrEqual(250);
    expect(post.body.trim().endsWith('?')).toBe(true);
    expect(post.hashtags.length).toBeGreaterThanOrEqual(3);
  });

  it('keeps Instagram captions under 150 words with 10-15 hashtags', () => {
    const post = finalizeInstagram(
      {
        headline: 'Remote',
        body: 'Love working from anywhere ✨ '.repeat(60),
        hashtags: Array.from({ length: 25 }, (_, i) => `#Tag${i}`),
        visualConcept: 'Visual concept: a laptop\non a beach',
      },
      ctx,
    );
    expect(countWords(post.body)).toBeLessThan(150);
    expect(post.hashtags).toHaveLength(15);
    expect(post.visualConcept).toBe('a laptop on a beach');
  });
});

describe('RateLimiter', () => {
  it('allows 10 requests per minute per key', () => {
    const limiter = new RateLimiter(10, 60_000);
    for (let i = 0; i < 10; i += 1) expect(limiter.check('1.1.1.1', 1000 + i).allowed).toBe(true);
    const blocked = limiter.check('1.1.1.1', 2000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(59);
    expect(limiter.check('2.2.2.2', 2000).allowed).toBe(true);
    expect(limiter.check('1.1.1.1', 61_001).allowed).toBe(true);
  });
});
