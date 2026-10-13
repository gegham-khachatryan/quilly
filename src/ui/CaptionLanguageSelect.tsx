import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CAPTION_LANGUAGES, captionLanguageName, MEET_DEFAULT_CAPTION_LANGUAGE, normalizeLanguageName } from '../shared/captionLanguages';
import { useDismiss } from './hooks';
import { ChevronDownIcon, GlobeIcon } from './icons';

interface Choice {
  code: string;
  name: string;
}

/**
 * Searchable dropdown over Meet's caption languages. `value` is a BCP 47 code,
 * or the empty string for "whatever Meet has"; that entry is offered only when
 * `defaultLabel` is given, otherwise it is just how an unknown state is shown.
 */
export function CaptionLanguageSelect({
  value,
  onChange,
  defaultLabel,
  placeholder = 'Meet default',
  size = 'md',
  disabled = false,
  align = 'left',
}: {
  value: string;
  onChange: (code: string) => void;
  /** Offers "leave Meet as it is" as a choice, labelled like this. */
  defaultLabel?: string;
  /** Shown while no language is selected. */
  placeholder?: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useDismiss(rootRef, open, useCallback(() => setOpen(false), []));
  useEffect(() => {
    if (!open) return;
    setQuery('');
    window.setTimeout(() => searchRef.current?.focus(), 0);
  }, [open]);

  const choices = useMemo<Choice[]>(() => {
    const q = normalizeLanguageName(query);
    const all: Choice[] = defaultLabel ? [{ code: MEET_DEFAULT_CAPTION_LANGUAGE, name: defaultLabel }, ...CAPTION_LANGUAGES] : [...CAPTION_LANGUAGES];
    return q ? all.filter((c) => normalizeLanguageName(c.name).includes(q) || c.code.toLowerCase().includes(q)) : all;
  }, [query, defaultLabel]);

  // Open on the current value; a new search starts from the top.
  useEffect(() => {
    if (!open) return;
    const index = choices.findIndex((c) => c.code === value);
    setActive(query ? 0 : Math.max(index, 0));
  }, [open, choices, query, value]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const choose = (code: string) => {
    setOpen(false);
    if (code !== value) onChange(code);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, choices.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const c = choices[active];
      if (c) choose(c.code);
    }
  };

  const label = value === MEET_DEFAULT_CAPTION_LANGUAGE ? (defaultLabel ?? placeholder) : captionLanguageName(value);
  const trigger =
    size === 'sm'
      ? 'btn-ghost h-7 max-w-full gap-1.5 px-2 text-xs font-medium'
      : 'input flex items-center gap-2.5 text-left';

  return (
    <div ref={rootRef} className={size === 'sm' ? 'relative inline-flex max-w-full' : 'relative'}>
      <button type="button" className={trigger} onClick={() => setOpen((v) => !v)} disabled={disabled} aria-haspopup="listbox" aria-expanded={open}>
        <GlobeIcon size={size === 'sm' ? 13 : 16} className="shrink-0 text-muted" />
        <span className={`min-w-0 flex-1 truncate ${value === MEET_DEFAULT_CAPTION_LANGUAGE && !defaultLabel ? 'text-muted' : ''}`}>{label}</span>
        <ChevronDownIcon size={size === 'sm' ? 12 : 14} className={`shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          className={`absolute z-20 mt-1 overflow-hidden rounded-md border border-line bg-panel shadow-2xl ${
            size === 'sm' ? `top-full w-60 ${align === 'right' ? 'right-0' : 'left-0'}` : 'w-full'
          }`}
          onKeyDown={onKeyDown}
        >
          <div className="border-b border-line p-1.5">
            <input
              ref={searchRef}
              className="input py-1.5 text-xs"
              placeholder="Search languages…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              spellCheck={false}
            />
          </div>
          <div ref={listRef} role="listbox" className="max-h-64 overflow-y-auto p-1">
            {choices.length === 0 && <p className="p-3 text-center text-xs text-muted">No language matches “{query}”.</p>}
            {choices.map((c, index) => {
              const selected = c.code === value;
              return (
                <button
                  key={c.code || 'default'}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-index={index}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(c.code)}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${index === active ? 'bg-panel-2' : ''} ${
                    selected ? 'text-accent' : ''
                  } ${c.code === MEET_DEFAULT_CAPTION_LANGUAGE ? 'border-b border-line pb-2 mb-1 rounded-b-none' : ''}`}
                >
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  {c.code && <span className="shrink-0 font-mono text-[10px] text-muted">{c.code}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
