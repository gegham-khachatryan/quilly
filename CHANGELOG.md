# Changelog

All notable changes to Quilly are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow SemVer.

## [Unreleased]

## [0.4.1] – 2026-10-27

### Fixed
- Hiding the caption overlay no longer leaves the stage and participant tiles at their captions-on size, which showed as empty space above the call controls. The stage edge is now anchored to the bottom call toolbar, with the hidden band's own bounds as a fallback, and the participant tiles are laid out again in a grid over the reclaimed area. Everything returns to Meet's own layout when the overlay is shown.

## [0.4.0] – 2026-10-15

### Removed
- Caption language switching: the default caption language setting and the live panel's language dropdown. Driving Meet's language chip did not work reliably, so the caption language is now left to Meet. A stored default is ignored.

## [0.3.1] – 2026-10-14

### Changed
- The search for a running `quilly-mcp` backs off from every 30 seconds to every 2 minutes while nothing is found, and returns to 30 seconds when a bridge connects, the setting changes or the settings page is open. Chrome records every refused probe as an extension error in developer mode; this keeps that list short.
- `quilly-mcp` 0.1.1: a tool call made before the extension has connected waits for it (up to 2 minutes 10 seconds) instead of failing at once. While Chrome stays closed, later calls fail fast for the length of one wait.

## [0.3.0] – 2026-10-14

### Added
- Local agents. Settings → Local agents pairs Quilly with `quilly-mcp`, an MCP server published from `packages/quilly-mcp`, so Claude Code, Cursor, Codex or any MCP client can list, search and read transcripts straight from the extension, with no export. `wait_for_updates` follows the meeting being recorded as captions arrive. Read-only, off by default, localhost only, mutual token handshake; the settings page shows which agent is connected and the exact setup command.
- `alarms` permission, used only while local agents are on to look for a running server every 30 seconds.

### Changed
- `npm run check` now also typechecks and bundles `packages/quilly-mcp`; the repo is an npm workspace.
- Extension summary and store listing describe local agents alongside recording, export and Ask AI.

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
