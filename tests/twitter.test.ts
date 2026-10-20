import { describe, expect, it } from 'vitest';
import { finalizeX } from '@/lib/posts';
import { enforceTweet, truncateToTweetLength, tweetLength, X_MAX_LENGTH } from '@/lib/twitter';

describe('tweetLength', () => {
  it('counts Latin characters as 1', () => {
    expect(tweetLength('hello world')).toBe(11);
  });

  it('counts emoji (including ZWJ sequences) as 2', () => {
    expect(tweetLength('🚀')).toBe(2);
    expect(tweetLength('👩‍💻')).toBe(2);
    expect(tweetLength('🇮🇳')).toBe(2);
  });

  it('counts CJK characters as 2', () => {
    expect(tweetLength('日本語')).toBe(6);
  });

  it('counts every URL as 23', () => {
    expect(tweetLength('see https://example.com/a/very/long/path/that/goes/on')).toBe(4 + 23);
  });
});

describe('enforceTweet', () => {
  it('keeps short posts intact with up to two hashtags', () => {
    const result = enforceTweet('Short and sweet.', ['#One', '#Two', '#Three']);
    expect(result.hashtags).toEqual(['#One', '#Two']);
    expect(result.text).toBe('Short and sweet.\n\n#One #Two');
  });

  it('drops hashtags before cutting the message', () => {
    const body = 'x'.repeat(270);
    const result = enforceTweet(body, ['#LongHashtagOne', '#LongHashtagTwo']);
    expect(result.body).toBe(body);
    expect(result.hashtags).toEqual([]);
    expect(tweetLength(result.text)).toBeLessThanOrEqual(X_MAX_LENGTH);
  });

  it.each([
    ['plain words', 'word '.repeat(200)],
    ['one giant token', 'a'.repeat(1000)],
    ['emoji heavy', '🚀 '.repeat(300)],
    ['CJK', '日本語のテキスト'.repeat(60)],
    ['URLs', 'read https://example.com/article '.repeat(30)],
  ])('never exceeds 280 characters: %s', (_name, body) => {
    const result = enforceTweet(body, ['#Growth', '#Ideas']);
    expect(tweetLength(result.text)).toBeLessThanOrEqual(X_MAX_LENGTH);
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.body.endsWith('…')).toBe(true);
  });

  it('truncates at a word boundary when possible', () => {
    const cut = truncateToTweetLength('alpha beta gamma delta epsilon', 20);
    expect(cut).toBe('alpha beta gamma…');
    expect(tweetLength(cut)).toBeLessThanOrEqual(20);
  });
});

describe('finalizeX', () => {
  it('enforces the limit and hashtag count on LLM output', () => {
    const post = finalizeX(
      {
        headline: 'Big news',
        body: `${'This is a very long tweet that keeps going. '.repeat(20)}\n#Tag1 #Tag2 #Tag3`,
        hashtags: ['#Alpha', '#Beta', '#Gamma'],
      },
      { idea: 'Big news', tone: 'urgent' },
    );
    expect(tweetLength(post.text)).toBeLessThanOrEqual(280);
    expect(post.hashtags.length).toBeLessThanOrEqual(2);
    expect(post.body).not.toMatch(/#Tag3/);
  });
});
