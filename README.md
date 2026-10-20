# ContentBySud — Social Post Generator (Phase 1)

Type one idea, pick a tone (**Professional**, **Witty** or **Urgent**) and get ready-to-post drafts
and matching images for **LinkedIn**, **X** and **Instagram** at once.

Zero running cost: free LLM tiers (Google Gemini or Groq), an offline template mode that needs no key,
and images drawn in the browser on an HTML canvas.

## Features

- **One call, three platforms.** `/api/generate` asks the model for all three posts in a single
  structured JSON reply, validates it with Zod and retries once if the JSON is invalid.
- **Platform rules enforced in code**, not just in the prompt:
  - LinkedIn: 150–250 words, hook line, short paragraphs, closing question, 3–5 hashtags
  - X: at most 280 characters (weighted the way X counts: emoji and CJK count as 2, URLs as 23),
    at most 2 hashtags
  - Instagram: caption under 150 words, emojis allowed, 10–15 hashtags, one-line visual concept
- **Three providers with automatic fallback.** Gemini (default) or Groq. If the key is missing or the
  call fails, times out (20 s) or returns unusable output, the app falls back to deterministic offline
  templates and shows a small notice.
- **Canvas images at exact sizes**: LinkedIn 1200×627, X 1600×900, Instagram 1080×1350. Tone-based
  palette, gradient and geometric pattern seeded from the idea (same idea → same image), auto-wrapped
  and auto-sized headline, safe margins and WCAG AA text contrast. Download as PNG.
- **Optional "AI artwork (free)"** background from Pollinations.ai. On error or after 10 s it silently
  falls back to the canvas design.
- **Per-card tools**: editable draft, live character count, Copy, Download, and Regenerate (that
  platform only).
- **Production basics**: input sanitization, Zod validation on client and server, 10 requests per
  minute per IP, API keys server-side only, security headers (CSP, frame and sniffing protection),
  accessible UI (labels, focus states, `aria-live` status and errors), light and dark mode.

## Quick start

Requirements: Node.js 18.18 or newer (Node 20+ recommended) and npm.

```bash
git clone https://github.com/dearsud1981/ContentBySud.git
cd ContentBySud
npm install
cp .env.example .env.local   # then add a free key (optional, see below)
npm run dev                  # http://localhost:3000
```

Without any key the app works in offline template mode straight away.

## Free API keys

| Provider      | Where to get it                                                                               | Env var          |
| ------------- | --------------------------------------------------------------------------------------------- | ---------------- |
| Google Gemini | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) → **Create API key** | `GEMINI_API_KEY` |
| Groq          | [console.groq.com/keys](https://console.groq.com/keys) → **Create API Key**                   | `GROQ_API_KEY`   |

Both have free tiers that need no credit card. Keys are read only on the server and are never sent
to the browser.

## Environment variables

| Variable         | Default                   | Description                                 |
| ---------------- | ------------------------- | ------------------------------------------- |
| `LLM_PROVIDER`   | `gemini`                  | `gemini`, `groq` or `offline`               |
| `GEMINI_API_KEY` | —                         | Google AI Studio key                        |
| `GEMINI_MODEL`   | `gemini-2.5-flash`        | Any Gemini model that supports JSON output  |
| `GROQ_API_KEY`   | —                         | Groq key                                    |
| `GROQ_MODEL`     | `llama-3.3-70b-versatile` | Any Groq chat model that supports JSON mode |

If Google or Groq retire a default model, set `GEMINI_MODEL` or `GROQ_MODEL` to a current one. No
code change is needed.

## Scripts

```bash
npm run dev           # start the dev server
npm run build         # production build
npm start             # serve the production build
npm run lint          # ESLint (zero warnings allowed)
npm run typecheck     # TypeScript strict mode
npm run format        # Prettier write
npm run format:check  # Prettier check
npm test              # Vitest unit tests
npm run check         # lint + typecheck + format check + tests
```

## Tests

`npm test` runs the Vitest suite in `tests/`:

- `schemas.test.ts` — request, raw LLM and final post schemas (sanitization, limits, hashtag counts)
- `twitter.test.ts` — weighted X length and the 280-character guarantee (long text, emoji, CJK, URLs)
- `llm.test.ts` — offline mode rules for every tone, missing key, HTTP errors, invalid key, timeout,
  retry on invalid JSON, single-platform regenerate
- `image.test.ts` — exact canvas sizes, seed determinism, unique designs per idea, contrast, headline fit
- `text.test.ts` — hashtag and word helpers, LLM output normalization, rate limiter

## Deploy free on Vercel

1. Push this repository to GitHub.
2. Go to [vercel.com/new](https://vercel.com/new), sign in with GitHub (Hobby plan is free) and import
   the repository. Vercel detects Next.js automatically.
3. Under **Environment Variables**, add `LLM_PROVIDER` and the matching key (`GEMINI_API_KEY` or
   `GROQ_API_KEY`). Skip this to run in offline mode.
4. Click **Deploy**. Later pushes to the default branch redeploy automatically.

CLI alternative: `npm i -g vercel`, then `vercel` (preview) and `vercel --prod`. Add keys with
`vercel env add GEMINI_API_KEY`.

## How it works

```
app/
  page.tsx, layout.tsx, globals.css   single-page UI shell, theme script, styles
  api/generate/route.ts               rate limit → validate → generate → JSON
components/
  ContentGenerator.tsx                form, tone selector, status, result grid
  ResultCard.tsx                      draft, live count, copy, regenerate
  PostImage.tsx                       canvas render, AI artwork fallback, PNG download
lib/
  schemas.ts                          Zod schemas and platform rules (shared client/server)
  posts.ts                            normalizes any draft so platform rules always hold
  twitter.ts                          X weighted length and 280-character enforcement
  text.ts, seed.ts, rateLimit.ts      sanitizing, keywords, hashtags, seeded RNG, rate limit
  llm/                                provider adapters (gemini, groq, offline) and fallback logic
  image/                              sizes, palettes, seeded design, layout, renderer, Pollinations
tests/                                Vitest unit tests
```

Request flow: the browser validates input with the same Zod schema as the server and posts to
`/api/generate`. The route applies the rate limit, validates again and calls the configured provider
once, with a 20 s timeout. The reply is parsed and validated; on invalid JSON the model is asked once
more. Every draft, from the LLM or offline, then passes through `lib/posts.ts`, which enforces the
platform rules before returning. Images are drawn entirely in the browser.

## Notes and limits

- The rate limiter is in memory, so the limit applies per server instance. That is enough to stop
  casual abuse on a free deployment; use a shared store if you scale out.
- Offline mode is rule-based. It is deterministic and always valid, but less tailored than an LLM.
- Pollinations.ai is a free third-party service and is only contacted when the toggle is on.
- Next.js is pinned to 14.2.35, the final 14.x release. Its open advisories concern `next/image`
  optimization, rewrites, middleware and React Server Component request handling. This app does not
  use image optimization, rewrites or middleware. Upgrading to a current major is planned for a later
  phase.

## Out of scope (Phase 2)

Auto-posting, scheduling, login, history, payments and analytics.
