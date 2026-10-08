import { useSession } from '../ui/hooks';
import { SettingsIcon } from '../ui/icons';
import { navigate, useRoute } from './router';
import { SessionDetailPage } from './pages/SessionDetailPage';
import { SessionsPage } from './pages/SessionsPage';
import { SettingsPage } from './pages/SettingsPage';

export function App() {
  const route = useRoute();
  const [session] = useSession(route.name === 'session' ? route.id : null);

  return (
    <div className="flex h-full flex-col">
      <nav className="flex items-center gap-3 border-b border-line bg-panel px-4 py-2">
        <button className="flex items-center gap-2 text-sm font-semibold" onClick={() => navigate('#/sessions')}>
          <img src="/logo.svg" alt="" className="h-5 w-5" /> Meet Hunter
        </button>
        <span className="h-4 w-px bg-line" aria-hidden />
        <ol className="flex min-w-0 items-center gap-1.5 text-sm">
          <Crumb active={route.name === 'sessions'} onClick={() => navigate('#/sessions')}>
            Sessions
          </Crumb>
          {route.name === 'session' && (
            <>
              <Separator />
              <Crumb active>{session?.title ?? '…'}</Crumb>
            </>
          )}
          {route.name === 'settings' && (
            <>
              <Separator />
              <Crumb active>Settings</Crumb>
            </>
          )}
        </ol>
        <button
          className={`btn-ghost ml-auto gap-1.5 px-2.5 ${route.name === 'settings' ? 'bg-line' : 'text-muted'}`}
          onClick={() => navigate('#/settings')}
          title="Settings"
        >
          <SettingsIcon size={16} /> Settings
        </button>
      </nav>
      <main className="min-h-0 flex-1">
        {route.name === 'sessions' && <SessionsPage />}
        {route.name === 'session' && <SessionDetailPage sessionId={route.id} />}
        {route.name === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}

function Crumb({ active, onClick, children }: { active: boolean; onClick?: () => void; children: string }) {
  if (!onClick) return <li className={`truncate ${active ? 'text-fg' : 'text-muted'}`}>{children}</li>;
  return (
    <li className="shrink-0">
      <button onClick={onClick} className={`rounded px-1 transition-colors hover:text-fg ${active ? 'text-fg' : 'text-muted'}`}>
        {children}
      </button>
    </li>
  );
}

function Separator() {
  return (
    <li className="text-muted/60" aria-hidden>
      /
    </li>
  );
}
