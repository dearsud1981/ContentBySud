import {
  ErrorResponseSchema,
  GenerateRequestSchema,
  GenerateResponseSchema,
  type GenerateRequestInput,
  type GenerateResponse,
} from './schemas';

/** Slightly longer than the server's 20s LLM timeout so the offline fallback can still arrive. */
export const CLIENT_TIMEOUT_MS = 25_000;

export class ClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClientError';
  }
}

/** Validates input locally, calls /api/generate and validates the response. */
export async function requestPosts(input: GenerateRequestInput): Promise<GenerateResponse> {
  const parsed = GenerateRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new ClientError(parsed.error.issues[0]?.message ?? 'Please check your input.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
      signal: controller.signal,
    });
  } catch {
    throw new ClientError(
      controller.signal.aborted
        ? 'The request took too long. Please try again.'
        : 'Could not reach the server. Check your connection and try again.',
    );
  } finally {
    clearTimeout(timer);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ClientError('The server sent an unexpected response. Please try again.');
  }

  if (!response.ok) {
    const error = ErrorResponseSchema.safeParse(payload);
    throw new ClientError(
      error.success ? error.data.error.message : 'Something went wrong. Please try again.',
    );
  }

  const result = GenerateResponseSchema.safeParse(payload);
  if (!result.success) {
    throw new ClientError('The server sent an unexpected response. Please try again.');
  }
  return result.data;
}
