# Exegetical Phrasing Editor — Developer Reference

Live URL: https://Kenobi1105.github.io/exegetical-phrasing-editor  
Repo: https://github.com/Kenobi1105/exegetical-phrasing-editor

---

## File Structure

```
exegetical-phrasing-editor/
├── index.html        — App shell, all HTML panels and modals (~430 lines)
├── app.css           — All styles (~1100+ lines, append-only pattern)
├── app.js            — Editor canvas logic, sessions, projects, export
├── bible.js          — Bible Module: data loading, picker, tabs, scroll sync
├── account.js        — Cloud sync integration layer (see "Cloud Sync" below)
├── sw.js             — Service worker for automatic cache-busting on deploy
├── CLAUDE.md         — This file
├── deploy.bat        — Windows deployment (git add/commit/push)
├── deploy.sh         — Mac/Linux deployment
├── sync/             — Cloud sync module + config (see "Cloud Sync")
├── supabase/         — SQL schema for the Supabase project (run manually)
└── data/
    ├── index.json    — Book/chapter/verse count index for all versions
    ├── sblgnt.json   — Greek NT (SBL Greek New Testament)
    ├── byz.json      — Greek NT (Byzantine text)
    ├── lxx.json      — Greek OT (Septuagint)
    ├── wlc.json      — Hebrew OT (Westminster Leningrad Codex)
    └── vulgate.json  — Latin (Jerome's Vulgate, OT+NT)
```

NET Bible is fetched live from `https://labs.bible.org/api/` — no local file.

---

## Architecture Overview

Single-page app. No framework, no build step, no npm. Pure HTML + CSS + JS.  
Deployed as a static site on GitHub Pages.

### Three screens
- **Screen 1** (`#s1`) — Language selection / recent projects. Shown on load.
- **Screen 2** (`#s2`) — Paste text or choose from Bible before entering editor.
- **Screen 3** (`#app`) — The main exegesis editor canvas.

Only one screen is visible at a time. Screens are shown/hidden via `.hidden` class and `display` style.

### Two panels (independent, both can be open simultaneously)
- **Projects panel** (`#proj-panel`) — slides in from LEFT, no pin. `position:fixed; top:0; left:0`.
- **Bible Module** (`#bible-panel`) — slides in from RIGHT. `position:fixed; top:48px; right:0`. Can be pinned to canvas right edge.

---

## app.js — Editor Canvas

### Session state (global vars)
```js
SESS        // 'greek' | 'hebrew' | 'custom'
LANG        // Display language label (e.g. 'Greek')
IS_RTL      // Boolean — Hebrew sessions are RTL
IS_SINGLE   // Boolean — 'Other Language' mode has single column
RC          // Row counter (ever-incrementing row ID seed)
CC          // Comment counter
COL_WIDTHS  // {v, o, t} — resizable column widths
CURRENT_PROJECT_ID  // localStorage key of loaded project
CURRENT_FILENAME    // .json filename if loaded from disk
```

### Key functions

| Function | Purpose |
|---|---|
| `chooseLang(lang, label)` | Called from Screen 1 language buttons → goes to Screen 2 |
| `confirmPaste()` | Confirms pasted text on Screen 2 → goes to editor |
| `skipPaste()` | Skips Screen 2 → opens empty editor |
| `openEditor()` | Shows `#app`, hides S1/S2, sets up column headers |
| `addRow(verse, origText, transHTML, cmtId, afterEl)` | Adds a verse row to canvas |
| `addEmptyRow(afterEl)` | Adds blank row (Ctrl++) |
| `mergeRowUp(rid)` | Merges row with one above (Ctrl+-) |
| `splitRow(col, rid)` | Splits row at caret on Enter |
| `recomputeIds()` | Renumbers all row IDs after insert/delete |
| `undo()` / `redo()` | Ctrl+Z / Ctrl+Y |
| `doIndent(dir)` | Tab / Shift+Tab indentation |
| `collectData()` | Serialises editor state to JSON object |
| `loadData(data)` | Restores editor state from JSON object |
| `projSave()` | Save to localStorage |
| `projLoad(id)` | Load from localStorage → navigates to editor |
| `projDelete(id, e)` | Delete from localStorage |
| `renderProjPanel()` | Refreshes `#proj-list` from localStorage |
| `renderS1Recent()` | Refreshes recent projects on Screen 1 |
| `restartSess()` | Confirm → clears canvas, calls `bFullReset()`, returns to S1 |
| `exportPDF()` | Multi-page PDF export via canvas rendering |
| `doExportJSON()` | JSON download |
| `clearAll()` | Clears canvas (Ctrl+Shift+L) |
| `toast(msg)` | Small notification at bottom of screen |
| `openHelp()` / `closeHelp()` | Help modal |
| `openSettings()` / `closeSettings()` | Settings modal |
| `setThemeMode(mode)` | Applies and persists the `light` or `dark` appearance |

### CSS custom properties (colors)
Defined on `:root`:
```css
--bg      /* page background — default #F7F3E9 (warm cream) */
--accent  /* highlight color — default #F0D08F (gold) */
--ink     /* text color — default #1F1E1E */
--sig     /* signature purple — default #493548 */
--label   /* label text — default #F7F3E9 */
--active  /* active/link color — default #C8A84B */
```

### Projects storage schema
```js
// Index key — localStorage (tiny, stays here)
'exeg-proj-index'    →  JSON array of {id, name, savedAt, lang, verseRef, folderId, cloudAt?}
'exeg-proj-folders'  →  JSON array of folder objects (local-only, never synced to the cloud)

// Full per-project session JSON — IndexedDB (exeg-proj-v1 / projdata store),
// keyed by id, value is the JSON.stringify'd editor state (a string, not a
// raw object — see pIdbGet/pIdbSet in app.js for why). PROJ_DATA_KEY(id) =>
// 'exeg-proj-'+id is now only the LEGACY localStorage key name, kept around
// as a fallback lookup in projLoad() and cleared on projSave()/projDelete()
// for any not-yet-migrated id.
```
`cloudAt` is optional and only present once cloud sync has synced that project at least
once — see "Cloud sync" below. Older entries simply lack it and render as local-only.

One-time migration (`projMigrateToIdbOnce()`, app.js) sweeps any leftover `exeg-proj-{id}`
localStorage keys into IndexedDB on first boot after this feature shipped, gated by the
`exeg-proj-idb-migrated-v1` flag — verify-then-delete per key, so a failed/corrupt entry
is left untouched in localStorage rather than lost, and the whole routine safely retries
on the next load if anything didn't fully succeed.

### Row DOM structure
```html
<tr data-rid="{id}">
  <td class="tc v">  <!-- Verse number -->
  <td class="tc l">  <!-- Line label (1a, 1b…) -->
  <td class="tc o" contenteditable>  <!-- Original text (Greek/Hebrew) -->
  <td class="tc t" contenteditable>  <!-- Translation -->
</tr>
```

---

## bible.js — Bible Module

### Version registry
```js
const BVERSIONS = {
  sblgnt:  {label:'SBLGNT',    corpus:'nt',  offline:true,  group:'Greek'},
  byz:     {label:'Byzantine', corpus:'nt',  offline:true,  group:'Greek'},
  lxx:     {label:'LXX',       corpus:'ot',  offline:true,  group:'Greek'},
  wlc:     {label:'WLC',       corpus:'ot',  offline:true,  group:'Hebrew'},
  vulgate: {label:'Vulgate',   corpus:'all', offline:true,  group:'Latin'},
  net:     {label:'NET',       corpus:'all', offline:false, group:'English'},
};
```
**To add a new version:** add an entry here, add the JSON file to `data/`, update `PRECACHE` in `sw.js`, and update `index.json` if chapter/verse counts differ.

### Bible data JSON format
All offline versions share this structure:
```js
// data/{version}.json
[
  // Index 0 = Genesis (OT) or Matthew (NT)
  {
    c: [
      // c[0] = chapter 1
      ["verse 1 text", "verse 2 text", ...],
      // c[1] = chapter 2
      ["verse 1 text", ...],
    ]
  },
  // Index 1 = Exodus / Mark, etc.
]
```

### IndexedDB cache
Database: `exeg-bible-v3`, object store: `texts`  
Keys: `__index__` (book/chapter/verse counts), `text:{version}` (full version data)  
Cache is cleared on `bFullReset()` (Ctrl+Shift+R) — index is preserved, text is cleared.

### State variables
```js
bPanelOpen      // Boolean — Bible panel currently visible
bPinned         // Boolean — panel pinned to canvas right edge
bProjOpen       // Boolean — Projects panel currently visible
bSplitOpen      // Boolean — split pane active
bScrollLocked   // Boolean — sync scroll enabled
bFocusedSection // 'top' | 'bottom'
bFontSize       // Number (px) — verse text font size

bTabs           // {top: TabObj[], bottom: TabObj[]}
bActiveTab      // {top: number, bottom: number} — active tab index
bLoadedBook     // {top: {corpus,bookIdx,version,chapter}|null, bottom: same}
bLoadedChapters // {top: number[], bottom: number[]} — currently loaded chapter numbers

bPicker         // Picker UI state object (see below)
```

### Tab object schema
```js
{
  version: 'net',      // key in BVERSIONS
  corpus: 'ot'|'nt',
  bookIdx: 0,          // index in OT_BOOKS or NT_BOOKS
  chapter: 1,
  verse: 1,
  label: 'NET · Genesis 1:1',
  cleared: false       // true = empty tab, no passage loaded
}
```

### Picker state
```js
bPicker = {
  open: false,
  openSection: null,   // 'top' | 'bottom' | null
  state: 'closed',     // 'closed' | 'books' | 'chapters' | 'verses'
  corpus: 'ot',
  bookIdx: 0,
  chapter: 1,
  verse: 1,
  targetSection: 'top' // which pane the picker will load into
}
```

### Key functions

| Function | Purpose |
|---|---|
| `openBible_()` | Open/toggle Bible panel |
| `closeBible()` | Close Bible panel |
| `bTogglePin()` / `bApplyPin()` | Pin/unpin panel to canvas right |
| `bFullReset()` | Full Bible Module reset (called on Ctrl+Shift+R) |
| `bClearCache(silent)` | Clear IDB text cache |
| `bLoadPassageInfinite(section, corpus, bookIdx, chapter, anchorVerse)` | Load single chapter into pane, anchor to verse |
| `bNavChapter(section, dir)` | Navigate prev/next chapter (crosses book/corpus boundaries) |
| `bPickerOpenFor(section)` | Open passage picker for a pane |
| `bPickerClose()` | Close passage picker |
| `bPickerConfirm(verse)` | User selected a verse — load it |
| `bBuildAccordion()` | Build book/chapter/verse picker grid |
| `bUpdatePickerBtn(section)` | Update picker button text to current passage |
| `bUpdateNavBtns(section, version, corpus, bookIdx, chapter)` | Enable/disable ← → buttons |
| `bRenderTabBar(section)` | Render tab list for a pane |
| `bActivateTab(section, idx)` | Switch active tab |
| `bCloseTab(section, idx)` | Remove a tab |
| `bAddTab(section)` | Add new empty tab |
| `bClearPane(section)` | Clear pane content |
| `bFocusSection(section)` | Set focused pane (updates outline) |
| `bToggleScrollLock()` | Toggle sync scroll |
| `bSyncScroll(fromSection)` | Debounced sync scroll handler |
| `bToggleSplit_()` | Toggle split pane |
| `openProjects()` / `closeProjects()` | Projects panel open/close |
| `renderProjPanel()` | Refresh projects list (called from app.js too) |

### Chapter boundary navigation rules
- **Genesis 1 ←** → does nothing (first chapter of Bible)
- **Malachi 4 →** → Matthew 1 (if version covers NT), else nothing
- **Matthew 1 ←** → Malachi 4 (if version covers OT), else nothing
- **Revelation 22 →** → does nothing (last chapter of Bible)
- **Within OT/NT:** crosses book boundaries freely (last chapter of book → first of next)

---

## index.html — Key Element IDs

### Screens
```
#s1              Screen 1 (language select)
#s2              Screen 2 (paste / Bible picker)
#app             Screen 3 (editor canvas)
```

### Editor canvas
```
#tzone           Table container (has left padding)
#rows-body       <tbody> where verse rows are inserted
#refin           Verse reference input
#version-sub     Version label display (click to edit)
#version-sub-input  Version label text input
#stbar           Status bar text
#toast           Toast notification element
```

### Toolbar (Screen 3)
```
#btn-projects    Projects icon button
#btn-bible       Bible Module icon button
#bbar            Bottom action bar
```

### Projects panel
```
#proj-panel      Panel container (slides from left)
#proj-panel-hdr  Header with close button
#proj-list       Project list container
#proj-list-empty Empty state message
#proj-panel-footer  Save button area
#proj-save-btn   Save current project button
```

### Bible panel
```
#bible-panel           Panel container
#bpanel-hdr            Header row
#b-font-size           Font size selector
#b-scroll-lock-btn     Sync scroll toggle
#bpanel-split-btn      Split pane toggle
#bpanel-pin-btn        Pin panel toggle
#bpanel-offline-bar    Offline warning banner
#bpanel-body           Contains both pane sections

#bpane-top-section     Top pane container
#bpicker-btn-top       Top pane passage picker button (← btn | text | → btn)
#bprev-top             Top pane previous chapter button
#bnext-top             Top pane next chapter button
#bpicker-container-top Top pane picker grid container
#bpane-top-tabs        Top pane tab bar
#bpane-top             Top pane text content

#bpane-divider         Drag handle between panes (hidden when not split)

#bpane-bottom-section  Bottom pane container (hidden when not split)
#bpicker-btn-bottom    Bottom pane passage picker button
#bprev-bottom          Bottom pane previous chapter button
#bnext-bottom          Bottom pane next chapter button
#bpicker-container-bottom Bottom pane picker grid container
#bpane-bottom-tabs     Bottom pane tab bar
#bpane-bottom          Bottom pane text content

#bible-side-divider    Drag handle between canvas and pinned panel
#btab-ver-popup        Version switcher popup (appears on tab click)
```

### Modals
```
#help-modal      Help modal (keyboard shortcuts)
#set-modal       Settings modal (appearance, cache)
#export-popup    Export options popup
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Alt+1` | Open/close Projects panel |
| `Alt+2` | Open/close Bible Module |
| `Ctrl+S` | Save project |
| `Ctrl+O` | Load JSON file |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+B` | Bold |
| `Ctrl+I` | Italic |
| `Ctrl+.` | Superscript |
| `Ctrl++` | Add line below |
| `Ctrl+-` | Merge line up |
| `Ctrl+\` | Toggle Bible split pane |
| `Ctrl+H` | Help modal |
| `Ctrl+,` | Settings modal |
| `Ctrl+Shift+E` | Export popup |
| `Ctrl+Shift+R` | Restart session (with confirmation) |
| `Ctrl+Shift+L` | Clear canvas |
| `Tab` | Indent line |
| `Shift+Tab` | Outdent line |
| `Enter` | Split row at caret |
| `↑/↓` | Navigate rows |

**Screen 1 only:** `Ctrl+O` and `Ctrl+,` work. All others are blocked.

---

## Service Worker (sw.js)

```js
const APP_VERSION = '202606271650'; // ← UPDATE THIS ON EVERY DEPLOY
const CACHE_NAME  = 'exeg-app-v' + APP_VERSION;
```

**On every new deploy:** bump `APP_VERSION` to a new timestamp string. The service worker will detect the old cache name doesn't match, delete all old caches on activation, and reload the page with fresh files. Users never need to clear browser cache manually.

Cached files: `index.html`, `app.css`, `app.js`, `bible.js`, all `data/*.json`.  
NOT cached: NET Bible API calls (online-only by design).

---

## CSS Patterns

`app.css` uses an append-only pattern — new rules are added at the bottom and override earlier ones using specificity or `!important`. Do not reorganize the file; just append new rules.

Key CSS variables (set on `:root`):
```css
--r    /* border-radius large */
--rs   /* border-radius small */
--ui   /* UI font family */
--serif /* serif font for Bible text */
--surface /* panel background */
--bg     /* page background */
--sig    /* signature purple #493548 */
--ink    /* body text color */
--muted  /* muted/secondary text */
--active /* accent/link color */
--label  /* label text color */
```

---

## Design Decisions & Constraints

1. **No framework, no build step.** Pure JS/CSS/HTML. Any addition must follow this constraint. No React, Vue, webpack, etc.

2. **No infinite scroll.** Bible text loads one chapter at a time. Navigation is via `←` and `→` buttons in each pane's picker row.

3. **Both panels can be open simultaneously.** Projects slides from left, Bible from right. Click-outside closes each independently — clicking one panel does not close the other.

4. **Bible Module pin:** Pins to the RIGHT edge of `#app`. When pinned, `#app` is `display:flex; flex-direction:row`. The pinned panel has `position:relative; height:100%` and its header is `height:48px` to align with the toolbar.

5. **Per-pane pickers:** Each pane (top/bottom) has its own passage selector, tab bar, and navigation buttons. The picker button shows `← | Current passage | →`.

6. **Sync scroll is debounced (80ms)** and uses `getBoundingClientRect()` for precise verse positioning, not `offsetTop` (which includes header offsets).

7. **IDB cache key:** `exeg-bible-v3`. Text keys: `text:{version}`. Index key: `__index__`. Only text keys are cleared on restart; the index is preserved.

8. **Session types:**
   - `greek` — LTR, two columns (Original Greek + Translation)
   - `hebrew` — RTL, two columns (Original Hebrew + Translation)
   - `custom` — LTR, single column (any language)

9. **Projects are stored in IndexedDB** (database `exeg-proj-v1`, object store `projdata`) — migrated from localStorage to lift the old ~5MB per-site ceiling. The small index/folders metadata (`exeg-proj-index`, `exeg-proj-folders`) stays in localStorage, unchanged. A separate DB from the Bible text cache (`exeg-bible-v3`, bible.js) so cache-clearing code there can never touch project data. Optional cloud sync (see below) mirrors project JSON to Supabase — IndexedDB remains the primary, authoritative local store either way.

10. **Appearance mode** persists in localStorage key `exeg-theme` as `light` or `dark`. On load, legacy Midnight preferences migrate to Dark mode and other retired/custom palettes reset to Light mode.

---

## Cloud Sync (account.js + sync/)

Optional, additive account/cloud-sync layer built on Supabase, sharing a project with
the separate "Personal Dashboard" app so both apps' users have one Auth identity.
**Local saving is always the primary path** — every offline/signed-out/profile-
incomplete state degrades silently to exactly today's local-only behavior; nothing
about editing, autosave, or the Projects panel requires signing in.

**Google sign-in only.** There is no email/password sign-up, sign-in, or password
reset UI, and no SMTP/custom email provider is required — this keeps the whole
feature free to run. There is no `public.user_profiles`/username layer — that
requirement was removed from the shared sync module (canonical copy lives in
the sibling Personal Dashboard repo); a signed-in Google user goes straight to
`ready` in `account.js`'s `ACCT.state`, no profile-completion step.

**Never synced under any circumstances:** the Bible Module's IndexedDB cache
(`exeg-bible-v3`) — only the phrasing project session JSON that `collectData()`/
`loadData()` already produce ever leaves the browser.

```
sync/phrasing-supabase-sync.js       — framework-free ES module: Supabase Auth +
                                        public.user_profiles + public.phrasing_projects.
                                        Copied verbatim from the sibling dashboard repo;
                                        never modified (its email/password/username
                                        exports simply go unused by this editor).
sync/phrasing-sync-config.js         — this editor's Supabase URL + publishable key +
                                        EDITOR_URL (Google OAuth redirectTo), single
                                        source of truth
supabase/phrasing_projects.sql       — RLS schema; run manually in the Supabase SQL
                                        Editor, never executed from the browser
account.js                           — integration layer: bridges window.PhrasingSync
                                        (set by the module-bridge <script type="module">
                                        in index.html) into projSave/autoSave/projDelete,
                                        renders the #acct-modal UI (loading/unavailable/
                                        offline/signed-out-Google-button/signed-in only)
```

New localStorage keys this adds (all additive, none required for editing):
```
phrasing_editor_migrated_v1:{user-id}  — one-time local→cloud migration flag
exeg-acct-oauth-pending                — set just before a Google OAuth redirect
exeg-acct-seen-signin                  — "this device has signed in before" (gates
                                          whether acctBoot() does any network work at all)
exeg-cloud-delete-queue                — project ids queued for cloud delete while offline
```

Call-site hooks are all fire-and-forget — see `projSave`/`autoSave`/`projDelete` in
app.js, each guarded with `typeof acctQueuePush/acctMarkDirty/acctQueueDelete==='function'`
so the app behaves identically if `account.js` fails to load for any reason. `projLoad`
has no cloud hook at all.

---

## Adding a New Bible Version

1. Prepare JSON in the format: `[ {c: [[v1,v2,...], [v1,v2,...], ...]}, ... ]`
   - Array index = book index (matching OT_BOOKS or NT_BOOKS order)
   - `c` = chapters array; each chapter = array of verse strings
2. Add file to `data/` as `{key}.json`
3. Add entry to `BVERSIONS` in `bible.js`:
   ```js
   myversion: {label:'My Version', corpus:'ot'|'nt'|'all', offline:true, group:'English'}
   ```
4. Update `data/index.json` if verse counts differ from existing versions
5. Add `'./data/myversion.json'` to `PRECACHE` array in `sw.js`
6. Bump `APP_VERSION` in `sw.js`

---

## Deployment

```bash
# Windows
deploy.bat

# Mac/Linux
./deploy.sh
```

Both scripts do: `git add -A && git commit -m "deploy" && git push`.  
GitHub Pages serves from the `main` branch root automatically.

**After every deploy:** bump `APP_VERSION` in `sw.js` so users get fresh files automatically.

---

## Bracketing System (app.js)

Brackets annotate structural relationships in Diagram View only. All bracket state lives in `app.js`.

### State variables
```js
BRACKETS        // Array of bracket objects (see schema below)
BRK_CTR         // Ever-incrementing ID seed
SELECTED_BRK_ID // ID of currently selected bracket (or null)
BRACKET_PENDING // {rid, pipEl} — first pip click awaiting second, or null
```

### Bracket data schema
```js
{
  id:           'brk-1',        // unique string ID
  startRid:     'r3',           // rid of first spanned row
  endRid:       'r7',           // rid of last spanned row
  label:        'A',            // text label (empty string = no label)
  color:        '#493548',      // hex color string
  thickness:    1,              // stroke-width (1, 2, or 4)
  lane:         1,              // column position (1 = closest to blocks)
  labelOffsetY: 0               // px offset of label from bracket midpoint
}
```

### Lane assignment — Stage 2 (nested bracket intelligence)
`_brkReassignAllLanes()` is called after every bracket create/delete/resize/undo-redo. It:
1. Computes `[lo, hi]` row-index spans for all brackets
2. Sorts brackets by span size — narrowest (innermost) first
3. Greedily assigns the lowest available lane to each bracket
4. Result: inner brackets (fully contained) get lane 1 (closest to blocks); outer brackets step right

### Key constants
```js
BRK_PIP_OFFSET  // gap between block right edge and lane 1 line X
BRK_LANE_W      // minimum step between adjacent lanes (px)
BRK_SERIF_W     // length of horizontal serif lines (px)
BRK_LABEL_GAP   // gap between bracket line and label text (px)
```

### Key functions
| Function | Purpose |
|---|---|
| `_brkReassignAllLanes()` | Recomputes all bracket lanes with nesting awareness |
| `_brkCreate(startRid, endRid)` | Creates bracket, pushes `brk-add` undo op |
| `_brkRenderDiagram()` | Renders all brackets into `#dbrk-svg` |
| `_brkDrawSVG(svg, brk, laneX, yStart, yEnd)` | Draws one bracket with label, serifs, hit line |
| `_brkHandleClick(rid, pipEl)` | Handles Shift+pip click — sets/completes BRACKET_PENDING |
| `_brkCancelPending()` | Cancels pending first-click state |
| `_brkSelect(id, ev)` | Selects bracket, opens edit popup |
| `_brkDeselect()` | Clears selection |
| `brkDeleteCurrent()` | Deletes selected bracket |
| `_brkStartSerifDrag(ev, brkId, which)` | Drag top/bottom serif to resize span |
| `_brkApplyUndo(op)` / `_brkApplyRedo(op)` | Handle `brk-*` undo/redo ops |
| `collectBracketData()` / `loadBracketData(arr)` | Serialize/restore from project JSON |
| `refreshBrackets()` | Entry point → calls `_brkRenderDiagram()` if in diagram view |
| `_brkMeasureLabelWidth(text)` | Canvas measureText for dynamic lane X computation |

### Undo op types
| Type | Payload | What it undoes |
|---|---|---|
| `brk-add` | `{brk}` | Creation — removes the bracket |
| `brk-remove` | `{brk}` | Deletion — restores the bracket |
| `brk-style` | `{id, prop, oldVal, newVal}` | Any property change (label, color, thickness, labelOffsetY, startRid, endRid) |

### DOM / CSS
- Pips: `.dbrk-pip` inside `.drow-pip-cell` (rightmost cell of each `.drow`)
- Pip cell: `.drow-pip-cell` — `flex-shrink:0; width:28px` at far right of row flex layout
- Bracket SVG: `#dbrk-svg` absolutely positioned inside `#dcanvas`, `z-index:7`
- Body classes: `brk-shift` (Shift held → pips visible), `brk-active` (bracket pending → pips visible)
- Bracket line: `.brk-line`, selected: `.brk-line.brk-selected`

---

## Updated Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Alt+1` | Open/close Projects panel |
| `Alt+2` | Open/close Bible Module |
| `Alt+3` | Toggle comment pane |
| `Alt+T` | Toggle Phrasing / Diagram View |
| `Shift` (held) | Show bracket pip dots in Diagram View |
| `Shift+click pip` | Start / complete bracket creation |
| `Escape` | Cancel pending bracket |

---

## Updated File List

```
index.html   — App shell, including the Phrasing/Diagram workspace controls and #brk-edit-popup
app.css      — All styles (append-only), including Diagram and bracket presentation
app.js       — Core editor, export, Diagram, bracket, annotation, and compatibility systems
lang.js      — i18n strings for EN + ZH
tut.js       — Tutorial content, including Brackets
bible.js     — Bible Module (unchanged)
account.js   — NEW; cloud sync integration layer (Google-only) — see "Cloud Sync" above
sw.js        — Service worker; APP_VERSION must be bumped on every deploy;
               now also precaches account.js/sync/*
sync/        — NEW; cloud sync module + config (Google-only, no auth pages)
supabase/    — NEW; SQL schema, run manually in the Supabase SQL Editor
CLAUDE.md    — This file
```
