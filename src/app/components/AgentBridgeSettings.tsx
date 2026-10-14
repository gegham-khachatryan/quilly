import { useState } from 'react';
import { AGENT_BRIDGE_DEFAULT_PORT, agentSetupCommand, agentSetupJson, newPairingToken } from '../../shared/agentProtocol';
import type { Settings } from '../../shared/types';
import { Toggle } from '../../ui/components';
import { useAgentBridgeStatus } from '../../ui/hooks';
import { CheckIcon, CopyIcon } from '../../ui/icons';

const AGENT_LABELS: Record<string, string> = { 'claude-code': 'Claude Code', 'claude-desktop': 'Claude Desktop', cursor: 'Cursor', codex: 'Codex' };

function agentLabel(name: string | null): string {
  if (!name) return 'an MCP client';
  return AGENT_LABELS[name.toLowerCase()] ?? name;
}

export function AgentBridgeSettings({ settings, update }: { settings: Settings; update: (patch: Partial<Settings>) => Promise<void> }) {
  const [showToken, setShowToken] = useState(false);
  const status = useAgentBridgeStatus(settings.agentBridgeEnabled);
  const { agentBridgeEnabled: enabled, agentBridgeToken: token, agentBridgePort: port } = settings;

  const setEnabled = (next: boolean) => void update({ agentBridgeEnabled: next, agentBridgeToken: token || newPairingToken() });
  const regenerate = () => {
    if (!confirm('Issue a new pairing token? Agents configured with the current token stop connecting until you update them.')) return;
    void update({ agentBridgeToken: newPairingToken() });
  };
  const setPort = (raw: string) => {
    const value = Number(raw);
    if (Number.isInteger(value) && value >= 1024 && value <= 65535) void update({ agentBridgePort: value });
  };

  return (
    <section className="card space-y-4 p-4">
      <div>
        <h2 className="text-sm font-semibold">Local agents</h2>
        <p className="text-xs text-muted">
          Let AI agents on this computer (Claude Code, Cursor, Codex or any MCP client) list, search and read your transcripts, including the one
          being recorded. Quilly talks only to a <code>quilly-mcp</code> process on this machine that proves it holds the token below; nothing
          leaves the computer.
        </p>
      </div>
      <Toggle
        label="Allow local agents to read transcripts"
        hint="Read-only. Agents cannot start, stop, rename or delete recordings."
        checked={enabled}
        onChange={setEnabled}
      />
      {enabled && (
        <>
          <ConnectionStatus status={status} />
          <label className="block space-y-1">
            <span className="text-xs text-muted">Pairing token</span>
            <div className="flex gap-2">
              <input className="input font-mono" type={showToken ? 'text' : 'password'} value={token} readOnly spellCheck={false} />
              <button className="btn-ghost shrink-0" onClick={() => setShowToken((v) => !v)}>
                {showToken ? 'Hide' : 'Show'}
              </button>
              <button className="btn-ghost shrink-0" onClick={regenerate}>
                Regenerate
              </button>
            </div>
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-muted">Port</span>
            <div className="flex items-center gap-2">
              <input key={port} className="input w-28 font-mono" type="number" min={1024} max={65535} defaultValue={port} onBlur={(e) => setPort(e.target.value)} />
              <span className="text-xs text-muted">
                Quilly looks for agents on this port and the three after it, so several agents can run at once.
                {port !== AGENT_BRIDGE_DEFAULT_PORT && ` Default is ${AGENT_BRIDGE_DEFAULT_PORT}.`}
              </span>
            </div>
          </label>
          <div className="space-y-2">
            <span className="block text-xs text-muted">Claude Code: run once in a terminal, then start a new Claude Code session.</span>
            <Snippet text={agentSetupCommand(token, port)} />
          </div>
          <details className="space-y-2">
            <summary className="cursor-pointer text-xs text-muted">Other MCP clients (Cursor, Codex, Claude Desktop…)</summary>
            <p className="pt-2 text-xs text-muted">Add this to the client’s MCP configuration. Node.js 20 or newer must be installed.</p>
            <Snippet text={agentSetupJson(token, port)} />
          </details>
        </>
      )}
    </section>
  );
}

function ConnectionStatus({ status }: { status: ReturnType<typeof useAgentBridgeStatus> }) {
  const connections = status?.connections ?? [];
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`inline-block h-2 w-2 rounded-full ${connections.length ? 'bg-emerald-400' : 'bg-line'}`} />
      {connections.length === 0 ? (
        <span className="text-muted">No agent connected. Quilly checks every 30 seconds while an agent with the token is running.</span>
      ) : (
        <span>
          Connected to {connections.map((c) => `${agentLabel(c.bridge.agent)} (port ${c.port})`).join(', ')}
        </span>
      )}
    </div>
  );
}

function Snippet({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-md border border-line bg-panel-2 p-3 pr-12 font-mono text-xs leading-5 whitespace-pre">{text}</pre>
      <button className="btn-icon btn-ghost absolute top-1.5 right-1.5 h-7 w-7 min-h-0" onClick={() => void copy()} title="Copy" aria-label="Copy">
        {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
      </button>
    </div>
  );
}
