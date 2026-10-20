import { IMAGE_SIZES } from '@/lib/image/palette';
import type { Platform } from '@/lib/schemas';

function Line({ width }: { width: string }) {
  return <div className={`h-3 animate-pulse rounded bg-slate-200 dark:bg-slate-700 ${width}`} />;
}

export function CardSkeleton({ platform }: { platform: Platform }) {
  const size = IMAGE_SIZES[platform];
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <div className="space-y-2">
        <Line width="w-full" />
        <Line width="w-11/12" />
        <Line width="w-4/5" />
        <Line width="w-full" />
        <Line width="w-2/3" />
      </div>
      <div className="flex gap-2">
        <div className="h-11 flex-1 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700" />
        <div className="h-11 flex-1 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700" />
      </div>
      <div
        className="w-full animate-pulse rounded-xl bg-slate-200 dark:bg-slate-700"
        style={{ aspectRatio: `${size.width} / ${size.height}` }}
      />
    </div>
  );
}
