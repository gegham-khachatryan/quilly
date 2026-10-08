import { useEffect, useMemo, useState } from 'react';
import { formatPricePerMillion, listModels, type OpenRouterModel } from '../../shared/openrouter';

let cache: Promise<OpenRouterModel[]> | null = null;
const loadModels = () => (cache ??= listModels().catch((e) => {
  cache = null;
  throw e;
}));

/** Searchable OpenRouter model selector; free text is accepted so unlisted ids still work. */
export function ModelPicker({ value, onChange }: { value: string; onChange: (model: string) => void }) {
  const [models, setModels] = useState<OpenRouterModel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);

  useEffect(() => setQuery(value), [value]);
  useEffect(() => {
    loadModels().then(setModels, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const matches = useMemo(() => {
    if (!models) return [];
    const q = query.trim().toLowerCase();
    const list = q ? models.filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)) : models;
    return list.slice(0, 60);
  }, [models, query]);

  const selected = models?.find((m) => m.id === value);

  return (
    <div className="relative">
      <input
        className="input font-mono"
        value={query}
        placeholder="provider/model-id"
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120);
          if (query.trim() && query.trim() !== value) onChange(query.trim());
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        spellCheck={false}
      />
      {selected && (
        <p className="mt-1 text-xs text-muted">
          {selected.name} · context {selected.context_length?.toLocaleString() ?? '—'} · {formatPricePerMillion(selected.pricing.prompt)} in /{' '}
          {formatPricePerMillion(selected.pricing.completion)} out per 1M tokens
        </p>
      )}
      {error && <p className="mt-1 text-xs text-rec">Could not load model list: {error}. You can still type a model id.</p>}
      {open && matches.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-line bg-panel shadow-xl">
          {matches.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className={`flex w-full items-baseline justify-between gap-3 px-3 py-1.5 text-left hover:bg-panel-2 ${m.id === value ? 'bg-panel-2' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(m.id);
                  setQuery(m.id);
                  setOpen(false);
                }}
              >
                <span className="min-w-0">
                  <span className="block truncate font-mono text-xs">{m.id}</span>
                  <span className="block truncate text-[11px] text-muted">{m.name}</span>
                </span>
                <span className="shrink-0 text-[11px] text-muted">
                  {formatPricePerMillion(m.pricing.prompt)} / {formatPricePerMillion(m.pricing.completion)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
