import { useEffect, useRef, useState } from 'react';
import { CheckIcon, PencilIcon } from './icons';

/** Heading that turns into an input on pencil click or double-click. Enter/blur saves, Escape cancels. */
export function EditableTitle({ value, onSave, className = '' }: { value: string; onSave: (next: string) => void | Promise<void>; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== value) void onSave(next);
  };

  if (editing) {
    return (
      <form
        className={`flex items-center gap-2 ${className}`}
        onSubmit={(e) => {
          e.preventDefault();
          commit();
        }}
      >
        <input
          ref={inputRef}
          className="input py-1 text-lg font-semibold"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setDraft(value);
              setEditing(false);
            }
          }}
        />
        <button type="submit" className="btn-ghost btn-icon shrink-0" title="Save" onMouseDown={(e) => e.preventDefault()}>
          <CheckIcon size={16} />
        </button>
      </form>
    );
  }

  return (
    <div className={`group flex min-w-0 items-center gap-2 ${className}`}>
      <h1 className="truncate text-lg font-semibold" onDoubleClick={() => setEditing(true)} title={value}>
        {value}
      </h1>
      <button
        type="button"
        className="shrink-0 rounded p-1 text-muted opacity-0 transition-opacity hover:bg-panel-2 hover:text-fg group-hover:opacity-100 focus:opacity-100"
        onClick={() => setEditing(true)}
        title="Rename"
      >
        <PencilIcon size={14} />
      </button>
    </div>
  );
}
