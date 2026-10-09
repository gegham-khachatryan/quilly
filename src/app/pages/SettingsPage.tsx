import { useState } from 'react';
import { sessionsRepo } from '../../shared/db';
import { Toggle } from '../../ui/components';
import { useSettings } from '../../ui/hooks';
import { ModelPicker } from '../components/ModelPicker';

export function SettingsPage() {
  const [settings, update] = useSettings();
  const [showKey, setShowKey] = useState(false);
  const [cleared, setCleared] = useState(false);

  if (!settings) return null;

  const clearAll = async () => {
    if (!confirm('Delete ALL recorded sessions, transcripts and AI chats? This cannot be undone.')) return;
    await sessionsRepo.clearAll();
    setCleared(true);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-lg font-semibold">Settings</h1>

      <section className="card space-y-4 p-4">
        <h2 className="text-sm font-semibold">Recording</h2>
        <Toggle
          label="Auto-start in calls"
          hint="When you join a Meet call, turn on captions and start recording automatically."
          checked={settings.autoStart}
          onChange={(v) => void update({ autoStart: v })}
        />
        <Toggle
          label="Keep capturing in background tabs"
          hint="Meet pauses captions when its tab is hidden. While recording, make Meet believe the tab is visible so captions keep flowing."
          checked={settings.keepAliveInBackground}
          onChange={(v) => void update({ keepAliveInBackground: v })}
        />
        <Toggle
          label="Hide caption overlay while recording"
          hint="Captions stay on (they are the transcript source) but are invisible and take no space in the Meet window. While recording, Meet’s captions button and the C key toggle this instead of switching captions off."
          checked={settings.hideCaptionsOverlay}
          onChange={(v) => void update({ hideCaptionsOverlay: v })}
        />
      </section>

      <section className="card space-y-4 p-4">
        <div>
          <h2 className="text-sm font-semibold">OpenRouter</h2>
          <p className="text-xs text-muted">
            Used for AI iterations on transcripts. Your key is stored locally in this browser profile and only sent to openrouter.ai.{' '}
            <a className="text-accent hover:underline" href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
              Get a key
            </a>
          </p>
        </div>
        <label className="block space-y-1">
          <span className="text-xs text-muted">API key</span>
          <div className="flex gap-2">
            <input
              className="input font-mono"
              type={showKey ? 'text' : 'password'}
              placeholder="sk-or-v1-…"
              value={settings.openRouterApiKey}
              onChange={(e) => void update({ openRouterApiKey: e.target.value.trim() })}
              autoComplete="off"
              spellCheck={false}
            />
            <button className="btn-ghost shrink-0" onClick={() => setShowKey((v) => !v)}>
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
        </label>
        <div className="space-y-1">
          <span className="text-xs text-muted">Model</span>
          <ModelPicker value={settings.model} onChange={(model) => void update({ model })} />
        </div>
      </section>

      <section className="card space-y-3 border-rec/30 p-4">
        <h2 className="text-sm font-semibold text-rec">Danger zone</h2>
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-muted">Remove every stored session, transcript and chat from this browser.</p>
          <button className="btn-danger shrink-0" onClick={() => void clearAll()}>
            Delete all data
          </button>
        </div>
        {cleared && <p className="text-xs text-muted">All data deleted.</p>}
      </section>
    </div>
  );
}
