import { navigate, useRoute } from './router';
import { SessionDetailPage } from './pages/SessionDetailPage';
import { SessionsPage } from './pages/SessionsPage';
import { SettingsPage } from './pages/SettingsPage';

export function App() {
  const route = useRoute();
  return (
    <div className="flex h-full flex-col">
      <nav className="flex items-center gap-1 border-b border-line bg-panel px-4 py-2">
        <span className="mr-4 flex items-center gap-2 text-sm font-semibold">
          <img src="/logo.svg" alt="" className="h-5 w-5" /> Meet Hunter
        </span>
        <NavLink active={route.name !== 'settings'} onClick={() => navigate('#/sessions')}>
          Sessions
        </NavLink>
        <NavLink active={route.name === 'settings'} onClick={() => navigate('#/settings')}>
          Settings
        </NavLink>
      </nav>
      <main className="min-h-0 flex-1">
        {route.name === 'sessions' && <SessionsPage />}
        {route.name === 'session' && <SessionDetailPage sessionId={route.id} />}
        {route.name === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}

function NavLink({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button onClick={onClick} className={`rounded-md px-3 py-1.5 text-sm ${active ? 'bg-panel-2 text-fg' : 'text-muted hover:text-fg'}`}>
      {children}
    </button>
  );
}
