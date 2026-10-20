'use client';

import { useEffect, useRef, useState } from 'react';
import { designSeed } from '@/lib/image/design';
import { IMAGE_SIZES } from '@/lib/image/palette';
import { artworkPrompt, loadImageWithTimeout, pollinationsUrl } from '@/lib/image/pollinations';
import { canvasToPngBlob, renderPostImage, type BackgroundImage } from '@/lib/image/render';
import { PLATFORM_META } from '@/lib/platformMeta';
import type { Platform, Tone } from '@/lib/schemas';

interface PostImageProps {
  idea: string;
  tone: Tone;
  platform: Platform;
  headline: string;
  visualConcept?: string;
  aiArtwork: boolean;
}

// Artwork requests are cached per URL so toggling or regenerating text never refetches.
const artworkCache = new Map<string, Promise<HTMLImageElement | null>>();

function loadArtwork(url: string): Promise<HTMLImageElement | null> {
  let pending = artworkCache.get(url);
  if (!pending) {
    pending = loadImageWithTimeout(url).then((image) => {
      if (!image) artworkCache.delete(url);
      return image;
    });
    artworkCache.set(url, pending);
  }
  return pending;
}

async function renderToBlob(
  props: Omit<PostImageProps, 'aiArtwork' | 'visualConcept'>,
  background: BackgroundImage | null,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  renderPostImage(canvas, { ...props, background });
  return canvasToPngBlob(canvas);
}

export function PostImage({
  idea,
  tone,
  platform,
  headline,
  visualConcept,
  aiArtwork,
}: PostImageProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const urlRef = useRef<string | null>(null);
  const size = IMAGE_SIZES[platform];
  const label = PLATFORM_META[platform].label;

  useEffect(() => {
    let cancelled = false;
    setFailed(false);

    (async () => {
      let background: HTMLImageElement | null = null;
      if (aiArtwork) {
        const prompt = artworkPrompt(idea, tone, visualConcept);
        background = await loadArtwork(pollinationsUrl(prompt, size, designSeed(idea)));
        if (cancelled) return;
      }

      const base = { idea, tone, platform, headline };
      let blob: Blob;
      try {
        blob = await renderToBlob(base, background);
      } catch {
        // A cross-origin image without CORS taints the canvas; fall back to the canvas design.
        blob = await renderToBlob(base, null);
      }
      if (cancelled) return;

      const nextUrl = URL.createObjectURL(blob);
      const previous = urlRef.current;
      urlRef.current = nextUrl;
      setUrl(nextUrl);
      if (previous) URL.revokeObjectURL(previous);
    })().catch(() => {
      if (!cancelled) setFailed(true);
    });

    return () => {
      cancelled = true;
    };
  }, [idea, tone, platform, headline, visualConcept, aiArtwork, size]);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const fileName = `contentbysud-${platform}-${size.width}x${size.height}.png`;

  return (
    <div>
      <div
        className="relative w-full overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800"
        style={{ aspectRatio: `${size.width} / ${size.height}` }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- local blob URL, not an optimizable asset
          <img
            src={url}
            alt={`${label} image with the headline: ${headline}`}
            width={size.width}
            height={size.height}
            className="h-full w-full object-cover"
          />
        ) : failed ? (
          <p className="flex h-full items-center justify-center p-4 text-center text-sm text-slate-600 dark:text-slate-300">
            The image could not be drawn in this browser.
          </p>
        ) : (
          <div
            className="h-full w-full animate-pulse bg-slate-200 dark:bg-slate-700"
            aria-hidden="true"
          />
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {size.width} × {size.height} PNG
        </span>
        {url ? (
          <a href={url} download={fileName} className="btn-secondary">
            <DownloadIcon />
            Download
            <span className="sr-only"> {label} image</span>
          </a>
        ) : (
          <button type="button" className="btn-secondary" disabled>
            <DownloadIcon />
            Download
          </button>
        )}
      </div>
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M12 3v12m0 0l-5-5m5 5l5-5M4 21h16" />
    </svg>
  );
}
