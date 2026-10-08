import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDownIcon } from './icons';

export interface MenuItem {
  label: string;
  hint?: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
}

export type MenuEntry = MenuItem | 'separator';

/** Button that opens a right-aligned action menu; closes on outside click, Escape or selection. */
export function Menu({ label, icon, items, className = 'btn-ghost', align = 'right' }: { label: ReactNode; icon?: ReactNode; items: MenuEntry[]; className?: string; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" className={className} onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}>
        {icon}
        {label}
        <ChevronDownIcon size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div role="menu" className={`absolute z-20 mt-1 min-w-48 overflow-hidden rounded-md border border-line bg-panel p-1 shadow-2xl ${align === 'right' ? 'right-0' : 'left-0'}`}>
          {items.map((item, i) =>
            item === 'separator' ? (
              <div key={i} className="my-1 border-t border-line" />
            ) : (
              <button
                key={i}
                type="button"
                role="menuitem"
                className={`flex w-full items-center gap-2.5 rounded px-2.5 py-1.5 text-left text-sm hover:bg-panel-2 ${item.danger ? 'text-rec' : ''}`}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.icon && <span className="shrink-0 text-muted">{item.icon}</span>}
                <span className="flex-1">{item.label}</span>
                {item.hint && <span className="text-[11px] text-muted">{item.hint}</span>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
