import { useEffect, useMemo, useRef, useState } from 'react';
import { formatPricePerMillion, getModels, type OpenRouterModel } from '../../shared/openrouter';
import { providerMeta } from '../../shared/providers';
import { ProviderIcon } from './ProviderIcon';

interface Group {
  slug: string;
  name: string;
  models: OpenRouterModel[];
}

function groupByProvider(models: OpenRouterModel[]): Group[] {
  const map = new Map<string, Group>();
  for (const m of models) {
    const g = map.get(m.providerSlug) ?? { slug: m.providerSlug, name: m.providerName, models: [] };
    g.models.push(m);
    map.set(m.providerSlug, g);
  }
  return Array.from(map.values()).sort((a, b) => {
    const ra = providerMeta(a.slug, a.name).rank ?? 100;
    const rb = providerMeta(b.slug, b.name).rank ?? 100;
    return ra - rb || a.name.localeCompare(b.name);
  });
}

function formatContext(n: number | null): string {
  if (!n) return '—';
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M` : `${Math.round(n / 1000)}K`;
}

function Price({ model }: { model: OpenRouterModel }) {
  return (
    <span className="whitespace-nowrap tabular-nums">
      {formatPricePerMillion(model.pricing.prompt)} / {formatPricePerMillion(model.pricing.completion)}
    </span>
  );
}

/** Dropdown of OpenRouter models grouped by provider, with search and a custom-id escape hatch. */
export function ModelPicker({ value, onChange }: { value: string; onChange: (model: string) => void }) {
  const [models, setModels] = useState<OpenRouterModel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [custom, setCustom] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getModels().then(setModels, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    window.setTimeout(() => searchRef.current?.focus(), 0);
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const groups = useMemo(() => {
    if (!models) return [];
    const q = query.trim().toLowerCase();
    const filtered = q
      ? models.filter((m) => `${m.providerName} ${m.name} ${m.id}`.toLowerCase().includes(q))
      : models;
    return groupByProvider(filtered);
  }, [models, query]);
  const flat = useMemo(() => groups.flatMap((g) => g.models), [groups]);
  const selected = models?.find((m) => m.id === value);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const m = flat[active];
      if (m) choose(m.id);
      else if (query.trim().includes('/')) choose(query.trim());
    }
  };

  // Model list unavailable: degrade to a plain text field so the user is never blocked.
  if (error && !models) {
    return (
      <div className="space-y-1">
        <input className="input font-mono" value={value} placeholder="provider/model-id" onChange={(e) => onChange(e.target.value.trim())} spellCheck={false} />
        <p className="text-xs text-rec">Could not load the model list ({error}). Enter a model id manually.</p>
      </div>
    );
  }

  const fallbackSlug = value.split('/')[0]?.replace(/^~/, '') ?? '';

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="input flex items-center gap-3 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <ProviderIcon slug={selected?.providerSlug ?? fallbackSlug} name={selected?.providerName} size={28} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{selected?.name ?? value ?? 'Select a model'}</span>
          <span className="block truncate text-xs text-muted">
            {selected ? (
              <>
                {selected.providerName} · <Price model={selected} /> per 1M tokens · {formatContext(selected.context_length)} context
              </>
            ) : models ? (
              `${value} (custom id)`
            ) : (
              'Loading models…'
            )}
          </span>
        </span>
        <svg className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-line bg-panel shadow-2xl" onKeyDown={onKeyDown}>
          <div className="border-b border-line p-2">
            <input
              ref={searchRef}
              className="input"
              placeholder="Search models, providers…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              spellCheck={false}
            />
          </div>
          <div ref={listRef} role="listbox" className="max-h-80 overflow-y-auto">
            {!models && <p className="p-4 text-center text-xs text-muted">Loading models…</p>}
            {models && flat.length === 0 && <p className="p-4 text-center text-xs text-muted">No models match “{query}”.</p>}
            {groups.map((g) => (
              <div key={g.slug}>
                <div className="sticky top-0 z-10 flex items-center gap-2 bg-panel-2/95 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted backdrop-blur">
                  <ProviderIcon slug={g.slug} name={g.name} size={16} />
                  {g.name}
                  <span className="font-normal">({g.models.length})</span>
                </div>
                {g.models.map((m) => {
                  const index = flat.indexOf(m);
                  const isActive = index === active;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="option"
                      aria-selected={m.id === value}
                      data-index={index}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => choose(m.id)}
                      className={`flex w-full items-center gap-3 px-3 py-2 text-left ${isActive ? 'bg-panel-2' : ''} ${m.id === value ? 'text-accent' : ''}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{m.name}</span>
                        <span className="block truncate font-mono text-[11px] text-muted">{m.id}</span>
                      </span>
                      <span className="shrink-0 text-right text-[11px] text-muted">
                        <Price model={m} />
                        <span className="block">{formatContext(m.context_length)} ctx</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <form
            className="flex gap-2 border-t border-line p-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (custom.trim()) choose(custom.trim());
            }}
          >
            <input
              className="input font-mono text-xs"
              placeholder="Custom model id (provider/model)"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              spellCheck={false}
            />
            <button type="submit" className="btn-ghost shrink-0 text-xs" disabled={!custom.trim().includes('/')}>
              Use
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
