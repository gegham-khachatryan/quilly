import { useSession } from '../ui/hooks';
import { ArrowLeftIcon, ListIcon, SettingsIcon } from '../ui/icons';
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

        {route.name === 'session' && (
          <>
            <span className="h-4 w-px bg-line" aria-hidden />
            <button className="inline-flex min-w-0 items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg" onClick={() => navigate('#/sessions')} title="Back to sessions">
              <ArrowLeftIcon size={15} />
              <span className="shrink-0">Back</span>
              <span className="text-muted/60">/</span>
              <span className="truncate text-fg">{session?.title ?? '…'}</span>
            </button>
          </>
        )}

        <div className="ml-auto flex items-center gap-1">
          <NavButton active={route.name === 'sessions' || route.name === 'session'} onClick={() => navigate('#/sessions')} icon={<ListIcon size={16} />}>
            Sessions
          </NavButton>
          <NavButton active={route.name === 'settings'} onClick={() => navigate('#/settings')} icon={<SettingsIcon size={16} />}>
            Settings
          </NavButton>
        </div>
      </nav>
      <main className="min-h-0 flex-1">
        {route.name === 'sessions' && <SessionsPage />}
        {route.name === 'session' && <SessionDetailPage sessionId={route.id} />}
        {route.name === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}

function NavButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: string }) {
  return (
    <button className={`btn-ghost gap-1.5 px-2.5 ${active ? 'bg-line text-fg' : 'bg-transparent text-muted hover:bg-panel-2'}`} onClick={onClick}>
      {icon} {children}
    </button>
  );
}
