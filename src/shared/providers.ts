/**
 * Display metadata for model providers (keyed by the OpenRouter id prefix).
 * Unknown providers still render: name comes from the model's display name,
 * and the icon falls back to a colored monogram.
 */
export interface ProviderMeta {
  name: string;
  domain?: string;
  color: string;
  /** Sort weight in the dropdown; lower is earlier. Unlisted providers get 100. */
  rank?: number;
}

const PROVIDERS: Record<string, ProviderMeta> = {
  anthropic: { name: 'Anthropic', domain: 'anthropic.com', color: '#d97757', rank: 1 },
  openai: { name: 'OpenAI', domain: 'openai.com', color: '#10a37f', rank: 2 },
  google: { name: 'Google', domain: 'google.com', color: '#4285f4', rank: 3 },
  'meta-llama': { name: 'Meta', domain: 'meta.com', color: '#0866ff', rank: 4 },
  meta: { name: 'Meta', domain: 'meta.com', color: '#0866ff', rank: 4 },
  mistralai: { name: 'Mistral', domain: 'mistral.ai', color: '#ff7000', rank: 5 },
  deepseek: { name: 'DeepSeek', domain: 'deepseek.com', color: '#4d6bfe', rank: 6 },
  'x-ai': { name: 'xAI', domain: 'x.ai', color: '#71717a', rank: 7 },
  qwen: { name: 'Qwen', domain: 'qwen.ai', color: '#6a4cff', rank: 8 },
  cohere: { name: 'Cohere', domain: 'cohere.com', color: '#39594d', rank: 9 },
  perplexity: { name: 'Perplexity', domain: 'perplexity.ai', color: '#20808d', rank: 10 },
  microsoft: { name: 'Microsoft', domain: 'microsoft.com', color: '#00a4ef', rank: 11 },
  amazon: { name: 'Amazon', domain: 'amazon.com', color: '#ff9900', rank: 12 },
  nvidia: { name: 'NVIDIA', domain: 'nvidia.com', color: '#76b900', rank: 13 },
  moonshotai: { name: 'Moonshot', domain: 'moonshot.ai', color: '#1d1d1f' },
  minimax: { name: 'MiniMax', domain: 'minimax.io', color: '#e63946' },
  'z-ai': { name: 'Z.ai', domain: 'z.ai', color: '#2563eb' },
  openrouter: { name: 'OpenRouter', domain: 'openrouter.ai', color: '#6467f2' },
  'ibm-granite': { name: 'IBM', domain: 'ibm.com', color: '#0f62fe' },
  'bytedance-seed': { name: 'ByteDance', domain: 'bytedance.com', color: '#325ab4' },
  tencent: { name: 'Tencent', domain: 'tencent.com', color: '#0052d9' },
  xiaomi: { name: 'Xiaomi', domain: 'mi.com', color: '#ff6900' },
  nousresearch: { name: 'Nous Research', domain: 'nousresearch.com', color: '#8b5cf6' },
};

const PALETTE = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6', '#06b6d4', '#f43f5e', '#84cc16'];

export function providerSlug(modelId: string): string {
  return (modelId.split('/')[0] ?? '').replace(/^~/, '').toLowerCase();
}

export function providerMeta(slug: string, fallbackName?: string): ProviderMeta {
  const known = PROVIDERS[slug];
  if (known) return known;
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { name: fallbackName || slug, color: PALETTE[h % PALETTE.length]!, rank: 100 };
}

export function providerIconUrl(meta: ProviderMeta): string | null {
  return meta.domain ? `https://www.google.com/s2/favicons?domain=${meta.domain}&sz=64` : null;
}
