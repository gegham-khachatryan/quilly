import { useEffect, useRef, useState } from 'react';
import { formatDateTime, formatDuration, formatRelative, pluralize } from '../shared/format';
import { countCaptions } from '../shared/transcript';
import type { ActiveRecording, Session } from '../shared/types';
import { Empty, Toggle, TranscriptList } from '../ui/components';
import { openAppPage, useActiveRecordings, useCurrentTabId, useEntries, useSessions, useSettings, useStickToBottom, useTabState } from '../ui/hooks';
import { ArrowLeftIcon, ListIcon, SettingsIcon } from '../ui/icons';
import { RecordingControls } from '../ui/RecordingControls';

/**
 * Global side panel. It is not bound to the tab it was opened from: recordings
 * are looked up across all tabs, so the live transcript keeps streaming while
 * the user works in another tab. Opening the panel while something is recording
 * jumps straight to that transcript; the list of recent sessions is one step back.
 */
export function SidePanel() {
  const tabId = useCurrentTabId();
  const [tabState, refreshTab] = useTabState(tabId);
  const [active, refreshActive] = useActiveRecordings();
  const [sessions] = useSessions();
  const [settings, updateSettings] = useSettings();
  const [viewedId, setViewedId] = useState<string | null>(null);

  // Show each recording the first time this panel instance sees it, then respect the user's navigation.
  const announced = useRef(new Set<string>());
  useEffect(() => {
    for (const r of active ?? []) {
      if (announced.current.has(r.session.id)) continue;
      announced.current.add(r.session.id);
      setViewedId(r.session.id);
    }
  }, [active]);

  const viewedLive = active?.find((r) => r.session.id === viewedId) ?? null;
  const viewed: Session | null = viewedLive?.session ?? sessions?.find((s) => s.id === viewedId) ?? null;
  // Stop acts on the session in view; otherwise on whatever this tab is recording.
  const stopTarget = viewedLive ?? active?.find((r) => r.tabId === tabId) ?? null;

  const refresh = () => {
    void refreshTab();
    void refreshActive();
  };

  return (
    <div className="flex h-full flex-col">
      <header className="space-y-2.5 border-b border-line p-3">
        <div className="flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-sm font-semibold">
            <img src="/logo.svg" alt="" className="h-4 w-4" /> Quilly
          </h1>
          <div className="flex items-center gap-1">
            <button className="btn-ghost h-7 gap-1 px-2 text-xs" onClick={() => openAppPage('#/sessions')} title="All sessions">
              <ListIcon size={14} /> Sessions
            </button>
            <button className="btn-ghost h-7 w-7 px-0" onClick={() => openAppPage('#/settings')} title="Settings">
              <SettingsIcon size={14} />
            </button>
          </div>
        </div>
        <RecordingControls state={tabState} recording={stopTarget} onChanged={refresh} size="sm" />
      </header>

      {viewed ? (
        <TranscriptPane session={viewed} live={viewedLive} onBack={() => setViewedId(null)} />
      ) : (
        <RecentSessions sessions={sessions} activeIds={new Set(active?.map((r) => r.session.id))} onSelect={setViewedId} />
      )}

      {settings && (
        <footer className="border-t border-line px-3 py-2 text-xs">
          <Toggle label="Auto-start in calls" checked={settings.autoStart} onChange={(v) => void updateSettings({ autoStart: v })} />
        </footer>
      )}
    </div>
  );
}

function TranscriptPane({ session, live, onBack }: { session: Session; live: ActiveRecording | null; onBack: () => void }) {
  const entries = useEntries(session.id);
  const scrollRef = useStickToBottom<HTMLDivElement>(live);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!live) return;
    const t = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [live]);

  return (
    <>
      <div className="flex items-center gap-2 border-b border-line bg-panel px-2 py-2 text-xs">
        <button className="btn-ghost h-7 w-7 shrink-0 px-0" onClick={onBack} title="Back to sessions">
          <ArrowLeftIcon size={14} />
        </button>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            {live && <span className="rec-dot shrink-0" />}
            <span className="truncate font-medium">{session.title}</span>
          </span>
          <span className="block text-muted" title={formatDateTime(session.startedAt)}>
            {pluralize(countCaptions(entries), 'caption')} · {live ? formatDuration(session.startedAt, null) : formatDuration(session.startedAt, session.endedAt)}
          </span>
        </span>
        <button
          className="btn-ghost h-7 shrink-0 gap-1 px-2 text-xs"
          onClick={() => openAppPage(`#/sessions/${session.id}`)}
          title="Open session page: export, search, AI"
        >
          Open
          <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
            <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
            <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
          </svg>
        </button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3">
        <TranscriptList entries={entries} startedAt={session.startedAt} compact />
      </div>
    </>
  );
}

function RecentSessions({
  sessions,
  activeIds,
  onSelect,
}: {
  sessions: Session[] | null;
  activeIds: Set<string>;
  onSelect: (id: string) => void;
}) {
  if (sessions === null) return null;
  if (sessions.length === 0) {
    return (
      <div className="flex-1">
        <Empty title="No sessions yet">Join a Google Meet call to start recording. Captions will stream here live.</Empty>
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Recent sessions</p>
      <ul className="space-y-2">
        {sessions.slice(0, 20).map((s) => {
          const live = activeIds.has(s.id) || s.status === 'recording';
          return (
            <li key={s.id}>
              <button
                className={`card group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:border-accent/50 hover:bg-panel-2 ${live ? 'border-rec/40' : ''}`}
                onClick={() => onSelect(s.id)}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    {live && <span className="rec-dot shrink-0" />}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.title}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted">{live ? 'live' : formatDuration(s.startedAt, s.endedAt)}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted">
                    {formatRelative(s.startedAt)} · {pluralize(s.entryCount, 'caption')}
                    {s.speakers.length > 0 && ` · ${s.speakers.join(', ')}`}
                  </span>
                </span>
                <svg className="h-4 w-4 shrink-0 text-muted/50 transition-colors group-hover:text-fg" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                  <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.17 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                </svg>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
