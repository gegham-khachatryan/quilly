# quilly-mcp

[MCP](https://modelcontextprotocol.io) server that gives local AI agents (Claude Code, Cursor, Codex,
Claude Desktop, any MCP client) read access to the Google Meet transcripts recorded by the
[Quilly](https://github.com/gegham-khachatryan/quilly) Chrome extension, including the meeting being
recorded right now. Nothing is exported and nothing leaves your computer: the extension connects to
this process over localhost and answers each request from its own database.

## Setup

1. In Chrome open Quilly → Settings → **Local agents** and switch on *Allow local agents to read
   transcripts*. The page shows the pairing token and a setup command.

2. For Claude Code, install the plugin from a session. Claude Code asks for the pairing token and
   keeps it in the system's credential store:

   ```
   /plugin marketplace add gegham-khachatryan/quilly
   /plugin install quilly@quilly
   ```

   Or register the server yourself with the command Quilly shows, which looks like this:

   ```sh
   claude mcp add quilly -e QUILLY_TOKEN=<token> -- npx -y quilly-mcp
   ```

3. For Claude Desktop, download `quilly-mcp-v<version>.mcpb` from the
   [latest release](https://github.com/gegham-khachatryan/quilly/releases/latest) and open it, or drag it
   into Settings → Extensions. Claude shows an install dialog that asks for the pairing token; there is
   no config file to edit. The bundle carries its own dependencies, so nothing is installed from npm.

4. For other clients, add the equivalent to their MCP configuration:

   ```json
   {
     "mcpServers": {
       "quilly": { "command": "npx", "args": ["-y", "quilly-mcp"], "env": { "QUILLY_TOKEN": "<token>" } }
     }
   }
   ```

Node.js 20 or newer is required. The extension looks for a running server every 30 seconds to 2
minutes, and the first tool call waits for it, so the tools work shortly after the agent starts. Quilly's settings page shows which
agent is connected.

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

## Building

| Command | Result |
| --- | --- |
| `npm run check` | Typecheck, then bundle the CLI into `dist/cli.js` for npm. |
| `npm run mcpb` | Pack the Claude Desktop bundle into `release/quilly-mcp-v<version>.mcpb` at the repository root. |
| `npm run listings` | Write the Claude Code plugin, the marketplace file and the MCP registry entry. |

The bundle's manifest is generated from `src/manifest.ts`, which takes the tool list and the install
settings from the same catalogue the server registers its tools from (`src/catalog.ts`) and the
default port from the shared protocol module, so neither is written down twice.

## Listings

Three committed files list the server where people look for one. `src/listings.ts` builds them from
`package.json` and the catalogue, and `npm run check` fails when one is out of date.

| File | Read by |
| --- | --- |
| `plugins/quilly/.claude-plugin/plugin.json` | Claude Code, and Anthropic's plugin directory. It starts `quilly-mcp` at the exact version of this package and asks for the pairing token on install. |
| `.claude-plugin/marketplace.json` | `claude plugin marketplace add gegham-khachatryan/quilly`, which offers the plugin above. |
| `packages/quilly-mcp/server.json` | The [MCP registry](https://registry.modelcontextprotocol.io), through `mcp-publisher`. |

To release a version of the server:

```sh
npm version minor -w quilly-mcp --no-git-tag-version   # or patch
npm run listings -w quilly-mcp                         # the plugin and the registry entry name the version
npm publish -w quilly-mcp                              # first: the plugin runs this version from npm
(cd packages/quilly-mcp && mcp-publisher login github && mcp-publisher publish)
```

Then commit and push; Claude Code picks the new plugin version up from the repository. The registry
checks `mcpName` in the published package against the name in `server.json`. The plugin is listed in
Anthropic's directory by submitting it as a plugin bundle at <https://claude.ai/directory/manage> with
`plugins/quilly` as the plugin path.

## License

MIT
