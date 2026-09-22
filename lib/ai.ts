import { getAiRuntimeSettings } from '@/lib/ai-settings';

type ResponsePart = { type: string; text?: string };
type ModelResponse = { output?: { type: string; content?: ResponsePart[] }[]; error?: { message?: string } };

export async function aiConfigured() {
  return Boolean((await getAiRuntimeSettings()).apiKey);
}

export async function structuredAi(input: {
  model: string;
  instructions: string;
  content: unknown[];
  schemaName: string;
  schema: Record<string, unknown>;
  maxOutputTokens?: number;
}): Promise<unknown> {
  const key = (await getAiRuntimeSettings()).apiKey;
  if (!key) throw new Error('AI_NOT_CONFIGURED');
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: input.model,
      store: false,
      instructions: input.instructions,
      input: [{ role: 'user', content: input.content }],
      text: { format: { type: 'json_schema', name: input.schemaName, strict: true, schema: input.schema } },
      max_output_tokens: input.maxOutputTokens ?? 900,
    }),
    signal: AbortSignal.timeout(45_000),
    cache: 'no-store',
  });
  const result = await response.json() as ModelResponse;
  if (!response.ok) throw new Error(`AI_PROVIDER_${response.status}`);
  const output = result.output?.flatMap(item => item.content || []).filter(part => part.type === 'output_text').map(part => part.text || '').join('');
  if (!output) throw new Error('AI_EMPTY_RESPONSE');
  try { return JSON.parse(output); } catch { throw new Error('AI_INVALID_RESPONSE'); }
}
