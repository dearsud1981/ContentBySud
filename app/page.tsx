import { ContentGenerator } from '@/components/ContentGenerator';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function HomePage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 sm:px-6 lg:py-10">
      <a
        href="#idea"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-slate-900"
      >
        Skip to the idea field
      </a>
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">ContentBySud</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            One idea in, ready-to-post drafts and images for LinkedIn, X and Instagram out.
          </p>
        </div>
        <ThemeToggle />
      </header>
      <main className="flex-1">
        <ContentGenerator />
      </main>
      <footer className="mt-10 text-center text-xs text-slate-500 dark:text-slate-500">
        Images are drawn in your browser. Review every draft before posting.
      </footer>
    </div>
  );
}
