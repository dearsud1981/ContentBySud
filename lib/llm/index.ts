import { finalizeInstagram, finalizeLinkedIn, finalizeX, type PostContext } from '../posts';
import {
  PLATFORMS,
  PROVIDERS,
  rawPostsSchemaFor,
  type GenerateRequest,
  type GenerateResponse,
  type Platform,
  type Posts,
  type ProviderName,
  type RawPosts,
} from '../schemas';
import { createGeminiProvider, GEMINI_DEFAULT_MODEL } from './gemini';
import { createGroqProvider, GROQ_DEFAULT_MODEL } from './groq';
import { generateOffline } from './offline';
import { buildPrompt, extractJson, RETRY_INSTRUCTION } from './prompt';
import { ProviderError, type FetchLike, type LlmProvider } from './types';

export const LLM_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 2; // first try + one retry on invalid JSON

type Env = Record<string, string | undefined>;

export interface GenerateOptions {
  env?: Env;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

interface ResolvedProvider {
  name: ProviderName;
  provider: LlmProvider | null;
  /** Set when the configured provider cannot be used because its key is missing. */
  missingKey?: string;
}

const LABELS: Record<ProviderName, string> = { gemini: 'Gemini', groq: 'Groq', offline: 'Offline' };

export function resolveProvider(env: Env, fetchImpl: FetchLike = fetch): ResolvedProvider {
  const requested = (env.LLM_PROVIDER ?? 'gemini').trim().toLowerCase();
  const name: ProviderName = (PROVIDERS as readonly string[]).includes(requested)
    ? (requested as ProviderName)
    : 'gemini';
  if (name !== requested) {
    console.warn(`Unknown LLM_PROVIDER "${requested}", using "gemini".`);
  }

  if (name === 'gemini') {
    const key = env.GEMINI_API_KEY?.trim();
    if (!key) return { name, provider: null, missingKey: 'GEMINI_API_KEY' };
    const model = env.GEMINI_MODEL?.trim() || GEMINI_DEFAULT_MODEL;
    return { name, provider: createGeminiProvider(key, model, fetchImpl) };
  }
  if (name === 'groq') {
    const key = env.GROQ_API_KEY?.trim();
    if (!key) return { name, provider: null, missingKey: 'GROQ_API_KEY' };
    const model = env.GROQ_MODEL?.trim() || GROQ_DEFAULT_MODEL;
    return { name, provider: createGroqProvider(key, model, fetchImpl) };
  }
  return { name: 'offline', provider: null };
}

class InvalidOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidOutputError';
  }
}

function finalizeAll(
  raw: Partial<RawPosts>,
  platforms: readonly Platform[],
  ctx: PostContext,
): Partial<Posts> {
  const posts: Partial<Posts> = {};
  for (const platform of platforms) {
    if (platform === 'linkedin' && raw.linkedin)
      posts.linkedin = finalizeLinkedIn(raw.linkedin, ctx);
    if (platform === 'x' && raw.x) posts.x = finalizeX(raw.x, ctx);
    if (platform === 'instagram' && raw.instagram)
      posts.instagram = finalizeInstagram(raw.instagram, ctx);
  }
  return posts;
}

function offlineResponse(
  request: GenerateRequest,
  platforms: readonly Platform[],
  notice: string | null,
): GenerateResponse {
  const ctx = { idea: request.idea, tone: request.tone };
  const raw = generateOffline(request.idea, request.tone, platforms, request.variation);
  return { posts: finalizeAll(raw, platforms, ctx), provider: 'offline', notice };
}

function describeFailure(error: unknown, label: string): string {
  const suffix = 'so offline template drafts are shown instead.';
  if (
    error instanceof DOMException &&
    (error.name === 'TimeoutError' || error.name === 'AbortError')
  ) {
    return `${label} took too long to respond, ${suffix}`;
  }
  if (error instanceof InvalidOutputError) {
    return `${label} returned a response we could not use, ${suffix}`;
  }
  if (error instanceof ProviderError && error.status === 429) {
    return `${label}'s free-tier limit was reached, ${suffix} Try again in a minute.`;
  }
  if (error instanceof ProviderError && (error.status === 401 || error.status === 403)) {
    return `${label} rejected the API key, ${suffix}`;
  }
  return `${label} is unavailable right now, ${suffix}`;
}

async function completeWithRetry(
  provider: LlmProvider,
  request: GenerateRequest,
  platforms: readonly Platform[],
  signal: AbortSignal,
): Promise<Partial<Posts>> {
  const prompt = buildPrompt({ ...request, platforms });
  const schema = rawPostsSchemaFor(platforms);
  const ctx = { idea: request.idea, tone: request.tone };
  const temperature = Math.min(1, 0.8 + 0.1 * Math.min(request.variation, 2));
  let lastProblem = 'unknown';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const reply = await provider.complete({
      ...prompt,
      followUp: attempt > 1 ? RETRY_INSTRUCTION : undefined,
      temperature,
      signal,
    });
    try {
      const parsed = schema.safeParse(extractJson(reply));
      if (parsed.success) return finalizeAll(parsed.data, platforms, ctx);
      lastProblem = parsed.error.issues[0]?.message ?? 'schema mismatch';
    } catch (error) {
      lastProblem = error instanceof Error ? error.message : String(error);
    }
    console.warn(`${provider.name} attempt ${attempt} returned invalid output: ${lastProblem}`);
  }
  throw new InvalidOutputError(lastProblem);
}

/**
 * Generates posts for all platforms (or one, on regenerate) in a single model
 * call. Any failure — missing key, network error, timeout, invalid output —
 * falls back to offline template mode with a user-facing notice.
 */
export async function generatePosts(
  request: GenerateRequest,
  options: GenerateOptions = {},
): Promise<GenerateResponse> {
  const env = options.env ?? process.env;
  const platforms = request.platform ? [request.platform] : [...PLATFORMS];
  const resolved = resolveProvider(env, options.fetchImpl);

  if (resolved.name === 'offline') return offlineResponse(request, platforms, null);
  if (!resolved.provider) {
    return offlineResponse(
      request,
      platforms,
      `No ${resolved.missingKey} is configured, so offline template drafts are shown.`,
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException('LLM request timed out', 'TimeoutError')),
    options.timeoutMs ?? LLM_TIMEOUT_MS,
  );
  try {
    const posts = await completeWithRetry(resolved.provider, request, platforms, controller.signal);
    return { posts, provider: resolved.name, notice: null };
  } catch (error) {
    const reason = controller.signal.aborted ? controller.signal.reason : error;
    console.error(
      `${LABELS[resolved.name]} generation failed:`,
      error instanceof Error ? error.message : error,
    );
    return offlineResponse(request, platforms, describeFailure(reason, LABELS[resolved.name]));
  } finally {
    clearTimeout(timer);
  }
}
