# Chrome Web Store listing

Copy for the developer dashboard. Keep in sync with `public/manifest.json`.

## Store listing

**Name** (≤ 75): `Quilly – transcripts for Google Meet`

**Summary** (≤ 132): `Transcripts for Google Meet: records captions locally, exports them, and lets you iterate on them with AI via OpenRouter.`

**Category**: Productivity → Workflow & Planning · **Language**: English

**Description**:

```
Quilly turns Google Meet's captions into a transcript you own.

RECORD
• Joins the dots for you: when you enter a call, Quilly switches on Meet's captions and records every line with the speaker's name and a timestamp.
• Keeps recording while you work in other tabs.
• Hand raises and emoji reactions are logged alongside what was said.
• Start/stop from the side panel or with Alt+Shift+R. Auto-start can be turned off.

FOLLOW LIVE
• The side panel streams the transcript as people speak and follows the active recording across tabs.

REVIEW & EXPORT
• Sessions page with search; each session has transcript search, speaker filter, rename and delete.
• Export as plain text, Markdown or JSON, or copy to the clipboard.

ASK AI (optional)
• Bring your own OpenRouter API key and pick any model: summary, action items, decisions, follow-up email, or free-form questions about the meeting.

PRIVATE BY DESIGN
• Everything is stored in your browser. No account, no Quilly servers, no analytics.
• Transcripts leave your machine only when you ask the AI panel a question, and then only to OpenRouter with your own key.

Quilly is not affiliated with Google. Recording a conversation may require participants' consent where you live; please check before you record.
```

**Screenshots** (1280×800 or 640×400, PNG/JPEG, up to 5) – take from a real call:
1. Side panel with a live transcript next to a Meet call.
2. Session page with transcript and the AI panel answering "action items".
3. Sessions list.
4. Settings (model picker open).

**Small promo tile** (440×280): `store/out/promo-small.png` · **Marquee** (1400×560, optional): `store/out/marquee.png`.
Generate with `npm run store-assets` (renders the SVGs in `store/` with headless Chrome; set `CHROME_BIN` if Chrome is not in the default location).

## Privacy practices tab

**Single purpose**: Records Google Meet captions into a local transcript that the user can review, export and query with an AI model.

**Permission justifications**
- `storage` – persist settings, sessions, transcripts and AI chats in the browser.
- `unlimitedStorage` – transcripts of long meetings and many sessions exceed the default quota.
- `sidePanel` – show the live transcript in Chrome's side panel.
- Host `https://meet.google.com/*` – content script reads the captions region, switches captions on, detects call state.
- Host `https://openrouter.ai/*` – calls the OpenRouter API with the user's own key when the user uses AI features.

**Remote code**: No. All code ships in the package; no eval, no remote scripts.

**Data usage** (what the extension handles; all stored locally, sent only to OpenRouter on user action):
- Personal communications – meeting captions (transcripts).
- Personally identifiable information – participant names as displayed by Meet.
- Authentication information – the user's OpenRouter API key (stored locally, sent only to openrouter.ai).

**Certifications**: data is not sold; not used or transferred for purposes unrelated to the single purpose; not used to determine creditworthiness or for lending.

**Privacy policy URL**: https://gegham.github.io/quilly/privacy (enable GitHub Pages from the `docs/` folder).
