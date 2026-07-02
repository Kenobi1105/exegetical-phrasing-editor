# Exegetical Phrasing Editor

A browser-based tool for Biblical exegetical phrasing analysis. Supports Greek (LTR), Hebrew (RTL), and custom language sessions.

**Live app:** https://Kenobi1105.github.io/exegetical-phrasing-editor

## Features

- Exegetical phrasing canvas with verse/line ID columns
- Rich text formatting (bold, italic, superscript, colors, highlighting)
- Indentation with Tab/Shift+Tab
- Comments as floating post-it cards
- PDF export with footnotes
- Project management with localStorage persistence
- **Bible Module** (Ctrl+2) — side panel with SBLGNT, Byzantine, LXX, WLC, Vulgate, and NET Bible
- Screen 2 passage picker — populate the editor directly from Bible texts

## Bible Texts

| Version | Type | Coverage |
|---------|------|----------|
| SBLGNT | Greek NT | Matthew–Revelation |
| Byzantine | Greek NT | Matthew–Revelation |
| LXX | Greek OT | Genesis–Malachi |
| WLC | Hebrew OT | Genesis–Malachi |
| Vulgate | Latin | Full Bible |
| NET Bible | English (live API) | Full Bible |

## Deploying Updates

Double-click `deploy.bat` (Windows) or run `./deploy.sh` (Mac/Linux).

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+1 | Projects panel |
| Ctrl+2 | Bible Module |
| Ctrl+S | Save to app |
| Ctrl+Shift+E | Export (PDF/JSON) |
| Ctrl+O | Load JSON |
| Ctrl+H | Help / Shortcuts |
| Ctrl+, | Color settings |
| Esc | Close any panel |
