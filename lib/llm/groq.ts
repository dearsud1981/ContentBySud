import { z } from 'zod';
import {
  ProviderError,
  safeErrorText,
  type CompletionRequest,
  type FetchLike,
  type LlmProvider,
} from './types';

export const GROQ_DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

const GroqResponseSchema = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string().nullable().optional() }) }))
    .min(1),
});

export function createGroqProvider(
  apiKey: string,
  model: string = GROQ_DEFAULT_MODEL,
  fetchImpl: FetchLike = fetch,
): LlmProvider {
  return {
    name: 'groq',
    async complete({ system, user, followUp, temperature, signal }: CompletionRequest) {
      const messages = [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ];
      if (followUp) messages.push({ role: 'user', content: followUp });

      const response = await fetchImpl(GROQ_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: 2048,
          response_format: { type: 'json_object' },
        }),
        signal,
      });

      if (!response.ok) {
        console.error(`Groq HTTP ${response.status}: ${await safeErrorText(response)}`);
        throw new ProviderError(`Groq returned HTTP ${response.status}`, response.status);
      }

      const parsed = GroqResponseSchema.safeParse(await response.json());
      if (!parsed.success) throw new ProviderError('Groq returned an unexpected response');
      const text = parsed.data.choices[0]?.message.content ?? '';
      if (!text.trim()) throw new ProviderError('Groq returned an empty reply');
      return text;
    },
  };
}
