const BASE = 'https://openrouter.ai/api/v1';

export interface OpenRouterModel {
  id: string;
  /** Human-friendly model name without the provider prefix, e.g. "Claude Sonnet 4.5". */
  name: string;
  providerSlug: string;
  /** Provider display name as OpenRouter labels it, e.g. "Anthropic". */
  providerName: string;
  context_length: number | null;
  pricing: { prompt: string; completion: string };
}

interface RawModel {
  id: string;
  name: string;
  context_length?: number | null;
  pricing: { prompt: string; completion: string };
  architecture?: { output_modalities?: string[] };
}

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const appHeaders = {
  'HTTP-Referer': 'https://github.com/gegham-khachatryan/quilly',
  'X-Title': 'Quilly',
};

export async function listModels(signal?: AbortSignal): Promise<OpenRouterModel[]> {
  const res = await fetch(`${BASE}/models`, { headers: appHeaders, signal });
  if (!res.ok) throw new Error(`OpenRouter models request failed (${res.status})`);
  const json = (await res.json()) as { data: RawModel[] };
  return json.data
    .filter((m) => m.architecture?.output_modalities?.includes('text') ?? true)
    .map((m): OpenRouterModel => {
      const providerSlug = (m.id.split('/')[0] ?? '').replace(/^~/, '').toLowerCase();
      const sep = m.name.indexOf(': ');
      const providerName = sep > 0 ? m.name.slice(0, sep) : providerSlug;
      const name = sep > 0 ? m.name.slice(sep + 2) : m.name;
      return { id: m.id, name, providerSlug, providerName, context_length: m.context_length ?? null, pricing: m.pricing };
    })
    .sort((a, b) => a.providerName.localeCompare(b.providerName) || a.name.localeCompare(b.name));
}

let modelsCache: Promise<OpenRouterModel[]> | null = null;

/** Memoized model list for the lifetime of the page; a failed load is retried on the next call. */
export function getModels(): Promise<OpenRouterModel[]> {
  modelsCache ??= listModels().catch((e: unknown) => {
    modelsCache = null;
    throw e;
  });
  return modelsCache;
}

export interface StreamChatOptions {
  apiKey: string;
  model: string;
  messages: ChatTurn[];
  signal?: AbortSignal;
  onDelta: (text: string) => void;
}

/** Streams a chat completion; resolves with the full assistant text. */
export async function streamChat({ apiKey, model, messages, signal, onDelta }: StreamChatOptions): Promise<string> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    signal,
    headers: { ...appHeaders, Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true }),
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    throw new Error(parseErrorMessage(detail) ?? `OpenRouter request failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line.startsWith('data:')) continue; // SSE comments / keep-alives
      const data = line.slice(5).trim();
      if (data === '[DONE]') return full;
      const event = JSON.parse(data) as {
        choices?: { delta?: { content?: string | null } }[];
        error?: { message?: string };
      };
      if (event.error) throw new Error(event.error.message ?? 'OpenRouter stream error');
      const delta = event.choices?.[0]?.delta?.content;
      if (delta) {
        full += delta;
        onDelta(delta);
      }
    }
  }
  return full;
}

function parseErrorMessage(body: string): string | null {
  try {
    const json = JSON.parse(body) as { error?: { message?: string } };
    return json.error?.message ?? null;
  } catch {
    return null;
  }
}

export function formatPricePerMillion(perToken: string): string {
  const n = Number(perToken) * 1_000_000;
  if (!Number.isFinite(n)) return '—';
  if (n === 0) return 'free';
  return `$${n < 1 ? n.toFixed(2) : n.toFixed(1)}`;
}
