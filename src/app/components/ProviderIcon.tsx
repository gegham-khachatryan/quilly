import { useState } from 'react';
import { providerIconUrl, providerMeta } from '../../shared/providers';

/** Provider favicon with a colored monogram fallback (also used while loading / offline). */
export function ProviderIcon({ slug, name, size = 20 }: { slug: string; name?: string; size?: number }) {
  const meta = providerMeta(slug, name);
  const url = providerIconUrl(meta);
  const [failed, setFailed] = useState(false);
  const monogram = (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-md font-semibold text-white"
      style={{ width: size, height: size, background: meta.color, fontSize: size * 0.5 }}
      aria-hidden
    >
      {meta.name.slice(0, 1).toUpperCase()}
    </span>
  );
  if (!url || failed) return monogram;
  return (
    <span className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-white" style={{ width: size, height: size }}>
      <img src={url} alt="" width={size - 4} height={size - 4} onError={() => setFailed(true)} loading="lazy" />
    </span>
  );
}
