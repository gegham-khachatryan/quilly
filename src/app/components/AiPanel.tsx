import { useEffect, useRef, useState } from 'react';
import { chatRepo } from '../../shared/db';
import { newId } from '../../shared/format';
import { streamChat, type ChatTurn } from '../../shared/openrouter';
import { transcriptToText } from '../../shared/transcript';
import type { ChatMessage, Session, TranscriptEntry } from '../../shared/types';
import { useChat, useSettings, useStickToBottom } from '../../ui/hooks';
import { renderMarkdown } from '../../ui/markdown';
import { navigate } from '../router';

const PRESETS: { label: string; prompt: string }[] = [
  { label: 'Summary', prompt: 'Write a concise summary of this meeting: purpose, main discussion points, and outcomes.' },
  { label: 'Action items', prompt: 'List every action item with owner (if mentioned) and deadline (if mentioned) as a checklist.' },
  { label: 'Decisions', prompt: 'List the decisions that were made, each with the reasoning given and any open questions.' },
  { label: 'Follow-up email', prompt: 'Draft a short follow-up email to attendees recapping the meeting and next steps.' },
];

function systemPrompt(session: Session, entries: TranscriptEntry[]): string {
  return [
    'You are an assistant helping the user work with a transcript of a Google Meet call.',
    'The transcript was captured from live captions, so expect minor transcription errors, missing punctuation and merged sentences.',
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
  const scrollRef = useStickToBottom<HTMLDivElement>(`${messages.length}:${streaming?.length ?? 0}`);

  useEffect(() => () => abortRef.current?.abort(), []);

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

  if (settings && !settings.openRouterApiKey) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm font-medium">Connect OpenRouter to iterate with AI</p>
        <p className="text-xs text-muted">Add your API key and pick a model. Summaries, action items and free-form questions run against this transcript.</p>
        <button className="btn-primary" onClick={() => navigate('#/settings')}>
          Open settings
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold">AI</p>
          <p className="truncate font-mono text-[11px] text-muted" title={settings?.model}>
            {settings?.model}
          </p>
        </div>
        {messages.length > 0 && (
          <button className="text-xs text-muted hover:text-fg" onClick={() => void clear()}>
            Clear
          </button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && streaming === null && (
          <p className="text-xs text-muted">Ask anything about this transcript, or start with a preset below.</p>
        )}
        {messages.map((m) => (
          <Bubble key={m.id} role={m.role} content={m.content} />
        ))}
        {streaming !== null && <Bubble role="assistant" content={streaming || '…'} />}
        {error && <p className="text-xs text-rec">{error}</p>}
      </div>

      <div className="space-y-2 border-t border-line p-3">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button key={p.label} className="btn-ghost px-2 py-1 text-xs" disabled={streaming !== null || entries.length === 0} onClick={() => void send(p.prompt)}>
              {p.label}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <textarea
            className="input min-h-[40px] resize-y"
            rows={2}
            placeholder="Ask about this meeting… (Enter to send, Shift+Enter for newline)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
          />
          {streaming !== null ? (
            <button type="button" className="btn-ghost shrink-0" onClick={() => abortRef.current?.abort()}>
              Stop
            </button>
          ) : (
            <button type="submit" className="btn-primary shrink-0" disabled={!input.trim() || entries.length === 0}>
              Send
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

function Bubble({ role, content }: { role: ChatMessage['role']; content: string }) {
  if (role === 'user') {
    return <div className="ml-6 whitespace-pre-wrap rounded-lg bg-accent/15 px-3 py-2 text-sm">{content}</div>;
  }
  return <div className="prose-chat mr-2 rounded-lg bg-panel-2 px-3 py-2 text-sm" dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />;
}
