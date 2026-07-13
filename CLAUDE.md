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
├── sw.js             — Service worker for automatic cache-busting on deploy
├── CLAUDE.md         — This file
├── deploy.bat        — Windows deployment (git add/commit/push)
├── deploy.sh         — Mac/Linux deployment
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
| `applySettings()` | Applies CSS custom property color changes |
| `resetColors()` | Resets to DCOLORS defaults |

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

### Projects localStorage schema
```js
// Index key
'exeg-proj-index'  →  JSON array of {id, name, savedAt, lang}

// Data key per project
'exeg-proj-data-{id}'  →  JSON with full editor state
```

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
#set-modal       Settings modal (colors, cache)
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

**Screen 1 only:** `Ctrl+O` and `Alt+P` work. All others are blocked.

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

9. **Projects are stored in localStorage** (not IndexedDB). Key prefix: `exeg-proj-`. Max storage depends on browser (~5MB). No server sync.

10. **Color theme** persists in localStorage key `exeg-colors`. On load, `applySettings()` reads it and sets CSS custom properties.

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

## Slides / Presenter System (app.js)

A built-in presentation layer. Three phases: A (builder), B (presenter), C (PDF export).

### State variables
```js
SL_DECK         // {slides: [...]} — the full deck
SL_ACTIVE_IDX   // index of currently selected slide
SL_SEL_EL_ID    // ID of selected element on active slide, or '__passage__', or null
SL_EL_CTR       // element ID seed
SL_SLIDE_CTR    // slide ID seed
SL_PROJ_WIN     // reference to projector window (window.open result)
SL_PRES_IDX     // current slide index during presentation
SL_CANVAS_W     // computed canvas width in px (maintains 16:9)
SL_CANVAS_H     // computed canvas height in px
SL_CMT_CACHE    // {cid: rawHTML} — comment text cache (DOM may be hidden in Slides view)
_slLastRefreshTime  // timestamp guard — prevents double-fire within 100ms
```

### Slide data schema
```js
{
  id:          'sl-1',
  type:        'blank' | 'content',
  view:        'phrasing' | 'diagram',
  rowIds:      ['r1', 'r2', 'r3'],   // selected rows (empty = show nothing)
  visibility: {
    indentation: false,  // all default false — user opts in
    translation:  false,
    comments:     false,
    connectors:   false,
    brackets:     false,
    labels:       false
  },
  contentArea: { x:3, y:3, w:94, h:55 },  // % of slide dimensions
  elements: [
    {
      id: 'el-1',
      type: 'textbox' | 'floatlabel' | 'commentbox',
      x: 10, y: 65,   // % of slide
      w: 80, h: 18,   // % of slide
      html: '<b>Key observation</b>…',
      // textbox only:
      fontSize: 18, color: '#1F1E1E', align: 'left',
      // floatlabel only:
      sourceId: 'lbl-3',   // DIAGRAM_DATA.labels entry ID
      // commentbox only:
      sourceCid: 'c-2'     // comment card cid
    }
  ],
  notes: 'Speaker notes here…'
}
```

### Render pipeline
`slRefreshSlide()` is the main entry point (called by Refresh button and thumbnail click):
1. 100ms timestamp guard (prevents double-fire)
2. `slSyncDerivedElements()` — syncs `floatlabel` elements from `DIAGRAM_DATA.labels` and `commentbox` elements from `SL_CMT_CACHE` into `slide.elements[]`, preserving user-moved positions
3. `slRenderActive()` — debounced via `clearTimeout`/`setTimeout(0)` → `_slDoRender()`
4. `slRenderThumb(idx)` — renders thumbnail at 152×85px

`_slDoRender()` → `slRenderSlideInto(slide, container, w, h)`:
- Clears container
- Builds passage content (phrasing: clones `.xrow` elements; diagram: builds from scratch using row data — never clones `#dcanvas`)
- Applies visibility toggles inline
- Draws connectors/brackets via `slDrawConnectorsIntoClone()` / `slDrawBracketsIntoClone()`
- Scales passage to fit `contentArea` via `requestAnimationFrame`
- Renders text boxes, floatlabels, commentboxes as absolute-positioned elements

### Key functions
| Function | Purpose |
|---|---|
| `slRenderAll()` | Full re-render: thumbnails + props panel + active canvas |
| `slRefreshSlide()` | Refresh active slide from live data (Refresh button, thumbnail click) |
| `slRenderActive()` | Debounced canvas render → `_slDoRender()` |
| `slRenderSlideInto(slide, container, w, h)` | Core renderer — builds slide DOM |
| `slSyncDerivedElements()` | Syncs floatlabel/commentbox from live data into slide.elements[] |
| `slSelectSlide(idx)` | Switch active slide → calls slRefreshSlide |
| `slAddBlank()` / `slAddContent()` | Add slide variants |
| `slDeleteSlide(idx)` / `slDuplicateSlide(idx)` | Manage slides |
| `slSetView(view)` | Switch phrasing/diagram (no re-render — user clicks Refresh) |
| `slVisChange(key, val)` | Toggle visibility flag (no re-render — user clicks Refresh) |
| `slSelectEl(id)` | Select element without re-render — toggles CSS class + handles directly |
| `slStartElDrag(ev, el, div, w, h)` | Move element via mousedown |
| `slStartElResize(ev, el, div, dir, w, h)` | Resize element via handle drag |
| `slStartThumbDrag(ev, fromIdx, thumbEl)` | Drag-to-reorder thumbnails |
| `slStartPresent()` | Opens projector window, switches to presenter dashboard |
| `slEndPresent()` | Closes projector, returns to slide editor |
| `slPresNav(delta)` | Advance/retreat slides during presentation |
| `slSendToProjector(slide)` | Renders slide at 1920×1080, sends via postMessage |
| `slExportPDF()` | html2canvas each slide → jsPDF landscape A4 |
| `slCollectDeck()` / `slLoadDeck(data)` | Serialize/restore deck from project JSON |
| `slDrawConnectorsIntoClone(el, rids)` | Draw connectors using offsetTop (not getBoundingClientRect) |
| `slDrawBracketsIntoClone(el, rids)` | Draw brackets using offsetTop |

### Undo op types
| Type | Payload | What it undoes |
|---|---|---|
| `sl-add-slide` | `{idx, slide}` | Slide creation |
| `sl-remove-slide` | `{idx, slide}` | Slide deletion |
| `sl-move-slide` | `{fromIdx, toIdx}` | Slide reorder |
| `sl-slide-prop` | `{idx, prop, key?, oldVal, newVal}` | Any slide property (view, rowIds, visibility, contentArea, notes) |
| `sl-add-el` | `{slideIdx, el}` | Element addition |
| `sl-remove-el` | `{slideIdx, elIdx, el}` | Element deletion |
| `sl-el-prop` | `{slideIdx, elId, prop, oldVal, newVal}` | Element move/resize/edit |
| `sl-zorder` | `{slideIdx, oldOrder, newOrder}` | Element z-order change |

### Projector communication
- Projector window opened with `window.open('', '_blank', ...)`
- Main window writes HTML shell with CSS vars inlined + link to app.css
- Projector signals `{type:'sl-ready'}` when listener is live
- Main window receives `sl-ready` → calls `slPresUpdate()` → `slSendToProjector(slide)`
- Each slide sent as `{type:'sl-slide', html}` via `postMessage`
- 2-second fallback in case `sl-ready` is never received

### Key element IDs
```
#szone           Slides view container (flex row, 3 columns)
#sl-list         Thumbnail list container
#sl-list-panel   Left panel (thumbnails + add buttons)
#sl-canvas-wrap  Center panel (toolbar + canvas outer)
#sl-canvas-outer Center panel inner (gray background, centers canvas)
#sl-canvas       The 16:9 slide canvas (size set by JS)
#sl-toolbar      Slides toolbar (Add Text Box, Present, Refresh, Export)
#sl-props-panel  Right panel (view toggle, row list, visibility, notes)
#sl-row-list     Row checkbox list in props panel
#sl-notes        Speaker notes textarea
#sl-presenter    Presenter dashboard (overlays szone during presentation)
#sl-pres-left    Presenter left column (slide preview)
#sl-pres-right   Presenter right column (notes)
#sl-pres-divider Draggable column divider
#sl-pres-bar     Bottom navigation bar
#sl-pres-preview Current slide preview container
#sl-pres-notes   Speaker notes display (read-only during presentation)
#sl-pres-counter Slide counter "N of M"
#sl-ctx-menu     Context menu (Bring to Front / Send to Back / Delete)
```

### CSS classes on slide elements
```
.sl-el           Base class for all slide elements
.sl-el-passage   Passage content area (draggable/resizable)
.sl-el-textbox   User text box
.sl-el-overlay   Floating label or comment box (read-only, draggable)
.sl-resize-handle Corner/edge resize handle
.sl-rh-{dir}     Direction-specific handle (nw, ne, sw, se, n, s, w, e)
.sl-thumb        Slide thumbnail div
.sl-thumb-inner  Thumbnail preview content container
.sl-thumb.active Currently selected thumbnail
.sl-drag-over   Drop target highlight during thumbnail reorder
```

### Important behaviours
- **No live re-render on property change** — `slVisChange`, `slSetView`, row checkbox changes only update data. User must click Refresh to see changes. Prevents lag.
- **`slLoadDeck` does NOT call `slRenderAll`** — rendering is always triggered by `setEditorView('slides')` → `setTimeout(slRenderAll, 80)`, or by user actions.
- **Comment pane hidden in Slides view** — `toggleCmtPane()` is a no-op when `EDITOR_VIEW==='slides'`. The comment pane button is disabled.
- **`SL_CMT_CACHE`** — populated in `loadData()` and updated in `autoSave()`. Used instead of querying `.ccard .cedit-c` directly (which returns empty when pane is hidden).
- **Diagram content in slides** — built from `.xrow` data directly, never clones `#dcanvas`, to avoid stale content and zoom inheritance issues.

---

## Updated Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Alt+1` | Open/close Projects panel |
| `Alt+2` | Open/close Bible Module |
| `Alt+3` | Toggle comment pane |
| `Alt+T` | Toggle Phrasing / Diagram View |
| `Alt+P` | Open Slides View |
| `Shift` (held) | Show bracket pip dots in Diagram View |
| `Shift+click pip` | Start / complete bracket creation |
| `Escape` | Cancel pending bracket |

---

## Updated File List

```
index.html   — App shell; now includes #szone, #sl-presenter, #sl-ctx-menu,
               #brk-edit-popup, Slides toolbar button
app.css      — All styles (~3700+ lines, append-only); bracket and slides CSS appended
app.js       — ~7100+ lines; bracketing system (~600 lines), slides system (~1200 lines)
lang.js      — i18n strings for EN + ZH; bracket.* and slides.* key namespaces
tut.js       — Tutorial content; now includes Part 9 (Brackets) and Part 10 (Slides)
bible.js     — Bible Module (unchanged)
sw.js        — Service worker; APP_VERSION must be bumped on every deploy
CLAUDE.md    — This file
```
