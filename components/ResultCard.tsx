'use client';

import { useEffect, useId, useState } from 'react';
import { copyToClipboard } from '@/lib/clipboard';
import { PLATFORM_META } from '@/lib/platformMeta';
import type { AnyPost, Platform, Tone } from '@/lib/schemas';
import { countWords } from '@/lib/text';
import { tweetLength } from '@/lib/twitter';
import { PostImage } from './PostImage';
import { CardSkeleton } from './Skeleton';

export interface ResultCardProps {
  platform: Platform;
  post: AnyPost | null;
  idea: string;
  tone: Tone;
  loading: boolean;
  error: string | null;
  aiArtwork: boolean;
  onRegenerate: (platform: Platform) => void;
}

function characterCount(platform: Platform, text: string): number {
  return platform === 'x' ? tweetLength(text) : Array.from(text).length;
}

export function ResultCard({
  platform,
  post,
  idea,
  tone,
  loading,
  error,
  aiArtwork,
  onRegenerate,
}: ResultCardProps) {
  const meta = PLATFORM_META[platform];
  const [draft, setDraft] = useState(post?.text ?? '');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const textareaId = useId();
  const countId = useId();
  const headingId = useId();

  useEffect(() => {
    setDraft(post?.text ?? '');
    setCopyState('idle');
  }, [post]);

  useEffect(() => {
    if (copyState === 'idle') return;
    const timer = setTimeout(() => setCopyState('idle'), 2000);
    return () => clearTimeout(timer);
  }, [copyState]);

  const count = characterCount(platform, draft);
  const overLimit = count > meta.charLimit;
  const visualConcept = post && 'visualConcept' in post ? post.visualConcept : undefined;

  const handleCopy = async (): Promise<void> => {
    setCopyState((await copyToClipboard(draft)) ? 'copied' : 'failed');
  };

  return (
    <article
      className="card flex flex-col p-4 sm:p-5"
      aria-labelledby={headingId}
      aria-busy={loading}
    >
      <header className="mb-3 flex items-center gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${meta.badgeClass}`}
          aria-hidden="true"
        >
          {meta.shortLabel}
        </span>
        <h2 id={headingId} className="text-lg font-bold">
          {meta.label}
        </h2>
      </header>

      {loading && !post ? (
        <CardSkeleton platform={platform} />
      ) : error && !post ? (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200"
        >
          {error}
        </p>
      ) : post ? (
        <div className="flex flex-1 flex-col gap-4">
          <div className={loading ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
            <label
              htmlFor={textareaId}
              className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Draft text{' '}
              <span className="font-normal text-slate-500 dark:text-slate-400">(editable)</span>
            </label>
            <textarea
              id={textareaId}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={platform === 'x' ? 6 : 12}
              className="field resize-y font-[inherit] text-sm leading-relaxed"
              aria-describedby={countId}
              disabled={loading}
            />
            <div id={countId} className="mt-1 flex flex-wrap justify-between gap-2 text-xs">
              <span
                className={
                  overLimit
                    ? 'font-semibold text-red-700 dark:text-red-400'
                    : 'text-slate-600 dark:text-slate-400'
                }
              >
                {count.toLocaleString()} / {meta.charLimit.toLocaleString()} characters
                {overLimit ? ' — over the limit' : ''}
              </span>
              {platform !== 'x' && (
                <span className="text-slate-500 dark:text-slate-400">
                  {countWords(draft.replace(/#[\p{L}\p{N}_]+/gu, ''))} words excl. hashtags
                </span>
              )}
            </div>
            {visualConcept && (
              <p className="mt-3 rounded-lg bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <span className="font-semibold">Visual concept:</span> {visualConcept}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary flex-1"
              onClick={handleCopy}
              disabled={loading}
            >
              {copyState === 'copied' ? 'Copied!' : copyState === 'failed' ? 'Copy failed' : 'Copy'}
              <span className="sr-only"> {meta.label} draft</span>
            </button>
            <button
              type="button"
              className="btn-secondary flex-1"
              onClick={() => onRegenerate(platform)}
              disabled={loading}
            >
              {loading ? 'Regenerating…' : 'Regenerate'}
              <span className="sr-only"> {meta.label} only</span>
            </button>
          </div>
          <span className="sr-only" aria-live="polite">
            {copyState === 'copied'
              ? `${meta.label} draft copied to clipboard.`
              : copyState === 'failed'
                ? 'Copy failed. Select the text and copy it manually.'
                : ''}
          </span>
          {error && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              {error}
            </p>
          )}

          <PostImage
            idea={idea}
            tone={tone}
            platform={platform}
            headline={post.headline}
            visualConcept={visualConcept}
            aiArtwork={aiArtwork}
          />
        </div>
      ) : null}
    </article>
  );
}
