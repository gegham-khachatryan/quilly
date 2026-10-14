# quilly-mcp

[MCP](https://modelcontextprotocol.io) server that gives local AI agents (Claude Code, Cursor, Codex,
Claude Desktop, any MCP client) read access to the Google Meet transcripts recorded by the
[Quilly](https://github.com/gegham-khachatryan/quilly) Chrome extension, including the meeting being
recorded right now. Nothing is exported and nothing leaves your computer: the extension connects to
this process over localhost and answers each request from its own database.

## Setup

1. In Chrome open Quilly → Settings → **Local agents**, switch on *Allow local agents to read
   transcripts* and copy the setup command shown there. It looks like this:

   ```sh
   claude mcp add quilly -e QUILLY_TOKEN=<token> -- npx -y quilly-mcp
   ```

2. For other clients, add the equivalent to their MCP configuration:

   ```json
   {
     "mcpServers": {
       "quilly": { "command": "npx", "args": ["-y", "quilly-mcp"], "env": { "QUILLY_TOKEN": "<token>" } }
     }
   }
   ```

Node.js 20 or newer is required. The extension looks for a running server every 30 seconds, so the
tools are available shortly after the agent starts. Quilly's settings page shows which agent is
connected.

## Tools

| Tool | What it does |
| --- | --- |
| `list_sessions` | Sessions newest first, filtered by text, participant or status. |
| `get_session` | A session's transcript as text, Markdown or JSON, with a cursor for live follow-up. |
| `wait_for_updates` | Blocks until a recording session gains new or changed entries after a cursor, then returns them. |
| `search_transcripts` | Entries containing a phrase, across all sessions or one, optionally for a single speaker. |

All tools are read-only. Agents cannot start, stop, rename or delete recordings.

## How pairing works

The token shown in Quilly's settings is a shared secret. On every connection both sides prove they
hold it with an HMAC over a fresh nonce before any data is exchanged: the server proves itself first,
so the extension never sends transcripts to a process that merely occupies the port, and the server
ignores any client that cannot answer its own challenge. The server binds `127.0.0.1` only. Several
agents can run at once; each server takes the next free port in a range of four, and the extension
connects to all of them.

Environment:

| Variable | Default | Meaning |
| --- | --- | --- |
| `QUILLY_TOKEN` | required | Pairing token from Quilly's settings. |
| `QUILLY_PORT` | `47800` | First port to try; must match the port in Quilly's settings. |

## License

MIT
