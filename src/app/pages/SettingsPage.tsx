import { useState } from 'react';
import { sessionsRepo } from '../../shared/db';
import { CaptionLanguageSelect } from '../../ui/CaptionLanguageSelect';
import { Toggle } from '../../ui/components';
import { useSettings } from '../../ui/hooks';
import { AgentBridgeSettings } from '../components/AgentBridgeSettings';
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
          hint="When you join a Meet call, start recording automatically."
          checked={settings.autoStart}
          onChange={(v) => void update({ autoStart: v })}
        />
        <div className="space-y-1">
          <span className="block text-sm">Caption language</span>
          <span className="block text-xs text-muted">
            The language Meet transcribes the call in. Automatic uses the language chosen in Meet’s own captions during the call, otherwise your
            browser’s language.
          </span>
          <div className="pt-1">
            <CaptionLanguageSelect
              value={settings.captionLanguage}
              defaultLabel="Automatic"
              onChange={(captionLanguage) => void update({ captionLanguage })}
            />
          </div>
        </div>
        <div className="space-y-4 border-t border-line pt-4">
          <p className="text-xs text-muted">
            Quilly receives captions directly from the call, without switching on Meet’s captions. In a Meet tab that was already open when Quilly
            was installed or updated it reads Meet’s on-screen captions instead until the tab is reloaded; the two options below apply only then.
          </p>
          <Toggle
            label="Keep capturing in background tabs"
            hint="Meet pauses on-screen captions when its tab is hidden. While recording, make Meet believe the tab is visible so captions keep flowing."
            checked={settings.keepAliveInBackground}
            onChange={(v) => void update({ keepAliveInBackground: v })}
          />
          <Toggle
            label="Hide caption overlay while recording"
            hint="Captions stay on (they are the transcript source) but are invisible. While recording, Meet’s captions button and the C key toggle this instead of switching captions off."
            checked={settings.hideCaptionsOverlay}
            onChange={(v) => void update({ hideCaptionsOverlay: v })}
          />
        </div>
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

      <AgentBridgeSettings settings={settings} update={update} />

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
