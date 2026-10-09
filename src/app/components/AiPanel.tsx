import { useEffect, useRef, useState, type ReactNode } from 'react';
import { chatRepo } from '../../shared/db';
import { newId } from '../../shared/format';
import { getModels, streamChat, type ChatTurn, type OpenRouterModel } from '../../shared/openrouter';
import { providerSlug } from '../../shared/providers';
import { transcriptToText } from '../../shared/transcript';
import type { ChatMessage, Session, TranscriptEntry } from '../../shared/types';
import { useChat, useSettings, useStickToBottom } from '../../ui/hooks';
import { AlignLeftIcon, CheckIcon, CopyIcon, GavelIcon, ListChecksIcon, MailIcon, SendIcon, SettingsIcon, SparklesIcon, StopIcon, TrashIcon } from '../../ui/icons';
import { renderMarkdown } from '../../ui/markdown';
import { navigate } from '../router';
import { ProviderIcon } from './ProviderIcon';

interface Preset {
  label: string;
  description: string;
  icon: ReactNode;
  prompt: string;
}

const PRESETS: Preset[] = [
  {
    label: 'Summary',
    description: 'Purpose, key points, outcomes',
    icon: <AlignLeftIcon size={18} />,
    prompt: 'Write a concise summary of this meeting: purpose, main discussion points, and outcomes.',
  },
  {
    label: 'Action items',
    description: 'Who does what, by when',
    icon: <ListChecksIcon size={18} />,
    prompt: 'List every action item with owner (if mentioned) and deadline (if mentioned) as a checklist.',
  },
  {
    label: 'Decisions',
    description: 'What was agreed and why',
    icon: <GavelIcon size={18} />,
    prompt: 'List the decisions that were made, each with the reasoning given and any open questions.',
  },
  {
    label: 'Follow-up email',
    description: 'Recap draft for attendees',
    icon: <MailIcon size={18} />,
    prompt: 'Draft a short follow-up email to attendees recapping the meeting and next steps.',
  },
];

function systemPrompt(session: Session, entries: TranscriptEntry[]): string {
  return [
    'You are an assistant helping the user work with a transcript of a Google Meet call.',
    'The transcript was captured from live captions, so expect minor transcription errors, missing punctuation and merged sentences.',
    'Lines starting with ✋ are hand raises and lines of the form "Name reacted 👍" are emoji reactions; use them as signals of agreement, questions or engagement.',
    'Answer based on the transcript. If something is not in it, say so rather than guessing. Use Markdown.',
    '',
    `Meeting: ${session.title} (${session.meetingCode})`,
    `Started: ${new Date(session.startedAt).toISOString()}`,
    `Participants (as detected): ${session.speakers.join(', ') || 'unknown'}`,
    '',
    '--- TRANSCRIPT START ---',
    transcriptToText(session, entries),
    '--- TRANSCRIPT END ---',
  ].join('\n');
}

export function AiPanel({ session, entries }: { session: Session; entries: TranscriptEntry[] }) {
  const [settings] = useSettings();
  const [messages, refresh] = useChat(session.id);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useStickToBottom<HTMLDivElement>(`${messages.length}:${streaming?.length ?? 0}`);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Auto-grow the composer up to a few lines.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const send = async (content: string) => {
    if (!settings?.openRouterApiKey || !content.trim() || streaming !== null) return;
    setError(null);
    const userMsg: ChatMessage = { id: newId(), sessionId: session.id, role: 'user', content: content.trim(), createdAt: Date.now() };
    await chatRepo.put(userMsg);
    await refresh();
    setInput('');

    const history: ChatTurn[] = [
      { role: 'system', content: systemPrompt(session, entries) },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: userMsg.content },
    ];

    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming('');
    let full = '';
    try {
      full = await streamChat({
        apiKey: settings.openRouterApiKey,
        model: settings.model,
        messages: history,
        signal: controller.signal,
        onDelta: (d) => setStreaming((s) => (s ?? '') + d),
      });
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e));
    } finally {
      abortRef.current = null;
    }
    if (full) {
      await chatRepo.put({ id: newId(), sessionId: session.id, role: 'assistant', content: full, model: settings.model, createdAt: Date.now() + 1 });
      await refresh();
    }
    setStreaming(null);
  };

  const clear = async () => {
    if (!confirm('Clear this conversation?')) return;
    await chatRepo.clear(session.id);
    await refresh();
  };

  const hasTranscript = entries.length > 0;
  const empty = messages.length === 0 && streaming === null;

  if (settings && !settings.openRouterApiKey) {
    return (
      <div className="flex h-full flex-col">
        <PanelHeader model={settings.model} />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <GradientOrb />
          <div>
            <p className="text-sm font-semibold">Connect OpenRouter to chat with this transcript</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">Summaries, action items, decisions, or any question. Add your API key and pick a model in Settings.</p>
          </div>
          <button className="btn-brand px-4" onClick={() => navigate('#/settings')}>
            <SettingsIcon size={15} /> Open settings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PanelHeader model={settings?.model ?? ''} onClear={messages.length > 0 ? () => void clear() : undefined} />

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {empty ? (
          <div className="flex h-full flex-col justify-center gap-5 p-5">
            <div className="text-center">
              <GradientOrb />
              <p className="mt-3 text-sm font-semibold">What do you want to know?</p>
              <p className="mt-1 text-xs text-muted">{hasTranscript ? 'Pick a starting point or ask your own question.' : 'Once captions are recorded you can ask about them here.'}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  className="card group flex flex-col items-start gap-2 p-3 text-left transition-colors hover:border-accent/50 hover:bg-panel-2 disabled:opacity-50"
                  disabled={!hasTranscript}
                  onClick={() => void send(p.prompt)}
                >
                  <span className="rounded-md bg-accent/10 p-1.5 text-accent">{p.icon}</span>
                  <span>
                    <span className="block text-sm font-medium">{p.label}</span>
                    <span className="block text-[11px] text-muted">{p.description}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-5 p-4">
            {messages.map((m) => (
              <Bubble key={m.id} role={m.role} content={m.content} />
            ))}
            {streaming !== null && <Bubble role="assistant" content={streaming} streaming />}
            {error && <p className="rounded-md border border-rec/30 bg-rec/10 px-3 py-2 text-xs text-rec">{error}</p>}
          </div>
        )}
      </div>

      <div className="border-t border-line p-3">
        {!empty && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel-2/60 px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-accent/50 hover:text-fg disabled:opacity-50"
                disabled={streaming !== null || !hasTranscript}
                onClick={() => void send(p.prompt)}
              >
                {p.icon}
                {p.label}
              </button>
            ))}
          </div>
        )}
        <form
          className="flex items-end gap-2 rounded-xl border border-line bg-panel-2 p-2 transition-colors focus-within:border-accent"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <textarea
            ref={textareaRef}
            rows={1}
            className="max-h-40 min-h-[24px] flex-1 resize-none bg-transparent px-1.5 py-1 text-sm leading-6 placeholder:text-muted focus:outline-none"
            placeholder={hasTranscript ? 'Ask about this meeting…' : 'No captions recorded yet'}
            value={input}
            disabled={!hasTranscript}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
          />
          {streaming !== null ? (
            <button type="button" className="btn-icon shrink-0 rounded-lg bg-rec/15 text-rec hover:bg-rec/25" onClick={() => abortRef.current?.abort()} title="Stop generating">
              <StopIcon size={16} />
            </button>
          ) : (
            <button type="submit" className="btn-brand btn-icon shrink-0 rounded-lg shadow-none" disabled={!input.trim() || !hasTranscript} title="Send (Enter)">
              <SendIcon size={16} />
            </button>
          )}
        </form>
        <p className="mt-1.5 px-1 text-[10px] text-muted">Enter to send · Shift+Enter for a new line · The transcript is sent to OpenRouter with your key.</p>
      </div>
    </div>
  );
}

function PanelHeader({ model, onClear }: { model: string; onClear?: () => void }) {
  const [resolved, setResolved] = useState<OpenRouterModel | null>(null);
  useEffect(() => {
    let cancelled = false;
    getModels().then((models) => {
      if (!cancelled) setResolved(models.find((m) => m.id === model) ?? null);
    }, () => undefined);
    return () => {
      cancelled = true;
    };
  }, [model]);

  return (
    <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-gradient-to-br from-indigo-500 to-fuchsia-500 p-1.5 text-white">
          <SparklesIcon size={14} />
        </span>
        <span className="text-sm font-semibold">Ask AI</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          className="inline-flex max-w-48 items-center gap-1.5 rounded-full border border-line bg-panel-2/60 py-0.5 pr-2.5 pl-1 text-[11px] text-muted transition-colors hover:border-accent/50 hover:text-fg"
          onClick={() => navigate('#/settings')}
          title={`${model}\nClick to change model`}
        >
          <ProviderIcon slug={resolved?.providerSlug ?? providerSlug(model)} name={resolved?.providerName} size={16} />
          <span className="truncate">{resolved?.name ?? model.split('/').pop()}</span>
        </button>
        {onClear && (
          <button className="btn-ghost btn-icon text-muted hover:bg-rec/15 hover:text-rec" onClick={onClear} title="Clear conversation">
            <TrashIcon size={20} />
          </button>
        )}
      </div>
    </div>
  );
}

function GradientOrb() {
  return (
    <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-lg shadow-indigo-500/25">
      <SparklesIcon size={22} />
    </span>
  );
}

function Bubble({ role, content, streaming = false }: { role: ChatMessage['role']; content: string; streaming?: boolean }) {
  const [copied, setCopied] = useState(false);
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent/15 px-3.5 py-2 text-sm whitespace-pre-wrap">{content}</div>
      </div>
    );
  }
  return (
    <div className="group flex gap-2.5">
      <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white">
        <SparklesIcon size={12} />
      </span>
      <div className="min-w-0 flex-1">
        {content ? (
          <div className="prose-chat text-sm" dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
        ) : (
          <span className="inline-flex gap-1 py-2">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" />
          </span>
        )}
        {streaming && content && <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-fg/70 align-middle" />}
        {!streaming && content && (
          <button
            className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-fg"
            onClick={() => {
              void navigator.clipboard.writeText(content);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1200);
            }}
          >
            {copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
    </div>
  );
}
