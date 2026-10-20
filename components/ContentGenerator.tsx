'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { ClientError, requestPosts } from '@/lib/client';
import { TONE_META } from '@/lib/platformMeta';
import {
  IDEA_MAX_LENGTH,
  IdeaSchema,
  PLATFORMS,
  TONES,
  type AnyPost,
  type Platform,
  type ProviderName,
  type Tone,
} from '@/lib/schemas';
import { ResultCard } from './ResultCard';

interface CardState {
  post: AnyPost | null;
  loading: boolean;
  error: string | null;
  variation: number;
}

type Cards = Record<Platform, CardState>;

const EMPTY_CARDS: Cards = {
  linkedin: { post: null, loading: false, error: null, variation: 0 },
  x: { post: null, loading: false, error: null, variation: 0 },
  instagram: { post: null, loading: false, error: null, variation: 0 },
};

const PROVIDER_LABELS: Record<ProviderName, string> = {
  gemini: 'Google Gemini',
  groq: 'Groq',
  offline: 'offline templates',
};

function messageFrom(error: unknown): string {
  return error instanceof ClientError ? error.message : 'Something went wrong. Please try again.';
}

export function ContentGenerator() {
  const [idea, setIdea] = useState('');
  const [tone, setTone] = useState<Tone>('professional');
  const [aiArtwork, setAiArtwork] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [cards, setCards] = useState<Cards>(EMPTY_CARDS);
  const [provider, setProvider] = useState<ProviderName | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [source, setSource] = useState<{ idea: string; tone: Tone } | null>(null);
  const requestId = useRef(0);

  const ideaId = useId();
  const counterId = useId();
  const errorId = useId();

  const updateCard = (platform: Platform, patch: Partial<CardState>): void =>
    setCards((current) => ({ ...current, [platform]: { ...current[platform], ...patch } }));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const parsedIdea = IdeaSchema.safeParse(idea);
    if (!parsedIdea.success) {
      setFormError(parsedIdea.error.issues[0]?.message ?? 'Please check your idea.');
      return;
    }

    const id = (requestId.current += 1);
    setFormError(null);
    setGenerating(true);
    setStatus('Drafting posts for LinkedIn, X and Instagram…');
    setCards((current) => {
      const next = { ...current };
      for (const platform of PLATFORMS)
        next[platform] = { post: null, loading: true, error: null, variation: 0 };
      return next;
    });

    try {
      const result = await requestPosts({ idea: parsedIdea.data, tone });
      if (id !== requestId.current) return;
      setSource({ idea: parsedIdea.data, tone });
      setProvider(result.provider);
      setNotice(result.notice);
      setCards((current) => {
        const next = { ...current };
        for (const platform of PLATFORMS) {
          next[platform] = {
            post: result.posts[platform] ?? null,
            loading: false,
            error: null,
            variation: 0,
          };
        }
        return next;
      });
      setStatus('Your drafts are ready.');
    } catch (error) {
      if (id !== requestId.current) return;
      const message = messageFrom(error);
      setFormError(message);
      setCards(EMPTY_CARDS);
      setStatus('');
    } finally {
      if (id === requestId.current) setGenerating(false);
    }
  };

  const handleRegenerate = async (platform: Platform): Promise<void> => {
    if (!source) return;
    const variation = cards[platform].variation + 1;
    updateCard(platform, { loading: true, error: null });
    setStatus(`Regenerating the ${platform === 'x' ? 'X' : platform} draft…`);
    try {
      const result = await requestPosts({ ...source, platform, variation });
      const post = result.posts[platform] ?? null;
      updateCard(platform, { post, loading: false, variation });
      setProvider(result.provider);
      setNotice(result.notice);
      setStatus('New draft ready.');
    } catch (error) {
      updateCard(platform, { loading: false, error: messageFrom(error) });
      setStatus('');
    }
  };

  const hasResults = PLATFORMS.some((platform) => cards[platform].post || cards[platform].loading);
  const remaining = IDEA_MAX_LENGTH - idea.length;

  return (
    <div className="space-y-8">
      <form
        onSubmit={handleSubmit}
        noValidate
        className="card space-y-5 p-4 sm:p-6"
        aria-describedby={formError ? errorId : undefined}
      >
        <div>
          <label htmlFor={ideaId} className="mb-1 block text-sm font-semibold">
            Your idea
          </label>
          <textarea
            id={ideaId}
            name="idea"
            value={idea}
            onChange={(event) => setIdea(event.target.value.slice(0, IDEA_MAX_LENGTH))}
            maxLength={IDEA_MAX_LENGTH}
            rows={4}
            required
            placeholder="e.g. We are launching a free weekly workshop that teaches small business owners how to use AI for marketing."
            className="field resize-y"
            aria-describedby={`${counterId}${formError ? ` ${errorId}` : ''}`}
            aria-invalid={formError ? true : undefined}
          />
          <p
            id={counterId}
            className={`mt-1 text-right text-xs ${remaining <= 25 ? 'text-amber-700 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`}
          >
            {idea.length} / {IDEA_MAX_LENGTH} characters
          </p>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Tone</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {TONES.map((value) => {
              const meta = TONE_META[value];
              const checked = tone === value;
              return (
                <label
                  key={value}
                  className={`flex min-h-[44px] cursor-pointer flex-col rounded-lg border px-3 py-2 transition focus-within:ring-2 focus-within:ring-brand-500 ${
                    checked
                      ? 'border-brand-600 bg-brand-50 dark:border-brand-500 dark:bg-brand-500/15'
                      : 'border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                  }`}
                >
                  <input
                    type="radio"
                    name="tone"
                    value={value}
                    checked={checked}
                    onChange={() => setTone(value)}
                    className="sr-only"
                  />
                  <span className="text-sm font-semibold">{meta.label}</span>
                  <span className="text-xs text-slate-600 dark:text-slate-400">
                    {meta.description}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex cursor-pointer items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={aiArtwork}
              onChange={(event) => setAiArtwork(event.target.checked)}
              className="h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-2 focus:ring-brand-500"
            />
            <span>
              <span className="font-semibold">AI artwork (free)</span>
              <span className="block text-xs text-slate-600 dark:text-slate-400">
                Uses Pollinations.ai for the background; falls back to the built-in design.
              </span>
            </span>
          </label>
          <button
            type="submit"
            className="btn-primary w-full sm:w-auto sm:px-8"
            disabled={generating}
          >
            {generating ? (
              <>
                <span
                  className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                  aria-hidden="true"
                />
                Generating…
              </>
            ) : (
              'Generate'
            )}
          </button>
        </div>

        {formError && (
          <p
            id={errorId}
            role="alert"
            className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200"
          >
            {formError}
          </p>
        )}
      </form>

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {status}
      </div>

      {hasResults && (
        <section aria-label="Generated posts" className="space-y-4">
          {provider && !generating && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-slate-200 px-2.5 py-1 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                Drafted with {PROVIDER_LABELS[provider]}
              </span>
              {notice && (
                <p
                  role="status"
                  className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200"
                >
                  {notice}
                </p>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {PLATFORMS.map((platform) => (
              <ResultCard
                key={platform}
                platform={platform}
                post={cards[platform].post}
                idea={source?.idea ?? idea}
                tone={source?.tone ?? tone}
                loading={cards[platform].loading}
                error={cards[platform].error}
                aiArtwork={aiArtwork}
                onRegenerate={handleRegenerate}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
