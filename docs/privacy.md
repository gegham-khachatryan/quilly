# Quilly privacy policy

_Last updated: 9 October 2026_

Quilly ("the extension") is a Chrome extension that records Google Meet captions into a local
transcript. This page explains what data the extension handles, where it goes, and what control you
have over it.

## Summary

- Everything Quilly records is stored **only in your browser**. There is no Quilly server and no account.
- Nothing is sent anywhere unless **you** use an AI feature, in which case the transcript and your
  question are sent to **OpenRouter** using **your own API key**.
- The developer never receives your transcripts, your API key, or any analytics.

## What the extension stores locally

Stored in your browser profile (IndexedDB and `chrome.storage.local`):

- **Transcripts**: caption text as shown by Google Meet, the speaker name Meet displays with each
  caption, hand-raise and emoji-reaction events, and timestamps.
- **Session metadata**: meeting code, meeting title, the Meet URL, start and end time.
- **AI chats**: the questions you ask and the answers you receive in the "Ask AI" panel, per session.
- **Settings**: auto-start and capture preferences, the OpenRouter model you selected, and your
  **OpenRouter API key**.

This data never leaves your device through the extension except as described below.

## When data is sent to third parties

- **OpenRouter (openrouter.ai)** – only when you use the "Ask AI" panel. The extension sends the
  transcript of the session you are viewing, your message history for that session and your API key
  to OpenRouter, which forwards the request to the model provider you selected. Their handling of
  that data is governed by [OpenRouter's privacy policy](https://openrouter.ai/privacy) and the
  selected provider's terms. The extension also fetches OpenRouter's public model list (no key, no
  personal data) to populate the model picker.
- **Google favicon service (google.com/s2/favicons)** – the model picker shows provider logos loaded
  from Google's public favicon service. Those requests contain the provider's domain name only
  (for example `anthropic.com`), never your data.
- **Google Meet (meet.google.com)** – the extension runs on Meet pages to read the captions region,
  switch captions on, and detect whether you are in a call. It does not send anything to Google.

The extension contains no analytics, tracking, advertising or crash reporting.

## Permissions

| Permission | Why it is needed |
| --- | --- |
| `storage`, `unlimitedStorage` | Keep sessions, transcripts, chats and settings locally; long meetings exceed the default quota. |
| `sidePanel` | Show the live transcript in Chrome's side panel. |
| Host access to `meet.google.com` | Read captions and control the captions button on Meet pages. |
| Host access to `openrouter.ai` | Call the OpenRouter API on your behalf when you use AI features. |

## Your control

- Delete a single session from its page, or everything from **Settings → Danger zone**.
- Removing the extension deletes all of its local data.
- AI features are off until you enter an API key, and each request is initiated by you.

## Recording consent

Quilly records what Google Meet displays as captions. Depending on where you and the other
participants are, recording or transcribing a conversation may require their consent. You are
responsible for complying with the laws and policies that apply to your meetings.

## Children

The extension is not directed at children under 13 and does not knowingly collect data from them.

## Changes

Changes to this policy are published on this page with an updated date.

## Contact

Gegham Khachatryan – gegham.k90@gmail.com
