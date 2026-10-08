import { useEffect, useState } from 'react';
import { formatDuration, formatRelative, pluralize } from '../shared/format';
import { sendToBackground } from '../shared/messages';
import { Toggle } from '../ui/components';
import { openAppPage, useCurrentTabId, useSessions, useSettings, useTabState } from '../ui/hooks';
import { RecordingControls } from '../ui/RecordingControls';

export function Popup() {
  const tabId = useCurrentTabId();
  const [state, refresh] = useTabState(tabId);
  const [settings, updateSettings] = useSettings();
  const [sessions] = useSessions();
  const recent = sessions?.slice(0, 3) ?? [];
  const shortcut = useToggleShortcut();

  const openSidePanel = async () => {
    if (tabId === null) return;
    await sendToBackground({ type: 'sidepanel/open', tabId });
    window.close();
  };

  return (
    <div className="w-[340px] space-y-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-sm font-semibold">
          <img src="/logo.svg" alt="" className="h-5 w-5" /> Meet Hunter
        </h1>
        <button className="text-xs text-muted hover:text-fg" onClick={() => openAppPage('#/settings')}>
          Settings
        </button>
      </header>

      <section className="card p-3">
        <RecordingControls state={state} onChanged={() => void refresh()} />
        {state?.session && (
          <p className="mt-2 text-xs text-muted">
            {pluralize(state.session.entryCount, 'caption')} · {formatDuration(state.session.startedAt, null)}
          </p>
        )}
        <p className="mt-2 text-[11px] text-muted">
          {shortcut ? (
            <>
              Toggle with <kbd className="rounded border border-line bg-panel-2 px-1 py-0.5 font-mono">{shortcut}</kbd>
            </>
          ) : (
            'No keyboard shortcut set'
          )}
          {' · '}
          <button className="hover:text-fg" onClick={() => void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}>
            change
          </button>
        </p>
      </section>

      <section className="card p-3">
        {settings ? (
          <Toggle
            label="Auto-start in calls"
            hint="Begin recording and turn on captions when you join a meeting."
            checked={settings.autoStart}
            onChange={(v) => void updateSettings({ autoStart: v })}
          />
        ) : null}
      </section>

      <section className="grid grid-cols-2 gap-2">
        <button className="btn-ghost" onClick={() => void openSidePanel()} disabled={tabId === null}>
          Live panel
        </button>
        <button className="btn-ghost" onClick={() => openAppPage('#/sessions')}>
          All sessions
        </button>
      </section>

      {recent.length > 0 && (
        <section>
          <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Recent</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-md border border-line">
            {recent.map((s) => (
              <li key={s.id}>
                <button
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-panel-2"
                  onClick={() => openAppPage(`#/sessions/${s.id}`)}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs">{s.title}</span>
                    <span className="block text-[11px] text-muted">{formatRelative(s.startedAt)}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-muted">
                    {s.status === 'recording' ? <span className="text-rec">● live</span> : formatDuration(s.startedAt, s.endedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** The key currently bound to the toggle-recording command, formatted for display. */
function useToggleShortcut(): string | null {
  const [shortcut, setShortcut] = useState<string | null>(null);
  useEffect(() => {
    void chrome.commands.getAll().then((commands) => {
      const key = commands.find((c) => c.name === 'toggle-recording')?.shortcut;
      setShortcut(key ? key.replace(/\+/g, ' + ') : null);
    });
  }, []);
  return shortcut;
}
