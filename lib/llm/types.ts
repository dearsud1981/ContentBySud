export interface CompletionRequest {
  system: string;
  user: string;
  /** Extra user turn appended on retry, e.g. a reminder to return valid JSON. */
  followUp?: string;
  temperature: number;
  signal: AbortSignal;
}

export interface LlmProvider {
  readonly name: 'gemini' | 'groq';
  /** Returns the raw text reply from the model. Throws ProviderError on failure. */
  complete(request: CompletionRequest): Promise<string>;
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

/** Reads an error response body for server logs without ever throwing. */
export async function safeErrorText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return '';
  }
}
