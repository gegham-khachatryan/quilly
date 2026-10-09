import { useCallback, useEffect, useRef, useState } from 'react';

/** A number persisted in localStorage (per browser profile), clamped to a range. */
export function useStoredWidth(key: string, fallback: number, min: number, max: number): [number, (next: number) => void, () => void] {
  const clamp = useCallback((n: number) => Math.round(Math.min(max, Math.max(min, n))), [min, max]);
  const [width, setWidthState] = useState(() => {
    try {
      const stored = Number(localStorage.getItem(key));
      return Number.isFinite(stored) && stored > 0 ? clamp(stored) : fallback;
    } catch {
      return fallback;
    }
  });
  const setWidth = useCallback(
    (next: number) => {
      const value = clamp(next);
      setWidthState(value);
      try {
        localStorage.setItem(key, String(value));
      } catch {
        // storage unavailable: keep the in-memory value
      }
    },
    [clamp, key],
  );
  const reset = useCallback(() => {
    setWidthState(fallback);
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }, [fallback, key]);
  return [width, setWidth, reset];
}

/**
 * Vertical drag handle for resizing an adjacent pane. Reports the pointer's x
 * position while dragging; the parent derives the new width. Double-click resets.
 */
export function ResizeHandle({ onDrag, onReset, label = 'Resize panel' }: { onDrag: (clientX: number) => void; onReset: () => void; label?: string }) {
  const [dragging, setDragging] = useState(false);
  const onDragRef = useRef(onDrag);
  onDragRef.current = onDrag;

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => onDragRef.current(e.clientX);
    const up = () => setDragging(false);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [dragging]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      title="Drag to resize · double-click to reset"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDoubleClick={onReset}
      className={`group absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize ${dragging ? 'bg-accent/40' : 'hover:bg-accent/25'}`}
    >
      <span className={`absolute inset-y-0 left-[3px] w-px ${dragging ? 'bg-accent' : 'bg-transparent group-hover:bg-accent/60'}`} />
    </div>
  );
}
