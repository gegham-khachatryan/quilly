# Chrome Web Store listing

Copy for the developer dashboard. Keep in sync with `public/manifest.json`.

## Store listing

**Name** (≤ 75): `Quilly – transcripts for Google Meet`

**Summary** (≤ 132): `Transcripts for Google Meet. Records captions locally with speaker and time, exports them, and answers questions with your AI key.`

**Category**: Productivity → Workflow & Planning · **Language**: English

**Description**:

```
Quilly gives you a written record of every Google Meet call, saved in your browser and yours to keep.

HOW IT WORKS
Google Meet already shows live captions. Quilly turns them on when you join a call and writes down every line, with who said it and when. No bots join your meeting, and nothing is sent anywhere.

WHILE YOU ARE IN THE CALL
• Recording starts on its own when you join. You can turn auto-start off and start or stop by hand from the side panel, or with Alt+Shift+R.
• Watch the transcript grow in Chrome's side panel as people speak.
• Switch to other tabs and keep working. Quilly keeps recording in the background.
• Prefer a clean screen? Hide Meet's captions with the usual captions button or the C key. Quilly keeps recording them.
• Hand raises and emoji reactions are noted in the transcript next to what was said.

AFTER THE CALL
• Every meeting is saved as a session. Search across all of them, or search within one and filter by speaker.
• Rename sessions and delete the ones you no longer need.
• Export as plain text, Markdown or JSON, or copy the transcript to your clipboard.

ASK AI ABOUT A MEETING (OPTIONAL)
• Add your own OpenRouter API key and choose any model.
• One click gives you a summary, action items, decisions or a follow-up email. Or ask your own questions about what was discussed.

YOUR DATA STAYS WITH YOU
• Transcripts, settings and AI chats live only in your browser. No account, no Quilly servers, no analytics.
• The only time a transcript leaves your computer is when you ask the AI a question. It then goes to OpenRouter, using your key, and nowhere else.

Quilly is not affiliated with Google. Depending on where you live, recording a conversation may require the consent of everyone in it. Please check before you record.
```

**Screenshots** (1280×800, up to 5) – the same images the README uses, in `docs/screenshots/`:

| File | Caption | How to capture the raw image (1280×800 window) |
| --- | --- | --- |
| `live-panel.png` | Live transcript while you stay in the call | Meet call with the side panel open and a few captions streamed |
| `session-ai.png` | Ask AI about any meeting | Session page after asking for action items, AI panel visible |
| `sessions.png` | Every meeting, searchable | Sessions list with 4–6 sessions |
| `settings.png` | Pick any model | Settings page with the model picker open |

Drop raw captures into `docs/screenshots/raw/<name>.png`, run `npm run screenshots`, commit. The
script adds the caption band and frame; captions are edited in `docs/screenshots/captions.json`.

**Small promo tile** (440×280): `store/out/promo-small.png` · **Marquee** (1400×560, optional): `store/out/marquee.png`.
Generate with `npm run store-assets` (renders the SVGs in `store/` with headless Chrome; set `CHROME_BIN` if Chrome is not in the default location).

## Privacy practices tab

**Single purpose**: Records Google Meet captions into a local transcript that the user can review, export and query with an AI model.

**Permission justifications**
- `storage` – persist settings, sessions, transcripts and AI chats in the browser.
- `unlimitedStorage` – transcripts of long meetings and many sessions exceed the default quota.
- `sidePanel` – show the live transcript in Chrome's side panel.
- `alarms` – while the optional "Local agents" setting is on, wake the service worker every 30 seconds to look for a paired `quilly-mcp` process on localhost. Unused otherwise.
- `scripting` – inject the bundled content script into Meet tabs that were open before install/update, so recording works without a page reload. Only targets `https://meet.google.com/*`; no remote code.
- Host `https://meet.google.com/*` – content script reads the captions region, switches captions on, detects call state.
- Host `https://openrouter.ai/*` – calls the OpenRouter API with the user's own key when the user uses AI features.

**Remote code**: No. All code ships in the package; no eval, no remote scripts.

**Data usage** (what the extension handles; all stored locally, sent only to OpenRouter on user action, or to an MCP process on the user's own machine when the user enables "Local agents" and pairs it with a token):
- Personal communications – meeting captions (transcripts).
- Personally identifiable information – participant names as displayed by Meet.
- Authentication information – the user's OpenRouter API key (stored locally, sent only to openrouter.ai).

**Certifications**: data is not sold; not used or transferred for purposes unrelated to the single purpose; not used to determine creditworthiness or for lending.

**Privacy policy URL**: https://gegham-khachatryan.github.io/quilly/privacy (enable GitHub Pages from the `docs/` folder).
