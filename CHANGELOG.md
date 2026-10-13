# Changelog

All notable changes to Quilly are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow SemVer.

## [0.2.0] – 2026-10-13

### Added
- Default caption language setting. When a recording starts, Quilly switches Meet's caption language to it unless Meet already shows it; "Leave as set in Meet" keeps Meet's choice.
- Caption language dropdown in the live panel to switch the language of the call being recorded without leaving the panel. It mirrors the language chip in Meet's captions band, so changes made in Meet show up too. The change applies to that call only.

### Changed
- "Hide caption overlay while recording" is off by default; captions stay visible in Meet unless the option is turned on.
- The local database is now named `quilly`. Sessions, transcripts and chats recorded under the previous name are moved over automatically the first time Quilly opens after the update.

### Fixed
- Deleting or renaming a session on the sessions or session page, or deleting all data, now updates the side panel's recent sessions and any other open Quilly page right away.

## [0.1.1] – 2026-10-12

### Fixed
- Hidden caption overlay no longer leaves an empty band above the call controls. Meet reserves the band's height in the stage's inline inset, so the stage now reclaims that space while the band stays invisible in place.

## [0.1.0] – 2026-10-09

### Added
- Records Google Meet's native captions into local sessions, with speaker, timestamp and live updates.
- Auto-start when joining a call, manual start/stop, keyboard shortcut (`Alt+Shift+R`).
- Side panel with the live transcript that follows the active recording across tabs, plus recent sessions.
- Sessions page with search; session page with transcript search, speaker filter, rename, delete.
- Hand raises and emoji reactions recorded as transcript events.
- Export to `.txt`, `.md`, `.json` or clipboard.
- "Ask AI" panel using OpenRouter (streaming, model picker, presets for summary, action items, decisions, follow-up email). Resizable.
- Background-tab capture: keeps Meet rendering captions while the tab is hidden; optional invisible caption overlay.
- Toolbar icon switches to a red dot while recording.
- Meet's captions button and the `c` key show or hide the overlay while recording instead of cutting the transcript; the button carries a Quilly badge and dims when hidden.
- Meet tabs open at install or update time are connected automatically; no page reload needed to start recording.
