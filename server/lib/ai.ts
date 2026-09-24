import type { ZodType } from 'zod';

export class AiNotConfiguredError extends Error {
  constructor() {
    super('No AI provider is configured. Add OPENROUTER_API_KEY or NVIDIA_API_KEY in project Secrets.');
  }
}

export interface ProviderConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export function getProviders(): ProviderConfig[] {
  const providers: ProviderConfig[] = [];
  const orKey = process.env.OPENROUTER_API_KEY?.trim();
  const nvKey = process.env.NVIDIA_API_KEY?.trim();
  const openrouter: ProviderConfig | null = orKey
    ? {
        name: 'openrouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: orKey,
        model: process.env.OPENROUTER_MODEL?.trim() || 'openai/gpt-4o-mini',
      }
    : null;
  const nvidia: ProviderConfig | null = nvKey
    ? {
        name: 'nvidia',
        baseUrl: 'https://integrate.api.nvidia.com/v1',
        apiKey: nvKey,
        model: process.env.NVIDIA_MODEL?.trim() || 'nvidia/nemotron-3-super-120b-a12b',
      }
    : null;
  const preferred = (process.env.AI_PROVIDER ?? '').trim().toLowerCase();
  if (preferred === 'nvidia' && nvidia) providers.push(nvidia);
  if (openrouter) providers.push(openrouter);
  if (nvidia && !providers.includes(nvidia)) providers.push(nvidia);
  return providers;
}

export function aiConfigured(): boolean {
  return getProviders().length > 0;
}

async function callProvider(
  p: ProviderConfig,
  messages: { role: string; content: string }[],
  temperature: number,
  maxTokens: number,
): Promise<string> {
  const res = await fetch(`${p.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${p.apiKey}`,
      ...(p.name === 'openrouter'
        ? { 'HTTP-Referer': 'https://gorkha.app', 'X-Title': 'Gorkha' }
        : {}),
    },
    body: JSON.stringify({
      model: p.model,
      messages,
      temperature,
      max_tokens: maxTokens,
      ...(p.name === 'nvidia' ? { chat_template_kwargs: { enable_thinking: false } } : {}),
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${p.name} error ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content ?? '';
}

function extractJSONObject(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in model output');
  }
  return raw.slice(start, end + 1);
}

export interface ChatJSONOptions<T> {
  system: string;
  user: string;
  schema: ZodType<T>;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Calls the configured AI providers in order (with one schema-repair retry each)
 * and returns schema-validated JSON.
 */
export async function chatJSON<T>({ system, user, schema, temperature = 0.2, maxTokens = 4096 }: ChatJSONOptions<T>) {
  const providers = getProviders();
  if (providers.length === 0) throw new AiNotConfiguredError();
  let lastError: unknown = new AiNotConfiguredError();
  for (const provider of providers) {
    let currentUser = user;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, attempt === 1 ? 3000 : 6000));
      try {
        const text = await callProvider(
          provider,
          [
            { role: 'system', content: system },
            { role: 'user', content: currentUser },
          ],
          temperature,
          maxTokens,
        );
        let json: unknown;
        try {
          json = JSON.parse(extractJSONObject(text));
        } catch (parseError) {
          console.error(`[ai] ${provider.name} attempt ${attempt + 1}: unparseable output:`, text.slice(0, 1500));
          throw parseError;
        }
        const parsed = schema.safeParse(json);
        if (parsed.success) {
          return { data: parsed.data, provider: provider.name };
        }
        const issues = parsed.error.issues
          .slice(0, 5)
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ');
        console.error(`[ai] ${provider.name} attempt ${attempt + 1}: schema issues: ${issues}`);
        console.error(`[ai] raw output sample:`, text.slice(0, 1500));
        lastError = new Error(`Schema validation failed: ${issues}`);
        currentUser = `${user}\n\nYour previous response failed validation: ${issues}. Return only a corrected single JSON object with the same structure. Use null for unknown values instead of omitting required keys.`;
      } catch (error) {
        lastError = error;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('AI request failed');
}
