# Meet Hunter

Chrome extension (Manifest V3) that records Google Meet captions locally and lets you
export transcripts or iterate on them with AI through OpenRouter.

## What it does

- **Auto-capture.** When you join a Meet call it turns on Meet's native captions (CC) and records
  every caption line with speaker and timestamp. Auto-start can be toggled off; you can also
  start/stop manually from the side panel or with the keyboard shortcut.
- **Hand raises and reactions.** Meet's "Name raised their hand" toasts and floating emoji reactions
  are recorded as events in the transcript, exported alongside captions and visible to the AI.
- **Live side panel.** The toolbar icon opens a Chrome side panel that streams the transcript as it is
  spoken. The panel is global: it keeps following the active recording while you work in other tabs,
  offers a way back to the list of recent sessions, and lets you reopen the live one at any time.
- **Background tabs.** Meet pauses caption rendering when its tab is hidden. While recording, a
  main-world shim (`keepalive.js`) reports the tab as visible so captions keep flowing. Can be turned
  off in Settings. Optionally the caption overlay can be hidden while still being captured.
- **Keyboard shortcut.** `Alt+Shift+R` toggles recording on the current Meet tab (change it at `chrome://extensions/shortcuts`).
- **Sessions.** Everything is stored locally in IndexedDB (no server). Sessions page with search,
  session detail with transcript search, speaker filter, rename, delete.
- **Export.** `.txt`, `.md`, `.json`, or copy to clipboard.
- **AI iterations.** Chat against a transcript via OpenRouter (streaming). Presets for summary,
  action items, decisions, follow-up email. API key and model are configured in Settings; the model
  picker searches the live OpenRouter model list. Chats are saved per session.

## Install (unpacked)

```sh
npm install
npm run build
```

Then open `chrome://extensions`, enable *Developer mode*, *Load unpacked*, and select the `dist/` folder.
After code changes run `npm run build` again and press the reload icon on the extension card.

## Development

| Command             | Purpose                                                        |
| ------------------- | -------------------------------------------------------------- |
| `npm run build`     | Icons + pages/service worker (ESM) + content script (IIFE)      |
| `npm run typecheck` | `tsc --noEmit`                                                 |
| `npm run check`     | typecheck then build                                           |

## Architecture

```
src/
  shared/      types, message contracts, settings, IndexedDB repos, OpenRouter client, exports
  content/     runs on meet.google.com: call detection, enables CC, observes captions, hand raises, reactions
  background/  service worker: session lifecycle, persistence, toolbar icon, shortcut
  sidepanel/   start/stop, auto-start toggle, live transcript of any active recording, recent sessions
  app/         sessions list, session detail (+ AI panel), settings
  ui/          React hooks and components shared by both surfaces
```

Flow: the content script polls call state and reports it to the background. On `inCall` with
auto-start enabled (or a manual start) the background creates a session, tells the content script to
start capturing, and the content script clicks the CC button and watches the captions region with a
`MutationObserver`. Each caption block is tracked by DOM element so in-place edits update the same
entry instead of duplicating it. A second observer watches the page for hand-raise toasts and emoji
reaction bubbles and emits them as `hand` / `reaction` entries. Entries are upserted into IndexedDB by the background, which
broadcasts changes so open pages refresh live. Active recordings are kept in `chrome.storage.session`
so they survive the service worker being suspended; on worker start, sessions whose tabs are gone are
finalized.

### Meet DOM selectors

Google changes Meet's class names frequently. Everything DOM-specific lives in
`src/content/meetDom.ts` and prefers ARIA attributes and structure (avatar `img` + name + text)
over class names. If captions stop being captured after a Meet update, that file is the only place
to adjust.

## Privacy

Transcripts never leave the browser unless you use the AI panel, in which case the transcript is sent
to OpenRouter with your own key. The key is stored in `chrome.storage.local` (not synced).
