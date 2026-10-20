import { z } from 'zod';
import {
  ProviderError,
  safeErrorText,
  type CompletionRequest,
  type FetchLike,
  type LlmProvider,
} from './types';

export const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash';
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

const GeminiResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({ parts: z.array(z.object({ text: z.string().optional() })).optional() })
          .optional(),
        finishReason: z.string().optional(),
      }),
    )
    .optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
});

export function createGeminiProvider(
  apiKey: string,
  model: string = GEMINI_DEFAULT_MODEL,
  fetchImpl: FetchLike = fetch,
): LlmProvider {
  return {
    name: 'gemini',
    async complete({ system, user, followUp, temperature, signal }: CompletionRequest) {
      const parts = [{ text: user }];
      if (followUp) parts.push({ text: followUp });
      const contents = [{ role: 'user', parts }];

      const generationConfig: Record<string, unknown> = {
        temperature,
        responseMimeType: 'application/json',
        maxOutputTokens: 4096,
      };
      // Flash models "think" by default; this task does not need it and it costs latency.
      if (/^gemini-2\.5-flash/.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };

      const response = await fetchImpl(
        `${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents,
            generationConfig,
          }),
          signal,
        },
      );

      if (!response.ok) {
        const detail = await safeErrorText(response);
        console.error(`Gemini HTTP ${response.status}: ${detail}`);
        // Gemini reports a bad key as 400 API_KEY_INVALID; surface it as an auth failure.
        const status = detail.includes('API_KEY_INVALID') ? 401 : response.status;
        throw new ProviderError(`Gemini returned HTTP ${response.status}`, status);
      }

      const parsed = GeminiResponseSchema.safeParse(await response.json());
      if (!parsed.success) throw new ProviderError('Gemini returned an unexpected response');
      const blockReason = parsed.data.promptFeedback?.blockReason;
      if (blockReason) throw new ProviderError(`Gemini blocked the request (${blockReason})`);

      const text = (parsed.data.candidates?.[0]?.content?.parts ?? [])
        .map((part) => part.text ?? '')
        .join('');
      if (!text.trim()) throw new ProviderError('Gemini returned an empty reply');
      return text;
    },
  };
}
