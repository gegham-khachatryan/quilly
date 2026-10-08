import { useEffect, useState } from 'react';

export type Route = { name: 'sessions' } | { name: 'session'; id: string } | { name: 'settings' };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '');
  const session = path.match(/^\/sessions\/([^/]+)$/);
  if (session?.[1]) return { name: 'session', id: decodeURIComponent(session[1]) };
  if (path === '/settings') return { name: 'settings' };
  return { name: 'sessions' };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(hash: string): void {
  location.hash = hash;
}
