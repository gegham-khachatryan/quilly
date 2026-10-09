import { useState } from 'react';
import { sessionsRepo } from '../../shared/db';
import { acceptsAudio } from '../../shared/openrouter';
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

  const audio = settings.captureSource === 'audio';

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-lg font-semibold">Settings</h1>

      <section className="card space-y-4 p-4">
        <h2 className="text-sm font-semibold">Recording</h2>
        <Toggle
          label="Auto-start in calls"
          hint="Start recording automatically when you join a Meet call."
          checked={settings.autoStart}
          onChange={(v) => void update({ autoStart: v })}
        />

        <div className="space-y-2">
          <span className="block text-sm">Transcript source</span>
          <div className="grid gap-2 sm:grid-cols-2">
            <SourceCard
              selected={settings.captureSource === 'captions'}
              onSelect={() => void update({ captureSource: 'captions' })}
              title="Meet captions"
              badge="Free"
              points={['Turns on Meet’s captions and reads them', 'Real speaker names', 'Only you see the captions; the overlay can be hidden']}
            />
            <SourceCard
              selected={audio}
              onSelect={() => void update({ captureSource: 'audio' })}
              title="Call audio"
              badge="Uses OpenRouter"
              points={['No captions needed', 'Transcribed by an audio model, in chunks at pauses', 'Speakers are labelled “You” and “Participants”']}
            />
          </div>
        </div>

        {audio ? (
          <div className="space-y-1">
            <span className="text-xs text-muted">Transcription model (accepts audio)</span>
            <ModelPicker value={settings.transcriptionModel} onChange={(transcriptionModel) => void update({ transcriptionModel })} filter={acceptsAudio} />
            <p className="text-xs text-muted">
              Silent stretches are skipped. With Gemini 2.5 Flash an hour of conversation costs roughly $0.10–0.20. Requires the API key below.
            </p>
          </div>
        ) : (
          <>
            <Toggle
              label="Keep capturing in background tabs"
              hint="Meet pauses captions when its tab is hidden. While recording, make Meet believe the tab is visible so captions keep flowing."
              checked={settings.keepAliveInBackground}
              onChange={(v) => void update({ keepAliveInBackground: v })}
            />
            <Toggle
              label="Hide caption overlay while recording"
              hint="Captions stay on (they are the transcript source) but are made invisible in the Meet window."
              checked={settings.hideCaptionsOverlay}
              onChange={(v) => void update({ hideCaptionsOverlay: v })}
            />
          </>
        )}
      </section>

      <section className="card space-y-4 p-4">
        <div>
          <h2 className="text-sm font-semibold">OpenRouter</h2>
          <p className="text-xs text-muted">
            Used for AI iterations on transcripts and for audio transcription. Your key is stored locally in this browser profile and only sent to openrouter.ai.{' '}
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
          <span className="text-xs text-muted">Chat model</span>
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

function SourceCard({
  selected,
  onSelect,
  title,
  badge,
  points,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  badge: string;
  points: string[];
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`rounded-lg border p-3 text-left transition-colors ${
        selected ? 'border-accent bg-accent/10' : 'border-line bg-panel-2/40 hover:border-accent/50'
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${selected ? 'bg-accent/20 text-accent' : 'bg-panel text-muted'}`}>
          {badge}
        </span>
      </span>
      <ul className="mt-2 space-y-1 text-xs text-muted">
        {points.map((p) => (
          <li key={p}>· {p}</li>
        ))}
      </ul>
    </button>
  );
}
