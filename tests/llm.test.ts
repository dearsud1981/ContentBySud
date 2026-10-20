import { afterEach, describe, expect, it, vi } from 'vitest';
import { generatePosts, resolveProvider } from '@/lib/llm';
import { generateOffline, ideaSentence, shortTitle } from '@/lib/llm/offline';
import { extractJson } from '@/lib/llm/prompt';
import { PLATFORMS, PostsSchema, TONES, type GenerateRequest } from '@/lib/schemas';
import { countWords } from '@/lib/text';
import { tweetLength } from '@/lib/twitter';
import { jsonResponse } from './helpers';

const IDEAS = [
  'We are launching a free weekly workshop that teaches small business owners how to use AI for marketing',
  'Remote work',
  'Why every developer should write documentation before writing code, and how it saves weeks of rework later on in a project',
  'Our café now uses 100% compostable cups 🌱',
];

const request = (overrides: Partial<GenerateRequest> = {}): GenerateRequest => ({
  idea: IDEAS[0] as string,
  tone: 'professional',
  variation: 0,
  ...overrides,
});

const validRaw = {
  linkedin: {
    headline: 'AI Marketing for Small Business',
    body: `${'Small businesses can now use AI to do more with less. '.repeat(16)}\n\nWhat would you automate first?`,
    hashtags: ['#AI', '#Marketing', '#SmallBusiness'],
  },
  x: {
    headline: 'Free AI workshop',
    body: 'Free weekly AI marketing workshop for small businesses.',
    hashtags: ['#AI'],
  },
  instagram: {
    headline: 'Learn AI Marketing',
    body: 'Free AI workshop every week! 🚀 Join us.',
    hashtags: ['#AI', '#Marketing'],
    visualConcept: 'A bright workshop room with laptops',
  },
};

const geminiReply = (text: string) =>
  jsonResponse({ candidates: [{ content: { parts: [{ text }] } }] });
const groqReply = (text: string) => jsonResponse({ choices: [{ message: { content: text } }] });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('offline template mode', () => {
  it.each(TONES.flatMap((tone) => IDEAS.map((idea) => [tone, idea] as const)))(
    'meets every platform rule (%s): %s',
    async (tone, idea) => {
      const result = await generatePosts(request({ idea, tone }), {
        env: { LLM_PROVIDER: 'offline' },
      });
      expect(result.provider).toBe('offline');
      expect(result.notice).toBeNull();
      const posts = PostsSchema.parse(result.posts);

      const linkedinWords = countWords(posts.linkedin.body);
      expect(linkedinWords).toBeGreaterThanOrEqual(150);
      expect(linkedinWords).toBeLessThanOrEqual(250);
      expect(posts.linkedin.body.trim().endsWith('?')).toBe(true);
      expect(posts.linkedin.hashtags.length).toBeGreaterThanOrEqual(3);
      expect(posts.linkedin.hashtags.length).toBeLessThanOrEqual(5);

      expect(tweetLength(posts.x.text)).toBeLessThanOrEqual(280);
      expect(posts.x.hashtags.length).toBeLessThanOrEqual(2);

      expect(countWords(posts.instagram.body)).toBeLessThan(150);
      expect(posts.instagram.hashtags.length).toBeGreaterThanOrEqual(10);
      expect(posts.instagram.hashtags.length).toBeLessThanOrEqual(15);
      expect(posts.instagram.visualConcept).not.toContain('\n');
    },
  );

  it('is deterministic for the same input', () => {
    expect(generateOffline(IDEAS[0] as string, 'witty', PLATFORMS)).toEqual(
      generateOffline(IDEAS[0] as string, 'witty', PLATFORMS),
    );
  });

  it('changes voice with the tone', () => {
    const texts = TONES.map(
      (tone) => generateOffline(IDEAS[1] as string, tone, ['linkedin']).linkedin?.body,
    );
    expect(new Set(texts).size).toBe(3);
  });

  it('produces a different draft on regenerate (variation)', () => {
    const variants = [0, 1, 2, 3].map(
      (variation) => generateOffline(IDEAS[0] as string, 'urgent', ['x'], variation).x?.body,
    );
    expect(new Set(variants).size).toBeGreaterThan(1);
    for (const tone of TONES) {
      for (const platform of PLATFORMS) {
        for (let v = 0; v < 5; v += 1) {
          const a = generateOffline(IDEAS[0] as string, tone, [platform], v)[platform]?.body;
          const b = generateOffline(IDEAS[0] as string, tone, [platform], v + 1)[platform]?.body;
          expect(a).not.toBe(b);
        }
      }
    }
  });

  it('returns only the requested platform on regenerate', async () => {
    const result = await generatePosts(request({ platform: 'instagram' }), {
      env: { LLM_PROVIDER: 'offline' },
    });
    expect(Object.keys(result.posts)).toEqual(['instagram']);
  });

  it('derives a readable sentence and headline from the idea', () => {
    expect(ideaSentence('remote work is here to stay. More later.')).toBe(
      'Remote work is here to stay.',
    );
    expect(ideaSentence('AI tools for teams')).toBe('AI tools for teams.');
    expect(shortTitle('We are launching a free weekly workshop that teaches owners')).toBe(
      'We Are Launching a Free Weekly Workshop',
    );
    expect(shortTitle('The future of remote work, explained')).toBe('The Future of Remote Work');
  });

  it('builds relevant hashtags from the idea', () => {
    const raw = generateOffline(
      'Teaching small business owners to use AI for marketing',
      'professional',
      ['instagram'],
    );
    expect(raw.instagram?.hashtags).toEqual(
      expect.arrayContaining(['AI', 'Marketing', 'SmallBusiness']),
    );
  });
});

describe('provider selection and fallback', () => {
  it('defaults to Gemini and reports a missing key', () => {
    expect(resolveProvider({}).missingKey).toBe('GEMINI_API_KEY');
    expect(resolveProvider({ LLM_PROVIDER: 'groq' }).missingKey).toBe('GROQ_API_KEY');
    expect(resolveProvider({ LLM_PROVIDER: 'GROQ', GROQ_API_KEY: 'k' }).provider?.name).toBe(
      'groq',
    );
  });

  it('falls back to offline with a notice when the key is missing', async () => {
    const fetchImpl = vi.fn();
    const result = await generatePosts(request(), { env: { LLM_PROVIDER: 'gemini' }, fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.provider).toBe('offline');
    expect(result.notice).toMatch(/GEMINI_API_KEY/);
    expect(PostsSchema.safeParse(result.posts).success).toBe(true);
  });

  it('falls back to offline when the provider call fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: 'quota' }, 429));
    const result = await generatePosts(request(), { env: { GEMINI_API_KEY: 'k' }, fetchImpl });
    expect(result.provider).toBe('offline');
    expect(result.notice).toMatch(/free-tier limit/);
  });

  it('reports an invalid Gemini key clearly', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(
          { error: { status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } },
          400,
        ),
      );
    const result = await generatePosts(request(), { env: { GEMINI_API_KEY: 'bad' }, fetchImpl });
    expect(result.provider).toBe('offline');
    expect(result.notice).toMatch(/rejected the API key/);
  });

  it('falls back to offline on network errors', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const result = await generatePosts(request(), {
      env: { LLM_PROVIDER: 'groq', GROQ_API_KEY: 'k' },
      fetchImpl,
    });
    expect(result.provider).toBe('offline');
    expect(result.notice).toMatch(/Groq is unavailable/);
  });

  it('falls back to offline when the provider times out', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchImpl = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    const result = await generatePosts(request(), {
      env: { GEMINI_API_KEY: 'k' },
      fetchImpl,
      timeoutMs: 20,
    });
    expect(result.provider).toBe('offline');
    expect(result.notice).toMatch(/took too long/);
  });

  it('uses Gemini output in a single call when it is valid', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(geminiReply(JSON.stringify(validRaw)));
    const result = await generatePosts(request(), { env: { GEMINI_API_KEY: 'secret' }, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.provider).toBe('gemini');
    expect(result.notice).toBeNull();
    const posts = PostsSchema.parse(result.posts);
    expect(posts.instagram.hashtags.length).toBeGreaterThanOrEqual(10);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('gemini-2.5-flash:generateContent');
    expect(url).not.toContain('secret');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('secret');
  });

  it('retries once on invalid JSON, then succeeds', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(groqReply('Sure! Here are your posts: {not json'))
      .mockResolvedValueOnce(groqReply(`\`\`\`json\n${JSON.stringify(validRaw)}\n\`\`\``));
    const result = await generatePosts(request({ tone: 'witty' }), {
      env: { LLM_PROVIDER: 'groq', GROQ_API_KEY: 'k' },
      fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.provider).toBe('groq');
    const retryBody = JSON.parse(
      String((fetchImpl.mock.calls[1] as [string, RequestInit])[1].body),
    ) as {
      messages: { content: string }[];
    };
    expect(retryBody.messages.at(-1)?.content).toMatch(/not valid JSON/);
  });

  it('falls back to offline after two invalid replies', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchImpl = vi
      .fn()
      .mockImplementation(() => Promise.resolve(geminiReply(JSON.stringify({ linkedin: {} }))));
    const result = await generatePosts(request(), { env: { GEMINI_API_KEY: 'k' }, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.provider).toBe('offline');
    expect(result.notice).toMatch(/could not use/);
  });

  it('requests only the regenerated platform from the LLM', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(geminiReply(JSON.stringify({ x: validRaw.x })));
    const result = await generatePosts(request({ platform: 'x', variation: 1 }), {
      env: { GEMINI_API_KEY: 'k' },
      fetchImpl,
    });
    expect(result.provider).toBe('gemini');
    expect(Object.keys(result.posts)).toEqual(['x']);
  });
});

describe('extractJson', () => {
  it('tolerates code fences and surrounding prose', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Here you go: {"a":2} hope it helps')).toEqual({ a: 2 });
  });

  it('throws when no object is present', () => {
    expect(() => extractJson('no json here')).toThrow();
  });
});
