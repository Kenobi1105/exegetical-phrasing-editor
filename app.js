/* ════════════════════════════════════════
   STATE
════════════════════════════════════════ */
let SESS='', LANG='', IS_RTL=false, IS_SINGLE=false;
// Per-column Phrasing font sizes (px). Hebrew sessions default the
// original-text column larger (24) since Hebrew glyphs read smaller
// than Latin translation text at the same nominal size; translation
// stays at the normal default. Not persisted per-project — resets to
// the session's default every time a session/project is (re)loaded,
// same philosophy as the Phrasing/Diagram view toggles.
let CEDIT_O_SIZE=14, CEDIT_T_SIZE=14;
let DEFAULT_O_SIZE=14, DEFAULT_T_SIZE=14; // this session's reset targets
const FSZ_MIN=8, FSZ_MAX=40, FSZ_STEP=1;
// Comment pane text size — a live UI preference (like Bible panel's
// bFontSize), not per-project content data, so it's persisted to
// localStorage rather than going through undo/redo or collectData().
// Applied via a CSS custom property (--cmt-font-size, .cedit-c's own font-
// size rule) rather than looping every .cedit-c element, so it covers
// cards that don't exist yet too.
let CMT_FONT_SIZE=12;
const CMT_FONT_MIN=9, CMT_FONT_MAX=20, CMT_FONT_STEP=1;
// NOTE: sessionVersionLabel is declared in bible.js as a shared global.
// Do not redeclare it here with let/var — that would throw a SyntaxError
// when both scripts are loaded in the same non-module scope.
let hlColor='#F0D08F';

// Converts a #rrggbb hex color to an rgba() string at the given alpha —
// used to make highlight marks genuinely translucent (ink-over-text look)
// instead of an opaque color block. Shared by the main editor's applyHl()
// and the main editor's rich-text highlighter.
function _hlToRgba(hex, alpha){
  const m=/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex||'');
  if(!m) return hex;
  const r=parseInt(m[1],16), g=parseInt(m[2],16), b=parseInt(m[3],16);
  return 'rgba('+r+','+g+','+b+','+alpha+')';
}
// The 0.55 alpha used to blend highlight marks is tuned for a light page
// background (a translucent "marker on paper" look) — over Dark mode's
// --bg it blends into a solid mid-brown patch instead, which both pops
// against the near-black canvas and leaves the theme's light --ink text
// low-contrast on top. A lower alpha blends closer to the dark background,
// fixing both at once. Only applies to newly-applied highlights — one
// already baked into a saved project as a static rgba() won't retroactively
// adjust if the theme changes later, matching how the rest of the color
// system already works.
function _hlAlpha(){
  return typeof _currentThemeId==='function' && _currentThemeId()==='dark' ? 0.3 : 0.55;
}
let activeEl=null, savedRange=null;
let RC=0, CC=0;
let asT=null;
let lastFocusedRowEl=null;
let FONT_B64=null; // pre-loaded Unicode font for PDF export
let CURRENT_FILENAME=null; // set when a JSON file is loaded — Ctrl+S updates it in-place
// Bibliographic citation extracted from a paste (e.g. Logos's BHS/SBLGNT
// edition citation) — see _findTrailingCitationLines / setSourceCitation.
// Shown in #citation-bar instead of becoming extra verse rows.
let SOURCE_CITATION='';
// Legacy slide decks remain opaque project data. The Slides workspace has
// been retired, but retaining this payload lets older project files round-trip
// without silently discarding the user's previous work.
let LEGACY_SLIDES_DECK={slides:[]};
let COMMENT_HTML_CACHE={};

// Tracks user-adjusted column widths (null = use flex/default)
const COL_WIDTHS={v:null, o:null, t:null};

const LIGHT_COLORS={bg:'#F7F3E9',accent:'#F0D08F',ink:'#1F1E1E',sig:'#493548',label:'#F7F3E9',active:'#C8A84B',muted:'#A89F90',crit:'#1E6AFE',surface:'#FFFFFF',alt:'#EEE8DC','bg-rgb':'247,243,233','ink-rgb':'31,30,30'};

const DARK_COLORS={bg:'#1B1A20',accent:'#E8C97A',ink:'#EDE7DD',sig:'#2C2438',label:'#EDE7DD',active:'#C9A64E',muted:'#B9B1AA',crit:'#6FA8FF',surface:'#252030',alt:'#211F29','bg-rgb':'27,26,32','ink-rgb':'237,231,221'};
const THEME_KEY='exeg-theme';
const LEGACY_COLORS_KEY='exeg-colors';

// Applies one curated appearance palette as CSS custom properties.
function _applyColorSet(colors){
  const R=document.documentElement;
  Object.entries(colors).forEach(([k,v])=>{
    if(!v) return;
    R.style.setProperty('--'+k,v);
  });
}

/* ── Diagram View state ──
   EDITOR_VIEW: 'phrasing' | 'diagram' — which canvas is currently shown.
   DIAGRAM_DATA: connectors + labels, saved alongside rows in
   collectData()/loadData(). Translation text renders directly below each
   block with a fixed gap (see makeDiagramRowEl). Floating labels remain
   stubbed (empty array) until a later stage.
   SELECTED_CNX_ID: the currently-selected connector's id (or null), used
   to highlight it and show the style/color/delete edit popup.
   A connector's shape is `kind: 'curve' | 'rightangle'`:
   - 'curve': a smooth semantic relationship, with top/bottom-edge snapped
     anchors for word-level relationships or direct block-handle links.
   - 'rightangle': a structural/dependency relationship, routed through a
     shared outer trunk so it traces clause logic without obscuring text.
   Both render below the diagram cards.
   Both kinds share the same style system: `pattern: 'solid'|'dotted'`,
   `arrowMode: 'none'|'single'|'double'`, and `weight` (one of 1, 1.25,
   1.5, 1.75 — px stroke width), all independent of each other, plus
   `color`. New connectors default to pattern:'solid', arrowMode:'single',
   weight:1 per the current spec.
   DIAGRAM_ZOOM: a view preference (50–200, step 10, default 100), NOT
   saved in diagramData/the project file — resets to 100 on session
   restart or loading a different project. Applied via CSS `zoom` (not
   `transform:scale`) specifically so every existing getBoundingClientRect()
   -based connector/drag calculation keeps working unmodified — `zoom`
   affects layout (so rects already reflect it), whereas `transform` only
   affects paint and would double-scale connector coordinates since the
   SVG layers are siblings of the blocks under the same scaled parent. */
let EDITOR_VIEW='phrasing';
let COMPARE_PANES=[null,null];
// Compare temporarily reuses the one Notes dock.  Its cards are rendered from
// an isolated comparison payload and the primary project cards are restored
// unchanged when Compare closes.
let COMPARE_NOTE_CONTEXT=null;
let COMPARE_PRIMARY_NOTE_NODES=[];
const STRUCTURE_LAYOUT_VERSION=1;
let STRUCTURE_EXPANDED=new Set();
const STRUCTURE_PANEL_OPEN_KEY='exeg-structure-panel-open';
let DIAGRAM_EDIT_MODE=false; // true = diagram word-edit mode active
let DIAGRAM_DATA={connectors:[], labels:[]};
let CNX=0; // connector ID counter, same idiom as RC (row counter) / CC (comment counter)
let LBL=0; // floating label ID counter
let SELECTED_CNX_ID=null;
// New relationships use the currently chosen scholarly visual grammar.
// Connector kind is still the existing persisted field, so legacy projects
// round-trip without a schema change.
let DIAGRAM_NEW_CONNECTOR_KIND='curve';
let DIAGRAM_ZOOM=100;
const DIAGRAM_ZOOM_MIN=50, DIAGRAM_ZOOM_MAX=200, DIAGRAM_ZOOM_STEP=10;
let _dzoomRefreshRAF=null; // pending requestAnimationFrame id for the debounced connector/label refresh in setDiagramZoom
let DIAGRAM_FONT_SIZE=18; // px — default larger than the original 14px
const DIAGRAM_FONT_MIN=10, DIAGRAM_FONT_MAX=28, DIAGRAM_FONT_STEP=1;

/* ── Annotations ──
   Unified array for the four new annotation types:
     • 'divider'  – horizontal rule between two rows in Phrasing view
                    {id, afterRid, label, color}
     • 'arrow'    – free SVG arrow in Diagram view
                    {id, x1,y1,x2,y2, label, color, dashed}
     • 'span'     – vertical brace grouping rows in Diagram view
                    {id, startRid, endRid, label, color, side:'left'|'right'}
     • 'arc'      – curved arc between two words in Diagram view
                    {id, fromRid, fromWordIdx, toRid, toWordIdx, label, color}
   All coordinates for diagram types are stored as percentages of #dcanvas
   clientWidth / clientHeight so they survive zoom changes.
   Dividers are stored by row id (afterRid) so they survive row reordering.
*/
let ANNOTATIONS=[];
let ANN_CTR=0; // ever-incrementing annotation id seed

/* ── Project-level Study Notebook ──
   Unlike row comments, these entries may connect several sources across a
   passage. The array is persisted as part of collectData(), keeping it
   compatible with project JSON, backups, and cloud payloads. */
let STUDY_NOTEBOOK=[];
let STUDY_NOTE_CTR=0;
let STUDY_NOTE_ACTIVE_ID=null;
let STUDY_NOTE_ACTIVE_EDITOR=null;
let STUDY_NOTE_SELECTION=null;
let STUDY_NOTE_TEXT_COLOR='#1F1E1E';
const STUDY_NOTEBOOK_OPEN_KEY='exeg-study-notebook-open';
const STUDY_STAGES=['observation','question','cross-reference','insight','application'];

/* ── Shared two-layer color palette (Highlight + Text Color + Line Color + Bracket Color) ──
   Layer 1 preset row differs by tool:
     - highlight / lineColor → 4 soft tones (original palette)
     - textColor → 8 spec colors (Black, Green, Orange, Blue,
                               Yellow, Pink, Purple, Red)
   Layer 2 is a per-tool "recently used" row, persisted in localStorage,
   capped at RECENT_COLOR_CAP, independent between tools. */
const PALETTE_PRESETS_HL  =['#F0D08F','#7BC67B','#7FB7E6','#B79AD9'];
const PALETTE_PRESETS_TEXT=['#000000','#00CC00','#FF6600','#2A7FFF','#E5A400','#F656B8','#A449FF','#990000'];
const RECENT_COLOR_CAP=8;
let PALETTE_ACTIVE_TOOL=null; // 'highlight' | 'textColor' | 'lineColor' | null
let txtColor='#1F1E1E'; // current text color, mirrors #txt-color-bar
let SELECTED_DIAG_RID=null; // rid of the currently selected diagram block
let _bracketJustDragged=false; // suppresses click-after-handle-drag on bracket bar

/* ════════════════════════════════════════
   UPDATE BANNER
════════════════════════════════════════ */
/* ════════════════════════════════════════
   SCREEN 1 — LANGUAGE
════════════════════════════════════════ */
function chooseLang(lang,customLabel,cuvVersion){
  if(cuvVersion) window._cuvVersion=cuvVersion; else window._cuvVersion=null;
  SESS=lang; IS_RTL=lang==='hebrew'; IS_SINGLE=lang==='custom';
  _applySessionFontDefaults();
  // dir="auto" lets each pasted line resolve its own base direction from
  // its first strong character (Unicode's standard heuristic) — a
  // Hebrew-first line reads RTL, a reference/label-first line reads LTR
  // — rather than forcing one direction on the whole box, which is what
  // caused embedded markers like [TM ... TM] to mirror into TM]...[TM.
  const pta0=document.getElementById('paste-ta');
  if(pta0) pta0.dir = IS_RTL ? 'auto' : 'ltr';
  LANG=lang==='greek'?'Greek':lang==='hebrew'?'Hebrew':(customLabel||'Custom');
  const prefix=typeof t==='function'?t('s2.add-passage-prefix'):'Add your ';
  const suffix=typeof t==='function'?t('s2.add-passage-suffix'):' passage';
  document.getElementById('s2-title').textContent=prefix+(LANG||'')+(IS_SINGLE&&!LANG?'':suffix);
  document.getElementById('s1').classList.add('hidden');
  document.getElementById('s2').classList.remove('hidden');
  // Reinitialize Screen 2 every time it opens so session-specific options are correct
  if(typeof s2Init==='function') s2Init();
}
function goBack(){
  document.getElementById('s2').classList.add('hidden');
  document.getElementById('s1').classList.remove('hidden');
  // Reset s2 init flag so it re-inits on next open
  if(typeof window.s2PickerInited!=='undefined') window.s2PickerInited=false;
}
/* ════════════════════════════════════════
   SCREEN 2 — PASTE & PARSE
════════════════════════════════════════ */
function confirmPaste(){
  const div=document.getElementById('paste-ta');
  const hasContent=div.innerText.trim().length>0;
  // Adopt the optional Screen 2 title as the passage title
  const titleIn=document.getElementById('s2-title-input');
  openEditor();
  if(titleIn&&titleIn.value.trim()){
    const ri=document.getElementById('refin');
    if(ri){ ri.value=titleIn.value.trim(); }
  }
  if(hasContent) parsePasteIntoRows(div);
  else addEmptyRow();
  if(titleIn) titleIn.value='';
}
function skipPaste(){
  openEditor();
  // Show default version placeholder so user knows to fill it in
  const vsub = document.getElementById('version-sub');
  if(vsub && !vsub.textContent.trim()) vsub.textContent = (typeof t==='function'?t('version.ph'):'Version (e.g., ESV, BHS, NA28)');
}

/* Parse rich HTML from the paste div.
   Strategy: normalise the div's children into a flat list of "line" objects,
   each with { verse, html } where html preserves inline spans/colors.
   A line whose plain-text starts with a digit sequence = new verse.
   All subsequent lines without a number inherit the last verse. */
/* Proposition labels recognised at the start of an outline-format line
   (Lexham "Propositional Outlines" export). Matching is case-insensitive;
   the original casing is preserved in the divider label. Extend this list
   as further label types are encountered. */
const PROP_LABELS=['sentence','complex','elaboration','sub-point','bullet',
                   'principle','support','application','circumstance'];

/* ── Source citation detection (paste import) ──────────────────────────
   Bible software (Logos, Accordance, BibleArc, Lexham, ...) commonly
   appends a full bibliographic citation of the source edition after the
   copied verse text — e.g. "...Biblia Hebraica Stuttgartensia (electronic
   ed.). Stuttgart: Deutsche Bibelgesellschaft, (1997)." or "Kurt Aland et
   al., Novum Testamentum Graece, 28th Edition (Stuttgart: Deutsche
   Bibelgesellschaft, 2012), 1 Pe 1." Left alone, parsePasteIntoRows would
   turn every line of that into extra verse rows. Instead it's detected,
   pulled out, and shown in the dedicated #citation-bar (see
   setSourceCitation) — kept, just not mixed into the passage.
   Detection is anchored on a modern (19xx/20xx) year appearing anywhere
   inside a parenthesized group — near-universal in bibliographic
   citations across citation styles (the year isn't always the ENTIRE
   parenthetical, e.g. "(Stuttgart: Deutsche Bibelgesellschaft, 2012)"),
   and essentially never appears in raw Biblical source text or a plain
   translation. */
function _isCitationLikeText(text){
  return /\([^()]*\b(?:19|20)\d{2}\b[^()]*\)/.test(text||'');
}

/* Scans block-line elements from the END backward, collecting a
   contiguous trailing run of citation-like lines. Blank lines within
   that trailing run are skipped over rather than treated as a stop
   condition — citations are often separated from the passage (and, when
   duplicated, from each other) by a blank line. Returns the citation
   line elements in original top-to-bottom order; does not mutate
   lineEls. Real passage content never matches, so this only ever grabs
   trailing citation material, never verse text further up. */
function _findTrailingCitationLines(lineEls){
  const citationEls=[];
  for(let idx=lineEls.length-1; idx>=0; idx--){
    const text=(lineEls[idx].textContent||'').trim();
    if(!text) continue; // blank line — keep scanning past it
    if(!_isCitationLikeText(text)) break;
    citationEls.unshift(lineEls[idx]);
  }
  return citationEls;
}

/* Collapses exact-duplicate citation blocks (compared by normalised
   plain text) down to one copy, keeping the first occurrence's HTML.
   Fixes sources (observed with Logos over RTF — see _RTF_SKIP_DESTS'
   footnote note) that embed the same citation twice. */
function _dedupeCitationEls(citationEls){
  const seen=new Set();
  const keep=[];
  citationEls.forEach(el=>{
    const key=(el.textContent||'').trim().replace(/\s+/g,' ').toLowerCase();
    if(seen.has(key)) return;
    seen.add(key);
    keep.push(el);
  });
  return keep;
}

/* Sets/clears the passage's source citation and reflects it into
   #citation-bar. html='' hides the bar entirely (default state, and
   the state every new/cleared session resets to). */
function setSourceCitation(html){
  SOURCE_CITATION=html||'';
  const bar=document.getElementById('citation-bar');
  if(!bar) return;
  if(SOURCE_CITATION){
    bar.innerHTML=SOURCE_CITATION;
    bar.title=bar.textContent.trim();
    bar.style.display='';
  } else {
    bar.innerHTML='';
    bar.removeAttribute('title');
    bar.style.display='none';
  }
}

function parsePasteIntoRows(div){
  // Collect line elements. Block children (<div>/<p>) are lines; any loose
  // inline/text nodes at the top level — including trailing content the
  // source app left outside a block wrapper — are grouped into synthetic
  // line elements, split at <br>. Nothing at the top level is dropped.
  const lineEls=[];
  {
    let buf=null;
    const flush=()=>{
      if(buf&&(buf.textContent||'').trim()) lineEls.push(buf);
      buf=null;
    };
    Array.from(div.childNodes).forEach(n=>{
      const isEl=n.nodeType===Node.ELEMENT_NODE;
      if(isEl&&(n.tagName==='DIV'||n.tagName==='P')){
        flush();
        lineEls.push(n);
      } else if(isEl&&n.tagName==='BR'){
        flush();
      } else {
        if(!buf) buf=document.createElement('div');
        buf.appendChild(n.cloneNode(true));
      }
    });
    flush();
  }

  // Pull a trailing bibliographic citation (if any) out before it can be
  // turned into verse rows — see _findTrailingCitationLines.
  {
    const citationEls=_dedupeCitationEls(_findTrailingCitationLines(lineEls));
    if(citationEls.length){
      setSourceCitation(citationEls.map(el=>el.innerHTML.trim()).join('<br>'));
      citationEls.forEach(el=>{
        const idx=lineEls.indexOf(el);
        if(idx!==-1) lineEls.splice(idx,1);
      });
      // Drop any now-trailing blank lines left behind so a stray empty
      // line doesn't become the passage's last row.
      while(lineEls.length && !(lineEls[lineEls.length-1].textContent||'').trim()) lineEls.pop();
    }
  }

  const parsed=[];

  // ── Format detection: labeled outline export? ──
  // A paste is outline-format when any line's first token is a known
  // proposition label (Complex, Elaboration, Sub-Point, Bullet, ...).
  const _firstLatinToken=el=>{
    const m=(el.textContent||'').match(/^\s*([A-Za-z][A-Za-z-]*)/);
    return m?m[1]:null;
  };
  const isOutlineFormat=lineEls.some(el=>{
    const tk=_firstLatinToken(el);
    return !!tk && PROP_LABELS.indexOf(tk.toLowerCase())>=0;
  });

  if(isOutlineFormat){
    /* Labeled outline, one proposition per line:
         Complex        Ro 1:1 Παῦλος
         Elaboration    δοῦλος ⸉Χριστοῦ Ἰησοῦ⸊,
         Sub-Point      2 ὃ προεπηγγείλατο …
                        3 περὶ τοῦ υἱοῦ …        (no label → continuation)
       • a recognised leading label is stripped from the text and becomes
         the LABEL of a Proposition Divider above that row; lines without
         a label are continuations and get no divider
       • after the label, three reference forms are recognised:
           book chapter:verse  (Ro 1:1) → verse 1, and the passage title
                               if none is set yet
           chapter:verse       (2:1)    → verse 1 (chapter dropped)
           bare verse          (3)      → verse 3
         no reference → continue the current verse (recomputeIds letters
         same-verse rows 1a/1b/1c automatically) */
    for(const el of lineEls){
      const tc=el.textContent||'';
      if(!tc.trim()) continue;
      // Optional leading proposition label
      let divLabel='';
      let html;
      const lm=tc.match(/^\s*([A-Za-z][A-Za-z-]*)\s*/);
      if(lm && PROP_LABELS.indexOf(lm[1].toLowerCase())>=0){
        divLabel=lm[1];
        html=stripLeadingVerseFromHTML(el, lm[0].length);
      } else {
        html=el.innerHTML.trim();
      }
      // Optional reference after the label. Only the row that DECLARES a
      // verse carries the number; continuation rows keep a blank verse
      // cell (recomputeIds inherits the running verse for the 1a/1b/1c
      // line IDs, so lettering is unaffected).
      let lineVerse='';
      const tmp=document.createElement('div');
      tmp.innerHTML=html;
      const rest=tmp.textContent;
      let m=rest.match(/^\s*((?:[1-3]\s?)?[A-Za-z]+\.?)\s*(\d+):(\d+)\s+/);
      if(m){
        lineVerse=m[3]; // book + chapter dropped from the text; title is NOT auto-set
        html=stripLeadingVerseFromHTML(tmp, m[0].length);
      } else if((m=rest.match(/^\s*(\d+):(\d+)\s+/))){
        lineVerse=m[2]; // chapter:verse with the chapter dropped
        html=stripLeadingVerseFromHTML(tmp, m[0].length);
      } else if((m=rest.match(/^\s*(\d+)\s+/))){
        lineVerse=m[1];
        html=stripLeadingVerseFromHTML(tmp, m[0].length);
      }
      parsed.push({verse:lineVerse, html, divLabel});
    }
  } else {
    /* Free-form paste. A line whose plain-text starts with a digit
       sequence = new verse; lines without a number inherit the last
       verse. NEW: within each line, standalone whitespace-delimited
       numbers that continue the ascending sequence (currentVerse+1,
       then +1 again…) split the line into further per-verse rows —
       see _splitInlineVerses for the guards that keep apparatus
       numerals (˸1, °2) out. */
    let currentVerse='';
    for(const el of lineEls){
      const tcPlain=el.textContent||'';
      if(!tcPlain.trim()) continue; // skip blank lines

      // Detect a verse reference at the very start of the line. Three
      // forms, same as the outline path, checked in order:
      //   book chapter:verse  (Ge 1:1)  → verse = vs, book+chapter dropped
      //   chapter:verse       (2:1)     → verse = vs, chapter dropped
      //   bare verse          (3)       → verse = the number
      // Matched against textContent (not innerText) so the offset fed to
      // stripLeadingVerseFromHTML always agrees with what it actually walks.
      let html=el.innerHTML.trim();
      let lineVerse='';
      let m=tcPlain.match(/^\s*((?:[1-3]\s?)?[A-Za-z]+\.?)\s*(\d+):(\d+)\s+/);
      if(m){
        currentVerse=m[3]; lineVerse=m[3];
        html=stripLeadingVerseFromHTML(el, m[0].length);
      } else if((m=tcPlain.match(/^\s*(\d+):(\d+)\s+/))){
        currentVerse=m[2]; lineVerse=m[2];
        html=stripLeadingVerseFromHTML(el, m[0].length);
      } else if((m=tcPlain.match(/^\s*(\d+)\s+/))){
        currentVerse=m[1]; lineVerse=m[1];
        html=stripLeadingVerseFromHTML(el, m[0].length);
      }
      // Split the remainder at inline ascending verse numbers. Only the
      // segment that STARTS a verse carries the number; continuation
      // segments/lines keep a blank verse cell and recomputeIds inherits
      // the running verse for lettering (1a/1b/1c).
      const segs=_splitInlineVerses(html, currentVerse);
      segs.forEach((sg,si)=>{
        if(sg.verse) currentVerse=sg.verse;
        parsed.push({verse: si===0 ? lineVerse : sg.verse, html:sg.html});
      });
    }
  }

  if(!parsed.length){addEmptyRow();return;}
  const madeRows=[];
  parsed.forEach(p=>{
    const row=addRow(p.verse,'','',null,null);
    const oc=row.querySelector(`#oc-${row.dataset.rid} .cedit`);
    if(oc){
      oc.innerHTML=_stripBgFromHTML(p.html); // no source-app backgrounds, ever
      _markupCriticalSigns(oc); // color apparatus + discourse signs (--crit)
    }
    madeRows.push(row);
  });
  // A labeled Proposition Divider above each row that carried an outline
  // label; unlabeled (continuation) rows get none.
  let madeDivider=false;
  madeRows.forEach((row,i)=>{
    const lbl=parsed[i]&&parsed[i].divLabel;
    if(lbl){
      ANNOTATIONS.push({id:_annId(), type:'divider', beforeRid:row.dataset.rid, label:lbl, color:'#C8A84B'});
      madeDivider=true;
    }
  });
  if(madeDivider) renderDividers();
  recomputeIds();
  autoSave();
  toast(parsed.length+' line'+(parsed.length!==1?'s':'')+' imported');
}

/* Remove the leading N characters from an element's HTML
   while preserving all inline formatting on the rest of the content.
   charCount = total characters to strip (leading spaces + verse number + space). */
function stripLeadingVerseFromHTML(el, charCount){
  const clone=el.cloneNode(true);
  let toStrip=charCount;
  function stripNode(node){
    if(toStrip<=0) return;
    if(node.nodeType===Node.TEXT_NODE){
      if(node.textContent.length<=toStrip){
        toStrip-=node.textContent.length;
        node.textContent='';
      } else {
        node.textContent=node.textContent.slice(toStrip);
        toStrip=0;
      }
    } else {
      for(const child of Array.from(node.childNodes)) stripNode(child);
    }
  }
  stripNode(clone);
  return clone.innerHTML;
}


/* ════════════════════════════════════════
   CUSTOM MODAL (replaces native prompt())
════════════════════════════════════════ */
let _cModalResolve=null;
function cModalPrompt(titleKey,descKey,defaultVal){
  return new Promise(resolve=>{
    _cModalResolve=resolve;
    const modal=document.getElementById('custom-modal');
    const titleEl=document.getElementById('cmodal-title');
    const descEl=document.getElementById('cmodal-desc');
    const inp=document.getElementById('cmodal-input');
    if(!modal||!inp){resolve(null);return;}
    if(titleEl)titleEl.textContent=typeof t==='function'?t(titleKey):titleKey;
    if(descEl)descEl.textContent=typeof t==='function'?t(descKey):descKey;
    inp.value=defaultVal||'';
    modal.classList.remove('hidden');
    setTimeout(()=>inp.focus(),50);
    inp.onkeydown=(e)=>{
      if(e.key==='Enter'){e.preventDefault();cModalOk();}
      if(e.key==='Escape'){e.preventDefault();cModalCancel();}
    };
  });
}
function cModalOk(){
  const val=(document.getElementById('cmodal-input')?.value||'').trim();
  document.getElementById('custom-modal')?.classList.add('hidden');
  if(_cModalResolve){_cModalResolve(val||null);_cModalResolve=null;}
}
function cModalCancel(){
  document.getElementById('custom-modal')?.classList.add('hidden');
  if(_cModalResolve){_cModalResolve(null);_cModalResolve=null;}
}

/* ════════════════════════════════════════
   SESSION LABELS (i18n-aware)
════════════════════════════════════════ */
/* Resets Phrasing per-column font sizes and the Diagram font size to this
   session's defaults, and refreshes which font-size toolbar control is
   shown (single stepper vs. the Hebrew/Greek split popover trigger).
   Called from every place SESS is established: choosing a language on
   Screen 1, and every project/JSON load path. */
function _applySessionFontDefaults(){
  CEDIT_O_SIZE = DEFAULT_O_SIZE = (SESS==='hebrew') ? 24 : 14;
  CEDIT_T_SIZE = DEFAULT_T_SIZE = 14;
  document.documentElement.style.setProperty('--cedit-o-size', CEDIT_O_SIZE+'px');
  document.documentElement.style.setProperty('--cedit-t-size', CEDIT_T_SIZE+'px');
  document.querySelectorAll('[id^="oc-"] .cedit').forEach(c=>{ c.style.fontSize=CEDIT_O_SIZE+'px'; });
  document.querySelectorAll('[id^="tc-"] .cedit').forEach(c=>{ c.style.fontSize=CEDIT_T_SIZE+'px'; });
  const ot=document.getElementById('phrasing-sz-txt'); if(ot) ot.textContent=CEDIT_O_SIZE+'px';
  if(typeof setDiagramFontSize==='function') setDiagramFontSize(SESS==='hebrew' ? 24 : 18);
  _updatePhrasingSizeGrpVisibility();
}
/* Shows the single unsplit -/+ stepper for Chinese/Custom sessions, or the
   split (Original + Translation) popover trigger for Hebrew/Greek — only
   ever in Phrasing view. Called on view switch AND on session change. */
function _updatePhrasingSizeGrpVisibility(){
  const isPhrasing=typeof EDITOR_VIEW==='undefined' || EDITOR_VIEW==='phrasing';
  const split=SESS==='hebrew'||SESS==='greek';
  document.getElementById('phrasing-sz-grp')?.style.setProperty('display', (isPhrasing&&!split)?'flex':'none');
  document.getElementById('phrasing-sz-split-grp')?.style.setProperty('display', (isPhrasing&&split)?'flex':'none');
}

function _applySessionLabels(){
  const isChinese=typeof LANG_UI!=='undefined'&&LANG_UI==='zh';
  let sessLabel,origLabel;
  if(SESS==='hebrew'){
    sessLabel=isChinese?'希伯来文工作区':'Hebrew Session';
    origLabel=isChinese?'希伯来文':'Hebrew Text';
  } else if(SESS==='greek'){
    sessLabel=isChinese?'希腊文工作区':'Greek Session';
    origLabel=isChinese?'希腊文':'Greek Text';
  } else {
    const customName=LANG||'Custom';
    sessLabel=isChinese?'自定义工作区':(customName+' Session');
    origLabel=isChinese?'原文':customName;
  }
  const sessEl=document.getElementById('sess-lbl');
  if(sessEl)sessEl.textContent=sessLabel;
  const origEl=document.getElementById('ch-o-lbl');
  if(origEl)origEl.textContent=origLabel;
  const tHdr=document.getElementById('ch-t-lbl');
  if(tHdr) tHdr.textContent=isChinese?'译文':'Translation';
}

function openEditor(){
  document.getElementById('s2').classList.add('hidden');
  document.getElementById('app').style.display='flex';
  _applySessionLabels();
  document.getElementById('ch-t').style.display=IS_SINGLE?'none':'';
  // Restore comment pane button
  const cmtBtnOE=document.getElementById('btn-cmt-pane');
  if(cmtBtnOE) cmtBtnOE.disabled=false;
  // Reset bracket and annotation state for new session
  BRACKETS=[]; BRK_CTR=0; SELECTED_BRK_ID=null;
  ANNOTATIONS=[]; ANN_CTR=0;
  STUDY_NOTEBOOK=[]; STUDY_NOTE_CTR=0; STUDY_NOTE_ACTIVE_ID=null; window.studyNotebookBibleSelection=null;
  renderStudyNotebook();
  setSourceCitation(''); // parsePasteIntoRows (below, if pasting) sets it fresh
  if(typeof _brkCancelPending==='function') _brkCancelPending();
  if(typeof _brkCloseEditPopup==='function') _brkCloseEditPopup();
  document.getElementById('dbrk-svg')?.remove();
  LEGACY_SLIDES_DECK={slides:[]};
  // setEditorView handles zones, toolbar buttons (including annotation buttons),
  // and active tab highlights — call it so everything resets consistently.
  EDITOR_VIEW=''; // force setEditorView to apply the change
  setEditorView('phrasing');
  autoSave();
  if(typeof _updateS12Pill==='function') _updateS12Pill();
  // Restore Bible Module pin state now that #app is visible
  if(typeof bPinned!=='undefined'&&bPinned&&typeof bApplyPin==='function'){
    setTimeout(()=>bApplyPin(),50);
  }
  // Silently pre-load Unicode font in background so PDF export is instant
  const fontURL=IS_RTL
    ?'https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSerifHebrew/NotoSerifHebrew-Regular.ttf'
    :'https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSerif/NotoSerif-Regular.ttf';
  fetch(fontURL).then(r=>r.arrayBuffer()).then(buf=>{
    const bytes=new Uint8Array(buf);
    let bin=''; for(let i=0;i<bytes.byteLength;i++) bin+=String.fromCharCode(bytes[i]);
    FONT_B64=btoa(bin);
  }).catch(()=>{}); // silent fail — export will still work, just slower
}

/* ════════════════════════════════════════
   ROW BUILDING
════════════════════════════════════════ */
function makeRowEl(rid,verse,origHTML,transHTML,cmtId){
  const rtl=IS_RTL?' rtl':'';
  const origPH=IS_RTL?'טקסט עברי…':IS_SINGLE?LANG+'…':LANG+' text…';

  // Apply user-adjusted widths if set, otherwise use defaults
  const vStyle = COL_WIDTHS.v
    ? `width:${COL_WIDTHS.v}px;min-width:${COL_WIDTHS.v}px`
    : `width:60px;min-width:60px`;
  const ocStyle = COL_WIDTHS.o
    ? `flex:none;width:${COL_WIDTHS.o}px`
    : `flex:1`;
  const tcStyle = COL_WIDTHS.t
    ? `flex:none;width:${COL_WIDTHS.t}px`
    : `flex:1`;

  const transCell=IS_SINGLE?'':`
    <div class="vdiv"></div>
    <div class="xcell grow" id="tc-${rid}" style="${tcStyle}">
      <div class="cedit" contenteditable="true" spellcheck="false"
        data-ph="Translation…"
        onfocus="trackFocus(this,${rid});_textFocusSnap(this,${rid},'t')" onblur="autoSave();_textBlurSnap(this,${rid},'t')"
        oninput="cleanEmptyCell(this)"
        onkeydown="onKey(event,'t',${rid})"></div>
    </div>`;
  const el=document.createElement('div');
  el.className='xrow'+(cmtId?' has-cmt':'');
  el.dataset.rid=rid;
  if(cmtId) el.dataset.cid=cmtId;
  el.innerHTML=`
    <div class="xcell mid" style="${vStyle}">
      <input class="vin" type="text" maxlength="8" placeholder="v" spellcheck="false"
        value="${escH(verse||'')}"
        oninput="_onVerseInput()"
        onkeydown="onVerseKey(event,${rid})"/>
    </div>
    <div class="xcell mid" style="width:52px;min-width:52px">
      <div class="lid">—</div>
    </div>
    <div class="vdiv"></div>
    <div class="xcell grow" id="oc-${rid}" style="${ocStyle}">
      <div class="cedit${rtl}" contenteditable="true" spellcheck="false"
        data-ph="${origPH}"
        onfocus="trackFocus(this,${rid});_textFocusSnap(this,${rid},'o')" onblur="autoSave();_textBlurSnap(this,${rid},'o')"
        oninput="cleanEmptyCell(this)"
        onkeydown="onKey(event,'o',${rid})"></div>
    </div>
    ${transCell}
    <div class="xcell mid" style="width:40px;min-width:40px">
      <button class="cmtbtn${cmtId?' on':''}" title="Comment" onclick="toggleCmt(this,${rid})">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      </button>
    </div>`;
  const oc=el.querySelector(`#oc-${rid} .cedit`);
  if(oc&&origHTML) oc.innerHTML=origHTML;
  const tc=el.querySelector(`#tc-${rid} .cedit`);
  if(tc&&transHTML) tc.innerHTML=transHTML;
  // Apply the current per-column font sizes to new cells
  if(oc) oc.style.fontSize=CEDIT_O_SIZE+'px';
  if(tc) tc.style.fontSize=CEDIT_T_SIZE+'px';
  return el;
}

function escH(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

function addRow(verse,origText,transHTML,cmtId,afterEl){
  const rid=++RC;
  const el=makeRowEl(rid,verse,'','',cmtId);
  const body=document.getElementById('rows-body');
  if(afterEl) afterEl.insertAdjacentElement('afterend',el);
  else body.appendChild(el);
  // Set orig as plain text (from paste)
  if(origText){
    const oc=el.querySelector(`#oc-${rid} .cedit`);
    if(oc) oc.textContent=origText;
  }
  if(transHTML){
    const tc=el.querySelector(`#tc-${rid} .cedit`);
    if(tc) tc.innerHTML=transHTML;
  }
  recomputeIds();
  return el;
}

function addEmptyRow(afterEl){
  const row=addRow('','','',null,afterEl);
  return row;
}

// addEmptyRow()/addRow() are shared by non-interactive callers too (bulk
// paste-import, session bootstrap, the 'clear' undo/redo op's own internal
// re-render) where pushing a per-row undo entry would be wrong (hundreds of
// spurious entries on import, or a corrupted stack if pushed while already
// inside applyRowUndo/applyRowRedo). This wrapper is for the two genuinely
// interactive call sites only — Ctrl++ and the "Add line" toolbar button —
// so only a deliberate user action becomes undoable.
function addEmptyRowUndoable(afterEl){
  const row=addEmptyRow(afterEl);
  rowPush({type:'row-add', rid:row.dataset.rid, afterRid: afterEl?afterEl.dataset.rid:null});
  return row;
}

/* ════════════════════════════════════════
   DIAGRAM VIEW
   Stage 1: toggle between Phrasing View and
   Diagram View. Both render the SAME row
   data (text, verse, indent) — Diagram View
   adds no new data of its own yet.
════════════════════════════════════════ */
function setEditorView(view){
  // A legacy project may name the retired Slides view; always open safely
  // in Phrasing instead.
  view=['diagram','compare'].includes(view)?view:'phrasing';
  if(view==='compare' && (!ACTIVE_COLLECTION || _collectionAvailableProjects().length<2)){
    toast('Open a Collection with at least two available chapters to compare.');
    return;
  }
  if(EDITOR_VIEW==='compare'&&view!=='compare') clearCompareNotesContext();
  if(view!==EDITOR_VIEW){
    EDITOR_VIEW=view;
    autoSave();
  }
  const isDiagram=EDITOR_VIEW==='diagram';
  const isCompare=EDITOR_VIEW==='compare';
  const isPhrasing=EDITOR_VIEW==='phrasing';
  document.getElementById('tzone').style.display    = isPhrasing?'':'none';
  document.getElementById('dzone').style.display    = isDiagram?'':'none';
  document.getElementById('collection-compare')?.toggleAttribute('hidden',!isCompare);
  // Section strips are measured via getBoundingClientRect() on Phrasing's
  // rows, which are always 0,0,0,0 while tzone is display:none (e.g. a
  // section created from Diagram View) — nothing recomputed them once
  // Phrasing became visible again, so a strip created elsewhere stayed
  // permanently collapsed. Recompute right after rows become visible.
  if(isPhrasing && typeof renderSectionStrips==='function') renderSectionStrips();
  document.getElementById('view-btn-phrasing')?.classList.toggle('active',EDITOR_VIEW==='phrasing');
  document.getElementById('view-btn-diagram')?.classList.toggle('active',isDiagram);
  document.getElementById('view-btn-compare')?.classList.toggle('active',isCompare);
  document.getElementById('dzoom-sep')?.style.setProperty('display',isDiagram?'':'none');
  // Phrasing-only formatting controls (font size, text colour, indent/outdent)
  const phrasingFmt=isPhrasing?'':'none';
  ['phrasing-inline-fmt-grp','phrasing-color-grp','phrasing-indent-grp',
   'phrasing-fmt-sep0','phrasing-fmt-sep1','phrasing-fmt-sep2','phrasing-fmt-sep3']
    .forEach(id=>document.getElementById(id)?.style.setProperty('display',phrasingFmt));
  _updatePhrasingSizeGrpVisibility();
  document.getElementById('dzoom-grp')?.style.setProperty('display',isDiagram?'flex':'none');
  document.getElementById('dfont-grp')?.style.setProperty('display',isDiagram?'flex':'none');
  document.getElementById('dlabel-sep')?.style.setProperty('display',isDiagram?'':'none');
  document.getElementById('tb-add-label')?.style.setProperty('display',isDiagram?'':'none');
  document.getElementById('tb-dem')?.style.setProperty('display',isDiagram?'':'none');
  // Annotation buttons: divider only in phrasing, arrow + bracket only in diagram
  document.getElementById('divider-grp')?.style.setProperty('display',isPhrasing?'flex':'none');
  document.getElementById('psection-grp')?.style.setProperty('display',isPhrasing?'flex':'none');
  document.getElementById('tb-tgl-dgtrans')?.style.setProperty('display',isDiagram?'':'none');
  document.getElementById('dsection-grp')?.style.setProperty('display',isDiagram?'flex':'none');
  document.getElementById('tb-add-arrow')?.style.setProperty('display',isDiagram?'':'none');
  document.getElementById('tb-add-connector')?.style.setProperty('display',isDiagram?'':'none');
  document.getElementById('tb-add-bracket')?.style.setProperty('display',isDiagram?'':'none');
  document.getElementById('tb-add-cmt')?.style.setProperty('display',isDiagram?'':'none');
  // Show exactly one PDF export option in the popup depending on active view
  const phrasePdfBtn =document.getElementById('export-pdf-btn');
  const diagPdfBtn   =document.getElementById('export-diag-pdf-btn');
  if(phrasePdfBtn)  phrasePdfBtn.style.display  =!isDiagram?'':'none';
  if(diagPdfBtn)    diagPdfBtn.style.display     =isDiagram              ?'':'none';
  if(!isDiagram){
    SELECTED_DIAG_RID=null;
    document.querySelectorAll('#dcanvas .dblock.selected').forEach(b=>b.classList.remove('selected'));
    const popup=document.getElementById('conn-edit-popup');
    if(popup) popup.style.display='none';
    cancelRightAngleArm();
  }
  if(isDiagram) renderDiagram();
  if(isCompare) renderCollectionCompare();
  if(isDiagram) syncDiagramWorkspaceUI();
  if(typeof refreshBrackets==='function') setTimeout(()=>refreshBrackets(), 80);
  if(typeof _refreshMobilePanelSections==='function') _refreshMobilePanelSections();
  if(typeof syncWorkspaceChrome==='function') syncWorkspaceChrome();
}

function _repositionCmtCards(isDiagram){
  // Notes are no longer positioned against either editor canvas.
  _syncCommentList();
}

/* Diagram View zoom — applies CSS `zoom` (not `transform`) to #dcanvas so
   every existing rect-based connector/drag calculation keeps working
   unmodified at any zoom level (see the DIAGRAM_ZOOM state comment for
   why `transform:scale` specifically would double-scale connectors). */
// Touch-device zoom path — transform:scale() instead of CSS zoom (see the
// comment in setDiagramZoom for why). transform doesn't affect layout the
// way zoom does, so #dcanvas-scroll's own scrollable area wouldn't
// otherwise grow to include the visually-scaled content at zoom > 100% —
// an invisible spacer sized to the SCALED footprint is added as a
// sibling of #dcanvas (not a wrapper around it, so it isn't itself
// affected by the transform) to force the scroll container to provide
// the correct scrollable area, matching what CSS zoom gives desktop for
// free through its native layout-affecting behavior.
function _applyDiagramZoomTransform(dcanvas){
  if(!dcanvas) return;
  const scroll=document.getElementById('dcanvas-scroll');
  const factor=DIAGRAM_ZOOM/100;

  // Measure the canvas's natural (unscaled) footprint — reset any
  // previous transform first so this measurement isn't itself scaled.
  dcanvas.style.transform='';
  const naturalW=dcanvas.scrollWidth, naturalH=dcanvas.scrollHeight;

  dcanvas.style.transformOrigin='0 0';
  dcanvas.style.transform=`scale(${factor})`;

  if(scroll){
    let spacer=document.getElementById('dzoom-spacer');
    if(!spacer){
      spacer=document.createElement('div');
      spacer.id='dzoom-spacer';
      spacer.style.cssText='position:absolute;top:0;left:0;pointer-events:none;visibility:hidden;';
      scroll.appendChild(spacer);
    }
    spacer.style.width=(naturalW*factor)+'px';
    spacer.style.height=(naturalH*factor)+'px';
  }

  // Counter-scale the SVG connector layers the same way desktop
  // counter-zooms them — these are children of #dcanvas and would
  // otherwise inherit its scale, diverging from _connectorPoint's
  // logical-pixel math.
  const counterFactor=1/factor;
  ['dcard-surfaces','dconns','dconns-back'].forEach(id=>{
    const el=document.getElementById(id);
    if(el){
      el.style.transformOrigin='0 0';
      el.style.transform=`scale(${counterFactor})`;
    }
  });
}

function setDiagramZoom(pct){
  DIAGRAM_ZOOM=Math.max(DIAGRAM_ZOOM_MIN, Math.min(DIAGRAM_ZOOM_MAX, pct));
  const dcanvas=document.getElementById('dcanvas');
  // CSS zoom has a long history of inconsistent cross-browser behavior —
  // desktop (tested extensively throughout this app's development on
  // Chromium) works correctly with it, but WebKit (Safari, and every
  // other iOS "browser" underneath, per Apple's platform requirement)
  // does not reliably apply it here, particularly for the nested
  // counter-zoom trick below. Rather than risk regressing the desktop
  // path that's already proven to work, touch devices get a completely
  // separate transform:scale()-based path instead — standard CSS with
  // consistent behavior everywhere — while desktop's code is untouched.
  const useTransform = window.matchMedia && window.matchMedia('(pointer:coarse)').matches;

  if(!useTransform){
    // ── DESKTOP: unchanged from before this fix ──
    if(dcanvas) dcanvas.style.zoom=String(DIAGRAM_ZOOM/100);
    // Counter-zoom the SVG connector layers so their internal coordinate
    // space stays at logical (unzoomed) pixels — exactly matching what
    // _connectorPoint computes via getBoundingClientRect() subtractions.
    // Without this, the SVGs inherit #dcanvas's zoom and their viewport
    // diverges from the path coordinates, distorting lines at non-100% zoom.
    const counterZoom=String(100/DIAGRAM_ZOOM);
    ['dcard-surfaces','dconns','dconns-back'].forEach(id=>{
      const el=document.getElementById(id);
      if(el) el.style.zoom=counterZoom;
    });
  } else {
    _applyDiagramZoomTransform(dcanvas);
  }
  const label=document.getElementById('dzoom-pct');
  if(label) label.textContent=DIAGRAM_ZOOM+'%';
  // CSS zoom is applied synchronously above, but measuring positions
  // from it immediately (via getBoundingClientRect(), which is what the
  // connector/bracket/label refresh below does) can read stale,
  // pre-zoom layout on some browsers — most notably Safari/WebKit,
  // where zoom's interaction with reflow timing has known quirks that
  // Chromium doesn't share. Deferring one frame gives the browser time
  // to have actually settled the new layout first. Debounced so pinch
  // (which calls this many times per second) doesn't queue a pile of
  // redundant refreshes — only the latest requested one actually runs.
  if(_dzoomRefreshRAF) cancelAnimationFrame(_dzoomRefreshRAF);
  _dzoomRefreshRAF=requestAnimationFrame(()=>{
    _dzoomRefreshRAF=null;
    refreshDiagramConnectors();
    // Re-derive all bracket top/height from fresh DOM rects at the new
    // zoom level so brackets stay locked to their anchor rows after
    // zoom changes.
    if(typeof refreshBrackets==='function') refreshBrackets();
    refreshDiagramLabels();
  });
}
function diagramZoomIn(){ setDiagramZoom(DIAGRAM_ZOOM+DIAGRAM_ZOOM_STEP); }
function diagramZoomOut(){ setDiagramZoom(DIAGRAM_ZOOM-DIAGRAM_ZOOM_STEP); }

function setDiagramFontSize(sz){
  DIAGRAM_FONT_SIZE=Math.max(DIAGRAM_FONT_MIN, Math.min(DIAGRAM_FONT_MAX, sz));
  const canvas=document.getElementById('dcanvas');
  if(canvas) canvas.style.setProperty('--diagram-font', DIAGRAM_FONT_SIZE+'px');
  const lbl=document.getElementById('dfont-sz');
  if(lbl) lbl.textContent=DIAGRAM_FONT_SIZE+'px';
  // Font size changes block dimensions the same way translation-hiding
  // does — same missing-refresh bug, same fix.
  if(typeof refreshDiagramConnectors==='function') refreshDiagramConnectors();
  if(typeof refreshBrackets==='function') refreshBrackets();
  autoSave();
}
function diagramFontInc(){ setDiagramFontSize(DIAGRAM_FONT_SIZE+DIAGRAM_FONT_STEP); }
function diagramFontDec(){ setDiagramFontSize(DIAGRAM_FONT_SIZE-DIAGRAM_FONT_STEP); }

/* Re-render the diagram canvas only if it's the currently visible view.
   Called after any row mutation (add/split/merge/indent/clear/load) so the
   diagram never goes stale while the user is looking at it. Cheap no-op
   when Phrasing View is active — render happens lazily on next toggle. */
function refreshDiagramIfActive(){
  if(EDITOR_VIEW==='diagram') renderDiagram();
}

/* Build one diagram ROW element: Verse cell | Line cell | block.
   Mirrors Phrasing View's column layout (same 60px/52px widths) so blocks
   align to a consistent left baseline instead of each row starting flush
   at the canvas edge — indentation then reads as relative depth within
   that baseline rather than as an absolute, disorienting shift per row.
   Reads the row's CURRENT DOM state directly — no separate diagram data
   model for block content/position; it's a different rendering of the
   same row. Horizontal position is driven by the Original cell's indent
   only (confirmed scope — Translation indent is not represented here). */
/* Build a Diagram View comment badge cell (.drow-cmt-cell). ALWAYS mounted
   for every row (mirrors .drow-pip-cell's always-present pattern) so a
   row's lane width never depends on whether it has a comment — only the
   badge's own visibility toggles (via the .has-cmt class), never the
   cell's presence, which would otherwise shift that row's block relative
   to same-indent rows without a comment. Shared by makeDiagramRowEl
   (initial render) and _dcmtSyncBadge (live add/remove while already in
   Diagram View, e.g. via addCommentOnFocusedRow or comment undo/redo). */
function _buildDiagCmtCell(){
  const cmtCell=document.createElement('div');
  cmtCell.className='drow-cmt-cell';
  const cmtBadge=document.createElement('button');
  cmtBadge.type='button';
  cmtBadge.className='dcmt-badge';
  cmtBadge.setAttribute('aria-label', typeof t==='function'?t('diagram.jump-to-comment'):'Jump to comment');
  cmtBadge.title=typeof t==='function'?t('diagram.jump-to-comment'):'Jump to comment';
  cmtBadge.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  // Read cid live from the cell's own dataset at click time — _dcmtSyncBadge
  // updates an existing cell's cid in place, so a value captured in this
  // closure at build time could go stale.
  cmtBadge.addEventListener('click', ev=>{ ev.stopPropagation(); jumpToCmt(cmtCell.dataset.cid); });
  cmtCell.appendChild(cmtBadge);
  return cmtCell;
}

/* Keep a live #dcanvas diagram block's comment badge in sync with its
   row's dataset.cid, for code paths that add/remove a comment WITHOUT
   going through a full renderDiagram() — e.g. creating a comment via the
   toolbar while already in Diagram View (addCommentOnFocusedRow), closing
   one (closeCmt), or comment undo/redo. No-op if the row isn't currently
   rendered in Diagram View. The .drow-cmt-cell itself is always present
   (see _buildDiagCmtCell) — only its cid/has-cmt state is toggled here. */
function _dcmtSyncBadge(rid){
  const drow=document.querySelector(`#dcanvas .drow[data-rid="${rid}"]`);
  if(!drow) return;
  const block=drow.querySelector('.dblock');
  const cmtCell=drow.querySelector('.drow-cmt-cell');
  if(!block||!cmtCell) return;
  const row=document.querySelector(`.xrow[data-rid="${rid}"]`);
  const cid=row?row.dataset.cid:null;
  if(cid){
    block.dataset.cid=cid;
    cmtCell.dataset.cid=cid;
    cmtCell.classList.add('has-cmt');
  } else {
    delete block.dataset.cid;
    delete cmtCell.dataset.cid;
    cmtCell.classList.remove('has-cmt');
  }
}

function makeDiagramRowEl(row){
  const rid=row.dataset.rid;
  const oc=row.querySelector(`#oc-${rid} .cedit`);
  const indent=oc?parseInt(oc.dataset.indent||'0'):0;
  const vi=row.querySelector('.vin');
  const lid=row.querySelector('.lid');
  const tc=row.querySelector(`#tc-${rid} .cedit`); // null in single-column (IS_SINGLE) sessions

  const dRow=document.createElement('div');
  dRow.className='drow'+(IS_RTL?' rtl':'');
  dRow.dataset.rid=rid;

  const vCell=document.createElement('div');
  vCell.className='dcell dv';
  vCell.textContent=vi?vi.value.trim():'';

  const lCell=document.createElement('div');
  lCell.className='dcell dl';
  const lidText=lid?lid.textContent:'—';
  lCell.textContent=lidText;
  lCell.style.opacity=(lidText==='—')?'.3':'1';

  const lane=document.createElement('div');
  lane.className='dlane';

  const block=document.createElement('div');
  block.className='dblock';
  block.dataset.rid=rid;
  block.tabIndex=0;
  block.setAttribute('role','button');
  block.setAttribute('aria-label', (typeof t==='function'?t('diagram.block.label'):'Diagram block')+' '+(lid?.textContent||''));
  const cid=row.dataset.cid;
  if(cid) block.dataset.cid=cid;
  // Read block.dataset.cid live (not the closed-over cid) so this stays
  // correct even after _dcmtSyncBadge adds/removes a comment later without
  // rebuilding the block.
  block.addEventListener('mouseenter',()=>{
    const liveCid=block.dataset.cid;
    if(!liveCid) return;
    const card=document.querySelector(`.ccard[data-cid="${liveCid}"]`);
    if(card) card.classList.add('row-linked');
  });
  block.addEventListener('mouseleave',()=>{
    const liveCid=block.dataset.cid;
    if(!liveCid) return;
    const card=document.querySelector(`.ccard[data-cid="${liveCid}"]`);
    if(card) card.classList.remove('row-linked');
  });
  const offsetPx=indent*INDENT_PX;
  if(IS_RTL){
    // Mirror Phrasing View's RTL behavior: indent grows toward the right edge,
    // so the block shifts right as indent increases (margin-right pushes it
    // away from the right boundary it would otherwise hug in an RTL flow).
    block.style.marginRight=offsetPx+'px';
  } else {
    block.style.marginLeft=offsetPx+'px';
  }

  const textEl=document.createElement('div');
  textEl.className='dblock-text';
  textEl.setAttribute('data-empty-ph', typeof t==='function'?t('diagram.empty-block'):'(empty)');
  textEl.innerHTML=oc?oc.innerHTML:'';
  block.appendChild(textEl);

  // Right-angle connector handle — sits at the left-edge midpoint (right
  // edge in RTL), drag from it to draw a right-angle line to another
  // block (see startRightAngleDraw). Own mousedown handler stops
  // propagation so it never triggers the block's own drag/indent behavior.
  const raHandle=document.createElement('button');
  raHandle.type='button';
  raHandle.className='dra-handle'+(IS_RTL?' rtl':'');
  raHandle.setAttribute('aria-label', typeof t==='function'?t('diagram.link.handle'):'Draw relationship');
  raHandle.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/></svg>';
  raHandle.style.touchAction='none';
  raHandle.addEventListener('pointerdown', ev=>{ startDiagramHandleDraw(ev, rid); });
  block.appendChild(raHandle);

  lane.appendChild(block);
  block.style.touchAction='none';
  block.addEventListener('pointerdown', ev=>startBlockDrag(ev, rid));
  block.addEventListener('click', ev=>{
    // Select this block (gold outline). Shift+click is a bracket gesture and
    // Ctrl+click is a connector draw gesture — ignore both for selection.
    if(ev.shiftKey||ev.ctrlKey) return;
    ev.stopPropagation(); // don't bubble to canvas deselect listener
    selectDiagBlock(rid);
  });
  block.addEventListener('keydown', ev=>{
    if(ev.key==='Enter'||ev.key===' '){ ev.preventDefault(); selectDiagBlock(rid); }
    if((ev.key==='l'||ev.key==='L')&&!ev.metaKey&&!ev.ctrlKey){ ev.preventDefault(); raHandle.focus(); }
  });

  // Translation line: a SIBLING of the block (not nested inside it), so the
  // block's own bounding box — which indent-drag and connector geometry
  // both key off — stays exactly the Original-text content's box, never
  // including the translation. Sits directly below the block with a fixed,
  // non-adjustable gap (--trans-gap below, no spacing control). Only
  // rendered for two-column sessions (tc is null entirely in IS_SINGLE
  // sessions, nothing to show or edit).
  if(tc){
    const transEl=document.createElement('div');
    transEl.className='dblock-trans'+(IS_RTL?' rtl':'');
    transEl.contentEditable='true';
    transEl.spellcheck=false;
    transEl.setAttribute('data-empty-ph', typeof t==='function'?t('diagram.empty-trans'):'(translation)');
    transEl.innerHTML=tc.innerHTML;
    // Match the block's horizontal indent offset so the translation lines
    // up under its own block rather than the canvas edge.
    if(IS_RTL){ transEl.style.marginRight=offsetPx+'px'; }
    else       { transEl.style.marginLeft=offsetPx+'px'; }
    // Live-sync every keystroke back into the REAL Translation cell in
    // Phrasing View's DOM — this is editing the same underlying data, not
    // a copy, so toggling back to Phrasing View immediately shows the
    // edit (matches how the Original-text block already works, and
    // mirrors the existing Phrasing View Translation cell's own behavior).
    transEl.addEventListener('input', ()=>{
      // Same normalization Phrasing View's cells get via cleanEmptyCell()
      // (app.js) — contenteditable elements routinely leave a stray <br>
      // behind after a select-all-and-delete, which defeats the CSS
      // :empty selector the placeholder depends on even though the box
      // looks blank. Only the trim-and-clear core applies here (unlike
      // cleanEmptyCell itself, which also does Phrasing-toolbar-specific
      // cleanup that doesn't apply to this Diagram View field).
      if(transEl.innerText.trim()==='') transEl.innerHTML='';
      const liveTc=document.querySelector(`#tc-${rid} .cedit`);
      if(liveTc) liveTc.innerHTML=transEl.innerHTML;
      autoSave();
    });
    // Also sync on blur as a defensive fallback (covers any edge case
    // where an 'input' event might not fire, e.g. some IME composition
    // flows) — matches the onblur="autoSave()" pattern Phrasing View cells
    // already use.
    transEl.addEventListener('blur', ()=>{
      if(transEl.innerText.trim()==='') transEl.innerHTML='';
      const liveTc=document.querySelector(`#tc-${rid} .cedit`);
      if(liveTc) liveTc.innerHTML=transEl.innerHTML;
      // Shares the 't' key with #tc-{rid} .cedit's own snap (see
      // _textFocusSnap/_textBlurSnap) — this box just mirrors that same
      // underlying cell, so an edit made here lands in the same
      // undoable slot as one made directly in Phrasing View.
      _textBlurSnap(transEl,rid,'t');
      autoSave();
    });
    transEl.addEventListener('focus', ()=>{ trackFocus(transEl, rid); _textFocusSnap(transEl,rid,'t'); });
    // Prevent Shift+drag-to-connect / plain-drag-to-indent from triggering
    // when interacting with the translation text itself — it's a normal
    // editable text field, not a draggable block.
    transEl.addEventListener('pointerdown', ev=>ev.stopPropagation());
    lane.appendChild(transEl);
  }

  // Always: verse | line | lane | spacer | comment badge | pip — same in LTR and RTL
  dRow.appendChild(vCell);
  dRow.appendChild(lCell);
  dRow.appendChild(lane);

  // Comment badge cell — ALWAYS mounted (mirrors the pip cell below) so
  // every row's lane keeps the same width whether or not it has a
  // comment; only the badge icon's own visibility toggles via .has-cmt.
  // Clicking it scrolls #cmargin to the linked card.
  const cmtCell=_buildDiagCmtCell();
  if(cid){ cmtCell.dataset.cid=cid; cmtCell.classList.add('has-cmt'); }
  dRow.appendChild(cmtCell);

  // Pip cell — margin-left:auto pushes it flush to the right edge
  const pipCell = document.createElement('div');
  pipCell.className = 'drow-pip-cell';
  const pipDot = document.createElement('div');
  pipDot.className = 'dbrk-pip';
  pipDot.dataset.rid = rid;
  pipDot.addEventListener('mousedown', ev=>{
    // Fire in two cases: Shift held (classic gesture) OR brk-locked mode (toolbar button active)
    if(!ev.shiftKey && !document.body.classList.contains('brk-locked')) return;
    ev.preventDefault();
    ev.stopPropagation();
    _brkHandleClick(rid, pipDot);
  });
  pipCell.appendChild(pipDot);
  dRow.appendChild(pipCell);

  return dRow;
}

/* Render the full Diagram View canvas from current row DOM state.
   Blocks render in sequential order (Stage 1), draggable horizontally for
   indent (Stage 2), with connectors drawn block-to-block by row ID
   (Stage 3+). Two SVG overlay layers sandwich the blocks: #dconns-back is
   created FIRST (so it paints BEHIND every block — right-angle connectors
   live here) and #dconns is created LAST (so it paints IN FRONT of every
   block — curve connectors live here). */
/* Builds one Diagram View Section Divider marker: 'start' (full editable
   label, appears before the section's first row) or 'end' (a plain
   closing line, no label — just marks where the range concludes,
   appears after the section's last row). Uses real flex-child line
   segments rather than a border-top + per-element transform hack, so
   every child shares one align-items:center row and can't drift out of
   vertical alignment with each other. */
/* Section gutter preview (Diagram View): a faint, non-interactive
   indicator in the verse-number gutter showing a section's full
   startRid..endRid range on hover/tap — same visual language as the
   Phrasing-side .sec-strip, but transient and much fainter, since this
   is a preview, not a persistent/editable element. */
let _secPreviewPinned=false, _secPreviewAnnId=null, _secPreviewTimer=null;
function _showSecGutterPreview(ann){
  const canvas=document.getElementById('dcanvas'); if(!canvas) return;
  const startBlk=canvas.querySelector(`.dblock[data-rid="${ann.startRid}"]`);
  const endBlk=canvas.querySelector(`.dblock[data-rid="${ann.endRid}"]`)||startBlk;
  if(!startBlk) return;
  _secPreviewAnnId=ann.id;
  let bar=document.getElementById('dsec-gutter-preview');
  if(!bar){
    bar=document.createElement('div');
    bar.id='dsec-gutter-preview';
    canvas.appendChild(bar);
  }
  const canvasRect=canvas.getBoundingClientRect();
  const startRect=startBlk.getBoundingClientRect();
  const endRect=endBlk.getBoundingClientRect();
  const top=Math.min(startRect.top,endRect.top)-canvasRect.top+canvas.scrollTop;
  const bottom=Math.max(startRect.bottom,endRect.bottom)-canvasRect.top+canvas.scrollTop;
  bar.style.top=top+'px';
  bar.style.height=Math.max(20,bottom-top)+'px';
  bar.style.setProperty('--sec-color', ann.color||'#534AB7');
  bar.classList.add('visible');
}
function _hideSecGutterPreview(){
  _secPreviewAnnId=null;
  const bar=document.getElementById('dsec-gutter-preview');
  if(bar) bar.classList.remove('visible');
}
// Tap elsewhere to dismiss a pinned preview
document.addEventListener('click',ev=>{
  if(!_secPreviewPinned) return;
  if(ev.target.closest('.dsec-start')) return; // handled by the element's own click handler
  _secPreviewPinned=false;
  _hideSecGutterPreview();
});

function _makeDiagramSectionEl(ann, kind){
  const el=document.createElement('div');
  el.className='dsec-divider dsec-'+kind;
  el.dataset.annId=ann.id;
  el.style.setProperty('--sec-color', ann.color||'#534AB7');

  const leadLine=document.createElement('div');
  leadLine.className='dsec-line dsec-line-lead';

  el.appendChild(leadLine);

  if(kind==='start'){
    const label=document.createElement('div');
    label.className='dsec-label';
    label.contentEditable='true';
    label.spellcheck=false;
    label.setAttribute('data-ph', typeof t==='function'?t('ann.section.ph'):'Section…');
    label.textContent=ann.label||'';
    label.addEventListener('input',()=>{ ann.label=label.textContent.trim(); autoSave(); });
    label.addEventListener('focus',()=>{ _annLabelFocusSnap(ann.id,label); });
    label.addEventListener('blur',()=>{ ann.label=label.textContent.trim(); _annLabelBlurSnap(ann.id,ann); autoSave(); });
    label.addEventListener('mousedown',ev=>ev.stopPropagation());
    label.addEventListener('pointerdown',ev=>ev.stopPropagation());
    el.appendChild(label);

    const swatch=document.createElement('input');
    swatch.type='color'; swatch.className='dsec-color';
    swatch.value=ann.color||'#534AB7';
    swatch.title=typeof t==='function'?t('ann.color'):'Color';
    swatch.addEventListener('mousedown',ev=>ev.stopPropagation());
    swatch.addEventListener('pointerdown',ev=>ev.stopPropagation());
    swatch.addEventListener('change',()=>{
      const oldVal=ann.color;
      ann.color=swatch.value;
      document.querySelectorAll(`.dsec-divider[data-ann-id="${ann.id}"]`)
        .forEach(d=>d.style.setProperty('--sec-color', ann.color));
      autoSave();
      rowPush({type:'ann-edit', annId:ann.id, prop:'color', oldVal, newVal:ann.color});
    });
    el.appendChild(swatch);

    const del=document.createElement('button');
    del.className='dsec-del';
    del.title=typeof t==='function'?t('ann.delete'):'Delete annotation';
    del.innerHTML='✕';
    del.addEventListener('mousedown',ev=>ev.stopPropagation());
    del.addEventListener('pointerdown',ev=>ev.stopPropagation());
    del.addEventListener('click',ev=>{ ev.stopPropagation(); deleteSection(ann.id); });
    el.appendChild(del);

    // Hover (desktop) / tap (touch) preview of the section's full range as
    // a faint gutter indicator, independent of the end-line toggle above —
    // lets you see the scope even when end lines are hidden. Single
    // tap/click shows briefly then auto-hides; double-click/double-tap
    // pins it until dismissed by tapping the line again or tapping
    // elsewhere. Mouse hover always shows/hides live and ignores the
    // pinned state entirely EXCEPT that leaving a pinned preview up
    // doesn't get cleared by an unrelated mouseleave.
    el.addEventListener('mouseenter',()=>{ if(!_secPreviewPinned) _showSecGutterPreview(ann); });
    el.addEventListener('mouseleave',()=>{ if(!_secPreviewPinned) _hideSecGutterPreview(); });
    el.addEventListener('click',ev=>{
      if(ev.target===del||ev.target===swatch||ev.target===label) return;
      if(_secPreviewPinned && _secPreviewAnnId===ann.id){
        _secPreviewPinned=false; _hideSecGutterPreview(); return;
      }
      _showSecGutterPreview(ann);
      clearTimeout(_secPreviewTimer);
      _secPreviewTimer=setTimeout(()=>{ if(!_secPreviewPinned) _hideSecGutterPreview(); }, 1800);
    });
    el.addEventListener('dblclick',ev=>{
      if(ev.target===del||ev.target===swatch||ev.target===label) return;
      clearTimeout(_secPreviewTimer);
      _secPreviewPinned=true;
      _showSecGutterPreview(ann);
    });
  } else {
    // 'end' marker: nothing more than the short lead line, same length
    // and color as the start marker's own lead line — deliberately NOT
    // full-width, so it doesn't interfere with labels/brackets/etc.
    // sitting further right in the diagram.
  }

  return el;
}

function renderDiagram(){
  const canvas=document.getElementById('dcanvas');
  if(!canvas) return;
  // Apply current font size as a CSS custom property so all blocks inherit it
  canvas.style.setProperty('--diagram-font', DIAGRAM_FONT_SIZE+'px');
  canvas.style.paddingRight = IS_RTL ? '25%' : '';
  // A full rebuild (triggered by row mutations elsewhere — adding a row,
  // editing text, etc. — while Diagram View happens to be showing) wipes
  // and recreates every block/SVG node. If a right-angle line is
  // currently armed (click-then-click gesture), its rubber band and
  // source-block reference would go stale/detached — cancel it first
  // rather than leaving broken listeners silently attached.
  cancelRightAngleArm();
  canvas.innerHTML='';

  const cardSurfaceSvg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  cardSurfaceSvg.id='dcard-surfaces';
  cardSurfaceSvg.setAttribute('preserveAspectRatio','none');
  canvas.appendChild(cardSurfaceSvg);

  const backSvg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  backSvg.id='dconns-back';
  backSvg.setAttribute('preserveAspectRatio','none');
  canvas.appendChild(backSvg);

  // Card surfaces, then relationship lines, then the transparent row/text
  // layer form the Diagram's visual stack. Arrows visibly cross the paper
  // cards without ever painting over words or controls.
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.id='dconns';
  svg.setAttribute('preserveAspectRatio','none');
  canvas.appendChild(svg);

  // Labels layer — kept as a structural placeholder but labels and brackets
  // are now appended directly to #dcanvas (position:relative), not here.
  // This avoids any counter-zoom % resolution complexity.
  const labelsLayer=document.createElement('div');
  labelsLayer.id='dlabels-layer';
  labelsLayer.style.cssText='position:absolute;inset:0;overflow:visible;pointer-events:none;';
  canvas.appendChild(labelsLayer);

  const rows=_realRows();
  const startByRid={}, endByRid={};
  ANNOTATIONS.filter(a=>a.type==='section').forEach(a=>{
    startByRid[a.startRid]=a;
    endByRid[a.endRid]=a;
  });
  rows.forEach(row=>{
    const startSec=startByRid[row.dataset.rid];
    if(startSec) canvas.appendChild(_makeDiagramSectionEl(startSec,'start'));
    canvas.appendChild(makeDiagramRowEl(row));
    const endSec=endByRid[row.dataset.rid];
    // A single-row section (startRid===endRid) correctly gets BOTH its
    // start marker (before the row) and end marker (after the same row)
    // — bracketing that one row on both sides.
    if(endSec) canvas.appendChild(_makeDiagramSectionEl(endSec,'end'));
  });

  const hasDiagramContent=rows.some(row=>row.querySelector('.cedit')?.innerText.trim());
  if(!rows.length || !hasDiagramContent){
    canvas.querySelectorAll('.drow,.dsec-divider').forEach(el=>el.remove());
    const empty=document.createElement('div');
    empty.className='diagram-empty-state';
    empty.innerHTML=`<strong>${escH(typeof t==='function'?t('diagram.empty.title'):'Build a visual reading of the passage')}</strong><span>${escH(typeof t==='function'?t('diagram.empty.body'):'Add phrasing rows, then connect semantic or structural relationships here.')}</span><div class="diagram-empty-legend"><span class="semantic">⌒ ${escH(typeof t==='function'?t('diagram.link.semantic'):'Semantic')}</span><span class="structural">⌟ ${escH(typeof t==='function'?t('diagram.link.structural'):'Structural')}</span></div>`;
    canvas.appendChild(empty);
    syncDiagramWorkspaceUI();
    return;
  }
  // Curve connectors can anchor to a specific word (fromWordIdx/toWordIdx),
  // resolved by looking up the Nth .ann-word span in the target block —
  // but .ann-word spans only get created lazily (Ctrl-press or entering
  // connector mode). A rebuild from ANY other trigger (switching views,
  // editing a row, hiding translations, ...) wipes and recreates every
  // block with plain unwrapped text, so a word-anchored connector would
  // fail to find its word and fall back to a block-level point instead —
  // same "must be tokenized before connectors resolve" requirement the
  // DIAGRAM_EDIT_MODE re-tokenization a few lines below already handles
  // for its own system; connectors just needed the same treatment.
  document.querySelectorAll('#dcanvas .dblock').forEach(blk=>_wrapBlockTextWords_single(blk));
  renderDiagramConnectors();
  renderDiagramLabels();
  refreshDiagramLabels();
  // Add pip handles to diagram blocks and render any existing brackets
  if(typeof _brkSyncPips==='function') _brkSyncPips();
  if(typeof _brkRenderDiagram==='function') setTimeout(()=>_brkRenderDiagram(), 20);
  // Re-render diagram annotations (arrows, spans, arcs)
  setTimeout(()=>renderAnnLayer(), 30);
  // Re-apply diagram edit mode after rebuild so blocks are re-tokenized
  if(DIAGRAM_EDIT_MODE) setTimeout(()=>_applyDiagramEditMode(true), 50);
}

/* Serializes a plain-text contenteditable's live DOM into a string with
   real newlines — a bare contenteditable has no explicit Enter handling,
   so the browser inserts <div>/<br> children instead of literal "\n",
   which Node.textContent silently drops at those element boundaries. */
function _ceTextWithNewlines(el){
  let out='';
  el.childNodes.forEach(node=>{
    if(node.nodeType===Node.TEXT_NODE){
      out+=node.nodeValue;
    } else if(node.nodeType===Node.ELEMENT_NODE){
      if(node.nodeName==='BR'){
        out+='\n';
      } else if(node.nodeName==='DIV'||node.nodeName==='P'){
        if(out && !out.endsWith('\n')) out+='\n';
        out+=_ceTextWithNewlines(node);
        if(!out.endsWith('\n')) out+='\n';
      } else {
        out+=_ceTextWithNewlines(node);
      }
    }
  });
  return out;
}

/* Build and mount one .dlabel element from a data object.
   Called both by renderDiagramLabels (rebuild) and addDiagramLabel (new). */
function _makeLabelEl(lb){
  const canvas=document.getElementById('dcanvas');
  if(!canvas) return null;

  const el=document.createElement('div');
  el.className='dlabel';
  el.dataset.lid=lb.id;
  el.style.left=lb.x+'%'; el.style.right='auto';
  el.style.top=lb.y+'%';
  el.style.width=(lb.width||140)+'px';

  // ── Bar (drag handle + delete button) ───────────────────────────────
  const bar=document.createElement('div');
  bar.className='dlabel-bar';

  const del=document.createElement('button');
  del.className='dlabel-del';
  del.type='button';
  del.setAttribute('aria-label', typeof t==='function'?t('diagram.delete-label'):'Delete label');
  del.innerHTML='&times;';
  del.addEventListener('pointerdown', ev=>ev.stopPropagation());
  del.addEventListener('click', ()=>{
    const snapshot={...lb};
    DIAGRAM_DATA.labels=DIAGRAM_DATA.labels.filter(l=>l.id!==lb.id);
    el.remove();
    autoSave();
    rowPush({type:'labelremove', id:lb.id, snapshot});
  });
  bar.appendChild(del);
  el.appendChild(bar);

  // ── Text area ────────────────────────────────────────────────────────
  const txt=document.createElement('div');
  txt.className='dlabel-txt';
  txt.contentEditable='true';
  txt.spellcheck=false;
  txt.setAttribute('data-ph', typeof t==='function'?t('diagram.label-ph'):'Label…');
  txt.textContent=lb.text||'';
  txt.addEventListener('input', ()=>{
    const found=DIAGRAM_DATA.labels.find(l=>l.id===lb.id);
    if(found) found.text=_ceTextWithNewlines(txt).replace(/\n+$/,'');
    autoSave();
  });
  txt.addEventListener('keydown', ev=>{
    if((ev.ctrlKey||ev.metaKey)&&!ev.altKey){
      if(ev.key==='z'||ev.key==='Z'){ ev.preventDefault(); undo(); }
      if(ev.key==='y'||ev.key==='Y'){ ev.preventDefault(); redo(); }
    }
  });
  txt.addEventListener('pointerdown', ev=>ev.stopPropagation());
  el.appendChild(txt);

  // ── Width resize grip ────────────────────────────────────────────────
  const grip=document.createElement('div');
  grip.className='dlabel-grip';
  grip.style.touchAction='none';
  grip.addEventListener('pointerdown', ev=>{
    ev.preventDefault();ev.stopPropagation();
    const startX=ev.clientX, startW=el.offsetWidth;
    function onMove(e){
      if(_pinchActive) return;
      const dx=e.clientX-startX;
      const newW=Math.max(80, startW+dx);
      el.style.width=newW+'px';
      const found=DIAGRAM_DATA.labels.find(l=>l.id===lb.id);
      if(found) found.width=newW;
    }
    function onUp(){
      document.removeEventListener('pointermove',onMove);
      document.removeEventListener('pointerup',onUp);
      autoSave();
    }
    document.addEventListener('pointermove',onMove);
    document.addEventListener('pointerup',onUp);
  });
  el.appendChild(grip);

  // ── Label drag (via bar) ─────────────────────────────────────────────
  bar.style.touchAction='none';
  bar.addEventListener('pointerdown', ev=>{
    if(ev.target===del) return;
    if(ev.shiftKey) return;
    ev.preventDefault();ev.stopPropagation();
    const startX=ev.clientX, startY=ev.clientY;
    const startPctX=lb.x, startPctY=lb.y;
    const beforeSnap={x:lb.x, y:lb.y};
    let didMove=false;
    function onMove(e){
      if(_pinchActive) return;
      didMove=true;
      const zr=DIAGRAM_ZOOM/100;
      const cW=canvas.clientWidth||1;
      const cH=canvas.clientHeight||1;
      const dx=(e.clientX-startX)/zr, dy=(e.clientY-startY)/zr;
      const newPctX=Math.max(0, startPctX+(dx/cW*100));
      const newPctY=Math.max(0, startPctY+(dy/cH*100));
      el.style.left=newPctX+'%'; el.style.right='auto';
      el.style.top=newPctY+'%';
      const found=DIAGRAM_DATA.labels.find(l=>l.id===lb.id);
      if(found){found.x=newPctX;found.y=newPctY;lb.x=newPctX;lb.y=newPctY;}
    }
    function onUp(){
      document.removeEventListener('pointermove',onMove);
      document.removeEventListener('pointerup',onUp);
      if(didMove){
        const afterSnap={x:lb.x, y:lb.y};
        if(JSON.stringify(beforeSnap)!==JSON.stringify(afterSnap)){
          rowPush({type:'lblsnap',id:lb.id,before:beforeSnap,after:afterSnap});
        }
        autoSave();
      }
    }
    document.addEventListener('pointermove',onMove);
    document.addEventListener('pointerup',onUp);
  });

  canvas.appendChild(el);
  return el;
}
function renderDiagramLabels(){
  DIAGRAM_DATA.labels.forEach(lb=>_makeLabelEl(lb));
}

function refreshDiagramLabels(){
  if(EDITOR_VIEW!=='diagram') return;
  const canvas=document.getElementById('dcanvas');
  if(!canvas) return;
  canvas.querySelectorAll('.dlabel').forEach(el=>el.remove());
  DIAGRAM_DATA.labels.forEach(lb=>_makeLabelEl(lb));
}

function addDiagramLabel(){
  const canvas=document.getElementById('dcanvas');
  if(!canvas) return;
  const cRect=canvas.getBoundingClientRect();
  const zoomR=DIAGRAM_ZOOM/100;
  // clientWidth/clientHeight are what CSS uses to resolve left:% / top:%
  // on abs-positioned children of #dcanvas. Store lb.x/lb.y as % of these
  // so that el.style.left = lb.x+'%' always lands exactly where intended.
  const cW=canvas.clientWidth||1;
  const cH=canvas.clientHeight||1;
  const labelW=140;
  const BRACKET_GAP=8, BRACKET_W=14;
  // Find rightmost block. BCR gives visual px; divide by zoomR for layout px
  // (layout px == clientWidth units, the right space to divide into).
  let maxBlockRight=-Infinity;
  canvas.querySelectorAll('.drow .dblock').forEach(blk=>{
    const r=(blk.getBoundingClientRect().right-cRect.left)/zoomR;
    if(r>maxBlockRight) maxBlockRight=r;
  });
  if(maxBlockRight===-Infinity) maxBlockRight=cW*0.3;
  const defaultX=Math.min(99,(maxBlockRight+BRACKET_GAP+BRACKET_W+4)/cW*100);
  // Place label near the current scroll position, not a fixed 10% of clientHeight.
  const scrollTop=canvas.parentElement?canvas.parentElement.scrollTop:0;
  const defaultY=Math.max(1,(scrollTop+20)/cH*100);
  const lb={id:++LBL, text:'', x:defaultX, y:defaultY, width:labelW};
  DIAGRAM_DATA.labels.push(lb);
  const el=_makeLabelEl(lb);
  rowPush({type:'labeladd', id:lb.id, snapshot:{...lb}});
  if(el){
    const txtEl=el.querySelector('.dlabel-txt');
    if(txtEl) setTimeout(()=>txtEl.focus(),50);
  }
  autoSave();
}

/* ── Diagram View: drag-to-indent ──
   Blocks are draggable HORIZONTALLY ONLY — vertical row order is always
   fixed; dragging only changes the row's indent level. The drag follows
   the mouse continuously but the block's rendered position snaps to
   INDENT_PX (32px) increments live, so the user always sees exactly
   which indent level they're about to commit to. Indent is only
   committed (pushed to the undo stack via setRowIndent) on mouseup, and
   only if it actually changed — a plain click with no real movement
   does nothing, so it doesn't pollute Ctrl+Z history.
   Shift+drag on a block instead starts drawing a CONNECTOR (see
   startConnectorDraw below) rather than moving the block. */
function startBlockDrag(ev, rid){
  if(ev.button!==0) return; // left mouse button only
  // Split Words owns presses on its temporary word tokens. Do not begin an
  // indent drag before that click has had a chance to create a new row.
  if(DIAGRAM_EDIT_MODE && ev.target.closest('.dedit-word')) return;
  if(ev.ctrlKey || _connectorModeActive){
    ev.preventDefault();
    ev.stopPropagation();
    if(DIAGRAM_NEW_CONNECTOR_KIND==='rightangle') startRightAngleDraw(ev, rid);
    else startConnectorDraw(ev, rid);
    return;
  }
  ev.preventDefault();
  ev.stopPropagation();

  const block=ev.currentTarget||ev.target.closest('.dblock');
  if(!block) return;
  const row=document.querySelector(`.xrow[data-rid="${rid}"]`);
  const ce=row?row.querySelector(`#oc-${rid} .cedit`):null;
  if(!ce) return;

  const startIndent=parseInt(ce.dataset.indent||'0');
  const startX=ev.clientX;
  const rtl=IS_RTL;
  const dRow=block.closest('.drow');
  let liveIndent=startIndent;
  let dragged=false;

  block.classList.add('dragging');

  const onMove=mv=>{
    if(_pinchActive) return;
    const dxRaw=mv.clientX-startX;
    // Mirror RTL: dragging LEFT increases indent in an RTL session,
    // dragging RIGHT increases indent in LTR — matches applyIndentStyle()'s
    // margin-right-grows-with-indent behavior for Hebrew sessions.
    const dx=rtl?-dxRaw:dxRaw;
    if(Math.abs(dx)>3) dragged=true;
    const deltaLevels=Math.round(dx/INDENT_PX);
    liveIndent=Math.max(0, startIndent+deltaLevels);
    const offsetPx=liveIndent*INDENT_PX;
    if(rtl){ block.style.marginRight=offsetPx+'px'; }
    else   { block.style.marginLeft=offsetPx+'px'; }
    if(dRow){ dRow.classList.add('indent-preview'); dRow.style.setProperty('--indent-preview',offsetPx+'px'); }
    // Connectors attached to this block must reroute LIVE during the drag,
    // not just snap-and-recalculate after drop.
    refreshDiagramConnectors();
    // Brackets reposition live too — all brackets recalc from current block positions
    if(typeof refreshBrackets==='function') refreshBrackets();
  };

  const onUp=()=>{
    document.removeEventListener('pointermove',onMove);
    document.removeEventListener('pointerup',onUp);
    block.classList.remove('dragging');
    if(dRow){ dRow.classList.remove('indent-preview'); dRow.style.removeProperty('--indent-preview'); }
    if(dragged && liveIndent!==startIndent){
      setRowIndent(rid, liveIndent); // commits + pushes to ROW_STACK + re-renders (which redraws connectors too)
    } else {
      // No real drag occurred (just a click) — snap back to the indent
      // we started at rather than leaving any stray inline offset.
      const offsetPx=startIndent*INDENT_PX;
      if(rtl){ block.style.marginRight=offsetPx+'px'; }
      else   { block.style.marginLeft=offsetPx+'px'; }
      refreshDiagramConnectors();
    }
  };

  document.addEventListener('pointermove',onMove);
  document.addEventListener('pointerup',onUp);
}

/* Converts a connector's stored fractional offset into actual #dcanvas-
   relative coordinates for the block's CURRENT size/position. Top/bottom-
   snapped points land a few px INSIDE the block rather than exactly on
   its border, so the line visually overlaps the block slightly instead
   of just touching its edge. (Right-angle connectors use fracX 0 or 1 —
   left/right edge — which gets no horizontal inset; only fracY 0/1 get
   the vertical inset, per the curve connector's original spec.) */
const CONN_EDGE_INSET=6;
const WORD_ARROW_CLEARANCE=0; // arrowhead tip sits right at the word edge

function _connectorPoint(el, fracX, fracY, canvasRect, wordIdx){
  // Word-level anchor: return a preliminary point at the word CENTER plus the
  // word's rect so _makeCurveConnectorEl can pick the correct edge (top/bottom)
  // after computing direction from both midpoints in a two-pass approach.
  // wordTop/wordBottom are the outer edges of the word (arrowhead clears by WORD_ARROW_CLEARANCE).
  if(wordIdx!=null){
    const words=el.querySelectorAll('.ann-word');
    const wordEl=words[wordIdx];
    if(wordEl){
      const wr=wordEl.getBoundingClientRect();
      const canvas=document.getElementById('dcanvas');
      const scrollTop=canvas?canvas.scrollTop:0;
      return {
        x:(wr.left+wr.right)/2-canvasRect.left,
        y:(wr.top+wr.bottom)/2-canvasRect.top+scrollTop,
        // Place endpoints just OUTSIDE the word so the arrowhead tip clears the text
        wordTop:   wr.top    - canvasRect.top + scrollTop - WORD_ARROW_CLEARANCE,
        wordBottom:wr.bottom - canvasRect.top + scrollTop + WORD_ARROW_CLEARANCE,
        isWord:true
      };
    }
  }
  // Block-level anchor (original behaviour)
  const r=el.getBoundingClientRect();
  let y=r.top-canvasRect.top + r.height*fracY;
  if(fracY===0) y+=CONN_EDGE_INSET;
  else if(fracY===1) y-=CONN_EDGE_INSET;
  return {
    x: r.left-canvasRect.left + r.width*fracX,
    y
  };
}

const PATTERN_DASH={solid:'none', dotted:'4,4'};

/* BibleArc-style S-curve (one cubic Bézier with a single inflection).
   Both control points sit DIRECTLY ABOVE/BELOW their endpoints — c1
   below the source, c2 above the target (mirrored when travelling
   upward) — giving purely VERTICAL tangents at both ends: the line
   departs the source heading straight down, sweeps diagonally across
   with one smooth inflection at the middle, then straightens back to
   vertical so the arrowhead drops straight into the target word, like
   the reference design's hand-drawn arrows. No sideways belly.
   Because the shape is horizontally symmetric it needs no RTL
   special-casing, and when dx≈0 it degrades gracefully to a clean
   straight vertical drop — so this one formula also covers the
   near-vertical cases that previously needed separate variants.
   V (how far each vertical run extends before the diagonal) scales
   with the vertical span, capped so very long connectors keep a
   readable diagonal rather than two enormous vertical tails.
   fromY/toY are accepted for signature compatibility with callers (and
   the rubber-band preview passes toY=null for the live cursor end) but
   the tangent direction is derived from dy directly, which handles
   snapped and unsnapped ends identically. */
function _connectorPathD(p1,p2,fromY,toY){
  const dy=p2.y-p1.y;
  const absDy=Math.abs(dy);
  const absDx=Math.abs(p2.x-p1.x);
  const vSign=dy>=0?1:-1;

  // V scales with whichever is larger: the vertical span, or a fraction
  // of the horizontal span. A short-but-wide hop (adjacent rows, words
  // far apart horizontally) previously got the same tiny V as a
  // short-and-narrow one, leaving almost no vertical room to execute the
  // diagonal — the curve had to whip sideways abruptly, looking pinched/
  // cramped. Factoring in dx gives it the room it actually needs to bend
  // gracefully, without changing already-fine narrow or long-distance cases.
  const V=Math.min(100, Math.max(20, Math.max(absDy*0.4, absDx*0.15)));

  const c1x=p1.x, c1y=p1.y+vSign*V; // straight down (or up) out of the source
  const c2x=p2.x, c2y=p2.y-vSign*V; // straight down (or up) into the target

  return `M${p1.x},${p1.y} C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
}

/* Item-1 redesign: EVERY right-angle connector routes through the SAME
   shared "trunk" column — a fixed x-position just outside the shallowest
   (LTR) or deepest (RTL) block CURRENTLY RENDERED, not the canvas's
   absolute edge. Using the canvas edge put the trunk behind the Verse/
   Line label columns for lightly-indented blocks, producing a needlessly
   long detour — this instead hugs the actual content, so the jut stays
   short unless a block genuinely is deeply indented.
   Why a SHARED column rather than a per-connector "route around
   whichever of these two blocks is shallower": a per-pair approach can't
   guarantee clearing a THIRD, unrelated, even-shallower block that
   happens to sit between them — only a column outside EVERY block,
   shared by every connector, guarantees the vertical run is never
   occluded, keeping right-angle lines clickable everywhere along their
   length (they render behind blocks by design, per the original
   "structural lines shouldn't obscure text" requirement — the trunk
   column is what makes "behind blocks" and "still clickable" compatible).
   Note: for an unindented (indent 0) block, this can still land within
   the Verse/Line gutter area — see the .dcell{pointer-events:none} CSS
   rule, which ensures those label columns never intercept a click meant
   for a connector passing behind them either. */
const RIGHTANGLE_TRUNK_MARGIN=8; // px outside the shallowest/deepest actual block edge — kept small for a tight jut
function _rightAngleTrunkX(canvas, canvasRect){
  const blocks=canvas.querySelectorAll('.dblock');
  if(blocks.length===0){
    // No blocks rendered — right-angle connectors can't exist without at
    // least two blocks anyway, but fall back to a small canvas-edge
    // margin defensively rather than producing NaN/Infinity.
    return IS_RTL ? (canvas.scrollWidth-RIGHTANGLE_TRUNK_MARGIN) : RIGHTANGLE_TRUNK_MARGIN;
  }
  if(IS_RTL){
    let maxRight=-Infinity;
    blocks.forEach(b=>{
      const right=b.getBoundingClientRect().right-canvasRect.left;
      if(right>maxRight) maxRight=right;
    });
    return Math.min(canvas.scrollWidth, maxRight+RIGHTANGLE_TRUNK_MARGIN);
  }
  let minLeft=Infinity;
  blocks.forEach(b=>{
    const left=b.getBoundingClientRect().left-canvasRect.left;
    if(left<minLeft) minLeft=left;
  });
  return Math.max(0, minLeft-RIGHTANGLE_TRUNK_MARGIN);
}

/* All right-angle connectors always route through the shared trunk column
   (out to trunkX, full vertical run, then jog into the target edge).
   The jut is kept short by the small RIGHTANGLE_TRUNK_MARGIN above. */
function _rightAnglePathD(p1,p2,trunkX){
  return `M${p1.x},${p1.y} H${trunkX} V${p2.y} H${p2.x}`;
}

/* SVG marker IDs can't contain '#', so colors are mapped to a safe id. */
function _cssId(color){ return String(color).replace('#',''); }

/* Ensures a <marker> of the given kind ('arrow' or 'dot') for the given
   color exists in <defs>, creating it on first use. Markers must be
   color-specific since SVG markers don't inherit stroke color from the
   path that references them. Using SVG markers (not separate <circle>
   elements) for dots too means marker-start and marker-end can each
   independently be 'none'/'arrow'/'dot' with no special-casing needed for
   any combination — arrow+arrow, dot+dot, arrow+dot, dot+arrow, or either
   paired with 'none', all just work via the same marker-start/marker-end
   attributes. */
function _ensureCapMarker(svg, color, kind){
  const id='dconn-'+kind+'-'+_cssId(color);
  if(svg.querySelector(`#${id}`)) return;
  let defs=svg.querySelector('defs');
  if(!defs){ defs=document.createElementNS('http://www.w3.org/2000/svg','defs'); svg.insertBefore(defs, svg.firstChild); }
  const marker=document.createElementNS('http://www.w3.org/2000/svg','marker');
  marker.setAttribute('id',id);
  marker.setAttribute('markerWidth','8'); marker.setAttribute('markerHeight','8');
  marker.setAttribute('refX', kind==='dot'?'4':'4.5');
  marker.setAttribute('refY','4');
  if(kind==='arrow') marker.setAttribute('orient','auto-start-reverse'); // dots are rotationally symmetric — no orient needed
  marker.setAttribute('markerUnits','userSpaceOnUse');
  const shape=document.createElementNS('http://www.w3.org/2000/svg', kind==='dot'?'circle':'path');
  if(kind==='dot'){
    shape.setAttribute('cx','4'); shape.setAttribute('cy','4'); shape.setAttribute('r','3');
  } else {
    shape.setAttribute('d','M0,1 L6,4 L0,7 Z');
  }
  shape.setAttribute('fill',color);
  marker.appendChild(shape);
  defs.appendChild(marker);
}

/* Applies pattern (solid/dotted), weight, color, and independent
   start/end cap decorations (each 'none'|'arrow'|'dot') to a connector's
   visible <path> — shared by both curve and right-angle builders so the
   style system behaves identically regardless of shape. Because
   startCap/endCap are two fully independent single-choice slots (not two
   combinable booleans), there's no way for a single endpoint to ever end
   up with both an arrow AND a dot — only one cap decoration can occupy
   a given end at a time, by construction of the data shape itself.
   Selected-state styling (the soft glow) is handled by the caller adding
   a .selected class to the parent <g>, not by this function. */
function _applyLineVisuals(path, cnx, svg){
  const color=cnx.color||'#000000';
  const pattern=cnx.pattern||'solid';
  const startCap=cnx.startCap||'none';
  const endCap=cnx.endCap||'arrow';
  const weight=cnx.weight||1;
  path.setAttribute('stroke',color);
  path.setAttribute('stroke-width', String(weight));
  path.setAttribute('stroke-dasharray', PATTERN_DASH[pattern]||PATTERN_DASH.solid);
  path.removeAttribute('marker-start');
  path.removeAttribute('marker-end');
  if(startCap==='arrow'||startCap==='dot'){
    _ensureCapMarker(svg, color, startCap);
    path.setAttribute('marker-start',`url(#dconn-${startCap}-${_cssId(color)})`);
  }
  if(endCap==='arrow'||endCap==='dot'){
    _ensureCapMarker(svg, color, endCap);
    path.setAttribute('marker-end',`url(#dconn-${endCap}-${_cssId(color)})`);
  }
}

/* Builds the wide, invisible "hit path" that makes a connector easy to
   click even though its visible line is thin — shared by both curve and
   right-angle builders. */
function _makeHitPath(d, cnxId){
  const hitPath=document.createElementNS('http://www.w3.org/2000/svg','path');
  hitPath.setAttribute('class','dconn-hit');
  hitPath.setAttribute('d',d);
  hitPath.setAttribute('fill','none');
  hitPath.setAttribute('stroke','transparent');
  hitPath.setAttribute('stroke-width','14');
  hitPath.dataset.cnxId=cnxId;
  hitPath.addEventListener('pointerdown', ev=>{ ev.stopPropagation(); });
  hitPath.addEventListener('click', ev=>{
    ev.stopPropagation();
    selectConnector(_pickOverlappingConnector(ev, cnxId), ev);
  });
  return hitPath;
}

// When two or more connectors' hit-paths overlap (e.g. sharing a source
// block, running parallel for part of their path), native hit-testing
// only ever reaches whichever one paints on top — every #dconns-hit path
// shares the same z-index, so DOM/creation order decides, and the click
// listener closed over the topmost one's own id always fires. This lets
// repeated clicks in the overlapping region cycle through every connector
// at that exact point instead of always landing on the same one: if the
// currently-selected connector is among the candidates here, advance to
// the next one (wrapping around); otherwise (a fresh click, nothing of
// ours selected yet) just take the topmost — same as before this existed.
function _pickOverlappingConnector(ev, topmostId){
  const candidates=document.elementsFromPoint(ev.clientX, ev.clientY)
    .filter(el=>el.classList && el.classList.contains('dconn-hit'))
    .map(el=>el.dataset.cnxId);
  if(candidates.length<=1) return topmostId;
  const curIdx=candidates.indexOf(SELECTED_CNX_ID);
  if(curIdx===-1) return topmostId;
  return candidates[(curIdx+1)%candidates.length];
}

/* Build one CURVE connector with direction-aware endpoint placement.
   The arc travels through the SPACE BETWEEN the connected words/blocks:
   • Going DOWN (p1 above p2):  exits p1 BOTTOM (downward), lands on p2 TOP from above
   • Going UP   (p1 below p2):  exits p1 TOP (upward),    lands on p2 BOTTOM from below
   • Nearly horizontal:         use block fracY as-is (original behaviour)
   For word-level endpoints, the actual path endpoint is placed just outside
   the word edge (with WORD_ARROW_CLEARANCE) so the arrowhead sits clear of the text. */
function _makeCurveConnectorEl(cnx, fromEl, toEl, canvasRect, svg, hitSvg){
  // Pass 1: get preliminary midpoint positions so we can determine direction
  const raw1=_connectorPoint(fromEl, cnx.fromX??0.5, cnx.fromY??0.5, canvasRect, cnx.fromWordIdx??null);
  const raw2=_connectorPoint(toEl,   cnx.toX  ??0.5, cnx.toY  ??0.5, canvasRect, cnx.toWordIdx  ??null);

  const dy=raw2.y-raw1.y;
  const dx=raw2.x-raw1.x;

  // Pass 2: for word-level endpoints, pick the correct edge based on direction;
  // for block-level endpoints, keep the original fracY behaviour.
  let p1={...raw1}, p2={...raw2};
  let fromY, toY;

  const isHorizontal = Math.abs(dy) < 20 && Math.abs(dx) > 40;

  if(raw1.isWord){
    if(isHorizontal){
      // Horizontal: keep center y, use block fracY fallback
      fromY = cnx.fromY??0.5;
    } else if(dy>0){
      // Going down: exit from below the from-word (wordBottom already has clearance)
      p1.y = raw1.wordBottom;
      fromY = 1;
    } else {
      // Going up: exit from above the from-word (wordTop already has clearance)
      p1.y = raw1.wordTop;
      fromY = 0;
    }
  } else {
    fromY = cnx.fromY;
  }

  if(raw2.isWord){
    if(isHorizontal){
      toY = cnx.toY??0.5;
    } else if(dy>0){
      // Going down: land on TOP of destination word, arriving from above
      p2.y = raw2.wordTop;
      toY = 0;
    } else {
      // Going up: land on BOTTOM of destination word, arriving from below
      p2.y = raw2.wordBottom;
      toY = 1;
    }
  } else {
    toY = cnx.toY;
  }

  // One path strategy for all horizontal offsets: the vertical-tangent
  // S-curve (_connectorPathD). It sweeps diagonally for normal offsets
  // and degrades smoothly to a straight vertical drop as |dx|→0, so the
  // old three-way branch (hook / tight / full) is no longer needed.
  const d = _connectorPathD(p1, p2, fromY, toY);

  const isSelected=(SELECTED_CNX_ID===cnx.id);
  const g=document.createElementNS('http://www.w3.org/2000/svg','g');
  g.setAttribute('class','dconn-group dconn-curve'+(isSelected?' selected':''));
  g.setAttribute('data-cnx-id',cnx.id);

  const path=document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('class','dconn-line');
  path.setAttribute('data-cnx-id',cnx.id);
  path.setAttribute('d', d);
  path.setAttribute('fill','none');
  _applyLineVisuals(path, cnx, svg);

  g.appendChild(path);
  if(hitSvg) hitSvg.appendChild(_makeHitPath(d, cnx.id));
  return g;
}

/* Formerly a small-belly variant for near-vertical connectors. The
   vertical-tangent S formula degrades gracefully to a straight drop as
   dx→0, so no separate shape is needed anymore. */
function _connectorPathDTight(p1,p2,fromY,toY){
  return _connectorPathD(p1,p2,fromY,toY);
}

/* Build one RIGHT-ANGLE connector — single 90° bend, left/right-edge
   midpoint to left/right-edge midpoint. Rendered into the BACK svg layer
   (behind block content), otherwise structurally identical to a curve
   connector (same hit path, same style system). */
function _makeRightAngleConnectorEl(cnx, fromEl, toEl, canvasRect, svg, trunkX, hitSvg){
  // Structural links always enter and leave their logical outer edge. This
  // also makes a semantic link converted in the inspector immediately read
  // as a clean structural dependency rather than retaining word fractions.
  const edgeX=IS_RTL?1:0;
  const p1=_connectorPoint(fromEl, edgeX, 0.5, canvasRect);
  const p2=_connectorPoint(toEl, edgeX, 0.5, canvasRect);
  const d=_rightAnglePathD(p1,p2,trunkX);
  const isSelected=(SELECTED_CNX_ID===cnx.id);

  const g=document.createElementNS('http://www.w3.org/2000/svg','g');
  g.setAttribute('class','dconn-group dconn-rightangle'+(isSelected?' selected':''));
  g.setAttribute('data-cnx-id',cnx.id);

  const path=document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('class','dconn-line');
  path.setAttribute('data-cnx-id',cnx.id);
  path.setAttribute('d', d);
  path.setAttribute('fill','none');
  _applyLineVisuals(path, cnx, svg);

  g.appendChild(path);
  if(hitSvg) hitSvg.appendChild(_makeHitPath(d, cnx.id));
  return g;
}

/* Draw all connectors fresh into the front (#dconns) and back
   (#dconns-back) svg layers, sized to the current #dcanvas scroll
   content. Connectors whose fromRid/toRid no longer resolve to a
   rendered block are silently skipped (per spec — no warning, no
   orphan-preservation UI; they simply don't draw until/unless the row
   reappears, e.g. via undo).
   Both #dconns and #dconns-back are placed as early children of #dcanvas
   so ALL connector lines paint BEHIND block content — words remain readable
   even when multiple connectors are drawn. Right-angle connectors stay in
   #dconns-back (first child); curve connectors go in #dconns (second child),
   both behind the .dblock elements that follow. */
function renderDiagramConnectors(){
  const svg=document.getElementById('dconns');
  const backSvg=document.getElementById('dconns-back');
  const cardSurfaceSvg=document.getElementById('dcard-surfaces');
  const canvas=document.getElementById('dcanvas');
  if(!svg||!backSvg||!cardSurfaceSvg||!canvas) return;
  // Guarantee every block has .ann-word wrapping before any word-anchored
  // connector's endpoint gets computed — a block rebuilt by any OTHER
  // trigger (switching views, editing a row, etc.) loses that wrapping,
  // and _connectorPoint's word-level branch can only find the word's true
  // center via a real .ann-word rect; without it, it silently falls back
  // to a block-level edge point instead. Idempotent (no-ops on blocks
  // already wrapped), so this is a no-op in the common case and only
  // does real work exactly where the gap used to bite.
  canvas.querySelectorAll('.dblock').forEach(blk=>_wrapBlockTextWords_single(blk));
  // Visible connector layers stay beneath rows; the separate hit layer stays
  // on top purely for pointer targeting and never paints a visible stroke.
  let hitSvg=document.getElementById('dconns-hit');
  if(!hitSvg){
    hitSvg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    hitSvg.id='dconns-hit';
    hitSvg.setAttribute('preserveAspectRatio','none');
  }
  canvas.appendChild(hitSvg);
  const canvasRect=canvas.getBoundingClientRect();
  // Previous renders painted a permanent SVG card behind every block here.
  // It duplicated the block interaction treatment, so the mount is retained
  // only to clear legacy content while .dblock::before owns card feedback.
  cardSurfaceSvg.innerHTML='';
  svg.setAttribute('width', canvas.scrollWidth);
  svg.setAttribute('height', canvas.scrollHeight);
  svg.innerHTML='';
  backSvg.setAttribute('width', canvas.scrollWidth);
  backSvg.setAttribute('height', canvas.scrollHeight);
  backSvg.innerHTML='';
  hitSvg.setAttribute('width', canvas.scrollWidth);
  hitSvg.setAttribute('height', canvas.scrollHeight);
  hitSvg.innerHTML='';
  const trunkX=_rightAngleTrunkX(canvas, canvasRect);

  // Safety net: if the selected connector no longer exists (e.g. an undo
  // just removed it, or its row was deleted elsewhere), clear the stale
  // selection and close its edit popup rather than leaving them dangling.
  if(SELECTED_CNX_ID!==null && !DIAGRAM_DATA.connectors.some(c=>c.id===SELECTED_CNX_ID)){
    SELECTED_CNX_ID=null;
    const popup=document.getElementById('conn-edit-popup');
    if(popup) popup.style.display='none';
  }

  DIAGRAM_DATA.connectors.forEach(cnx=>{
    const fromEl=document.querySelector(`.dblock[data-rid="${cnx.fromRid}"]`);
    const toEl=document.querySelector(`.dblock[data-rid="${cnx.toRid}"]`);
    if(!fromEl||!toEl){
      // Referenced row no longer exists — drop silently. If it was the
      // selected connector, also close its popup (same reasoning as above).
      if(SELECTED_CNX_ID===cnx.id){
        SELECTED_CNX_ID=null;
        const popup=document.getElementById('conn-edit-popup');
        if(popup) popup.style.display='none';
      }
      return;
    }
    if(cnx.kind==='rightangle'){
      backSvg.appendChild(_makeRightAngleConnectorEl(cnx, fromEl, toEl, canvasRect, backSvg, trunkX, hitSvg));
    } else {
      svg.appendChild(_makeCurveConnectorEl(cnx, fromEl, toEl, canvasRect, svg, hitSvg));
    }
  });
  syncDiagramWorkspaceUI();
}

/* Lightweight reroute used during a live block drag — recomputes line
   endpoints from current DOM positions without rebuilding the whole
   canvas (renderDiagram() would be overkill/jittery mid-drag). Safe to
   call frequently; only does work if Diagram View is actually showing. */
function refreshDiagramConnectors(){
  // Also refresh brackets when connectors refresh (zoom/resize)
  if(typeof refreshBrackets==='function' && EDITOR_VIEW==='diagram') setTimeout(()=>_brkRenderDiagram&&_brkRenderDiagram(),0);
  if(EDITOR_VIEW!=='diagram') return;
  renderDiagramConnectors();
  refreshDiagramLabels();
}

/* Snaps a vertical fraction to either the very top (0) or very bottom (1)
   of the block — whichever half the point falls in. Horizontal position
   stays free/unsnapped so the line still lines up with whatever word the
   user clicked near. This means connectors never land on the left/right
   edges or mid-block vertically, only the top or bottom edge. */
function _snapFracY(fracY){ return fracY<0.5 ? 0 : 1; }

/* Ctrl+drag from a block (or a specific word within a block) starts drawing
   a connector. If the mousedown lands on a .ann-word span, the connector
   anchors to that word's center (word-level). Otherwise it anchors to the
   block fraction position as before (block-level).
   Word-level endpoints are stored as fromWordIdx/toWordIdx (integer).
   Block-level endpoints use fromWordIdx/toWordIdx = null (or absent).
   Default color: #C8A84B (gold), weight: 1.5 — matching the arc connector.
   Escape during drag cancels. */
/* Returns the index (0-based) of the .ann-word span that contains targetNode */
/* ── Connector draw mode (toolbar button / Alt+C) ───────────────────────────
   Clicking the connector button (or pressing Alt+C) toggles connector-draw
   mode. While active, the canvas shows a crosshair cursor over blocks and
   a hint toast. The user then Ctrl+drags from any block or word.
   Pressing Escape, clicking the button again, or Alt+C again exits the mode. */
let _connectorModeActive=false;

function startConnectorMode(){
  if(EDITOR_VIEW!=='diagram') return;
  if(_connectorModeActive){
    _exitConnectorMode();
  } else {
    _connectorModeActive=true;
    _setAnnBtnActive('tb-add-connector', true);
    // Pre-wrap all blocks so .ann-word spans exist for word-level detection
    document.querySelectorAll('#dcanvas .dblock').forEach(blk=>_wrapBlockTextWords_single(blk));
    document.getElementById('dcanvas')?.classList.add('ann-connector-mode');
    const hintKey=DIAGRAM_NEW_CONNECTOR_KIND==='rightangle'?'diagram.link.draw.structural':'diagram.link.draw.semantic';
    toast(typeof t==='function'?t(hintKey):'Drag from a block to draw a relationship.');
  }
}

function _exitConnectorMode(){
  _connectorModeActive=false;
  _setAnnBtnActive('tb-add-connector', false);
  document.getElementById('dcanvas')?.classList.remove('ann-connector-mode');
}

/* Called after a connector is successfully committed. Locked mode
   (entered via the "Draw Connector" toolbar button) now deliberately
   PERSISTS across multiple connectors — draw several in a row without
   re-toggling the button each time — on both desktop and mobile, since
   both the drag path (startConnectorDraw's onUp) and the tap path
   (_commitConnectorTap) call this same hook. The mode only ends when the
   user explicitly clicks "Draw Connector" again to unlock it. (A
   transient Ctrl-held drag, which never sets _connectorModeActive in the
   first place, already behaved this way — each new mousedown while Ctrl
   stays down starts a fresh connector — so this brings locked mode in
   line with that, rather than introducing a new pattern.) */
function _onConnectorCommitted(connectorId){
  if(!connectorId) return;
  SELECTED_CNX_ID=connectorId;
  selectDiagBlock(null);
  renderDiagramConnectors();
  openConnEditPopup();
}

/* Pre-wrap + visual connector mode on Ctrl keydown/keyup ─────────────────
   When Ctrl is held in diagram view:
   1. Pre-wrap all .dblock-text elements so .ann-word spans exist before mousedown.
   2. Add ann-connector-mode to #dcanvas so words show as clickable boxes (CSS).
   On Ctrl keyup: remove ann-connector-mode unless toolbar button locked it on. */
document.addEventListener('keydown', ev=>{
  if(ev.key!=='Control'||EDITOR_VIEW!=='diagram') return;
  const canvas=document.getElementById('dcanvas'); if(!canvas) return;
  document.querySelectorAll('#dcanvas .dblock').forEach(blk=>_wrapBlockTextWords_single(blk));
  canvas.classList.add('ann-connector-mode');
  _setAnnBtnActive('tb-add-connector', true);
});
document.addEventListener('keyup', ev=>{
  if(ev.key!=='Control') return;
  if(!_connectorModeActive){
    document.getElementById('dcanvas')?.classList.remove('ann-connector-mode');
    _setAnnBtnActive('tb-add-connector', false);
  }
});

/* Returns the index (0-based) of the .ann-word span that contains targetNode */
function _getWordIdx(textEl, targetNode){
  const words=[...textEl.querySelectorAll('.ann-word')];
  for(let i=0;i<words.length;i++){
    if(words[i]===targetNode||words[i].contains(targetNode)) return i;
  }
  return -1;
}

/* A plain color/highlight/format span (no crit-mark/sup semantics) is
   never itself a word boundary — e.g. a separately-colored vav-
   conjunction prefix must still count as one word with what follows.
   Shared by _wrapBlockTextWords_single (connector word-anchoring) and
   _insertSplitPoints inside _demTokenize (Diagram Edit Mode word-split). */
function _isPlainFormatSpan(el){
  if(!el||el.nodeType!==Node.ELEMENT_NODE) return false;
  if(el.nodeName==='SUP') return false;
  if(el.classList&&el.classList.contains('crit-mark')) return false;
  if(el.querySelector&&el.querySelector('sup,.crit-mark')) return false;
  return /\S/.test(el.textContent||'');
}

/* Wrap words in a single .dblock's text with .ann-word spans for word-level
   connector anchoring. Only touches the given block element, not the whole canvas,
   so it's safe to call during a mousedown without disrupting other blocks' DOM. */
function _wrapBlockTextWords_single(blockEl){
  const textEl=blockEl?.querySelector('.dblock-text');
  if(!textEl||textEl.querySelector('.ann-word')) return; // already wrapped
  // Skip <sup> and .crit-mark subtrees — apparatus/discourse markers are
  // annotation markup, never real "words" that should be independently
  // draggable connector anchors (matches _demTokenize's same protection).
  const walker=document.createTreeWalker(textEl, NodeFilter.SHOW_TEXT, {
    acceptNode(node){
      let p=node.parentNode;
      while(p&&p!==textEl){
        if(p.nodeName==='SUP') return NodeFilter.FILTER_REJECT;
        if(p.nodeType===Node.ELEMENT_NODE && p.classList && p.classList.contains('crit-mark')) return NodeFilter.FILTER_REJECT;
        p=p.parentNode;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const textNodes=[];
  let node;
  while((node=walker.nextNode())) textNodes.push(node);
  textNodes.forEach(tn=>{
    const text=tn.nodeValue;
    if(!text.trim()) return;
    const frag=document.createDocumentFragment();
    let buf='', inWord=false;
    for(let i=0;i<=text.length;i++){
      const ch=i<text.length?text[i]:'';
      const isWS=ch===''||ch===' '||ch==='\t'||ch==='\n'||ch==='\r';
      if(!isWS){
        if(!inWord){ inWord=true; buf=ch; } else buf+=ch;
      } else {
        if(inWord){
          const sp=document.createElement('span');
          sp.className='ann-word'; sp.textContent=buf;
          frag.appendChild(sp); inWord=false; buf='';
        }
        if(ch) frag.appendChild(document.createTextNode(ch));
      }
    }
    tn.parentNode.replaceChild(frag,tn);
  });
  _mergeGluedWordSpans(textEl, 'ann-word');
}

/* Post-pass shared by _wrapBlockTextWords_single (.ann-word, connector
   word-anchoring) and _demTokenize (.dedit-word, Diagram Edit Mode word-
   split): each caller's per-text-node wrap can't see across element
   boundaries, so a word split across a color/highlight span (e.g. a
   separately-colored vav-conjunction prefix, <span class="hl">וְ</span>
   כִלְיֹון֙) ends up as two separate word spans of that caller's class.
   Walk them in document order and splice any pair with no whitespace
   between them into a single span of the same class wrapping BOTH
   original nodes (preserving the inner color span so highlighting/text-
   color is not lost), so both connector word-anchoring (_getWordIdx) and
   Diagram Edit Mode's split-click/hover see exactly one word/token. */
function _mergeGluedWordSpans(textEl, wordClass){
  let words=[...textEl.querySelectorAll('.'+wordClass)];
  for(let i=0;i<words.length-1;i++){
    const a=words[i], b=words[i+1];
    if(!a.isConnected||!b.isConnected) continue; // already merged away
    if(!_gluedRun(a,b)) continue;

    const outerA=_outerAt(a,b), outerB=_outerAt(b,a);
    if(!outerA||!outerB||outerA.parentNode!==outerB.parentNode) continue;

    // outerA/outerB are the sibling-level wrapper elements containing a/b
    // — but a real paste (e.g. from Logos/BibleArc) commonly wraps EVERY
    // run in its own <span style="font-size:...">, including runs that
    // hold several whitespace-separated words, not just the one glued
    // word, and those runs can carry LEADING or trailing whitespace of
    // their own (e.g. a plain span "  אֶת־כָּל־" whose glued word is only
    // the last part of its content). Starting the range at `a` itself
    // (not outerA's own start) and ending right after `b` itself (not
    // outerB's end) sidesteps both directions of that problem at once:
    // extractContents() automatically splits outerA/outerB at those exact
    // boundaries, cloning their own style/attrs onto every resulting
    // piece, so only the actually-glued a..b span moves into the merge —
    // any leading whitespace before `a` (which would otherwise get
    // dragged inside the merged word, making it look glued to whatever
    // precedes it too) and any trailing content after `b` both stay
    // behind as their own correctly-styled siblings — the same partial-
    // boundary splitting the diagram split-click handler already relies
    // on elsewhere in this file.
    const range=document.createRange();
    range.setStartBefore(a);
    range.setEndAfter(b);
    const frag=range.extractContents();
    const wrapper=document.createElement('span');
    wrapper.className=wordClass;
    wrapper.appendChild(frag);
    range.insertNode(wrapper);
    // Unwrap the two original (now-nested, redundant) word spans —
    // querySelectorAll('.'+wordClass) must return exactly ONE element
    // for this merged word, not three.
    [a,b].forEach(sp=>{ if(sp.isConnected) sp.replaceWith(...sp.childNodes); });
    words=[...textEl.querySelectorAll('.'+wordClass)]; // re-query after mutation
    // The merge just collapsed two entries into one, shifting everything
    // after it down by one position — without this, the loop's own i++
    // would skip re-checking the merged word against its NEW neighbor
    // (a three-way glued run, e.g. a+b+c all touching with no whitespace,
    // would otherwise only ever merge a+b and never notice c).
    i--;
  }
  // extractContents() above clones any ancestor that's only PARTIALLY
  // inside the range (e.g. a .hl highlight span whose entire text
  // content happens to be the glued word being merged) into the
  // extracted fragment, but leaves the original ancestor behind in the
  // tree, now empty — invisible for a plain formatting span, but .hl has
  // real padding (see its CSS), so an empty one renders as a small stray
  // highlighted box sitting right where the word used to be. Nothing
  // legitimate is ever a genuinely empty .hl, so it's always safe to
  // prune.
  textEl.querySelectorAll('.hl').forEach(hl=>{ if(!hl.hasChildNodes()) hl.remove(); });
  // A .hl that wraps SEVERAL whitespace-separated words (not just one
  // word glued to trailing punctuation, the case above) can be left
  // TRUNCATED rather than emptied by the same extractContents() partial-
  // ancestor-clone mechanism, when the glued sub-run being merged sits at
  // its edge: the range only partially spans .hl, so a clone wraps the
  // merged piece while the original .hl — still non-empty, holding
  // whatever else it wrapped — stays behind right next to it. Two
  // adjacent .hl boxes, each carrying its own CSS padding, create a
  // visible seam even though neither is empty. Same style + genuinely
  // adjacent (nothing between them) is conclusive proof they were one
  // highlight before the merge, so rejoining them is always correct.
  let hls=[...textEl.querySelectorAll('.hl')];
  for(let i=0;i<hls.length-1;i++){
    const a=hls[i], b=hls[i+1];
    if(!a.isConnected||!b.isConnected) continue;
    if(a.nextSibling!==b) continue;
    if(a.getAttribute('style')!==b.getAttribute('style')) continue;
    while(b.firstChild) a.appendChild(b.firstChild);
    b.remove();
    hls=[...textEl.querySelectorAll('.hl')];
    i--;
  }
}

/* True if there's no whitespace anywhere between the end of `a` and the
   start of `b` in rendered document order (siblings or across element
   boundaries alike) — the plain-formatting-span "glued word" case. */
function _gluedRun(a,b){
  const range=document.createRange();
  range.setStartAfter(a);
  range.setEndBefore(b);
  if(/\s/.test(range.toString())) return false;
  // A <sup> apparatus-letter or .crit-mark sitting in the gap (e.g. a
  // real word immediately followed by a footnote-letter superscript and
  // then end-of-verse punctuation, with no actual space anywhere) is
  // invisible-width but never grounds for gluing two otherwise-separate
  // tokens together — Phase 1 deliberately excludes both from
  // tokenization for exactly this reason (see _demTokenize's TreeWalker),
  // so a merge pass built on the same word list must respect the same
  // exclusion rather than naively reading "no whitespace" as "glued".
  const frag=range.cloneContents();
  if(frag.querySelector && frag.querySelector('sup,.crit-mark')) return false;
  return true;
}

/* Returns the ancestor-or-self of `node` that is a direct child of the
   nearest common ancestor of `node` and `other` — i.e. the node at the
   level where `node` and `other` are true siblings. */
function _outerAt(node, other){
  let n=node;
  while(n.parentNode && !n.parentNode.contains(other)) n=n.parentNode;
  return n.parentNode ? n : null;
}

/* ════════════════════════════════════════
   DIAGRAM — SPLIT WORDS MODE
   Temporary word wrappers are applied only to the Diagram clone. The saved
   Phrasing cells receive clean, original HTML when a split is committed.
════════════════════════════════════════ */
const _DEM_WORD=/[\u0370-\u03FF\u1F00-\u1FFF\u0590-\u05FF\u00E0-\u00FF]|[a-z]/i;
let _demAltTemp=false; // retained for the Escape/reset lifecycle

function _demTokenize(blockEl){
  const textEl=blockEl?.querySelector('.dblock-text');
  if(!textEl||textEl.querySelector('.dedit-word')) return;
  // Connector word wrappers are visual-only too; unwrap them before applying
  // the splitter's own tokens so formatting remains intact.
  textEl.querySelectorAll('.ann-word').forEach(word=>word.replaceWith(...word.childNodes));
  textEl.normalize();
  const walker=document.createTreeWalker(textEl,NodeFilter.SHOW_TEXT,{
    acceptNode(node){
      let parent=node.parentNode;
      while(parent&&parent!==textEl){
        if(parent.nodeName==='SUP'||parent.classList?.contains('crit-mark')) return NodeFilter.FILTER_REJECT;
        parent=parent.parentNode;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const nodes=[]; let node;
  while((node=walker.nextNode())) nodes.push(node);
  nodes.forEach(textNode=>{
    const fragment=document.createDocumentFragment();
    textNode.nodeValue.split(/(\s+)/).forEach(part=>{
      if(!part) return;
      if(/^\s+$/.test(part)){ fragment.appendChild(document.createTextNode(part)); return; }
      if(_DEM_WORD.test(part)){
        const word=document.createElement('span');
        word.className='dedit-word'; word.textContent=part;
        fragment.appendChild(word);
      } else fragment.appendChild(document.createTextNode(part));
    });
    textNode.replaceWith(fragment);
  });
  _mergeGluedWordSpans(textEl,'dedit-word');
  [...textEl.querySelectorAll('.dedit-word')].forEach((word,index)=>{
    word.dataset.demIndex=String(index);
    // Each eligible split boundary lives inside its following word. This gives
    // the hover preview a reliable, zero-layout-shift anchor at the word's
    // real rendered edge instead of at an empty sibling span.
    if(index===0) return; // splitting before the first word would leave an empty row
    const marker=document.createElement('span');
    marker.className='dedit-split-marker';
    marker.dataset.demIndex=String(index);
    marker.setAttribute('aria-hidden','true');
    word.prepend(marker);
  });
}

function _demUntokenize(blockEl){
  const textEl=blockEl?.querySelector('.dblock-text');
  if(!textEl) return;
  textEl.querySelectorAll('.dedit-split-marker,.dedit-sp').forEach(marker=>marker.remove());
  textEl.querySelectorAll('.dedit-word').forEach(word=>word.replaceWith(...word.childNodes));
  textEl.normalize();
}

function _demAddMergeBtn(labelCell,rid){
  if(labelCell.querySelector('.dem-merge-btn')) return;
  const button=document.createElement('button');
  button.type='button'; button.className='dem-merge-btn'; button.textContent='↑';
  button.title=typeof t==='function'?t('merge-line'):'Merge line up';
  button.addEventListener('click',event=>{
    event.preventDefault(); event.stopPropagation();
    if(!DIAGRAM_EDIT_MODE) return;
    mergeRowUp(rid);
    setTimeout(()=>{ if(EDITOR_VIEW==='diagram') renderDiagram(); },0);
  });
  labelCell.appendChild(button);
}

function _applyDiagramEditMode(on){
  DIAGRAM_EDIT_MODE=!!on;
  const canvas=document.getElementById('dcanvas');
  const toolbarButton=document.getElementById('tb-dem');
  const splitButton=document.getElementById('diagram-split-words');
  if(!canvas) return;
  canvas.classList.toggle('dem-active',DIAGRAM_EDIT_MODE);
  toolbarButton?.classList.toggle('on',DIAGRAM_EDIT_MODE);
  splitButton?.classList.toggle('active',DIAGRAM_EDIT_MODE);
  splitButton?.setAttribute('aria-pressed',String(DIAGRAM_EDIT_MODE));
  if(DIAGRAM_EDIT_MODE){
    canvas.querySelectorAll('.dblock').forEach(_demTokenize);
    canvas.querySelectorAll('.dl').forEach(labelCell=>{
      const row=labelCell.closest('.drow'); if(row) _demAddMergeBtn(labelCell,row.dataset.rid);
    });
  } else {
    canvas.querySelectorAll('.dem-merge-btn').forEach(button=>button.remove());
    canvas.querySelectorAll('.dblock').forEach(_demUntokenize);
  }
  syncDiagramWorkspaceUI();
}

function toggleDiagramEditMode(){
  _applyDiagramEditMode(!DIAGRAM_EDIT_MODE);
  if(DIAGRAM_EDIT_MODE) toast(typeof t==='function'?t('diagram.edit-hint'):'Split Words is on. Click a word to create a new row.');
  autoSave();
}

function _demCleanHTML(root){
  root.querySelectorAll('.dedit-split-marker,.dedit-sp').forEach(marker=>marker.remove());
  root.querySelectorAll('.dedit-word').forEach(word=>word.replaceWith(...word.childNodes));
  root.normalize();
  return root.innerHTML.replace(/^\s+|\s+$/g,'');
}

function _demSplitWord(wordEl){
  const block=wordEl.closest('.dblock');
  const textEl=block?.querySelector('.dblock-text');
  const row=block?.closest('.drow');
  const rid=row?.dataset.rid;
  const index=wordEl.dataset.demIndex;
  if(!textEl||!rid||index==null) return;
  const clone=textEl.cloneNode(true);
  const marker=clone.querySelector(`.dedit-split-marker[data-dem-index="${CSS.escape(index)}"]`);
  if(!marker) return;
  const beforeRange=document.createRange();
  beforeRange.selectNodeContents(clone); beforeRange.setEndBefore(marker);
  const afterRange=document.createRange();
  afterRange.selectNodeContents(clone); afterRange.setStartBefore(marker);
  const before=document.createElement('div'); before.appendChild(beforeRange.cloneContents());
  const after=document.createElement('div'); after.appendChild(afterRange.cloneContents());
  const beforeHTML=_demCleanHTML(before), afterHTML=_demCleanHTML(after);
  const sourceRow=document.querySelector(`.xrow[data-rid="${rid}"]`);
  const source=sourceRow?.querySelector(`#oc-${rid} .cedit`);
  if(!sourceRow||!source) return;
  const originalHTML=source.innerHTML;
  const verse=sourceRow.querySelector('.vin')?.value||'';
  source.innerHTML=beforeHTML;
  const newRid=++RC;
  const newRow=makeRowEl(newRid,'','','',null);
  sourceRow.insertAdjacentElement('afterend',newRow);
  const newOriginal=newRow.querySelector(`#oc-${newRid} .cedit`);
  if(newOriginal) newOriginal.innerHTML=afterHTML;
  rowPush({type:'split',rid:String(rid),newRid:String(newRid),verse,origHTML:originalHTML,afterHTML:beforeHTML,newHTML:afterHTML,splitOffset:source.innerText.length});
  recomputeIds(); autoSave();
  setTimeout(()=>{ if(EDITOR_VIEW==='diagram') renderDiagram(); },0);
  toast(typeof t==='function'?t('diagram.edit-split'):'Word split.');
}

document.addEventListener('click',event=>{
  if(!DIAGRAM_EDIT_MODE) return;
  const word=event.target.closest?.('.dedit-word');
  if(!word) return;
  event.preventDefault(); event.stopPropagation();
  _demSplitWord(word);
},true);

function startConnectorDraw(ev, fromRid){
  ev.preventDefault();
  ev.stopPropagation();

  const canvas=document.getElementById('dcanvas');
  const svg=document.getElementById('dconns');
  const fromEl=document.querySelector(`.dblock[data-rid="${fromRid}"]`);
  if(!canvas||!svg||!fromEl) return;

  // Wrap words on the FROM block only so word-level anchoring works
  // without rewriting the entire canvas DOM (which would interrupt the drag).
  _wrapBlockTextWords_single(fromEl);

  // Determine if the drag started on a specific word (word-level anchor).
  // Connectors must resolve to a word on BOTH ends — a block-level
  // fallback point is no longer a valid outcome, so bail out here with
  // no drag/rubber-band at all if the press didn't land on a word.
  const fromWordEl=ev.target.closest('.ann-word');
  if(!fromWordEl) return;
  const fromWordIdx=_getWordIdx(fromEl.querySelector('.dblock-text'), fromWordEl);

  // Stage 2 (mobile touch parity): dragging a continuous path is
  // imprecise with a finger, so coarse-pointer devices get tap-source,
  // tap-target instead — desktop mice keep the exact drag behavior
  // below, completely untouched.
  if(window.matchMedia && window.matchMedia('(pointer:coarse)').matches){
    _startConnectorTapMode(fromRid, fromEl, fromWordEl, fromWordIdx);
    return;
  }

  // Compute start fractional position within the block
  const fr0=fromEl.getBoundingClientRect();
  const fromFracX=Math.min(1,Math.max(0,(ev.clientX-fr0.left)/fr0.width));
  const fromFracY=_snapFracY(Math.min(1,Math.max(0,(ev.clientY-fr0.top)/fr0.height)));

  // If word-level: use the word's center as the visual start point for the rubber-band
  let p1Override=null;
  if(fromWordEl){
    const wr=fromWordEl.getBoundingClientRect();
    const cr=canvas.getBoundingClientRect();
    p1Override={x:(wr.left+wr.right)/2-cr.left, y:(wr.top+wr.bottom)/2-cr.top+(canvas.scrollTop||0)};
  }

  const rubberPath=document.createElementNS('http://www.w3.org/2000/svg','path');
  rubberPath.setAttribute('class','dconn-rubberband');
  rubberPath.setAttribute('fill','none');
  rubberPath.setAttribute('stroke','#C8A84B');
  rubberPath.setAttribute('stroke-width','1.5');
  rubberPath.setAttribute('stroke-dasharray','4,4');
  canvas.appendChild(svg);
  svg.appendChild(rubberPath);

  fromEl.classList.add('dconn-source');

  const updateRubberband=(mx,my)=>{
    const canvasRect=canvas.getBoundingClientRect();
    const p1=p1Override||_connectorPoint(fromEl, fromFracX, fromFracY, canvasRect);
    const p2={x:mx-canvasRect.left, y:my-canvasRect.top+(canvas.scrollTop||0)};
    rubberPath.setAttribute('d', _connectorPathD(p1,p2,fromFracY,null));
  };
  updateRubberband(ev.clientX, ev.clientY);

  let hoverTarget=null;
  const onMove=mv=>{
    updateRubberband(mv.clientX, mv.clientY);
    const el=document.elementFromPoint?document.elementFromPoint(mv.clientX, mv.clientY):null;
    const block=el?el.closest('.dblock'):null;
    if(hoverTarget && hoverTarget!==block) hoverTarget.classList.remove('dconn-target');
    if(block && block!==fromEl){ block.classList.add('dconn-target'); hoverTarget=block; }
    else { hoverTarget=null; }
  };

  const cancel=()=>{
    document.removeEventListener('pointermove',onMove);
    document.removeEventListener('pointerup',onUp);
    document.removeEventListener('keydown',onKey,true);
    rubberPath.remove();
    fromEl.classList.remove('dconn-source');
    if(hoverTarget) hoverTarget.classList.remove('dconn-target');
  };

  const onKey=kev=>{ if(kev.key==='Escape'){ kev.preventDefault(); cancel(); } };

  const onUp=mv=>{
    cancel();
    const el=document.elementFromPoint?document.elementFromPoint(mv.clientX, mv.clientY):null;
    const toBlock=el?el.closest('.dblock'):null;
    if(toBlock && toBlock!==fromEl){
      _wrapBlockTextWords_single(toBlock); // ensure .ann-word spans exist on target
      const toRid=toBlock.dataset.rid;
      const tr=toBlock.getBoundingClientRect();
      const toFracX=Math.min(1,Math.max(0,(mv.clientX-tr.left)/tr.width));
      const toFracY=_snapFracY(Math.min(1,Math.max(0,(mv.clientY-tr.top)/tr.height)));

      // Connectors must resolve to a word on BOTH ends (see the matching
      // guard at drag-start) — if the release didn't land on a specific
      // word, the connector is rejected rather than falling back to a
      // block-level point.
      const toWordEl=el?el.closest('.ann-word'):null;
      if(!toWordEl) return;
      const toWordIdx=_getWordIdx(toBlock.querySelector('.dblock-text'), toWordEl);

      CNX++;
      const newConnector={
        id:'cnx'+CNX, fromRid:String(fromRid), toRid:String(toRid),
        kind:'curve',
        fromX:fromFracX, fromY:fromFracY, toX:toFracX, toY:toFracY,
        fromWordIdx, toWordIdx,
        pattern:'solid', startCap:'none', endCap:'arrow', weight:1.5, color:'#6c527b'
      };
      DIAGRAM_DATA.connectors.push(newConnector);
      rowPush({type:'connector-add', connector:newConnector});
      autoSave();
      renderDiagramConnectors();
      _onConnectorCommitted(newConnector.id);
    }
  };

  document.addEventListener('pointermove',onMove);
  document.addEventListener('pointerup',onUp);
  document.addEventListener('keydown',onKey,true);
}

/* ── Stage 2 (mobile): tap-to-connect for curve connectors ──
   Same source-then-target arming principle as the right-angle
   connector's RA_ARMED above, adapted for word-level anchors instead of
   fixed block-edge points. Kept as a SEPARATE state machine (not reusing
   RA_ARMED) since curve connectors need to track a specific armed WORD,
   not just a block.
   Timing note: unlike the right-angle connector (which arms during its
   OWN pointerup handler, after the initiating gesture has essentially
   finished), this is entered directly from pointerdown — so the SAME
   tap that arms this gesture is still about to generate its own click
   event. Attaching the completion/cancel click-listener synchronously
   would risk that very click immediately landing on it and cancelling
   the gesture before the user's finger even lifts — so that one
   listener is deferred to the next macrotask, after the current tap's
   own event sequence has fully finished. */
let CONN_ARMED=null;

function cancelConnectorArm(){
  if(!CONN_ARMED) return;
  const armed=CONN_ARMED;
  CONN_ARMED=null;
  armed.teardown();
}

function _startConnectorTapMode(fromRid, fromEl, fromWordEl, fromWordIdx){
  if(CONN_ARMED){
    if(CONN_ARMED.fromRid===fromRid && CONN_ARMED.fromWordIdx===fromWordIdx){
      // Tapped the same armed word again — cancel, don't re-arm.
      cancelConnectorArm();
      return;
    }
    // Tapped a different word while armed — completes the connection,
    // a terminal action (mirrors the right-angle connector's same rule).
    const armed=CONN_ARMED;
    cancelConnectorArm();
    _commitConnectorTap(armed, fromRid, fromEl, fromWordEl, fromWordIdx);
    return;
  }
  // Wait for THIS tap's own pointerup before arming (see timing note
  // above) — nothing about the gesture actually needs pointerup to have
  // fired first, this is purely to dodge the same-tap click race.
  const onInitialUp=()=>{
    document.removeEventListener('pointerup', onInitialUp);
    _armConnectorTap(fromRid, fromEl, fromWordEl, fromWordIdx);
  };
  document.addEventListener('pointerup', onInitialUp, {once:true});
}

function _armConnectorTap(fromRid, fromEl, fromWordEl, fromWordIdx){
  const canvas=document.getElementById('dcanvas');
  const svg=document.getElementById('dconns');
  if(!canvas||!svg) return;

  const fr0=fromEl.getBoundingClientRect();
  const wr=fromWordEl.getBoundingClientRect();
  // Use the word's own center, not a raw tap coordinate — a fingertip is
  // far less precise than a mouse cursor for picking an exact point
  // within a small word, so the word's center is the more reliable
  // anchor for the touch path specifically.
  const fromFracX=Math.min(1,Math.max(0,((wr.left+wr.right)/2-fr0.left)/fr0.width));
  const fromFracY=_snapFracY(Math.min(1,Math.max(0,((wr.top+wr.bottom)/2-fr0.top)/fr0.height)));

  const rubberPath=document.createElementNS('http://www.w3.org/2000/svg','path');
  rubberPath.setAttribute('class','dconn-rubberband');
  rubberPath.setAttribute('fill','none');
  rubberPath.setAttribute('stroke','#C8A84B');
  rubberPath.setAttribute('stroke-width','1.5');
  rubberPath.setAttribute('stroke-dasharray','4,4');
  canvas.appendChild(svg);
  svg.appendChild(rubberPath);
  fromEl.classList.add('dconn-source');
  fromWordEl.classList.add('dconn-armed');

  const updateRubberband=(mx,my)=>{
    const canvasRect=canvas.getBoundingClientRect();
    const p1=_connectorPoint(fromEl, fromFracX, fromFracY, canvasRect, fromWordIdx);
    const p2={x:mx-canvasRect.left, y:my-canvasRect.top+(canvas.scrollTop||0)};
    rubberPath.setAttribute('d', _connectorPathD(p1,p2,fromFracY,null));
  };
  updateRubberband(wr.left+wr.width/2, wr.top+wr.height/2);

  let hoverTarget=null;
  const onMove=mv=>{
    if(_pinchActive) return;
    updateRubberband(mv.clientX, mv.clientY);
    const el=document.elementFromPoint?document.elementFromPoint(mv.clientX, mv.clientY):null;
    const block=el?el.closest('.dblock'):null;
    if(hoverTarget && hoverTarget!==block) hoverTarget.classList.remove('dconn-target');
    if(block && block!==fromEl){ block.classList.add('dconn-target'); hoverTarget=block; }
    else if(!block) hoverTarget=null;
  };

  const onEscape=kev=>{ if(kev.key==='Escape'){ kev.preventDefault(); cancelConnectorArm(); } };

  const onClick=cev=>{
    const target=cev.target;
    const clickedWord=target.closest?.('.ann-word');
    const clickedBlock=target.closest?.('.dblock');
    if(!clickedBlock || clickedBlock===fromEl){
      // Tapping the source block again (any word or empty space on it),
      // or tapping anywhere that isn't a block at all, cancels.
      cancelConnectorArm();
      return;
    }
    if(!clickedWord){
      // Tapped a different block but not a specific word — connectors
      // must resolve to a word on both ends, same rule as the drag path.
      cancelConnectorArm();
      return;
    }
    const armed=CONN_ARMED;
    cancelConnectorArm();
    _commitConnectorTap(armed, clickedBlock.dataset.rid, clickedBlock, clickedWord,
      _getWordIdx(clickedBlock.querySelector('.dblock-text'), clickedWord));
  };

  const teardown=()=>{
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('click', onClick);
    document.removeEventListener('keydown', onEscape);
    rubberPath.remove();
    fromEl.classList.remove('dconn-source');
    fromWordEl.classList.remove('dconn-armed');
    if(hoverTarget) hoverTarget.classList.remove('dconn-target');
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('keydown', onEscape);
  setTimeout(()=>{ document.addEventListener('click', onClick); }, 0);

  CONN_ARMED={ fromRid, fromWordIdx, fromEl, fromFracX, fromFracY, teardown };
}

function _commitConnectorTap(armed, toRid, toEl, toWordEl, toWordIdx){
  if(!armed || String(armed.fromRid)===String(toRid)) return;
  _wrapBlockTextWords_single(toEl);
  const tr=toEl.getBoundingClientRect();
  const wr=toWordEl.getBoundingClientRect();
  const toFracX=Math.min(1,Math.max(0,((wr.left+wr.right)/2-tr.left)/tr.width));
  const toFracY=_snapFracY(Math.min(1,Math.max(0,((wr.top+wr.bottom)/2-tr.top)/tr.height)));

  CNX++;
  const newConnector={
    id:'cnx'+CNX, fromRid:String(armed.fromRid), toRid:String(toRid),
    kind:'curve',
    fromX:armed.fromFracX, fromY:armed.fromFracY, toX:toFracX, toY:toFracY,
    fromWordIdx:armed.fromWordIdx, toWordIdx,
    pattern:'solid', startCap:'none', endCap:'arrow', weight:1.5, color:'#6c527b'
  };
  DIAGRAM_DATA.connectors.push(newConnector);
  rowPush({type:'connector-add', connector:newConnector});
  autoSave();
  renderDiagramConnectors();
  _onConnectorCommitted(newConnector.id);
}

/* Right-angle connectors support TWO gestures:
   1. Click-and-DRAG from the "+" handle to a target block (mouse held
      down throughout) — live preview follows the cursor, drop on a
      different block commits.
   2. Click-and-RELEASE on the "+" handle to ARM it (mouse released
      immediately, no real drag), then move the cursor freely — the
      preview keeps following even with no button held — and click a
      target block to commit. Cancel by clicking the SAME handle again,
      clicking empty canvas (or the source block itself), or Escape.
   Both gestures share the same fixed attach points (left/right-edge
   midpoint of each block — right edge in RTL, mirroring every other
   Diagram View interaction), the same undo-stack integration, and the
   same silent-cancel-on-invalid-drop convention. */
let RA_ARMED=null; // {fromRid, teardown} while a right-angle line is armed (gesture 2, above)

function cancelRightAngleArm(){
  if(!RA_ARMED) return;
  const armed=RA_ARMED;
  RA_ARMED=null;
  armed.teardown();
}

function _commitRightAngleConnector(fromRid, toRid, attachFracX, attachFracY){
  CNX++;
  const newConnector={
    id:'cnx'+CNX, fromRid:String(fromRid), toRid:String(toRid),
    kind:'rightangle',
    fromX:attachFracX, fromY:attachFracY, toX:attachFracX, toY:attachFracY,
    pattern:'solid', startCap:'none', endCap:'arrow', weight:1.25, color:'#a98233'
  };
  DIAGRAM_DATA.connectors.push(newConnector);
  rowPush({type:'connector-add', connector:newConnector});
  autoSave();
  renderDiagramConnectors();
  _onConnectorCommitted(newConnector.id);
}

/* The visible link handle creates the currently selected relationship type.
   The kind is persisted using the existing curve/rightangle field only. */
function startDiagramHandleDraw(ev, fromRid){
  if(DIAGRAM_NEW_CONNECTOR_KIND==='rightangle') startRightAngleDraw(ev, fromRid);
  else startSemanticHandleDraw(ev, fromRid);
}

function startSemanticHandleDraw(ev, fromRid){
  ev.preventDefault(); ev.stopPropagation();
  if(ev.button!==0) return;
  const canvas=document.getElementById('dcanvas');
  const svg=document.getElementById('dconns');
  const fromEl=document.querySelector(`.dblock[data-rid="${fromRid}"]`);
  if(!canvas||!svg||!fromEl) return;
  const fromX=IS_RTL?0:1;
  const startY=ev.clientY;
  let dragged=false, hoverTarget=null;
  const rubber=document.createElementNS('http://www.w3.org/2000/svg','path');
  rubber.setAttribute('class','dconn-rubberband'); rubber.setAttribute('fill','none');
  rubber.setAttribute('stroke','#6c527b'); rubber.setAttribute('stroke-width','1.5');
  rubber.setAttribute('stroke-dasharray','4,4'); svg.appendChild(rubber);
  fromEl.classList.add('dconn-source');
  const update=(x,y)=>{
    const rect=canvas.getBoundingClientRect();
    const sourceY=y>startY?1:0;
    const p1=_connectorPoint(fromEl,fromX,sourceY,rect);
    rubber.setAttribute('d',_connectorPathD(p1,{x:x-rect.left,y:y-rect.top+(canvas.scrollTop||0)},sourceY,null));
  };
  const cleanup=()=>{
    document.removeEventListener('pointermove',onMove); document.removeEventListener('pointerup',onUp);
    rubber.remove(); fromEl.classList.remove('dconn-source');
    if(hoverTarget) hoverTarget.classList.remove('dconn-target');
  };
  const onMove=mv=>{
    if(_pinchActive) return;
    if(Math.abs(mv.clientX-ev.clientX)>3||Math.abs(mv.clientY-ev.clientY)>3) dragged=true;
    update(mv.clientX,mv.clientY);
    const target=document.elementFromPoint?.(mv.clientX,mv.clientY)?.closest('.dblock');
    if(hoverTarget&&hoverTarget!==target) hoverTarget.classList.remove('dconn-target');
    hoverTarget=target&&target!==fromEl?target:null;
    if(hoverTarget) hoverTarget.classList.add('dconn-target');
  };
  const onUp=up=>{
    const target=document.elementFromPoint?.(up.clientX,up.clientY)?.closest('.dblock');
    cleanup();
    if(!dragged||!target||target===fromEl) return;
    const fromRect=fromEl.getBoundingClientRect(), toRect=target.getBoundingClientRect();
    const downward=toRect.top>=fromRect.top;
    const targetWord=document.elementFromPoint?.(up.clientX,up.clientY)?.closest('.ann-word');
    const toWordIdx=targetWord?_getWordIdx(target.querySelector('.dblock-text'),targetWord):null;
    const connector={
      id:'cnx'+(++CNX),fromRid:String(fromRid),toRid:String(target.dataset.rid),kind:'curve',
      fromX,fromY:downward?1:0,toX:IS_RTL?0:1,toY:downward?0:1,
      fromWordIdx:null,toWordIdx,pattern:'solid',startCap:'none',endCap:'arrow',weight:1.5,color:'#6c527b'
    };
    DIAGRAM_DATA.connectors.push(connector); rowPush({type:'connector-add',connector}); autoSave();
    _onConnectorCommitted(connector.id);
  };
  update(ev.clientX,ev.clientY);
  document.addEventListener('pointermove',onMove); document.addEventListener('pointerup',onUp);
}

function startRightAngleDraw(ev, fromRid){
  ev.preventDefault();
  ev.stopPropagation();
  if(ev.button!==0) return;

  if(RA_ARMED){
    if(RA_ARMED.fromRid===fromRid){
      // Clicked the SAME handle again while armed — cancel, don't start
      // a new gesture from this same click.
      cancelRightAngleArm();
      return;
    }
    // Clicked a DIFFERENT handle while armed — this COMPLETES the
    // connection to that handle's block, exactly like clicking anywhere
    // else on that block's body already does (both are valid ways to
    // finish an armed right-angle line — handle-to-handle is just a more
    // precise version of the same completion). This does NOT also start
    // a new drag/arm from the clicked handle; it's a terminal action.
    const armedFromRid=RA_ARMED.fromRid;
    cancelRightAngleArm();
    const completeAttachX=IS_RTL?1:0, completeAttachY=0.5;
    _commitRightAngleConnector(armedFromRid, fromRid, completeAttachX, completeAttachY);
    return;
  }

  const canvas=document.getElementById('dcanvas');
  const backSvg=document.getElementById('dconns-back');
  const fromEl=document.querySelector(`.dblock[data-rid="${fromRid}"]`);
  if(!canvas||!backSvg||!fromEl) return;

  const attachFracX=IS_RTL?1:0;
  const attachFracY=0.5;
  const startX=ev.clientX, startY=ev.clientY;
  let dragged=false;

  const rubberPath=document.createElementNS('http://www.w3.org/2000/svg','path');
  rubberPath.setAttribute('class','dconn-rubberband');
  rubberPath.setAttribute('fill','none');
  rubberPath.setAttribute('stroke','#000000');
  rubberPath.setAttribute('stroke-width','1');
  rubberPath.setAttribute('stroke-dasharray','4,4');
  backSvg.appendChild(rubberPath);
  fromEl.classList.add('dconn-source');

  const updateRubberband=(mx,my)=>{
    const canvasRect=canvas.getBoundingClientRect();
    const p1=_connectorPoint(fromEl, attachFracX, attachFracY, canvasRect);
    const p2={x:mx-canvasRect.left, y:my-canvasRect.top};
    rubberPath.setAttribute('d', _rightAnglePathD(p1,p2,_rightAngleTrunkX(canvas,canvasRect)));
  };
  updateRubberband(ev.clientX, ev.clientY);

  let hoverTarget=null;
  const updateHover=(mx,my)=>{
    const el=document.elementFromPoint?document.elementFromPoint(mx,my):null;
    const block=el?el.closest('.dblock'):null;
    if(hoverTarget && hoverTarget!==block) hoverTarget.classList.remove('dconn-target');
    if(block && block!==fromEl){ block.classList.add('dconn-target'); hoverTarget=block; }
    else { hoverTarget=null; }
  };

  const teardown=()=>{
    document.removeEventListener('pointermove',onDragMove);
    document.removeEventListener('pointerup',onMouseUp);
    document.removeEventListener('mousemove',onArmedMove);
    document.removeEventListener('click',onArmedClick);
    document.removeEventListener('keydown',onArmedEscape);
    rubberPath.remove();
    fromEl.classList.remove('dconn-source');
    if(hoverTarget){ hoverTarget.classList.remove('dconn-target'); hoverTarget=null; }
  };

  const onDragMove=mv=>{
    if(_pinchActive) return;
    if(Math.abs(mv.clientX-startX)>3||Math.abs(mv.clientY-startY)>3) dragged=true;
    updateRubberband(mv.clientX, mv.clientY);
    updateHover(mv.clientX, mv.clientY);
  };

  const onMouseUp=mv=>{
    document.removeEventListener('pointermove',onDragMove);
    document.removeEventListener('pointerup',onMouseUp);

    if(dragged){
      // A real drag occurred — same commit-or-cancel behavior as before,
      // then fully tear down (this gesture never arms).
      const el=document.elementFromPoint?document.elementFromPoint(mv.clientX, mv.clientY):null;
      const toBlock=el?el.closest('.dblock'):null;
      if(toBlock && toBlock!==fromEl){
        _commitRightAngleConnector(fromRid, toBlock.dataset.rid, attachFracX, attachFracY);
      }
      teardown();
    } else {
      // No real movement — this was a CLICK, not a drag. Instead of
      // cancelling, ARM: keep the rubber band and source highlight alive,
      // and switch to tracking mousemove/click independent of the mouse
      // button (which has now been released).
      RA_ARMED={ fromRid, teardown };
      document.addEventListener('mousemove', onArmedMove);
      document.addEventListener('click', onArmedClick);
      document.addEventListener('keydown', onArmedEscape);
    }
  };

  const onArmedMove=mv=>{
    if(_pinchActive) return;
    updateRubberband(mv.clientX, mv.clientY);
    updateHover(mv.clientX, mv.clientY);
  };

  const onArmedClick=cev=>{
    const el=cev.target;
    // A click landing on ANY "+" handle is handled by that handle's own
    // mousedown, which fires first and re-enters startRightAngleDraw
    // (cancelling or re-arming as appropriate) — skip here so the same
    // physical click isn't handled twice.
    if(el && el.closest && el.closest('.dra-handle')) return;

    const toBlock=el && el.closest ? el.closest('.dblock') : null;
    if(toBlock && toBlock!==fromEl){
      const toRid=toBlock.dataset.rid;
      cancelRightAngleArm();
      _commitRightAngleConnector(fromRid, toRid, attachFracX, attachFracY);
    } else {
      // Clicked the source block itself, empty canvas, or anywhere else
      // that's not a valid different target — cancel silently.
      cancelRightAngleArm();
    }
  };

  const onArmedEscape=kev=>{
    if(kev.key==='Escape') cancelRightAngleArm();
  };

  document.addEventListener('pointermove',onDragMove);
  document.addEventListener('pointerup',onMouseUp);
}

/* ── Diagram View: connector selection + edit popup ──
   Clicking directly on a connector's line selects it (SELECTED_CNX_ID)
   and opens a small floating popup — matching the existing comment-card
   popup convention — right next to the click point, with controls for
   Style (solid/dotted/double-arrow), Color, and Delete. Backspace deletes
   the selected connector too, as long as focus isn't inside a text field
   elsewhere. Clicking anywhere else (empty canvas, a block, another
   connector) deselects/closes the popup. */
function selectConnector(id, ev){
  SELECTED_CNX_ID=id;
  selectDiagBlock(null);
  renderDiagramConnectors(); // re-render so the selected line highlights
  openConnEditPopup(ev?.clientX, ev?.clientY);
}

function _selectedConnector(){
  return DIAGRAM_DATA.connectors.find(c=>c.id===SELECTED_CNX_ID) || null;
}

function setDiagramNewConnectorKind(kind){
  DIAGRAM_NEW_CONNECTOR_KIND=kind==='rightangle'?'rightangle':'curve';
  document.querySelectorAll('.diagram-link-type').forEach(btn=>{
    btn.classList.toggle('active',btn.dataset.kind===DIAGRAM_NEW_CONNECTOR_KIND);
  });
  const key=DIAGRAM_NEW_CONNECTOR_KIND==='curve'?'diagram.link.semantic':'diagram.link.structural';
  const status=document.getElementById('diagram-selection-status');
  if(status && !SELECTED_CNX_ID && !SELECTED_DIAG_RID) status.textContent=typeof t==='function'?t(key):DIAGRAM_NEW_CONNECTOR_KIND;
}

function syncDiagramWorkspaceUI(){
  document.querySelectorAll('.diagram-link-type').forEach(btn=>{
    btn.classList.toggle('active',btn.dataset.kind===DIAGRAM_NEW_CONNECTOR_KIND);
  });
  const splitButton=document.getElementById('diagram-split-words');
  splitButton?.classList.toggle('active',DIAGRAM_EDIT_MODE);
  splitButton?.setAttribute('aria-pressed',String(DIAGRAM_EDIT_MODE));
  const status=document.getElementById('diagram-selection-status');
  if(!status) return;
  const cnx=_selectedConnector();
  if(cnx){
    const from=document.querySelector(`.xrow[data-rid="${cnx.fromRid}"] .lid`)?.textContent||cnx.fromRid;
    const to=document.querySelector(`.xrow[data-rid="${cnx.toRid}"] .lid`)?.textContent||cnx.toRid;
    const kindKey=cnx.kind==='rightangle'?'diagram.link.structural':'diagram.link.semantic';
    status.textContent=(typeof t==='function'?t(kindKey):cnx.kind)+' · '+from+' → '+to;
    return;
  }
  if(SELECTED_DIAG_RID){
    const line=document.querySelector(`.xrow[data-rid="${SELECTED_DIAG_RID}"] .lid`)?.textContent||SELECTED_DIAG_RID;
    status.textContent=(typeof t==='function'?t('diagram.selection.block'):'Selected block')+' · '+line;
    return;
  }
  if(DIAGRAM_EDIT_MODE){
    status.textContent=typeof t==='function'?t('diagram.split-status'):'Split Words is on — click a word to create a new row.';
    return;
  }
  status.textContent=typeof t==='function'?t('diagram.selection.none'):'Select a block or relationship';
}

/* Reflects the selected connector's CURRENT property values onto every
   popup control (pattern, start cap, end cap, weight, color swatch).
   Called after opening the popup, after any style change, AND after an
   undo/redo that touches a 'connector-style' op — so if the popup is
   sitting open on a connector when you press Ctrl+Z, it immediately
   shows the reverted value rather than stale state. No-ops harmlessly if
   the popup isn't currently open. */
function _refreshConnEditPopupControls(){
  const cnx=_selectedConnector();
  const popup=document.getElementById('conn-edit-popup');
  if(!cnx || !popup || popup.style.display==='none') return;
  const pattern=cnx.pattern||'solid';
  const startCap=cnx.startCap||'none';
  const endCap=cnx.endCap||'arrow';
  const weight=cnx.weight||1;
  const color=cnx.color||'#F0D08F';
  popup.querySelectorAll('.cep-type-btn[data-kind]').forEach(b=>{
    b.classList.toggle('on',b.dataset.kind===(cnx.kind||'curve'));
  });
  // Pattern buttons (solid/dotted) — still direct toggle buttons
  popup.querySelectorAll('.cep-style-btn[data-pattern]').forEach(b=>{
    b.classList.toggle('on', b.dataset.pattern===pattern);
  });
  // Start cap dropdown — update trigger icon + mark active menu item
  const startIcon=document.getElementById('cep-start-icon');
  if(startIcon) startIcon.innerHTML=_capIconSvg(startCap,'start');
  popup.querySelectorAll('.cep-drop-item[data-cap-end="start"]').forEach(b=>{
    b.classList.toggle('on', b.dataset.cap===startCap);
  });
  // End cap dropdown — update trigger icon + mark active menu item
  const endIcon=document.getElementById('cep-end-icon');
  if(endIcon) endIcon.innerHTML=_capIconSvg(endCap,'end');
  popup.querySelectorAll('.cep-drop-item[data-cap-end="end"]').forEach(b=>{
    b.classList.toggle('on', b.dataset.cap===endCap);
  });
  // Weight dropdown — update trigger icon + mark active menu item
  const weightIcon=document.getElementById('cep-weight-icon');
  if(weightIcon) weightIcon.innerHTML=_weightIconSvg(weight);
  popup.querySelectorAll('.cep-drop-item[data-weight]').forEach(b=>{
    b.classList.toggle('on', Number(b.dataset.weight)===weight);
  });
  const swatch=document.getElementById('cep-color-swatch');
  if(swatch) swatch.style.background=color;
}

// Clicking the diagram canvas background deselects any selected block.
document.addEventListener('click', e=>{
  if(EDITOR_VIEW!=='diagram') return;
  if(e.target.closest('.dblock')||e.target.closest('.dlabel')||
     e.target.closest('.dra-handle')||e.target.closest('#conn-edit-popup')) return;
  if(SELECTED_CNX_ID!==null) closeConnEditPopup();
  selectDiagBlock(null);
});

// Click outside #bracket-edit-popup closes it (same pattern as conn-edit-popup).
document.addEventListener('click', e=>{
  const popup=document.getElementById('bracket-edit-popup');
  if(!popup || popup.style.display==='none') return;
  if(popup.contains(e.target)) return;
  // Keep open when clicking inside the color palette (separate DOM sibling)
  const palette=document.getElementById('color-palette-popover');
  if(palette && palette.style.display!=='none' && palette.contains(e.target)) return;
  // Keep open when clicking the bracket bar itself (its own onclick reopens)
  closeBracketEditPopup();
});

function openConnEditPopup(clientX, clientY){
  const cnx=_selectedConnector();
  const popup=document.getElementById('conn-edit-popup');
  if(!cnx || !popup) return;
  const zone=document.getElementById('dzone');
  if(zone&&popup.parentNode!==zone) zone.insertBefore(popup,zone.firstChild);
  popup.style.display='flex';
  popup.setAttribute('aria-hidden','false');
  _refreshConnEditPopupControls();
  syncDiagramWorkspaceUI();
}

function closeConnEditPopup(){
  const popup=document.getElementById('conn-edit-popup');
  if(popup){ popup.style.display='none'; popup.setAttribute('aria-hidden','true'); }
  closeCepDrops();
  closeColorPalette(); // a nested color palette shouldn't outlive its parent popup
  if(SELECTED_CNX_ID!==null){
    SELECTED_CNX_ID=null;
    renderDiagramConnectors(); // clear the selected-line highlight
  }
  syncDiagramWorkspaceUI();
}

/* Generic undo-tracked style setter, shared by every style control
   (pattern, start cap, end cap, weight, color) so EACH style change
   becomes its own independent undo step — Ctrl+Z after changing a color
   reverts JUST the color (not the connector's creation), same for
   pattern/caps/weight. Captures the previous value before applying the
   new one and pushes a 'connector-style' op (see applyRowUndo/
   applyRowRedo) that generically reverses/reapplies any of these
   properties by name. A no-op change (new value === current value)
   doesn't push anything, so re-clicking an already-active button never
   pollutes undo history with a null change. */
function _setConnectorStyleProp(prop, newValue){
  const cnx=_selectedConnector();
  if(!cnx) return;
  const oldValue=cnx[prop];
  if(oldValue===newValue) return;
  cnx[prop]=newValue;
  rowPush({type:'connector-style', cnxId:cnx.id, prop, oldValue, newValue});
  autoSave();
  renderDiagramConnectors();
  _refreshConnEditPopupControls();
}

/* Line pattern — solid/dotted, mutually exclusive, independent of caps. */
function setConnectorPattern(pattern){
  _setConnectorStyleProp('pattern', pattern);
}

function setConnectorKind(kind){
  _setConnectorStyleProp('kind',kind==='rightangle'?'rightangle':'curve');
}

/* Sets the cap (none/arrow/dot) at one end of the connector. 'end' is
   'start' or 'end', mapping to startCap/endCap respectively. Because
   each end is a single independent choice (not two combinable flags),
   a given endpoint can never end up with both an arrow AND a dot — there
   is no data shape that would allow it. Start and end are fully
   independent of each other (setting one never affects the other). */
function setConnectorCap(end, cap){
  _setConnectorStyleProp(end==='start' ? 'startCap' : 'endCap', cap);
}

/* Line weight — one of four fixed values, mutually exclusive
   (radio-style), independent of pattern and caps. */
function setConnectorWeight(weight){
  _setConnectorStyleProp('weight', weight);
}

function setConnectorColor(color){
  _setConnectorStyleProp('color', color);
}

/* Removes a connector by id, pushing a 'connector-remove' undo op (the
   mirror image of 'connector-add' — see applyRowUndo/applyRowRedo) so
   Ctrl+Z brings it back exactly as it was (same id/style/color/anchors). */
function removeConnectorById(id){
  const idx=DIAGRAM_DATA.connectors.findIndex(c=>c.id===id);
  if(idx===-1) return;
  const removed=DIAGRAM_DATA.connectors[idx];
  DIAGRAM_DATA.connectors.splice(idx,1);
  rowPush({type:'connector-remove', connector:removed});
  autoSave();
  const popup=document.getElementById('conn-edit-popup');
  if(popup) popup.style.display='none';
  closeColorPalette();
  if(SELECTED_CNX_ID===id) SELECTED_CNX_ID=null;
  renderDiagramConnectors();
  syncDiagramWorkspaceUI();
}

function deleteSelectedConnector(){
  if(!SELECTED_CNX_ID) return;
  removeConnectorById(SELECTED_CNX_ID);
}

/* ── Connector popup custom dropdowns (Start cap / End cap / Weight) ──
   Each dropdown trigger button opens a small upward menu. Only one can
   be open at a time. closeCepDrops() closes all of them. */
function closeCepDrops(){
  ['start','end','weight'].forEach(key=>{
    const menu=document.getElementById('cep-'+key+'-menu');
    const btn=document.getElementById('cep-'+key+'-btn');
    if(menu) menu.style.display='none';
    if(btn) btn.classList.remove('open');
  });
}

function toggleCepDrop(key){
  const menu=document.getElementById('cep-'+key+'-menu');
  const btn=document.getElementById('cep-'+key+'-btn');
  if(!menu) return;
  const isOpen=menu.style.display!=='none';
  closeCepDrops(); // close any other open dropdown first
  if(!isOpen){
    menu.style.display='flex';
    if(btn) btn.classList.add('open');
  }
}

/* Close cep dropdowns when clicking outside them */
document.addEventListener('click', e=>{
  const popup=document.getElementById('conn-edit-popup');
  if(!popup || popup.style.display==='none') return;
  if(e.target.closest('.cep-drop-wrap')) return; // click inside a dropdown wrap — handled by its own onclick
  closeCepDrops();
});

/* Returns the SVG innerHTML for a given cap type — used to update the
   dropdown trigger icon to reflect the current selection. */
function _capIconSvg(cap, end){
  if(cap==='arrow'){
    return end==='start'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="12" x2="20" y2="12"/><path d="M11 7l-5 5 5 5"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="12" x2="18" y2="12"/><path d="M13 7l5 5-5 5"/></svg>';
  }
  if(cap==='dot'){
    return end==='start'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="8" y1="12" x2="20" y2="12"/><circle cx="6" cy="12" r="3" fill="currentColor" stroke="none"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="4" y1="12" x2="16" y2="12"/><circle cx="18" cy="12" r="3" fill="currentColor" stroke="none"/></svg>';
  }
  // none
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="4" y1="12" x2="20" y2="12"/></svg>';
}

function _weightIconSvg(weight){
  const sw={1:'1',1.25:'1.75',1.5:'2.5',1.75:'3.25'}[weight]||'1';
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round"><line x1="4" y1="12" x2="20" y2="12"/></svg>`;
}

/* ── Shared two-layer color palette popover ──
   Used by the connector popup's Line Color control and the toolbar's
   Highlight Color button. NOT used by Text Color, which keeps its
   original plain native input. Layer 1 is the fixed PALETTE_PRESETS row;
   layer 2 is a per-tool "recently used" row, persisted in localStorage
   and capped at RECENT_COLOR_CAP, kept separate between tools (Highlight
   and Line Color each have their own list, per the original i18n/palette
   spec's stated principle). */
function _recentColorKey(toolKey){ return 'exeg-recent-color-'+toolKey; }

function getRecentColors(toolKey){
  try{
    const raw=localStorage.getItem(_recentColorKey(toolKey));
    const list=raw?JSON.parse(raw):[];
    return Array.isArray(list)?list:[];
  }catch(e){ return []; }
}

function pushRecentColor(toolKey, color){
  let list=getRecentColors(toolKey).filter(c=>String(c).toLowerCase()!==String(color).toLowerCase());
  list.unshift(color);
  if(list.length>RECENT_COLOR_CAP) list=list.slice(0,RECENT_COLOR_CAP);
  try{ localStorage.setItem(_recentColorKey(toolKey), JSON.stringify(list)); }catch(e){}
  return list;
}

function _makePaletteSwatchBtn(color){
  const b=document.createElement('button');
  b.type='button';
  b.className='cpp-swatch';
  b.style.background=color;
  b.title=color;
  b.addEventListener('click', ()=>applyPaletteColor(color));
  return b;
}

// Tools whose preset row uses the 8-color "spec" set (PALETTE_PRESETS_TEXT)
// rather than the 4 soft highlight tones (PALETTE_PRESETS_HL) — solid
// foreground/border colors read better from a wider spread than the soft
// highlight tones do.
const PALETTE_TEXT_LIKE_TOOLS=['textColor','studyTextColor'];

function _renderPaletteRows(){
  const presetRow=document.getElementById('cpp-preset-row');
  const recentRow=document.getElementById('cpp-recent-row');
  if(!presetRow||!recentRow) return;
  presetRow.innerHTML='';
  const presets=PALETTE_TEXT_LIKE_TOOLS.includes(PALETTE_ACTIVE_TOOL)?PALETTE_PRESETS_TEXT:PALETTE_PRESETS_HL;
  presets.forEach(c=>presetRow.appendChild(_makePaletteSwatchBtn(c)));
  recentRow.innerHTML='';
  if(PALETTE_ACTIVE_TOOL){
    getRecentColors(PALETTE_ACTIVE_TOOL).forEach(c=>recentRow.appendChild(_makePaletteSwatchBtn(c)));
  }
}

function openColorPalette(toolKey, triggerEl, currentColor){
  const pop=document.getElementById('color-palette-popover');
  // Toggle: if already open for the same tool, close it instead.
  if(pop && pop.style.display!=='none' && PALETTE_ACTIVE_TOOL===toolKey){
    closeColorPalette();
    return;
  }
  PALETTE_ACTIVE_TOOL=toolKey;
  if(!pop||!triggerEl) return;
  const nativeInput=document.getElementById('cpp-native');
  if(nativeInput) nativeInput.value=currentColor||'#000000';
  _renderPaletteRows();
  // Show remove-highlight button only for highlight-like tools
  const removeBtn=document.getElementById('cpp-remove-hl');
  if(removeBtn) removeBtn.style.display=toolKey==='highlight'?'block':'none';

  pop.style.display='flex';
  const r=triggerEl.getBoundingClientRect();
  const pw=pop.offsetWidth||160, ph=pop.offsetHeight||90;
  let left=r.left, top=r.bottom+6;
  left=Math.max(8, Math.min(window.innerWidth-pw-8, left));
  if(top+ph>window.innerHeight-8) top=r.top-ph-6; // flip above if it would overflow the bottom
  top=Math.max(8, top);
  pop.style.left=left+'px';
  pop.style.top=top+'px';
}

function closeColorPalette(){
  const pop=document.getElementById('color-palette-popover');
  if(pop) pop.style.display='none';
  PALETTE_ACTIVE_TOOL=null;
}

/* Applies a color for whichever tool currently owns the open palette, and
   records it in that tool's recent-colors list. Used by both the fixed
   preset swatches and the native input's change handler, so every path
   to "a color was chosen" goes through the same apply+remember logic. */
function applyPaletteColor(color){
  if(PALETTE_ACTIVE_TOOL==='highlight'){
    hlColor=color;
    const bar=document.getElementById('hl-bar');
    if(bar) bar.style.background=color;
    // Apply the highlight to the current selection now that the color is set.
    // closeColorPalette is called inside applyHl so we don't double-close.
    applyHl();
    return; // skip the pushRecentColor/renderPaletteRows below — applyHl handles closing
  } else if(PALETTE_ACTIVE_TOOL==='textColor'){
    txtColor=color;
    const bar=document.getElementById('txt-color-bar');
    if(bar) bar.style.background=color;
    fmtCmd('foreColor',color);
  } else if(PALETTE_ACTIVE_TOOL==='studyTextColor'){
    STUDY_NOTE_TEXT_COLOR=color;
    const bar=document.querySelector('#study-notebook-color i');
    if(bar) bar.style.background=color;
    studyNotebookFormat('foreColor',color);
  } else if(PALETTE_ACTIVE_TOOL==='lineColor'){
    setConnectorColor(color);

    autoSave();
  }
  if(PALETTE_ACTIVE_TOOL){
    pushRecentColor(PALETTE_ACTIVE_TOOL, color);
    _renderPaletteRows();
  }
  const nativeInput=document.getElementById('cpp-native');
  if(nativeInput) nativeInput.value=color;
}

function onPaletteNativeChange(color){
  applyPaletteColor(color);
}

// Dispatches the popover's "Remove highlight" button to the active editor.
function cppRemoveHl(){
  removeHl();
}

// Clicking anywhere outside the color palette popover (and outside its
// own trigger buttons, whose onclick already called openColorPalette
// again — reopening is harmless) closes it.
//
// Uses e.composedPath() rather than pop.contains(e.target): clicking a
// preset swatch calls applyPaletteColor() synchronously, which rebuilds
// the preset/recent rows (_renderPaletteRows) — that replaces the very
// swatch button the click landed on. By the time this bubbled listener
// runs, e.target is a now-detached node, so pop.contains(e.target) reads
// false even though the click was genuinely inside the popover, and the
// popover would incorrectly close itself immediately after every pick.
// composedPath() is captured at dispatch time and still lists the
// popover as an ancestor regardless of any DOM mutation the click's own
// handler made afterward.
document.addEventListener('click', e=>{
  const pop=document.getElementById('color-palette-popover');
  if(!pop || pop.style.display==='none') return;
  const path=e.composedPath?e.composedPath():[e.target];
  if(path.includes(pop)) return;
  // Also ignore clicks on any trigger button — their own onclick
  // handlers already manage opening/repositioning correctly.
  if(path.some(n=>n.closest && n.closest('#cep-color-swatch, #tb-hl, #tb-txt-color, #study-notebook-color, #bep-color-swatch'))) return;
  closeColorPalette();
});

/* Backspace AND Delete both delete the selected connector — but only when
   focus isn't inside any editable text field (a row cell, a comment, the
   translation line, a native input/textarea), so neither key interferes
   with normal text editing elsewhere in the app. */
document.addEventListener('keydown', e=>{
  if(e.key!=='Backspace' && e.key!=='Delete') return;
  if(!SELECTED_CNX_ID) return;
  const ae=document.activeElement;
  const tag=(ae&&ae.tagName||'').toLowerCase();
  if(tag==='input'||tag==='textarea') return;
  // Check both isContentEditable AND a direct attribute lookup (covers the
  // element itself or an ancestor) — belt-and-suspenders against any edge
  // case where isContentEditable's computed value might lag behind a
  // just-added contenteditable attribute.
  if(ae && (ae.isContentEditable || ae.closest?.('[contenteditable="true"]'))) return;
  e.preventDefault();
  deleteSelectedConnector();
});

// Clicking anywhere outside the popup (and outside a connector's own hit
// path, which stops propagation before this fires) closes it — same idiom
// as closeExportPopup()'s document-level click listener. Also ignores
// clicks inside the color palette popover, which is a SEPARATE sibling
// element (not nested in the DOM inside #conn-edit-popup) that can be
// open at the same time when editing a connector's line color.
document.addEventListener('click', e=>{
  const popup=document.getElementById('conn-edit-popup');
  if(!popup || popup.style.display==='none') return;
  if(popup.contains(e.target)) return; // click was inside the popup itself
  const palette=document.getElementById('color-palette-popover');
  if(palette && palette.style.display!=='none' && palette.contains(e.target)) return;
  closeConnEditPopup();
});

/* ════════════════════════════════════════
   LINE IDs
   Rows with a blank verse field inherit the
   last seen verse number for ID purposes,
   without writing to the verse input.
════════════════════════════════════════ */
/* Alternating row shading, computed here rather than via CSS :nth-child,
   because Proposition Dividers are inserted as direct DOM siblings of
   rows (row.before(el) in renderDividers) — a positional CSS selector
   counts EVERY sibling type, so a divider between two rows throws off
   the odd/even count for everything after it. Counting only .xrow
   elements keeps the alternating pattern correct regardless of how many
   dividers are interspersed. Called from recomputeIds() (row add/
   remove/reorder) and from the end of renderDividers() (divider add/
   remove doesn't change row order, but does change which rows sit next
   to a divider sibling, so shading needs the same recheck either way). */
function _applyRowShading(){
  let i=0;
  document.querySelectorAll('.xrow').forEach(row=>{
    row.classList.toggle('row-even', i%2===0);
    row.classList.toggle('row-odd', i%2===1);
    i++;
  });
  // Section strips span multiple rows, so anything that changes row
  // count/order needs them recomputed too — same reasoning, same fix
  // location as the shading itself just above.
  if(typeof renderSectionStrips==='function') renderSectionStrips();
}

// recomputeIds() does two full document.querySelectorAll('.xrow') passes over
// EVERY row in the project (its own pass + _applyRowShading()'s pass above) —
// fine for the other 13 call sites (discrete one-shot events: row add/split/
// merge/delete, undo/redo, load), but the verse-number <input>'s oninput fires
// it on every keystroke, which re-scans the whole document per character on
// large projects. Debounce ONLY this call site, not recomputeIds() itself, so
// every other caller keeps its immediate-consistency guarantee unchanged.
// 120ms is short enough that normal typing still feels live (letters settle
// right after each pause) while coalescing genuine rapid-fire bursts (held
// Backspace, paste) into one re-scan instead of one per character.
let _verseInputRecomputeT=null;
function _onVerseInput(){
  clearTimeout(_verseInputRecomputeT);
  _verseInputRecomputeT=setTimeout(recomputeIds,120);
  autoSave(); // unchanged — autoSave already has its own independent 700ms debounce
}
function recomputeIds(){
  const counts={};
  let lastVerse='';
  _applyRowShading();
  document.querySelectorAll('.xrow').forEach(row=>{
    const vi=row.querySelector('.vin');
    const lid=row.querySelector('.lid');
    const v=(vi?vi.value.trim():'')||'';
    // Use explicit verse if present, otherwise inherit last seen
    const effective=v||lastVerse;
    if(v) lastVerse=v; // update running verse only when explicitly set
    if(!effective){
      if(lid){lid.textContent='—';lid.style.opacity='.3';}
      return;
    }
    if(!counts[effective])counts[effective]=0;
    const letter=String.fromCharCode(97+counts[effective]++);
    if(lid){lid.textContent=effective+letter;lid.style.opacity='1';}
    const cid=row.dataset.cid;
    if(cid){const h=document.querySelector(`.ccard[data-cid="${cid}"] .chdr-i`);if(h)h.textContent=effective+letter;}
  });
  _syncCommentList();
  refreshDiagramIfActive();
}

/* ════════════════════════════════════════
   KEY HANDLERS
════════════════════════════════════════ */
function trackFocus(el,rid){
  activeEl=el;
  lastFocusedRowEl=document.querySelector(`.xrow[data-rid="${rid}"]`);
}
function onVerseKey(e,rid){
  if(e.key==='Enter'){e.preventDefault();focusOrig(rid);}
}
function focusOrig(rid){
  const ce=document.querySelector(`#oc-${rid} .cedit`);
  if(ce){ce.focus();placeCaret(ce,'end');}
}

function onKey(e,col,rid){
  if(e.key==='Tab'){e.preventDefault();doIndent(e.shiftKey?-1:1);return;}
  if(e.key==='Enter'){
    e.preventDefault();
    // Enter in the translation column does nothing structural — only the
    // original/Greek column can split a row.
    if(col!=='t') splitRow(col,rid);
    return;
  }
  if(e.key==='Backspace'){
    // Get the cell directly from the row — don't rely on activeEl which may be null
    const row=document.querySelector(`.xrow[data-rid="${rid}"]`);
    const ce=row?(col==='t'?row.querySelector(`#tc-${rid} .cedit`):row.querySelector(`#oc-${rid} .cedit`)):null;
    const indent=ce?parseInt(ce.dataset.indent||'0'):0;
    if(indent>0){
      // Always outdent if cell is indented, regardless of caret position
      e.preventDefault();
      activeEl=ce; // ensure activeEl is correct for doIndent
      doIndent(-1);
      return;
    }
    // Only merge rows from the original column — translation column
    // Backspace at start does nothing structural.
    if(col!=='t' && caretAtStart()){
      e.preventDefault();
      mergeRowUp(rid);
      return;
    }
  }
  // Arrow Down/Up: navigate to same column in adjacent row
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
    const allRows=_realRows();
    const idx=allRows.findIndex(r=>r.dataset.rid===String(rid));
    const targetIdx=e.key==='ArrowDown'?idx+1:idx-1;
    if(targetIdx>=0&&targetIdx<allRows.length){
      const targetRid=allRows[targetIdx].dataset.rid;
      const selector=col==='t'?`#tc-${targetRid} .cedit`:`#oc-${targetRid} .cedit`;
      const targetCell=document.querySelector(selector);
      if(targetCell){
        e.preventDefault();
        targetCell.focus();
        placeCaret(targetCell,'end');
        return;
      }
    }
  }
  setTimeout(()=>{
    saveRange();
    updateTb();
    const row=document.querySelector(`.xrow[data-rid="${rid}"]`);
    const ce=row?(col==='t'?row.querySelector(`#tc-${rid} .cedit`):row.querySelector(`#oc-${rid} .cedit`)):null;
    cleanEmptyCell(ce);
  },0);
}

function caretAtStart(){
  const sel=window.getSelection();
  if(!sel||!sel.rangeCount) return false;
  const r=sel.getRangeAt(0);
  if(!r.collapsed) return false;
  // If the active cell is empty, we're always at the start
  if(activeEl && !activeEl.innerText.trim()) return true;
  if(r.startOffset!==0) return false;
  // Check if we're in the first text node
  let n=r.startContainer;
  while(n&&n!==activeEl){
    if(n.previousSibling) return false;
    n=n.parentNode;
  }
  return true;
}

/* ════════════════════════════════════════
   SPLIT ROW (Enter key)
   Text after caret in orig cell → new row below
════════════════════════════════════════ */
function splitRow(col,rid){
  const row=document.querySelector(`.xrow[data-rid="${rid}"]`);
  if(!row)return;
  const ce=row.querySelector(`#oc-${rid} .cedit`);
  if(!ce){addEmptyRow(row);return;}

  const sel=window.getSelection();
  if(!sel||!sel.rangeCount){addEmptyRow(row);return;}
  const range=sel.getRangeAt(0);

  // Delete selected text first
  if(!range.collapsed) range.deleteContents();

  // Capture HTML after caret within the orig cell
  const afterRange=document.createRange();
  afterRange.setStart(range.startContainer,range.startOffset);
  afterRange.setEnd(ce,ce.childNodes.length);
  const afterFrag=afterRange.extractContents();

  const tmp=document.createElement('div');
  tmp.appendChild(afterFrag.cloneNode(true));
  const afterHTML=tmp.innerHTML;

  // Snapshot of current cell BEFORE the split (for undo)
  const origHTMLFull=ce.innerHTML+afterHTML; // what it was before extractContents

  // Inherit verse from current row
  const verse=row.querySelector('.vin')?.value||'';

  // Insert new row after current — verse field left blank so it doesn't repeat visually.
  // recomputeIds() will still assign the correct line letter by inheriting from above.
  const newRid=++RC;
  const newRow=makeRowEl(newRid,'','','',null);
  row.insertAdjacentElement('afterend',newRow);
  const newOc=newRow.querySelector(`#oc-${newRid} .cedit`);
  if(newOc) newOc.innerHTML=afterHTML;

  // Push a text snapshot FIRST so double-undo restores pre-split text state
  // (e.g. deleted a space, pressed Enter: two Ctrl+Z presses restore the space)
  rowPush({type:'textsnap',rid:String(rid),html:origHTMLFull});

  // Push to row undo stack
  // splitOffset = character length of what remains in the original cell after split
  // Used by undo to place the caret at the join point, not the end
  const splitOffset=ce.innerText.length;
  rowPush({
    type:'split',
    rid:String(rid), newRid:String(newRid),
    verse,
    origHTML:origHTMLFull,   // full pre-split content of the original cell
    afterHTML:ce.innerHTML,  // what stayed in the original cell after split
    newHTML:afterHTML,       // what went into the new row
    splitOffset              // caret position for undo
  });

  recomputeIds();
  autoSave();

  // Focus same column in new row
  setTimeout(()=>{
    const target=col==='t'?newRow.querySelector(`#tc-${newRid} .cedit`):newOc;
    if(target){target.focus();placeCaret(target,'start');}
    drawConns();
  },0);
}

/* ════════════════════════════════════════
   MERGE ROW UP (Backspace at start / Delete line button)
════════════════════════════════════════ */
function mergeRowUp(rid){
  const rows=Array.from(document.querySelectorAll('.xrow'));
  const idx=rows.findIndex(r=>r.dataset.rid===String(rid));
  if(idx<=0){toast(typeof t==='function'?t('toast.nothing-merge'):'Nothing to merge into');return;}
  const curRow=rows[idx];
  const prevRow=rows[idx-1];
  const prevRid=prevRow.dataset.rid;

  // Block merging across verse boundaries
  const curVerse=(curRow.querySelector('.vin')?.value||'').trim();
  const prevVerse=(prevRow.querySelector('.vin')?.value||'').trim();
  if(curVerse && prevVerse && curVerse!==prevVerse){
    toast(typeof t==='function'?t('toast.no-cross-verse-merge'):'Cannot merge across verse boundaries.');
    return;
  }

  const curOc=curRow.querySelector(`#oc-${rid} .cedit`);
  const prevOc=prevRow.querySelector(`#oc-${prevRid} .cedit`);
  if(!curOc||!prevOc)return;

  const curHTML=curOc.innerHTML;
  const prevHTMLBefore=prevOc.innerHTML;

  // Move content
  const tmp=document.createElement('div');
  tmp.innerHTML=curHTML;
  const insertOffset=prevOc.childNodes.length;
  while(tmp.firstChild) prevOc.appendChild(tmp.firstChild);

  // Translation cells are a separate sibling structure (#tc-<rid>, not
  // nested under #oc-<rid>) and don't exist at all in single-language
  // sessions — move it the same way as the original text, but only if
  // both sides actually have one.
  const curTc=curRow.querySelector(`#tc-${rid} .cedit`);
  const prevTc=prevRow.querySelector(`#tc-${prevRid} .cedit`);
  let prevTransHTMLBefore='', curTransHTML='';
  if(curTc && prevTc){
    curTransHTML=curTc.innerHTML;
    prevTransHTMLBefore=prevTc.innerHTML;
    // Translation is plain prose (not word-span-wrapped like the
    // original text), so two merged phrases need an explicit separator
    // or they'd visually run together as one word — but only insert it
    // if the destination already has real content to separate from.
    if(prevTc.textContent.trim().length>0 && curTc.textContent.trim().length>0){
      prevTc.appendChild(document.createTextNode(' '));
    }
    const transTmp=document.createElement('div');
    transTmp.innerHTML=curTransHTML;
    while(transTmp.firstChild) prevTc.appendChild(transTmp.firstChild);
  }

  // Remove cur row
  const removedVerse=curRow.querySelector('.vin')?.value||'';
  curRow.remove();
  recomputeIds();
  autoSave();

  // Push to row undo stack
  rowPush({
    type:'merge',
    prevRid:String(prevRid),
    removedRid:String(rid),
    prevHTML:prevHTMLBefore,
    removedHTML:curHTML,
    prevTransHTML:prevTransHTMLBefore,
    removedTransHTML:curTransHTML,
    removedVerse
  });

  // Focus end of prev orig cell
  setTimeout(()=>{
    prevOc.focus();
    // Place caret at join point (before the appended content)
    const nodes=Array.from(prevOc.childNodes);
    if(nodes.length>insertOffset){
      const r=document.createRange();
      r.setStart(nodes[insertOffset],0);
      r.collapse(true);
      const s=window.getSelection();s.removeAllRanges();s.addRange(r);
    } else {
      placeCaret(prevOc,'end');
    }
    drawConns();
  },0);
}

function deleteFocusedRow(){
  if(!lastFocusedRowEl)return;
  const rid=lastFocusedRowEl.dataset.rid;
  mergeRowUp(rid);
}

// Genuinely discards a row's content — distinct from mergeRowUp()/
// "Merge line up" above, which folds the row into the previous one and is
// this app's only other row-removal action. Additive: does not change
// mergeRowUp's own behavior or its Ctrl+-/Backspace-at-start bindings.
function deleteRowContent(rid){
  if(!rid) return;
  const rows=Array.from(document.querySelectorAll('.xrow'));
  const idx=rows.findIndex(r=>r.dataset.rid===String(rid));
  if(idx<0) return;
  const row=rows[idx];
  const afterRid=idx>0?rows[idx-1].dataset.rid:null;
  const verse=row.querySelector('.vin')?.value||'';
  const oc=row.querySelector(`#oc-${rid} .cedit`);
  const tc=row.querySelector(`#tc-${rid} .cedit`);
  const html=oc?oc.innerHTML:'';
  const transHTML=tc?tc.innerHTML:'';
  row.remove();
  recomputeIds();
  autoSave();
  rowPush({type:'row-delete', rid:String(rid), afterRid, verse, html, transHTML});
}
function deleteFocusedRowContent(){
  if(!lastFocusedRowEl)return;
  deleteRowContent(lastFocusedRowEl.dataset.rid);
}

/* ════════════════════════════════════════
   ROW-LEVEL UNDO STACK
   Only tracks split/merge/add row operations.
   Text edits inside cells use native browser undo (Ctrl+Z).
════════════════════════════════════════ */
const ROW_STACK=[];   // [{type,data}]
const ROW_REDO=[];
const MAX_ROW=50;

function rowPush(op){
  ROW_STACK.push(op);
  if(ROW_STACK.length>MAX_ROW) ROW_STACK.shift();
  ROW_REDO.length=0;
}

function undo(){
  // If there's a row-level op on the stack, reverse it first
  if(ROW_STACK.length){
    const op=ROW_STACK.pop();
    ROW_REDO.push(op);
    applyRowUndo(op);
    recomputeIds(); drawConns(); autoSave();
    updateTb();
    return;
  }
  // Otherwise native text undo
  ensureFocus();
  document.execCommand('undo',false,null);
  // Suppress carry-forward: blur then refocus WITHOUT restoring the old
  // saved range. restoreRange() would re-anchor the caret at the pre-undo
  // position and re-activate any pending format state (bold, italic, etc.)
  // that the undo was supposed to clear.
  setTimeout(()=>{
    if(activeEl){activeEl.blur();activeEl.focus();}
    updateTb();
  },0);
}

function redo(){
  if(ROW_REDO.length){
    const op=ROW_REDO.pop();
    ROW_STACK.push(op);
    applyRowRedo(op);
    recomputeIds(); drawConns(); autoSave();
    updateTb();
    return;
  }
  ensureFocus();
  document.execCommand('redo',false,null);
  setTimeout(()=>{
    if(activeEl){activeEl.blur();activeEl.focus();}
    updateTb();
  },0);
}

// Shared by 'row-add' and 'row-delete' undo/redo — 'row-add' undo and
// 'row-delete' redo both just remove a row by id; 'row-add' redo and
// 'row-delete' undo both reconstruct and reinsert one. Factored out once
// instead of duplicated four times across applyRowUndo/applyRowRedo.
function _removeRowById(rid){
  const row=document.querySelector(`.xrow[data-rid="${rid}"]`);
  if(row) row.remove();
}
// pos.afterRid set = insert right after that row. pos.afterRid null with
// pos.atEnd true = append to the very end (matches addRow()'s own "no
// afterEl" behavior, used by 'row-add'). pos.afterRid null with pos.atEnd
// false = the row was the very first row when removed, so prepend it back
// to the start (used by 'row-delete', where null never means "goes at the
// end" — it means "there was nothing before it").
function _reinsertRow(rid, verse, html, transHTML, pos){
  const row=makeRowEl(rid, verse||'', html||'', transHTML||'', null);
  row.dataset.rid=rid;
  const body=document.getElementById('rows-body');
  const afterRow=pos.afterRid?document.querySelector(`.xrow[data-rid="${pos.afterRid}"]`):null;
  if(afterRow) afterRow.insertAdjacentElement('afterend',row);
  else if(pos.atEnd) body.appendChild(row);
  else body.prepend(row);
  return row;
}

function applyRowUndo(op){
  // Bracket ops — handled entirely by bracket system
  if(typeof _brkApplyUndo==='function' && _brkApplyUndo(op)) return;
  if(op.type==='sec-style'){
    const ann=ANNOTATIONS.find(a=>a.id===op.id && a.type==='section');
    if(ann){ ann[op.prop]=op.oldVal; renderSectionStrips(); if(EDITOR_VIEW==='diagram') renderDiagram(); }
    return;
  }
  // Annotation ops (dividers, arrows, spans, arcs)
  if(typeof _annApplyUndo==='function' && _annApplyUndo(op)) return;
  if(op.type==='tgl-dividers'){ _setDividersVisible(op.prev); return; }
  if(op.type==='tgl-sections'){ _setSectionsVisible(op.prev); return; }
  if(op.type==='tgl-dgtrans'){ _setDgTransVisible(op.prev); return; }
  if(op.type==='tgl-dsec-end'){ _setDgSecEndVisible(op.prev); return; }
  if(op.type==='fsz-orig'){ _applyOrigSize(op.prev); return; }
  if(op.type==='fsz-trans'){ _applyTransSize(op.prev); return; }
  if(op.type==='fsz-both'){ _applyBothSize(op.prev); return; }
  if(op.type==='indent'){
    // Re-query the cell from the DOM (op.el reference may be stale)
    const row=document.querySelector(`.xrow[data-rid="${op.rid}"]`);
    const ce=row?row.querySelector('.cedit[data-indent]')||row.querySelector('.cedit'):op.el;
    if(ce){ ce.dataset.indent=op.prev; applyIndentStyle(ce); ce.focus(); }
    return;
  }
  if(op.type==='clear'){
    // Restore the full session state from before the clear
    loadData(op.snapshot);
    toast(typeof t==='function'?t('toast.clear-undone'):'Clear undone');
    return;
  }
  if(op.type==='connector-add'){
    // Undoing a connector creation removes it by id (re-querying DIAGRAM_DATA
    // fresh rather than relying on array index, since other ops may have
    // run in between).
    const idx=DIAGRAM_DATA.connectors.findIndex(c=>c.id===op.connector.id);
    if(idx!==-1) DIAGRAM_DATA.connectors.splice(idx,1);
    return;
  }
  if(op.type==='connector-remove'){
    // Undoing a connector deletion re-adds the exact same connector object
    // (same id/style/color/anchor fractions) that was removed.
    const exists=DIAGRAM_DATA.connectors.some(c=>c.id===op.connector.id);
    if(!exists) DIAGRAM_DATA.connectors.push(op.connector);
    return;
  }
  if(op.type==='connector-style'){
    // Undoing a style change (pattern/startCap/endCap/weight/color)
    // restores the property's PREVIOUS value — Ctrl+Z after a color
    // change reverts just the color, not the connector's creation.
    // Refreshes the edit popup's controls too, in case it's still open
    // and showing this exact connector (so it doesn't show stale state).
    const cnx=DIAGRAM_DATA.connectors.find(c=>c.id===op.cnxId);
    if(cnx){ cnx[op.prop]=op.oldValue; if(typeof _refreshConnEditPopupControls==='function') _refreshConnEditPopupControls(); }
    return;
  }
  if(op.type==='textsnap'){
    // Restore cell text content before a split (for undo-chain fidelity)
    const row=document.querySelector(`.xrow[data-rid="${op.rid}"]`);
    const ce=row?row.querySelector('.cedit'):null;
    if(ce){
      ce.innerHTML=op.html||'';
      ce.focus();
      placeCaret(ce,'end');
    }
    return;
  }
  if(op.type==='labeladd'){
    // Undo adding a label: remove it from data and re-render
    DIAGRAM_DATA.labels=DIAGRAM_DATA.labels.filter(l=>l.id!==op.id);
    renderDiagram();
    return;
  }
  if(op.type==='labelremove'){
    // Undo removing a label: restore it from its pre-delete snapshot —
    // same restore logic as labeladd's redo below, since this op is
    // labeladd's exact mirror image.
    if(!DIAGRAM_DATA.labels.find(l=>l.id===op.id)){
      DIAGRAM_DATA.labels.push({...op.snapshot});
    }
    renderDiagram();
    return;
  }
  // ── Comment box ops ───────────────────────────────────────────────────
  if(op.type==='cmt-add'){
    // Undo comment creation: remove the card and unmark the row
    const card=document.querySelector(`.ccard[data-cid="${op.cid}"]`);
    if(card) card.remove();
    const row=document.querySelector(`.xrow[data-rid="${op.rid}"]`);
    if(row){row.classList.remove('has-cmt');delete row.dataset.cid;
      const btn=row.querySelector('.cmtbtn');if(btn)btn.classList.remove('on');}
    _dcmtSyncBadge(op.rid);
    _syncCommentList(); return;
  }
  if(op.type==='cmt-remove'){
    // Undo comment deletion: restore the card
    const list=_commentList();if(!list)return;
    const existing=document.querySelector(`.ccard[data-cid="${op.cid}"]`);
    if(!existing){
      const card=_buildCmtCard(op.cid,op.rid,op.lid,op.top,op.left,op.width,op.html);
      list.appendChild(card);
    }
    const row=document.querySelector(`.xrow[data-rid="${op.rid}"]`);
    if(row){row.dataset.cid=op.cid;row.classList.add('has-cmt');
      const btn=row.querySelector('.cmtbtn');if(btn)btn.classList.add('on');}
    _dcmtSyncBadge(op.rid);
    _syncCommentList(); return;
  }
  if(op.type==='cmt-move'){
    // Legacy layout-only operation: Notes now flow in document order.
    return;
  }
  if(op.type==='cmt-text'){
    const card=document.querySelector(`.ccard[data-cid="${op.cid}"]`);
    const ed=card?card.querySelector('.cedit-c'):null;
    if(ed){ed.innerHTML=op.before;_cmtTextBefore[op.cid]=op.before;}
    return;
  }
  if(op.type==='text-edit'){
    const ed=document.querySelector(`#${op.col==='o'?'oc':'tc'}-${op.rid} .cedit`);
    if(ed) ed.innerHTML=op.before;
    if(op.col==='t'){
      const trans=document.querySelector(`.dblock[data-rid="${op.rid}"] .dblock-trans`);
      if(trans) trans.innerHTML=op.before;
    }
    _textBefore[op.rid+':'+op.col]=op.before;
    autoSave();
    return;
  }
  if(op.type==='lblsnap'){
    const lb=DIAGRAM_DATA.labels.find(l=>l.id===op.id);
    if(lb){
      if(op.after===null) op.after={x:lb.x,y:lb.y};
      Object.assign(lb, op.before);
      renderDiagram();
    }
    return;
  }
  if(op.type==='fmtsnap'){
    // correct column ('o' = original/Greek, 't' = translation).
    const row=document.querySelector(`.xrow[data-rid="${op.rid}"]`);
    const ce=row?(op.colKey==='t'
      ?row.querySelector(`#tc-${op.rid} .cedit`)
      :row.querySelector(`#oc-${op.rid} .cedit`)):null;
    if(ce){
      if(op.after===null) op.after=ce.innerHTML; // lazy capture for redo
      ce.innerHTML=op.before||'';
      ce.focus();
      placeCaret(ce,'end');
      updateTb();
      autoSave();
    }
    return;
  }
  if(op.type==='row-add'){
    _removeRowById(op.rid);
    return;
  }
  if(op.type==='row-delete'){
    const restored=_reinsertRow(op.rid, op.verse, op.html, op.transHTML, {afterRid:op.afterRid, atEnd:false});
    const oc=restored.querySelector(`#oc-${op.rid} .cedit`);
    if(oc){ oc.focus(); placeCaret(oc,'start'); }
    return;
  }
  if(op.type==='split'){
    // Remove the new row, restore the original cell HTML
    const newRow=document.querySelector(`.xrow[data-rid="${op.newRid}"]`);
    if(newRow) newRow.remove();
    const origRow=document.querySelector(`.xrow[data-rid="${op.rid}"]`);
    if(origRow){
      const oc=origRow.querySelector(`#oc-${op.rid} .cedit`);
      if(oc){
        oc.innerHTML=op.origHTML;
        oc.focus();
        // Place caret at the split point (where Enter was pressed), not at end
        placeCaretAtOffset(oc, op.splitOffset||0);
      }
    }
  } else if(op.type==='merge'){
    // Restore prev cell, re-insert the removed row
    const prevRow=document.querySelector(`.xrow[data-rid="${op.prevRid}"]`);
    if(prevRow){
      const oc=prevRow.querySelector(`#oc-${op.prevRid} .cedit`);
      if(oc) oc.innerHTML=op.prevHTML;
      if(op.prevTransHTML!==undefined){
        const tc=prevRow.querySelector(`#tc-${op.prevRid} .cedit`);
        if(tc) tc.innerHTML=op.prevTransHTML;
      }
    }
    const restored=makeRowEl(op.removedRid, op.removedVerse, op.removedHTML, op.removedTransHTML||'', null);
    restored.dataset.rid=op.removedRid;
    if(prevRow) prevRow.insertAdjacentElement('afterend',restored);
    else document.getElementById('rows-body').appendChild(restored);
    const oc2=restored.querySelector(`#oc-${op.removedRid} .cedit`);
    if(oc2){ oc2.focus(); placeCaret(oc2,'start'); }
  }
}

function applyRowRedo(op){
  // Bracket ops — handled entirely by bracket system
  if(typeof _brkApplyRedo==='function' && _brkApplyRedo(op)) return;
  if(op.type==='sec-style'){
    const ann=ANNOTATIONS.find(a=>a.id===op.id && a.type==='section');
    if(ann){ ann[op.prop]=op.newVal; renderSectionStrips(); if(EDITOR_VIEW==='diagram') renderDiagram(); }
    return;
  }
  // Annotation ops
  if(typeof _annApplyRedo==='function' && _annApplyRedo(op)) return;
  if(op.type==='tgl-dividers'){ _setDividersVisible(op.next); return; }
  if(op.type==='tgl-sections'){ _setSectionsVisible(op.next); return; }
  if(op.type==='tgl-dgtrans'){ _setDgTransVisible(op.next); return; }
  if(op.type==='tgl-dsec-end'){ _setDgSecEndVisible(op.next); return; }
  if(op.type==='fsz-orig'){ _applyOrigSize(op.next); return; }
  if(op.type==='fsz-trans'){ _applyTransSize(op.next); return; }
  if(op.type==='fsz-both'){ _applyBothSize(op.next); return; }
  if(op.type==='indent'){
    const row=document.querySelector(`.xrow[data-rid="${op.rid}"]`);
    const ce=row?row.querySelector('.cedit[data-indent]')||row.querySelector('.cedit'):op.el;
    if(ce){ ce.dataset.indent=op.next; applyIndentStyle(ce); ce.focus(); }
    return;
  }
  if(op.type==='clear'){
    // Re-apply the clear
    document.getElementById('rows-body').innerHTML='';
    document.querySelectorAll('.ccard').forEach(c=>c.remove());
    document.getElementById('refin').value='';
    document.getElementById('svgl')?.replaceChildren();
    RC=CC=0; addEmptyRow();
    toast(typeof t==='function'?t('toast.cleared-short'):'Cleared');
    return;
  }
  if(op.type==='connector-add'){
    // Redoing a connector creation re-adds the exact same connector object
    // (same id/style/color/anchor fractions) that was removed by undo.
    // Guard against double-adding if it somehow wasn't removed.
    const exists=DIAGRAM_DATA.connectors.some(c=>c.id===op.connector.id);
    if(!exists) DIAGRAM_DATA.connectors.push(op.connector);
    return;
  }
  if(op.type==='connector-remove'){
    // Redoing a connector deletion removes it again by id.
    const idx=DIAGRAM_DATA.connectors.findIndex(c=>c.id===op.connector.id);
    if(idx!==-1) DIAGRAM_DATA.connectors.splice(idx,1);
    return;
  }
  if(op.type==='connector-style'){
    // Redoing a style change reapplies the property's NEW value.
    const cnx=DIAGRAM_DATA.connectors.find(c=>c.id===op.cnxId);
    if(cnx){ cnx[op.prop]=op.newValue; if(typeof _refreshConnEditPopupControls==='function') _refreshConnEditPopupControls(); }
    return;
  }
  if(op.type==='labeladd'){
    // Redo adding a label: re-insert from snapshot and re-render
    if(!DIAGRAM_DATA.labels.find(l=>l.id===op.id)){
      DIAGRAM_DATA.labels.push({...op.snapshot});
    }
    renderDiagram();
    return;
  }
  if(op.type==='labelremove'){
    // Redo removing a label: remove it again — same logic as labeladd's
    // undo above, since this op is labeladd's exact mirror image.
    DIAGRAM_DATA.labels=DIAGRAM_DATA.labels.filter(l=>l.id!==op.id);
    renderDiagram();
    return;
  }
  // ── Comment box ops ───────────────────────────────────────────────────
  if(op.type==='cmt-add'){
    // Redo comment creation: rebuild the card
    const list=_commentList();if(!list)return;
    const existing=document.querySelector(`.ccard[data-cid="${op.cid}"]`);
    if(!existing){
      const card=_buildCmtCard(op.cid,op.rid,op.lid,op.top,op.left,op.width,'');
      list.appendChild(card);
    }
    const row=document.querySelector(`.xrow[data-rid="${op.rid}"]`);
    if(row){row.dataset.cid=op.cid;row.classList.add('has-cmt');
      const btn=row.querySelector('.cmtbtn');if(btn)btn.classList.add('on');}
    _dcmtSyncBadge(op.rid);
    _syncCommentList(); return;
  }
  if(op.type==='cmt-remove'){
    // Redo comment deletion: remove the card again
    const card=document.querySelector(`.ccard[data-cid="${op.cid}"]`);
    if(card) card.remove();
    const row=document.querySelector(`.xrow[data-rid="${op.rid}"]`);
    if(row){row.classList.remove('has-cmt');delete row.dataset.cid;
      const btn=row.querySelector('.cmtbtn');if(btn)btn.classList.remove('on');}
    _dcmtSyncBadge(op.rid);
    _syncCommentList(); return;
  }
  if(op.type==='cmt-move'){
    // Legacy layout-only operation: Notes now flow in document order.
    return;
  }
  if(op.type==='cmt-text'){
    const card=document.querySelector(`.ccard[data-cid="${op.cid}"]`);
    const ed=card?card.querySelector('.cedit-c'):null;
    if(ed){ed.innerHTML=op.after;_cmtTextBefore[op.cid]=op.after;}
    return;
  }
  if(op.type==='text-edit'){
    const ed=document.querySelector(`#${op.col==='o'?'oc':'tc'}-${op.rid} .cedit`);
    if(ed) ed.innerHTML=op.after;
    if(op.col==='t'){
      const trans=document.querySelector(`.dblock[data-rid="${op.rid}"] .dblock-trans`);
      if(trans) trans.innerHTML=op.after;
    }
    _textBefore[op.rid+':'+op.col]=op.after;
    autoSave();
    return;
  }
  if(op.type==='lblsnap'){
    // Redo a bracket drag/delete: restore label fields from 'after' snapshot.
    const lb=DIAGRAM_DATA.labels.find(l=>l.id===op.id);
    if(lb&&op.after!==null){
      Object.assign(lb, op.after);
      renderDiagram();
    }
    return;
  }
  if(op.type==='fmtsnap'){
    // Redo an inline formatting op by restoring the 'after' innerHTML.
    // Use colKey to pick the correct column.
    const row=document.querySelector(`.xrow[data-rid="${op.rid}"]`);
    const ce=row?(op.colKey==='t'
      ?row.querySelector(`#tc-${op.rid} .cedit`)
      :row.querySelector(`#oc-${op.rid} .cedit`)):null;
    if(ce&&op.after!==null){
      ce.innerHTML=op.after;
      ce.focus();
      placeCaret(ce,'end');
      updateTb();
      autoSave();
    }
    return;
  }
  if(op.type==='row-add'){
    const restored=_reinsertRow(op.rid, '', '', '', {afterRid:op.afterRid, atEnd:true});
    const oc=restored.querySelector(`#oc-${op.rid} .cedit`);
    if(oc){ oc.focus(); placeCaret(oc,'start'); }
    return;
  }
  if(op.type==='row-delete'){
    _removeRowById(op.rid);
    return;
  }
  if(op.type==='split'){
    const origRow=document.querySelector(`.xrow[data-rid="${op.rid}"]`);
    if(!origRow) return;
    const oc=origRow.querySelector(`#oc-${op.rid} .cedit`);
    if(oc) oc.innerHTML=op.afterHTML;
    const newRow=makeRowEl(op.newRid, op.verse, op.newHTML,'',null);
    newRow.dataset.rid=op.newRid;
    origRow.insertAdjacentElement('afterend',newRow);
    const noc=newRow.querySelector(`#oc-${op.newRid} .cedit`);
    if(noc){ noc.focus(); placeCaret(noc,'start'); }
  } else if(op.type==='merge'){
    const removedRow=document.querySelector(`.xrow[data-rid="${op.removedRid}"]`);
    if(removedRow){
      const prevRow=document.querySelector(`.xrow[data-rid="${op.prevRid}"]`);
      const prevOc=prevRow&&prevRow.querySelector(`#oc-${op.prevRid} .cedit`);
      if(prevOc){
        // Record join offset before appending
        const joinOffset=prevOc.innerText.length;
        const tmp=document.createElement('div');
        tmp.innerHTML=op.removedHTML;
        while(tmp.firstChild) prevOc.appendChild(tmp.firstChild);
        if(op.removedTransHTML){
          const prevTc=prevRow.querySelector(`#tc-${op.prevRid} .cedit`);
          if(prevTc){
            if(prevTc.textContent.trim().length>0 && op.removedTransHTML.trim().length>0){
              prevTc.appendChild(document.createTextNode(' '));
            }
            const transTmp=document.createElement('div');
            transTmp.innerHTML=op.removedTransHTML;
            while(transTmp.firstChild) prevTc.appendChild(transTmp.firstChild);
          }
        }
        removedRow.remove();
        prevOc.focus();
        // Place caret at join point
        placeCaretAtOffset(prevOc, joinOffset);
      } else {
        removedRow.remove();
      }
    }
  }
}

/* ════════════════════════════════════════
   INDENT / OUTDENT
   Stored as data-indent on the .cedit div.
   Applied as padding via inline style.
   No DOM restructuring — fully safe with contenteditable.
════════════════════════════════════════ */
const INDENT_PX=32;

function doIndent(dir){
  const ce=activeEl;
  if(!ce||!ce.classList.contains('cedit')) return;
  const rid=ce.closest('.xrow')?.dataset.rid;
  const prevIndent=parseInt(ce.dataset.indent||'0');
  const next=Math.max(0, prevIndent+dir);
  if(next===prevIndent) return; // already at 0 and outdenting — nothing to do
  ce.dataset.indent=next;
  applyIndentStyle(ce);
  // Push to ROW_STACK so Ctrl+Z can reverse it
  rowPush({type:'indent', rid:String(rid||''), el:ce, prev:prevIndent, next});
  refreshDiagramIfActive();
  autoSave();
}

function applyIndentStyle(ce){
  const n=parseInt(ce.dataset.indent||'0');
  if(ce.classList.contains('rtl')){
    ce.style.paddingLeft='0';
    ce.style.paddingRight=(n*INDENT_PX)+'px';
  } else {
    ce.style.paddingLeft=(n*INDENT_PX)+'px';
    ce.style.paddingRight='0';
  }
}

/* Set a row's Original-cell indent level directly by row ID, rather than
   via activeEl/focus + Tab direction (which is how doIndent() works).
   This is what Diagram View's drag-to-indent uses — it pushes the SAME
   {type:'indent',...} op shape onto ROW_STACK as doIndent(), so Ctrl+Z/
   Ctrl+Y already work for drags with no changes needed to undo()/redo()/
   applyRowUndo()/applyRowRedo(). Returns true if the indent actually changed. */
function setRowIndent(rid, newLevel){
  const row=document.querySelector(`.xrow[data-rid="${rid}"]`);
  const ce=row?row.querySelector(`#oc-${rid} .cedit`):null;
  if(!ce) return false;
  const prev=parseInt(ce.dataset.indent||'0');
  const next=Math.max(0, newLevel);
  if(next===prev) return false;
  ce.dataset.indent=next;
  applyIndentStyle(ce);
  rowPush({type:'indent', rid:String(rid||''), el:ce, prev, next});
  refreshDiagramIfActive();
  autoSave();
  return true;
}

function restoreAllIndents(){
  document.querySelectorAll('.cedit[data-indent]').forEach(applyIndentStyle);
}

/* ════════════════════════════════════════
   CARET
════════════════════════════════════════ */
function placeCaret(el,where){
  const r=document.createRange();
  if(where==='end'){r.selectNodeContents(el);r.collapse(false);}
  else{r.setStart(el,0);r.collapse(true);}
  const s=window.getSelection();s.removeAllRanges();s.addRange(r);
}

// Place caret at a character offset within a contenteditable element
// by walking its text nodes
function placeCaretAtOffset(el, charOffset){
  const walker=document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
  let remaining=charOffset;
  let node=walker.nextNode();
  while(node){
    const len=node.textContent.length;
    if(remaining<=len){
      const r=document.createRange();
      r.setStart(node, remaining);
      r.collapse(true);
      const s=window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
      return;
    }
    remaining-=len;
    node=walker.nextNode();
  }
  // Fallback: end of element
  placeCaret(el,'end');
}

/* ════════════════════════════════════════
   TOOLBAR
════════════════════════════════════════ */
function saveRange(){const s=window.getSelection();if(s&&s.rangeCount)savedRange=s.getRangeAt(0).cloneRange();}
function restoreRange(){if(!savedRange)return;try{const s=window.getSelection();s.removeAllRanges();s.addRange(savedRange);}catch(_){}}
function ensureFocus(){if(activeEl){activeEl.focus();restoreRange();}}

function fmtCmd(cmd,val){
  ensureFocus();
  document.execCommand(cmd,false,val||null);
  if(activeEl?.classList?.contains('structure-row-edit')){
    structureSyncRow(activeEl,activeEl.dataset.rid,activeEl.dataset.col);
  }
  if(activeEl?.classList?.contains('compare-edit')&&activeEl.dataset.comparePane!==undefined){
    compareEdit(Number(activeEl.dataset.comparePane),activeEl.dataset.rid,activeEl.dataset.col,activeEl);
  }
  if(activeEl?.dataset?.compareNote!==undefined) compareSaveNoteInput(activeEl);
  updateTb();
  // For collapsed selections (no text selected), the browser sets a
  // "pending format" for the next typed character. Calling updateTb()
  // immediately after ensures the toolbar button correctly reflects
  // the new pending state (on vs off) without carry-forward after undo.
  // We do NOT blur/refocus here — that would clear the pending state
  // and break the feature. The carry-forward suppression only applies
  // in undo() where we want to clear stale pending state.
}
/* ── Phrasing font-size controls ──────────────────────────────────────
   Three independent step functions:
   • _stepOrigSize / _stepTransSize — Hebrew & Greek sessions, via the
     split popover (one column at a time)
   • _stepBothSize — Chinese & Custom sessions, via the single toolbar
     stepper (both columns move together, matching the old unified
     behaviour minus the removed per-selection sizing)
   Each pushes a ROW_STACK op so Ctrl+Z / Ctrl+Y step through size changes
   exactly like any other editor action (see applyRowUndo/applyRowRedo). */
function _applyOrigSize(px){
  CEDIT_O_SIZE=px;
  document.documentElement.style.setProperty('--cedit-o-size', px+'px');
  document.querySelectorAll('[id^="oc-"] .cedit').forEach(c=>{ c.style.fontSize=px+'px'; });
  const t1=document.getElementById('fsz-orig-txt'); if(t1) t1.textContent=px+'px';
  if(typeof renderSectionStrips==='function') renderSectionStrips();
  autoSave();
}
function _applyTransSize(px){
  CEDIT_T_SIZE=px;
  document.documentElement.style.setProperty('--cedit-t-size', px+'px');
  document.querySelectorAll('[id^="tc-"] .cedit').forEach(c=>{ c.style.fontSize=px+'px'; });
  const t2=document.getElementById('fsz-trans-txt'); if(t2) t2.textContent=px+'px';
  if(typeof renderSectionStrips==='function') renderSectionStrips();
  autoSave();
}
function _applyBothSize(px){
  CEDIT_O_SIZE=px; CEDIT_T_SIZE=px;
  document.documentElement.style.setProperty('--cedit-o-size', px+'px');
  document.documentElement.style.setProperty('--cedit-t-size', px+'px');
  document.querySelectorAll('.cedit').forEach(c=>{ c.style.fontSize=px+'px'; });
  const t3=document.getElementById('phrasing-sz-txt'); if(t3) t3.textContent=px+'px';
  if(typeof renderSectionStrips==='function') renderSectionStrips();
  autoSave();
}
function _stepOrigSize(delta){
  const prev=CEDIT_O_SIZE, next=Math.max(FSZ_MIN,Math.min(FSZ_MAX,prev+delta));
  if(next===prev) return;
  _applyOrigSize(next);
  rowPush({type:'fsz-orig', prev, next});
}
function _stepTransSize(delta){
  const prev=CEDIT_T_SIZE, next=Math.max(FSZ_MIN,Math.min(FSZ_MAX,prev+delta));
  if(next===prev) return;
  _applyTransSize(next);
  rowPush({type:'fsz-trans', prev, next});
}
function _stepBothSize(delta){
  const prev=CEDIT_O_SIZE, next=Math.max(FSZ_MIN,Math.min(FSZ_MAX,prev+delta));
  if(next===prev) return;
  _applyBothSize(next);
  rowPush({type:'fsz-both', prev, next});
}
function _resetOrigSize(){
  const prev=CEDIT_O_SIZE, next=DEFAULT_O_SIZE;
  if(next===prev) return;
  _applyOrigSize(next);
  rowPush({type:'fsz-orig', prev, next});
}
function _resetTransSize(){
  const prev=CEDIT_T_SIZE, next=DEFAULT_T_SIZE;
  if(next===prev) return;
  _applyTransSize(next);
  rowPush({type:'fsz-trans', prev, next});
}
function _resetBothSize(){
  const prev=CEDIT_O_SIZE, next=DEFAULT_O_SIZE;
  if(next===prev) return;
  _applyBothSize(next);
  rowPush({type:'fsz-both', prev, next});
}
function origFontInc(){ _stepOrigSize(FSZ_STEP); }
function origFontDec(){ _stepOrigSize(-FSZ_STEP); }
function transFontInc(){ _stepTransSize(FSZ_STEP); }
function transFontDec(){ _stepTransSize(-FSZ_STEP); }
function bothFontInc(){ _stepBothSize(FSZ_STEP); }
function bothFontDec(){ _stepBothSize(-FSZ_STEP); }

/* Split font-size popover (Hebrew/Greek sessions only) */
function toggleFontSizePopup(triggerEl){
  const pop=document.getElementById('fsz-popover');
  if(!pop) return;
  if(pop.style.display!=='none'){ closeFontSizePopup(); return; }
  if(typeof closeColorPalette==='function') closeColorPalette();
  const lbl=document.getElementById('fsz-orig-lbl');
  if(lbl) lbl.textContent=(typeof t==='function') ? t(SESS==='hebrew'?'toolbar.fsize-hebrew':'toolbar.fsize-greek') : (SESS==='hebrew'?'Hebrew':'Greek');
  const t1=document.getElementById('fsz-orig-txt'); if(t1) t1.textContent=CEDIT_O_SIZE+'px';
  const t2=document.getElementById('fsz-trans-txt'); if(t2) t2.textContent=CEDIT_T_SIZE+'px';
  pop.style.display='flex';
  const r=triggerEl.getBoundingClientRect();
  const pw=pop.offsetWidth||190, ph=pop.offsetHeight||96;
  let left=Math.max(8, Math.min(window.innerWidth-pw-8, r.left));
  let top=r.bottom+6;
  if(top+ph>window.innerHeight-8) top=r.top-ph-6;
  pop.style.left=left+'px'; pop.style.top=Math.max(8,top)+'px';
  setTimeout(()=>{ document.addEventListener('mousedown', _fszOutsideClick); },0);
}
function _fszOutsideClick(e){
  const pop=document.getElementById('fsz-popover');
  if(pop && !pop.contains(e.target) && !e.target.closest('#tb-sz-split-btn')) closeFontSizePopup();
}
function closeFontSizePopup(){
  const pop=document.getElementById('fsz-popover');
  if(pop) pop.style.display='none';
  document.removeEventListener('mousedown', _fszOutsideClick);
}
/* ── Inline-format undo snapshot ──────────────────────────────────────
   Saves the innerHTML of the active cell before a highlight apply or
   remove, so Ctrl+Z can restore it. Uses the same ROW_STACK as row-level
   ops — the stack is checked before the native browser undo queue, so
   highlight undo fires in the right order.
   Each entry stores both 'before' and 'after' so redo (Ctrl+Y) works too.
   after is stored lazily on first undo rather than upfront. */
function _fmtSnap(ce){
  if(!ce) return;
  const row=ce.closest('.xrow');
  const rid=row?row.dataset.rid:null;
  if(!rid) return;
  // Derive column key from the parent container id (#oc-{rid} or #tc-{rid}),
  // NOT from ce.id — .cedit elements have no id of their own.
  const parent=ce.parentElement;
  const colKey=(parent&&parent.id&&parent.id.startsWith('tc-'))?'t':'o';
  const before=ce.innerHTML;
  rowPush({type:'fmtsnap', rid, colKey, before, after:null});
}

function applyHl(){
  // Restore focus and saved selection — when called from the color palette
  // the cell has lost focus, so we must restore activeEl and savedRange first.
  if(activeEl) activeEl.focus();
  if(savedRange){
    try{const s=window.getSelection();s.removeAllRanges();s.addRange(savedRange);}catch(_){}
  }
  const sel=window.getSelection();
  if(!sel||sel.isCollapsed) return;
  const range=sel.getRangeAt(0).cloneRange(); // clone so DOM mutations don't invalidate it
  const ce=activeEl;
  if(!ce) return;

  // Detect if the entire selection is already inside a single .hl span
  let hlAncestor=null;
  let node=range.commonAncestorContainer;
  while(node&&node!==ce){
    if(node.nodeType===1&&node.classList&&node.classList.contains('hl')){hlAncestor=node;break;}
    node=node.parentNode;
  }

  _fmtSnap(ce);

  if(hlAncestor){
    _unwrapHl(hlAncestor);
  } else {
    // Remove any existing .hl spans that intersect the selection
    const hlsInRange=[];
    ce.querySelectorAll('.hl').forEach(el=>{
      if(range.intersectsNode(el)) hlsInRange.push(el);
    });
    hlsInRange.forEach(el=>_unwrapHl(el));
    // After DOM mutation re-query the live selection — the browser updates
    // range boundaries automatically when text nodes are normalised.
    const freshSel=window.getSelection();
    const freshRange=freshSel&&freshSel.rangeCount?freshSel.getRangeAt(0):range;
    const span=document.createElement('span');
    span.className='hl';
    span.style.backgroundColor=_hlToRgba(hlColor,_hlAlpha());
    try{freshRange.surroundContents(span);}
    catch(e){const f=freshRange.extractContents();span.appendChild(f);freshRange.insertNode(span);}
  }

  const lastOp=ROW_STACK[ROW_STACK.length-1];
  if(lastOp&&lastOp.type==='fmtsnap') lastOp.after=ce.innerHTML;

  pushRecentColor('highlight', hlColor);
  _renderPaletteRows();
  closeColorPalette();
  // This mutates ce's DOM directly (Range.surroundContents), not via
  // document.execCommand, so no real 'input' event fires on its own.
  // Diagram View's translation block (.dblock-trans) only syncs back to
  // the real #tc-{rid} .cedit via its own 'input' listener (or a 'blur'
  // fallback) — without this, a highlight applied there could autoSave
  // before that sync happens and be lost if the tab closes/reloads first.
  // Harmless no-op for Phrasing View cells (oninput there is just
  // cleanEmptyCell).
  if(ce) ce.dispatchEvent(new Event('input',{bubbles:true}));
  autoSave();
}

function removeHl(){
  // Remove all .hl spans from the current selection (or entire cell if no selection)
  ensureFocus();
  const ce=activeEl;
  if(!ce) return;
  const sel=window.getSelection();
  _fmtSnap(ce);
  if(sel&&!sel.isCollapsed){
    const range=sel.getRangeAt(0);
    const hls=[];
    ce.querySelectorAll('.hl').forEach(el=>{if(range.intersectsNode(el))hls.push(el);});
    hls.forEach(el=>_unwrapHl(el));
  } else {
    // No selection — clear all highlights in this cell
    ce.querySelectorAll('.hl').forEach(el=>_unwrapHl(el));
  }
  const lastOp=ROW_STACK[ROW_STACK.length-1];
  if(lastOp&&lastOp.type==='fmtsnap') lastOp.after=ce.innerHTML;
  closeColorPalette();
  // See applyHl() above for why this is needed.
  if(ce) ce.dispatchEvent(new Event('input',{bubbles:true}));
  autoSave();
}

function _unwrapHl(span){
  // Replace the .hl span with its own children, keeping them in place
  const parent=span.parentNode;
  if(!parent) return;
  while(span.firstChild) parent.insertBefore(span.firstChild,span);
  parent.removeChild(span);
  // Normalise adjacent text nodes left behind
  parent.normalize();
}
function updateTb(){
  document.getElementById('tb-b').classList.toggle('on',document.queryCommandState('bold'));
  document.getElementById('tb-i').classList.toggle('on',document.queryCommandState('italic'));
  document.getElementById('tb-u')?.classList.toggle('on',document.queryCommandState('underline'));
  document.getElementById('tb-s').classList.toggle('on',document.queryCommandState('strikeThrough'));
  document.getElementById('tb-sup').classList.toggle('on',document.queryCommandState('superscript'));
}

/* Called on every keystroke (via onKey setTimeout) to ensure that when a
   cell is fully emptied the browser doesn't leave stale child nodes
   (empty <br>, <span>) that prevent the :empty CSS placeholder from
   showing, AND to clear any pending format state (bold, italic, etc.)
   so the next typed character doesn't inherit it. */
function cleanEmptyCell(ce){
  if(!ce) return;
  if(ce.innerText.trim()===''){
    ce.innerHTML='';
    // Wipe pending format state — execCommand on an empty selection clears
    // the browser's "next character will be bold" carry-forward state.
    try{document.execCommand('removeFormat',false,null);}catch(_){}
    updateTb();
  }
}

document.getElementById('toolbar').addEventListener('mousedown',e=>{
  if(!['INPUT','SELECT'].includes(e.target.tagName))e.preventDefault();
});
document.addEventListener('selectionchange',()=>{
  const s=window.getSelection();
  if(s&&activeEl&&activeEl.contains&&activeEl.contains(s.anchorNode)){saveRange();updateTb();}
});

/* ════════════════════════════════════════
   COMMENTS
════════════════════════════════════════ */
function _commentList(){ return document.getElementById('cmt-list'); }

function _syncCommentList(){
  const list=_commentList();
  if(!list) return;
  const rowOrder=new Map(_realRows().map((row,index)=>[String(row.dataset.rid),index]));
  [...list.querySelectorAll('.ccard')]
    .sort((a,b)=>{
      const ai=rowOrder.get(String(a.dataset.rid)),bi=rowOrder.get(String(b.dataset.rid));
      if(ai!==bi) return (ai??Number.MAX_SAFE_INTEGER)-(bi??Number.MAX_SAFE_INTEGER);
      return Number(a.dataset.cid)-Number(b.dataset.cid);
    })
    .forEach(card=>list.appendChild(card));
}

function _revealComment(cid,{focus=true}={}){
  const card=document.querySelector(`.ccard[data-cid="${cid}"]`);
  if(!card) return;
  const pane=document.getElementById('cmargin');
  if(pane?.classList.contains('pane-hidden')){
    pane.classList.remove('pane-hidden');
    try{localStorage.setItem(WORKSPACE_NOTES_KEY,'1');}catch(_){}
    document.getElementById('btn-cmt-pane')?.classList.add('active');
  }
  _syncCommentList();
  card.scrollIntoView({block:'nearest',behavior:'smooth'});
  card.classList.remove('ccard-jump-flash','ccard-jump-flash-fade');
  card.classList.add('ccard-jump-flash');
  setTimeout(()=>card.classList.add('ccard-jump-flash-fade'),50);
  setTimeout(()=>card.classList.remove('ccard-jump-flash','ccard-jump-flash-fade'),1400);
  if(focus) setTimeout(()=>{
    const ed=card.querySelector('.cedit-c');
    if(ed){ed.focus();activeEl=ed;}
  },220);
  if(typeof syncWorkspaceChrome==='function') syncWorkspaceChrome();
}

function _createCommentForRow(rid){
  const row=document.querySelector(`.xrow[data-rid="${rid}"]`);if(!row)return;
  const existing=row.dataset.cid;
  if(existing){_revealComment(existing);return;}
  const cid=++CC;
  row.dataset.cid=cid;row.classList.add('has-cmt');
  row.querySelector('.cmtbtn')?.classList.add('on');
  const lid=row.querySelector('.lid')?.textContent||'';
  const list=_commentList();if(!list)return;
  list.appendChild(_buildCmtCard(cid,rid,lid));
  _syncCommentList();
  rowPush({type:'cmt-add',cid,rid,lid});
  _dcmtSyncBadge(rid);
  _revealComment(cid);
  autoSave();
}

function toggleCmt(_btn,rid){ _createCommentForRow(rid); }

/* Build a comment card element — shared by toggleCmt and undo restore */
function _buildCmtCard(cid,rid,lid,_top,_left,_width,html){
  const card=document.createElement('div');
  card.className='ccard';card.dataset.cid=cid;card.dataset.rid=rid;
  card.innerHTML=`
    <div class="chdr">
      <span class="chdr-l">${typeof t==='function'?t('comment.label'):'Comment'}</span><span class="chdr-i">${lid&&lid!=='—'?lid:''}</span>
      <button class="ccl" onclick="closeCmt('${cid}')">✕</button>
    </div>
    <div class="cbody">
      <div class="cedit-c" contenteditable="true" spellcheck="false"
        onfocus="_cmtFocusSnap(this,${cid})" onblur="_cmtBlurSnap(this,${cid});autoSave()"
        onkeydown="if(event.key==='Tab'){event.preventDefault();document.execCommand(event.shiftKey?'outdent':'indent',false,null);}setTimeout(()=>{saveRange();updateTb();},0)"></div>
    </div>`;
  if(html) card.querySelector('.cedit-c').innerHTML=html;
  return card;
}

/* Per-card focus/blur text snap for undo — mirrors fmtsnap coalescing */
const _cmtTextBefore={};
function _cmtFocusSnap(el,cid){
  activeEl=el;
  _cmtTextBefore[cid]=el.innerHTML;
}
function _cmtBlurSnap(el,cid){
  const before=_cmtTextBefore[cid]??'';
  const after=el.innerHTML;
  if(after===before) return;
  const lastOp=ROW_STACK[ROW_STACK.length-1];
  if(lastOp&&lastOp.type==='cmt-text'&&lastOp.cid===cid){
    lastOp.after=after;
  } else {
    rowPush({type:'cmt-text',cid,before,after});
  }
  _cmtTextBefore[cid]=after;
}

/* Same focus/blur snap-and-coalesce pattern as _cmtFocusSnap/_cmtBlurSnap
   above, for the original-language and translation cells (#oc-{rid}/
   #tc-{rid} .cedit) — plain typing there never used to push anything
   onto ROW_STACK, so Ctrl+Z had nothing of its own to undo and instead
   silently undid whatever unrelated structural op happened to already be
   on top of the shared stack. col is 'o'|'t'; .dblock-trans (Diagram
   View's translation box) shares the 't' key since it mirrors straight
   into the same #tc-{rid} .cedit cell — editing from either side lands
   in the same undoable slot. */
const _textBefore={};
function _textFocusSnap(el,rid,col){
  _textBefore[rid+':'+col]=el.innerHTML;
}
function _textBlurSnap(el,rid,col){
  const key=rid+':'+col;
  const before=_textBefore[key]??'';
  const after=el.innerHTML;
  if(after===before) return;
  const lastOp=ROW_STACK[ROW_STACK.length-1];
  if(lastOp&&lastOp.type==='text-edit'&&lastOp.rid===rid&&lastOp.col===col){
    lastOp.after=after;
  } else {
    rowPush({type:'text-edit',rid,col,before,after});
  }
  _textBefore[key]=after;
}

function cmtFontInc(){ _setCmtFontSize(CMT_FONT_SIZE+CMT_FONT_STEP); }
function cmtFontDec(){ _setCmtFontSize(CMT_FONT_SIZE-CMT_FONT_STEP); }
function _setCmtFontSize(px){
  CMT_FONT_SIZE=Math.max(CMT_FONT_MIN,Math.min(CMT_FONT_MAX,px));
  document.documentElement.style.setProperty('--cmt-font-size',CMT_FONT_SIZE+'px');
  const lbl=document.getElementById('cmt-font-size-txt');
  if(lbl) lbl.textContent=CMT_FONT_SIZE+'px';
  try{ localStorage.setItem('exeg-cmt-fontsize',CMT_FONT_SIZE); }catch(_){}
}

function closeCmt(cid){
  const card=document.querySelector(`.ccard[data-cid="${cid}"]`);if(!card)return;
  const rid=card.dataset.rid;
  const ed=card.querySelector('.cedit-c');
  const html=ed?ed.innerHTML:'';
  const lid=card.querySelector('.chdr-i')?.textContent||'';
  const row=document.querySelector(`.xrow[data-rid="${rid}"]`);
  if(row){row.classList.remove('has-cmt');delete row.dataset.cid;const btn=row.querySelector('.cmtbtn');if(btn)btn.classList.remove('on');}
  rowPush({type:'cmt-remove',cid,rid,html,lid});
  _dcmtSyncBadge(rid);
  card.remove();_syncCommentList();autoSave();
  if(typeof syncWorkspaceChrome==='function') syncWorkspaceChrome();
}

function _compareNotesTitle(){
  const pane=COMPARE_NOTE_CONTEXT&&COMPARE_PANES[COMPARE_NOTE_CONTEXT.index];
  const label=typeof t==='function'?t('compare.notes'):'Notes';
  return pane?.data ? `${label} · ${pane.data.verseRef||pane.data.langLabel||'Comparison chapter'}` : label;
}
function _compareNoteRows(index){
  const pane=COMPARE_PANES[index],rows=pane?.data?.rows||[];
  const order=new Map(rows.map((row,i)=>[String(row.rid),i]));
  return [...(pane?.data?.cmts||[])].sort((a,b)=>(order.get(String(a.rid))??Infinity)-(order.get(String(b.rid))??Infinity)||Number(a.cid)-Number(b.cid));
}
function renderCompareNotes({focusCid=null}={}){
  if(!COMPARE_NOTE_CONTEXT)return;
  const {index}=COMPARE_NOTE_CONTEXT,pane=COMPARE_PANES[index],list=_commentList();
  if(!pane?.data||!list)return;
  const title=document.querySelector('#cmargin-hdr .cmargin-title');if(title)title.textContent=_compareNotesTitle();
  list.replaceChildren();
  _compareNoteRows(index).forEach(comment=>{
    const row=pane.data.rows.find(item=>String(item.rid)===String(comment.rid));
    const card=document.createElement('article');
    card.className='ccard compare-note-card';card.dataset.cid=`compare-${index}-${comment.cid}`;card.dataset.rid=comment.rid;
    const lid=row?.lineId||'';
    card.innerHTML=`<div class="chdr"><span class="chdr-l">${typeof t==='function'?t('comment.label'):'Comment'}</span><span class="chdr-i">${escH(lid&&lid!=='—'?lid:'')}</span><button class="ccl" type="button" aria-label="Delete comment">✕</button></div><div class="cbody"><div class="cedit-c" contenteditable="true" spellcheck="false"></div></div>`;
    const editor=card.querySelector('.cedit-c');editor.dataset.compareNote=`${index}:${comment.cid}`;editor.innerHTML=comment.html||'';
    editor.addEventListener('focus',()=>{activeEl=editor;saveRange();});
    editor.addEventListener('input',()=>compareSaveNoteInput(editor));
    editor.addEventListener('keyup',saveRange);editor.addEventListener('mouseup',saveRange);
    editor.addEventListener('keydown',event=>{if(event.key==='Tab'){event.preventDefault();document.execCommand(event.shiftKey?'outdent':'indent',false,null);compareSaveNoteInput(editor);}setTimeout(()=>{saveRange();updateTb();},0);});
    card.querySelector('.ccl').addEventListener('click',()=>compareDeleteNote(index,comment.cid));
    list.appendChild(card);
  });
  if(!list.children.length)list.innerHTML=`<div class="cmt-list-empty">Start a comment from a phrase.</div>`;
  if(focusCid!==null)requestAnimationFrame(()=>{const editor=list.querySelector(`[data-compare-note="${index}:${focusCid}"]`);editor?.focus();activeEl=editor;});
  syncWorkspaceChrome();
}
function compareSaveNoteInput(editor){
  const [index,cid]=String(editor?.dataset?.compareNote||'').split(':');
  const pane=COMPARE_PANES[Number(index)],comment=pane?.data?.cmts?.find(item=>String(item.cid)===cid);
  if(!comment)return;
  comment.html=editor.innerHTML;compareScheduleSave(Number(index));
}
function compareDeleteNote(index,cid){
  const pane=COMPARE_PANES[index];if(!pane)return;
  pane.data.cmts=(pane.data.cmts||[]).filter(comment=>String(comment.cid)!==String(cid));
  compareScheduleSave(index);renderCompareNotes();renderCollectionCompare();
}
function compareOpenNotes(index,rid=null){
  const pane=COMPARE_PANES[index];if(!pane?.data)return;
  const list=_commentList();
  if(!COMPARE_NOTE_CONTEXT&&list)COMPARE_PRIMARY_NOTE_NODES=[...list.childNodes];
  COMPARE_NOTE_CONTEXT={index};
  const cm=document.getElementById('cmargin');cm?.classList.remove('pane-hidden');
  document.getElementById('study-notebook')?.classList.add('pane-hidden');
  document.getElementById('structure-panel')?.classList.add('pane-hidden');
  if(rid!==null){
    const comments=pane.data.cmts||(pane.data.cmts=[]);let comment=comments.find(item=>String(item.rid)===String(rid));
    if(!comment){comment={cid:String((Number(pane.data.CC)||0)+1),rid:String(rid),html:''};pane.data.CC=Number(comment.cid);comments.push(comment);compareScheduleSave(index);}
    renderCompareNotes({focusCid:comment.cid});
  }else renderCompareNotes();
  document.getElementById('btn-cmt-pane')?.classList.add('active');
}
function compareActivateNotes(index){
  if(COMPARE_NOTE_CONTEXT&&COMPARE_NOTE_CONTEXT.index!==index)compareOpenNotes(index);
}
function clearCompareNotesContext(){
  if(!COMPARE_NOTE_CONTEXT)return;
  const list=_commentList();if(list)list.replaceChildren(...COMPARE_PRIMARY_NOTE_NODES);
  COMPARE_PRIMARY_NOTE_NODES=[];COMPARE_NOTE_CONTEXT=null;
  const title=document.querySelector('#cmargin-hdr .cmargin-title');if(title)title.textContent=typeof t==='function'?t('workspace.notes'):'Notes';
  _syncCommentList();syncWorkspaceChrome();
}
function drawConns(){ /* Retained as a safe no-op for legacy callers. */ }

/* Scroll #cmargin so the comment card nearest to the diagram viewport
   centre comes into view when the diagram canvas is scrolled. */
function _scrollCmarginToVisible(){
  const scrollEl=document.getElementById('dcanvas-scroll');
  const cmarginEl=document.getElementById('cmargin');
  if(!scrollEl||!cmarginEl) return;
  const cards=[...document.querySelectorAll('.ccard')];
  if(!cards.length) return;
  // The diagram scroll mid-point in canvas logical coordinates
  const zR=DIAGRAM_ZOOM/100;
  const dcanvas=document.getElementById('dcanvas');
  const canvasRect=dcanvas?dcanvas.getBoundingClientRect():null;
  const scrollMidViewport=scrollEl.getBoundingClientRect().top+scrollEl.clientHeight/2;
  // Find card whose associated drow is closest to the scroll midpoint
  let bestCard=null,bestDist=Infinity;
  cards.forEach(card=>{
    const rid=card.dataset.rid;
    const drow=document.querySelector('#dcanvas .drow[data-rid="'+rid+'"]');
    if(!drow||!canvasRect) return;
    const dr=drow.getBoundingClientRect();
    const rowViewportMid=dr.top+dr.height/2;
    const dist=Math.abs(rowViewportMid-scrollMidViewport);
    if(dist<bestDist){bestDist=dist;bestCard=card;}
  });
  if(!bestCard) return;
  _revealComment(bestCard.dataset.cid,{focus:false});
}

/* Jump from a Diagram View comment badge to its card: un-hide it if
   collapsed, scroll #cmargin to centre it, and flash it briefly.
   Mirrors the show/hide branch in toggleCmt() and the scroll math in
   _scrollCmarginToVisible(), and the two-class flash/fade timing bible.js
   uses for .bverse-highlight/-fade. */
function jumpToCmt(cid){
  _revealComment(cid);
}

/* Select a diagram block by rid — gold outline, deselects previous */
function selectDiagBlock(rid){
  if(rid && SELECTED_CNX_ID!==null) closeConnEditPopup();
  // Clear previous selection
  document.querySelectorAll('#dcanvas .dblock.selected')
    .forEach(b=>b.classList.remove('selected'));
  SELECTED_DIAG_RID=rid||null;
  if(rid){
    const blk=document.querySelector(`#dcanvas .dblock[data-rid="${rid}"]`);
    if(blk) blk.classList.add('selected');
  }
  syncDiagramWorkspaceUI();
}

/* ════════════════════════════════════════
   MODERN WORKSPACE CHROME
════════════════════════════════════════ */
const WORKSPACE_NOTES_KEY='exeg-notes-pane-open';
let _workspaceChromeReady=false;

function _workspaceMove(id,targetId){
  const el=document.getElementById(id),target=document.getElementById(targetId);
  if(el&&target&&el.parentNode!==target) target.appendChild(el);
}

function _workspaceMenuMove(id,targetId,labelKey){
  _workspaceMove(id,targetId);
  const el=document.getElementById(id);
  if(!el||!labelKey) return;
  let label=el.querySelector('.workspace-menu-label');
  if(!label){
    label=document.createElement('span');
    label.className='workspace-menu-label';
    el.appendChild(label);
  }
  label.dataset.i18n=labelKey;
  label.textContent=typeof t==='function'?t(labelKey):labelKey;
}

function _organizeWorkspaceTools(){
  if(window.matchMedia?.('(pointer:coarse)').matches) return;
  ['phrasing-sz-grp','phrasing-sz-split-grp','phrasing-color-grp'].forEach(id=>_workspaceMove(id,'workspace-tools-text'));
  ['phrasing-indent-grp','divider-grp','psection-grp'].forEach(id=>_workspaceMove(id,'workspace-tools-structure'));
  ['dzoom-grp','dfont-grp','tb-tgl-dgtrans','dsection-grp'].forEach(id=>_workspaceMove(id,'workspace-tools-diagram'));
  ['tb-add-label','tb-add-cmt','tb-dem','tb-add-arrow','tb-add-connector','tb-add-bracket'].forEach(id=>_workspaceMove(id,'workspace-tools-annotations'));
  document.getElementById('btn-projects')?.classList.add('workspace-redundant-action');
  _workspaceMenuMove('btn-restart','workspace-more-workspace','workspace.menu.restart');
  _workspaceMenuMove('btn-help','workspace-more-workspace','workspace.menu.shortcuts');
  _workspaceMenuMove('btn-account','workspace-more-workspace','workspace.menu.account');
  _workspaceMenuMove('lang-toggle-btn','workspace-more-preferences','workspace.menu.language');
  const settingsButton=document.querySelector('#toolbar .tr-r button[data-i18n-title="toolbar.settings"]');
  if(settingsButton){
    settingsButton.id='btn-settings';
    _workspaceMenuMove('btn-settings','workspace-more-preferences','workspace.menu.settings');
  }
  ['bbar-save','bbar-load-json','btn-clear'].forEach(id=>_workspaceMove(id,'workspace-more-project'));
}

function _refreshWorkspaceToolSections(){
  document.querySelectorAll('#workspace-tools-popover .workspace-tools-section').forEach(section=>{
    const row=section.querySelector('.workspace-tools-row');
    const visible=row&&[...row.children].some(el=>getComputedStyle(el).display!=='none');
    section.style.display=visible?'':'none';
  });
}

function syncWorkspaceChrome(state){
  const ref=document.getElementById('refin')?.value.trim()||'';
  const entry=typeof projIndex==='function'&&CURRENT_PROJECT_ID
    ?projIndex().find(p=>p.id===CURRENT_PROJECT_ID):null;
  const name=entry?.name||ref||(typeof t==='function'?t('workspace.untitled'):'Untitled');
  const title=document.getElementById('workspace-project-name');
  if(title) title.textContent=name;
  const status=document.getElementById('workspace-save-state');
  if(status){
    const key=state==='saved'||CURRENT_PROJECT_ID?'workspace.saved':'workspace.draft';
    status.textContent=typeof t==='function'?t(key):(key==='workspace.saved'?'Saved locally':'Draft');
    status.parentElement?.classList.toggle('is-saved',key==='workspace.saved');
  }
  const notes=document.querySelectorAll('.ccard').length;
  const badge=document.getElementById('workspace-notes-count');
  if(badge){badge.textContent=notes;badge.style.display=notes?'flex':'none';}
  const cm=document.getElementById('cmargin');
  document.getElementById('btn-cmt-pane')?.classList.toggle('active',!!cm&&!cm.classList.contains('pane-hidden'));
  const notebook=document.getElementById('study-notebook');
  const notebookCount=document.getElementById('workspace-notebook-count');
  const notebookEntries=_studyEntries();
  if(notebookCount){notebookCount.textContent=notebookEntries.length;notebookCount.style.display=notebookEntries.length?'flex':'none';}
  document.getElementById('btn-study-notebook')?.classList.toggle('active',!!notebook&&!notebook.classList.contains('pane-hidden'));
  const structure=document.getElementById('structure-panel');
  document.getElementById('btn-structure-panel')?.classList.toggle('active',!!structure&&!structure.classList.contains('pane-hidden'));
  const compareBtn=document.getElementById('view-btn-compare');
  if(compareBtn)compareBtn.hidden=!ACTIVE_COLLECTION||_collectionAvailableProjects().length<2;
  _refreshWorkspaceToolSections();
}

function toggleWorkspaceTools(event){
  event?.stopPropagation();
  const pop=document.getElementById('workspace-tools-popover');
  const more=document.getElementById('workspace-more-popover');
  if(!pop) return;
  const open=!pop.classList.contains('open');
  pop.classList.toggle('open',open);pop.setAttribute('aria-hidden',String(!open));
  document.getElementById('btn-workspace-tools')?.classList.toggle('on',open);
  more?.classList.remove('open');more?.setAttribute('aria-hidden','true');
}
function toggleWorkspaceMore(event){
  event?.stopPropagation();
  const pop=document.getElementById('workspace-more-popover');
  const tools=document.getElementById('workspace-tools-popover');
  if(!pop) return;
  const open=!pop.classList.contains('open');
  pop.classList.toggle('open',open);pop.setAttribute('aria-hidden',String(!open));
  document.getElementById('btn-workspace-more')?.classList.toggle('on',open);
  tools?.classList.remove('open');tools?.setAttribute('aria-hidden','true');
  document.getElementById('btn-workspace-tools')?.classList.remove('on');
}
function closeWorkspacePopovers(){
  ['workspace-tools-popover','workspace-more-popover'].forEach(id=>{
    const pop=document.getElementById(id);pop?.classList.remove('open');pop?.setAttribute('aria-hidden','true');
  });
  document.getElementById('btn-workspace-tools')?.classList.remove('on');
  document.getElementById('btn-workspace-more')?.classList.remove('on');
}
function initWorkspaceChrome(){
  if(_workspaceChromeReady) return;
  _workspaceChromeReady=true;
  _organizeWorkspaceTools();
  const cm=document.getElementById('cmargin');
  const notebook=document.getElementById('study-notebook');
  const structure=document.getElementById('structure-panel');
  let notesOpen=false;
  try{notesOpen=localStorage.getItem(WORKSPACE_NOTES_KEY)==='1';}catch(_){}
  cm?.classList.toggle('pane-hidden',!notesOpen);
  let notebookOpen=false;
  try{notebookOpen=localStorage.getItem(STUDY_NOTEBOOK_OPEN_KEY)==='1';}catch(_){}
  notebook?.classList.toggle('pane-hidden',!notebookOpen);
  if(notebookOpen) cm?.classList.add('pane-hidden');
  let structureOpen=false;
  try{structureOpen=localStorage.getItem(STRUCTURE_PANEL_OPEN_KEY)==='1';}catch(_){}
  structure?.classList.toggle('pane-hidden',!structureOpen);
  if(structureOpen){cm?.classList.add('pane-hidden');notebook?.classList.add('pane-hidden');renderStructurePanel();}
  document.addEventListener('click',event=>{
    if(event.target.closest('#workspace-tools-popover,#workspace-more-popover,#btn-workspace-tools,#btn-workspace-more')) return;
    closeWorkspacePopovers();
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape') closeWorkspacePopovers();});
  if(window.matchMedia){
    const mq=window.matchMedia('(pointer:coarse)');
    const reorganize=()=>setTimeout(_organizeWorkspaceTools,0);
    if(mq.addEventListener) mq.addEventListener('change',reorganize); else mq.addListener(reorganize);
  }
  syncWorkspaceChrome();
}

/* Toggle the comment pane (#cmargin) show/hide */
function toggleCmtPane(){
  const cm=document.getElementById('cmargin');
  if(!cm) return;
  if(EDITOR_VIEW==='compare'){
    if(cm.classList.contains('pane-hidden')) compareOpenNotes(COMPARE_NOTE_CONTEXT?.index??0);
    else cm.classList.add('pane-hidden');
    syncWorkspaceChrome();return;
  }
  const hidden=cm.classList.toggle('pane-hidden');
  if(!hidden){
    document.getElementById('study-notebook')?.classList.add('pane-hidden');
    document.getElementById('structure-panel')?.classList.add('pane-hidden');
    try{localStorage.setItem(STUDY_NOTEBOOK_OPEN_KEY,'0');localStorage.setItem(STRUCTURE_PANEL_OPEN_KEY,'0');}catch(_){}
  }
  try{localStorage.setItem(WORKSPACE_NOTES_KEY,hidden?'0':'1');}catch(_){}
  const btn=document.getElementById('btn-cmt-pane');
  if(btn) btn.classList.toggle('active',!hidden);
  // #cmargin.pane-hidden collapses to width:0, which resizes #dcanvas-scroll
  // either way (hide or show) — refresh every SVG overlay that's keyed off
  // canvas geometry, same set the window 'resize' handler already refreshes.
  setTimeout(()=>{
    refreshBrackets();
    refreshDiagramConnectors();
    if(typeof renderSectionStrips==='function') renderSectionStrips();
  },50);
  syncWorkspaceChrome();
}

/* ════════════════════════════════════════
   STUDY NOTEBOOK
════════════════════════════════════════ */
function _studyStageLabel(stage){
  const key='study.stage.'+stage;
  return typeof t==='function'?t(key):stage;
}
function _studyNewId(){return 'study-'+Date.now()+'-'+(++STUDY_NOTE_CTR);}
function _studyStripHtml(html){
  const node=document.createElement('div');node.innerHTML=html||'';
  return (node.textContent||'').replace(/\s+/g,' ').trim();
}
function _studyEscAttr(value){return escH(String(value||'')).replace(/"/g,'&quot;');}
function _studyEntries(){return ACTIVE_COLLECTION?.notebook?.entries||STUDY_NOTEBOOK;}
function _studyFind(id){return _studyEntries().find(note=>note.id===id);}
function _studyCommit(){
  if(ACTIVE_COLLECTION){ collectionSaveActive(); }
  else autoSave();
}
function _studyReferenceForRow(rid){
  const row=document.querySelector(`.xrow[data-rid="${rid}"]`);
  if(!row) return null;
  const line=row.querySelector('.lid')?.textContent||'';
  const verse=row.querySelector('.vin')?.value||'';
  const text=_studyStripHtml(row.querySelector(`#oc-${rid} .cedit`)?.innerHTML||'');
  return {type:'row',projectId:CURRENT_PROJECT_ID||null,rid:String(rid),label:(line&&line!=='—'?line:(verse?'v'+verse:'Line'))+(text?' · '+text.slice(0,54):''),snapshot:{line,verse,text}};
}
function studyNotebookCurrentAttachment(){
  if(EDITOR_VIEW==='diagram'&&SELECTED_DIAG_RID){const link=_studyReferenceForRow(SELECTED_DIAG_RID);if(link)link.view='diagram';return link;}
  if(lastFocusedRowEl?.dataset?.rid){return _studyReferenceForRow(lastFocusedRowEl.dataset.rid);}
  const bibleSel=window.studyNotebookBibleSelection;
  if(bibleSel) return {...bibleSel,projectId:ACTIVE_COLLECTION?(CURRENT_PROJECT_ID||null):bibleSel.projectId};
  if(ACTIVE_COLLECTION&&CURRENT_PROJECT_ID){const project=projIndex().find(item=>item.id===CURRENT_PROJECT_ID);if(project)return {type:'project',projectId:project.id,label:project.name||'Project',snapshot:{reference:project.verseRef||'',name:project.name||''}};}
  return null;
}
function studyNotebookAttachmentAvailable(link){
  if(link.projectId&&link.projectId!==CURRENT_PROJECT_ID){const entry=projIndex().find(item=>item.id===link.projectId);return !!entry&&!projIsTrashed(entry);}
  if(link.type==='project') return true;
  if(link.type==='row') return !!document.querySelector(`.xrow[data-rid="${link.rid}"]`);
  if(link.type==='bible') return true;
  return false;
}
function studyNotebookSave(id,field,el){
  const note=_studyFind(id);if(!note) return;
  note[field]=field==='bodyHTML'?el.innerHTML:el.textContent;
  note.updatedAt=Date.now();STUDY_NOTE_ACTIVE_ID=id;
  _studyCommit();
}
function studyNotebookSetStage(id,value){
  const note=_studyFind(id);if(!note||!STUDY_STAGES.includes(value)) return;
  note.stage=value;note.updatedAt=Date.now();_studyCommit();renderStudyNotebook();
}
function studyNotebookDelete(id){
  const note=_studyFind(id);if(!note) return;
  if(!confirm(typeof t==='function'?t('study.delete.confirm'):'Delete this notebook entry?')) return;
  if(ACTIVE_COLLECTION) ACTIVE_COLLECTION.notebook.entries=_studyEntries().filter(item=>item.id!==id);
  else STUDY_NOTEBOOK=STUDY_NOTEBOOK.filter(item=>item.id!==id);
  if(STUDY_NOTE_ACTIVE_ID===id)STUDY_NOTE_ACTIVE_ID=null;
  _studyCommit();renderStudyNotebook();syncWorkspaceChrome();
}
function addStudyNote(stage){
  const filter=document.getElementById('study-notebook-filter')?.value||'observation';
  const note={id:_studyNewId(),stage:STUDY_STAGES.includes(stage)?stage:(STUDY_STAGES.includes(filter)?filter:'observation'),title:'',bodyHTML:'',attachments:[],createdAt:Date.now(),updatedAt:Date.now()};
  _studyEntries().unshift(note);STUDY_NOTE_ACTIVE_ID=note.id;
  renderStudyNotebook();syncWorkspaceChrome();_studyCommit();
  requestAnimationFrame(()=>document.querySelector(`.study-note-title[data-note-id="${note.id}"]`)?.focus());
}
function studyNotebookAttachCurrent(id){
  const note=_studyFind(id),attachment=studyNotebookCurrentAttachment();
  if(!note){return;}
  if(!attachment){toast(typeof t==='function'?t('study.attach.none'):'Select a row, diagram phrase, or Bible verse first.');return;}
  note.attachments=Array.isArray(note.attachments)?note.attachments:[];
  const duplicate=note.attachments.some(item=>item.type===attachment.type&&item.rid===attachment.rid&&item.reference===attachment.reference);
  if(!duplicate) note.attachments.push(attachment);
  note.updatedAt=Date.now();_studyCommit();renderStudyNotebook();
}
function studyNotebookDetach(id,index){
  const note=_studyFind(id);if(!note||!note.attachments?.[index]) return;
  note.attachments.splice(index,1);note.updatedAt=Date.now();_studyCommit();renderStudyNotebook();
}
function studyNotebookRememberFocus(el){
  if(!el?.closest?.('.study-note-card'))return;
  STUDY_NOTE_ACTIVE_EDITOR=el;activeEl=el;STUDY_NOTE_ACTIVE_ID=el.dataset.noteId||STUDY_NOTE_ACTIVE_ID;
  const selection=window.getSelection();
  if(selection?.rangeCount&&el.contains(selection.anchorNode))STUDY_NOTE_SELECTION=selection.getRangeAt(0).cloneRange();
}
function _studyNotebookActiveEditor(){
  const focused=document.activeElement;
  if(focused?.matches?.('.study-note-title,.study-note-body'))studyNotebookRememberFocus(focused);
  return STUDY_NOTE_ACTIVE_EDITOR?.isConnected&&STUDY_NOTE_ACTIVE_EDITOR.closest('.study-note-card')?STUDY_NOTE_ACTIVE_EDITOR:null;
}
function _studyNotebookRestoreSelection(editor){
  if(!editor)return;
  editor.focus();
  if(!STUDY_NOTE_SELECTION||!editor.contains(STUDY_NOTE_SELECTION.commonAncestorContainer))return;
  try{const selection=window.getSelection();selection.removeAllRanges();selection.addRange(STUDY_NOTE_SELECTION.cloneRange());}catch(_){}
}
function _studyNotebookSaveEditor(editor){
  if(!editor)return;
  const id=editor.dataset.noteId;
  if(id)studyNotebookSave(id,editor.classList.contains('study-note-title')?'title':'bodyHTML',editor);
}
function studyNotebookFormat(command,value=null){
  const editor=_studyNotebookActiveEditor();if(!editor)return;
  _studyNotebookRestoreSelection(editor);
  document.execCommand(command,false,value);
  studyNotebookRememberFocus(editor);_studyNotebookSaveEditor(editor);
}
function openStudyNotebookColorPalette(trigger){
  if(!_studyNotebookActiveEditor())return;
  openColorPalette('studyTextColor',trigger,STUDY_NOTE_TEXT_COLOR);
}
function _studyNotebookDashAtParagraphStart(editor){
  const selection=window.getSelection();if(!selection?.rangeCount||!selection.isCollapsed)return false;
  const range=selection.getRangeAt(0);if(!editor.contains(range.startContainer)||range.startContainer.nodeType!==Node.TEXT_NODE||range.startOffset<1)return false;
  const block=range.startContainer.parentElement?.closest('li,p,div')||editor;
  if(!editor.contains(block))return false;
  const before=range.cloneRange();before.selectNodeContents(block);before.setEnd(range.startContainer,range.startOffset);
  return before.toString()==='-'&&block.textContent==='-';
}
function _studyNotebookConvertDashToBullet(editor){
  const selection=window.getSelection(),range=selection?.rangeCount?selection.getRangeAt(0):null;if(!range)return;
  const dash=range.cloneRange();dash.setStart(range.startContainer,range.startOffset-1);
  selection.removeAllRanges();selection.addRange(dash);
  document.execCommand('delete',false,null);
  document.execCommand('insertUnorderedList',false,null);
  studyNotebookRememberFocus(editor);_studyNotebookSaveEditor(editor);
}
function studyNotebookKeydown(event,editor){
  studyNotebookRememberFocus(editor);
  if(event.key==='Tab'){
    event.preventDefault();document.execCommand(event.shiftKey?'outdent':'indent',false,null);
    requestAnimationFrame(()=>{studyNotebookRememberFocus(editor);_studyNotebookSaveEditor(editor);});return;
  }
  if(event.key===' '&&!event.shiftKey&&!event.ctrlKey&&!event.metaKey&&_studyNotebookDashAtParagraphStart(editor)){
    event.preventDefault();_studyNotebookConvertDashToBullet(editor);return;
  }
  requestAnimationFrame(()=>studyNotebookRememberFocus(editor));
}
async function studyNotebookJump(link){
  if(!link)return;
  if(link.projectId&&link.projectId!==CURRENT_PROJECT_ID){
    const entry=projIndex().find(item=>item.id===link.projectId);
    if(!entry||projIsTrashed(entry)){toast(typeof t==='function'?t('study.attachment.unavailable'):'This source is no longer available.');return;}
    await projLoad(link.projectId,{keepCollection:true});
  }
  if(link.type==='bible'&&typeof window.bOpenNotebookVerse==='function'){window.bOpenNotebookVerse(link);return;}
  if(link.type==='project') return;
  if(link.type!=='row'||!studyNotebookAttachmentAvailable(link)){toast(typeof t==='function'?t('study.attachment.unavailable'):'This source is no longer available.');return;}
  if(link.view==='diagram'){
    if(EDITOR_VIEW!=='diagram')setEditorView('diagram');
    selectDiagBlock(link.rid);
    const block=document.querySelector(`#dcanvas .dblock[data-rid="${link.rid}"]`);
    block?.scrollIntoView({block:'center',behavior:'smooth'});
    return;
  }
  if(EDITOR_VIEW!=='phrasing')setEditorView('phrasing');
  const row=document.querySelector(`.xrow[data-rid="${link.rid}"]`);
  row?.scrollIntoView({block:'center',behavior:'smooth'});
  row?.classList.add('study-note-source-focus');
  setTimeout(()=>row?.classList.remove('study-note-source-focus'),1500);
}
function studyNotebookJumpByIndex(id,index){studyNotebookJump(_studyFind(id)?.attachments?.[index]);}
function _studyNoteCard(note){
  const deleteLabel=typeof t==='function'?t('study.delete'):'Delete entry';
  const detachLabel=typeof t==='function'?t('study.detach'):'Remove attachment';
  const attachments=(note.attachments||[]).map((link,index)=>{
    const available=studyNotebookAttachmentAvailable(link);
    return `<span class="study-note-attachment${available?'':' is-orphan'}" title="${_studyEscAttr(link.label)}"><button type="button" onclick="studyNotebookJumpByIndex('${note.id}',${index})">${escH(link.label||'Source')}</button><button type="button" class="study-note-detach" onclick="studyNotebookDetach('${note.id}',${index})" aria-label="${_studyEscAttr(detachLabel)}">×</button></span>`;
  }).join('');
  const stamp=new Date(note.updatedAt||note.createdAt||Date.now()).toLocaleDateString([],{month:'short',day:'numeric'})+' · '+new Date(note.updatedAt||note.createdAt||Date.now()).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  return `<article class="study-note-card" data-study-id="${note.id}"><div class="study-note-card-hdr"><select class="study-note-stage" onchange="studyNotebookSetStage('${note.id}',this.value)">${STUDY_STAGES.map(stage=>`<option value="${stage}"${note.stage===stage?' selected':''}>${escH(_studyStageLabel(stage))}</option>`).join('')}</select><button class="study-note-delete" type="button" onclick="studyNotebookDelete('${note.id}')" title="${_studyEscAttr(deleteLabel)}" aria-label="${_studyEscAttr(deleteLabel)}">×</button></div><div class="study-note-title" data-note-id="${note.id}" contenteditable="true" spellcheck="true" data-placeholder="${_studyEscAttr(typeof t==='function'?t('study.title.placeholder'):'Entry title') }" onfocus="studyNotebookRememberFocus(this)" oninput="studyNotebookSave('${note.id}','title',this)" onkeyup="studyNotebookRememberFocus(this)" onmouseup="studyNotebookRememberFocus(this)">${escH(note.title||'')}</div><div class="study-note-body" data-note-id="${note.id}" contenteditable="true" spellcheck="true" data-placeholder="${_studyEscAttr(typeof t==='function'?t('study.body.placeholder'):'Write your study note…') }" onfocus="studyNotebookRememberFocus(this)" oninput="studyNotebookSave('${note.id}','bodyHTML',this)" onkeydown="studyNotebookKeydown(event,this)" onkeyup="studyNotebookRememberFocus(this)" onmouseup="studyNotebookRememberFocus(this)">${note.bodyHTML||''}</div>${attachments?`<div class="study-note-attachments">${attachments}</div>`:''}<footer class="study-note-footer"><span>${escH(stamp)}</span><button class="study-note-attach" type="button" onclick="studyNotebookAttachCurrent('${note.id}')">${typeof t==='function'?t('study.attach'):'Attach current source'}</button></footer></article>`;
}
function renderStudyNotebook(){
  const list=document.getElementById('study-notebook-list');if(!list)return;
  const title=document.getElementById('study-notebook-title');if(title)title.textContent=ACTIVE_COLLECTION?ACTIVE_COLLECTION.name:(typeof t==='function'?t('study.notebook.title'):'Study Notebook');
  const memberBtn=document.getElementById('collection-members-btn');if(memberBtn){memberBtn.hidden=!ACTIVE_COLLECTION;memberBtn.setAttribute('aria-expanded',String(!!ACTIVE_COLLECTION&&COLLECTION_MEMBERS_OPEN));}
  _renderCollectionChapterSwitcher();
  _renderCollectionMembersPopover();
  const query=(document.getElementById('study-notebook-search')?.value||'').trim().toLowerCase();
  const stage=document.getElementById('study-notebook-filter')?.value||'all';
  const entries=_studyEntries();
  const notes=entries.filter(note=>{
    if(stage!=='all'&&note.stage!==stage)return false;
    return !query||_studyStripHtml(note.title+' '+note.bodyHTML+' '+(note.attachments||[]).map(a=>a.label).join(' ')).toLowerCase().includes(query);
  });
  list.innerHTML=notes.length?notes.map(_studyNoteCard).join(''):`<div class="study-notebook-empty">${typeof t==='function'?t('study.empty'):'Start with an observation, question, or insight.'}</div>`;
  const total=document.getElementById('study-notebook-count');if(total)total.textContent=entries.length;
  syncWorkspaceChrome();
}
function _renderCollectionChapterSwitcher(){
  const host=document.getElementById('collection-chapter-switcher');if(!host)return;
  if(!ACTIVE_COLLECTION){host.hidden=true;host.innerHTML='';return;}
  host.hidden=false;
  const active=ACTIVE_COLLECTION.members.map(member=>({member,project:projIndex().find(project=>project.id===member.projectId)}));
  host.innerHTML=`<span class="collection-chapter-label">${typeof t==='function'?t('collection.chapters'):'Chapters'}</span><div class="collection-chapter-list">${active.map(({member,project})=>{const unavailable=!project||projIsTrashed(project),selected=project?.id===CURRENT_PROJECT_ID;const label=project?.name||member.label||'Unavailable project';return `<button type="button" class="collection-chapter-btn${selected?' is-active':''}${unavailable?' is-unavailable':''}" onclick="collectionOpenMember('${member.projectId}')" ${unavailable?'disabled':''} aria-current="${selected?'page':'false'}" title="${_studyEscAttr(unavailable?(typeof t==='function'?t('study.attachment.unavailable'):'Unavailable'):label)}">${escH(label)}</button>`;}).join('')||`<span class="collection-chapter-empty">${typeof t==='function'?t('collection.empty-members'):'Add saved projects with Manage Members.'}</span>`}</div>`;
}
function _renderCollectionMembersPopover(){
  const popover=document.getElementById('collection-members-popover');if(!popover)return;
  if(!ACTIVE_COLLECTION||!COLLECTION_MEMBERS_OPEN){popover.hidden=true;popover.innerHTML='';return;}
  popover.hidden=false;popover.innerHTML=_collectionMemberManagerHTML();
}
function _collectionMemberManagerHTML(){
  const members=new Set(ACTIVE_COLLECTION.members.map(member=>member.projectId));
  const projects=projIndex();
  const listed=new Set(projects.map(project=>project.id));
  const projectRows=projects.map(project=>{const unavailable=projIsTrashed(project),included=members.has(project.id);if(included)return `<div class="collection-member-row is-member${unavailable?' is-unavailable':''}"><button type="button" class="collection-member-open" onclick="collectionOpenMember('${project.id}')" ${unavailable?'disabled':''}><span>✓</span><span>${escH(project.name||'Untitled')}</span><small>${escH(project.verseRef||'—')}${unavailable?' · '+escH(typeof t==='function'?t('collection.trashed'):'In Trash'):''}</small></button><button type="button" class="collection-member-remove" onclick="collectionToggleMember('${ACTIVE_COLLECTION.id}','${project.id}')" title="Remove project">×</button></div>`;return `<button type="button" class="collection-member-row${unavailable?' is-unavailable':''}" onclick="collectionToggleMember('${ACTIVE_COLLECTION.id}','${project.id}')" ${unavailable?'disabled':''}><span>＋</span><span>${escH(project.name||'Untitled')}</span><small>${escH(project.verseRef||'—')}${unavailable?' · '+escH(typeof t==='function'?t('collection.trashed'):'In Trash'):''}</small></button>`;}).join('');
  const missingRows=ACTIVE_COLLECTION.members.filter(member=>!listed.has(member.projectId)).map(member=>`<button type="button" class="collection-member-row is-member is-unavailable" onclick="collectionToggleMember('${ACTIVE_COLLECTION.id}','${member.projectId}')" title="Remove unavailable reference"><span>×</span><span>${escH(member.label||'Unavailable project')}</span><small>${escH(member.reference||'—')} · ${typeof t==='function'?t('study.attachment.unavailable'):'Unavailable'}</small></button>`).join('');
  return `<div class="collection-member-manager" onfocusout="collectionPopoverFocusOut(event)"><strong>${typeof t==='function'?t('collection.manage'):'Manage members'}</strong>${projectRows||`<p>${typeof t==='function'?t('collection.member.no-project'):'Open a saved project first.'}</p>`}${missingRows}</div>`;
}
function collectionManageActive(){if(!ACTIVE_COLLECTION)return;COLLECTION_MEMBERS_OPEN=!COLLECTION_MEMBERS_OPEN;renderStudyNotebook();if(COLLECTION_MEMBERS_OPEN)requestAnimationFrame(()=>document.querySelector('#collection-members-popover button:not(:disabled)')?.focus());}
function collectionCloseMembers(){if(!COLLECTION_MEMBERS_OPEN)return;COLLECTION_MEMBERS_OPEN=false;renderStudyNotebook();}
function collectionPopoverFocusOut(event){setTimeout(()=>{const popover=document.getElementById('collection-members-popover'),button=document.getElementById('collection-members-btn');if(COLLECTION_MEMBERS_OPEN&&!popover?.contains(document.activeElement)&&document.activeElement!==button)collectionCloseMembers();},0);}
async function collectionOpenMember(projectId){if(!ACTIVE_COLLECTION)return;const entry=projIndex().find(project=>project.id===projectId);if(!entry||projIsTrashed(entry)){toast(typeof t==='function'?t('study.attachment.unavailable'):'This source is no longer available.');return;}await projLoad(projectId,{keepCollection:true});renderStudyNotebook();}
document.addEventListener('pointerdown',event=>{if(!COLLECTION_MEMBERS_OPEN)return;const popover=document.getElementById('collection-members-popover'),button=document.getElementById('collection-members-btn');if(!popover?.contains(event.target)&&event.target!==button)collectionCloseMembers();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&COLLECTION_MEMBERS_OPEN){event.preventDefault();collectionCloseMembers();document.getElementById('collection-members-btn')?.focus();}});
function toggleStudyNotebook(){
  const dock=document.getElementById('study-notebook');if(!dock)return;
  const opening=dock.classList.contains('pane-hidden');
  dock.classList.toggle('pane-hidden',!opening);
  if(opening){
    const cm=document.getElementById('cmargin');cm?.classList.add('pane-hidden');
    document.getElementById('structure-panel')?.classList.add('pane-hidden');
    try{localStorage.setItem(WORKSPACE_NOTES_KEY,'0');localStorage.setItem(STUDY_NOTEBOOK_OPEN_KEY,'1');localStorage.setItem(STRUCTURE_PANEL_OPEN_KEY,'0');}catch(_){}
    renderStudyNotebook();
  }else try{localStorage.setItem(STUDY_NOTEBOOK_OPEN_KEY,'0');}catch(_){}
  setTimeout(()=>{refreshBrackets();refreshDiagramConnectors();if(typeof renderSectionStrips==='function')renderSectionStrips();},50);
  syncWorkspaceChrome();
}

function toggleStructurePanel(){
  const dock=document.getElementById('structure-panel');if(!dock)return;
  const opening=dock.classList.contains('pane-hidden');
  dock.classList.toggle('pane-hidden',!opening);
  if(opening){
    STRUCTURE_EXPANDED.clear();
    document.getElementById('cmargin')?.classList.add('pane-hidden');
    document.getElementById('study-notebook')?.classList.add('pane-hidden');
    try{localStorage.setItem(WORKSPACE_NOTES_KEY,'0');localStorage.setItem(STUDY_NOTEBOOK_OPEN_KEY,'0');localStorage.setItem(STRUCTURE_PANEL_OPEN_KEY,'1');}catch(_){}
    renderStructurePanel();
  }else{STRUCTURE_EXPANDED.clear();try{localStorage.setItem(STRUCTURE_PANEL_OPEN_KEY,'0');}catch(_){}}
  document.getElementById('btn-structure-panel')?.classList.toggle('active',opening);
  setTimeout(()=>{refreshBrackets();refreshDiagramConnectors();renderSectionStrips();},50);
  syncWorkspaceChrome();
}

/* ── Structure panel ─────────────────────────────────────────────────
   It projects the existing section annotations into a movable analytical
   map. The only new persisted value is structureLane; source-row order and
   section ranges remain the canonical phrasing document. */
function _structureLane(ann){return Math.max(-2,Math.min(2,Number.isFinite(Number(ann?.structureLane))?Number(ann.structureLane):-2));}
function _structureSections(){
  const rows=_realRows(),index=new Map(rows.map((row,i)=>[String(row.dataset.rid),i]));
  return ANNOTATIONS.filter(ann=>ann.type==='section').sort((a,b)=>(index.get(String(a.startRid))??Infinity)-(index.get(String(b.startRid))??Infinity));
}
function _structureRowHTML(row){
  const rid=String(row.dataset.rid),verse=row.querySelector('.vin')?.value||'',line=row.querySelector('.lid')?.textContent||'—';
  const orig=row.querySelector(`#oc-${rid} .cedit`)?.innerHTML||'',trans=row.querySelector(`#tc-${rid} .cedit`)?.innerHTML||'';
  return `<article class="structure-row"><header class="structure-row-head"><span>${escH(verse||'—')}</span><span>${escH(line)}</span></header><div class="structure-row-edit" contenteditable="true" data-rid="${rid}" data-col="o">${orig}</div>${IS_SINGLE?'':`<div class="structure-row-edit" contenteditable="true" data-rid="${rid}" data-col="t">${trans}</div>`}</article>`;
}
function _structureSelectOptions(selected){return _realRows().map(row=>{const rid=String(row.dataset.rid),label=(row.querySelector('.lid')?.textContent||rid);return `<option value="${rid}"${rid===String(selected)?' selected':''}>${escH(label)}</option>`;}).join('');}
function _structureGroupHTML(ann,rows,rowNo,isUnsectioned=false){
  if(isUnsectioned){const expanded=STRUCTURE_EXPANDED.has('unsectioned'),disclosure=typeof t==='function'?t(expanded?'structure.collapse':'structure.expand'):(expanded?'Collapse section':'Expand section');return `<section class="structure-group is-unsectioned${expanded?'':' is-collapsed'}" style="grid-row:${rowNo}"><header class="structure-divider"><button type="button" data-structure-unsectioned-toggle aria-expanded="${expanded}" title="${escH(disclosure)}">${expanded?'▾':'▸'}</button><span class="structure-divider-label">${escH(typeof t==='function'?t('structure.unsectioned'):'Unsectioned')}</span></header>${expanded?`<div class="structure-rows">${rows.map(_structureRowHTML).join('')}</div>`:''}</section>`;}
  const lane=_structureLane(ann),start=lane+3;
  const expanded=STRUCTURE_EXPANDED.has(ann.id);
  const disclosure=typeof t==='function'?t(expanded?'structure.collapse':'structure.expand'):(expanded?'Collapse section':'Expand section'),reset=typeof t==='function'?t('structure.reset-left'):'Reset section left';
  return `<section class="structure-group${expanded?'':' is-collapsed'}" data-ann-id="${ann.id}" style="--structure-start:${start};--structure-color:${escH(ann.color||'#534AB7')};grid-row:${rowNo}"><header class="structure-divider" draggable="true"><button type="button" data-structure-action="toggle" aria-expanded="${expanded}" title="${escH(disclosure)}">${expanded?'▾':'▸'}</button><button type="button" data-structure-action="left" title="Move section left">‹</button><span class="structure-divider-label" contenteditable="true" data-ph="Section…">${escH(ann.label||'')}</span><input type="color" value="${escH(ann.color||'#534AB7')}" title="Section color"><button type="button" data-structure-action="reset" title="${escH(reset)}">•</button><button type="button" data-structure-action="right" title="Move section right">›</button><button type="button" data-structure-action="delete" title="Delete section">×</button></header>${expanded?`<div class="structure-divider-meta"><select data-structure-range="start" aria-label="Section starts at">${_structureSelectOptions(ann.startRid)}</select><select data-structure-range="end" aria-label="Section ends at">${_structureSelectOptions(ann.endRid)}</select></div><div class="structure-rows">${rows.map(_structureRowHTML).join('')}</div>`:''}</section>`;
}
function renderStructurePanel(){
  const canvas=document.getElementById('structure-panel-canvas');if(!canvas)return;
  const rows=_realRows();if(!rows.length){canvas.innerHTML=`<div class="structure-empty">${escH(typeof t==='function'?t('structure.empty'):'Add phrasing rows, then organize them into sections.')}</div>`;return;}
  const index=new Map(rows.map((row,i)=>[String(row.dataset.rid),i]));
  const sections=_structureSections();const occupied=new Set();const groups=[];
  sections.forEach(ann=>{const a=index.get(String(ann.startRid)),b=index.get(String(ann.endRid));if(a===undefined||b===undefined)return;const lo=Math.min(a,b),hi=Math.max(a,b),members=rows.slice(lo,hi+1);members.forEach(row=>occupied.add(String(row.dataset.rid)));groups.push({ann,rows:members,at:lo});});
  const unsectioned=rows.filter(row=>!occupied.has(String(row.dataset.rid)));if(unsectioned.length)groups.push({ann:null,rows:unsectioned,at:Math.min(...unsectioned.map(row=>index.get(String(row.dataset.rid))))});
  groups.sort((a,b)=>a.at-b.at);
  const hasOffsets=sections.some(ann=>_structureLane(ann)>-2);
  canvas.innerHTML=`<div class="structure-lanes${hasOffsets?' has-offsets':''}">${groups.map((group,i)=>_structureGroupHTML(group.ann,group.rows,i+1,!group.ann)).join('')}</div>`;
  canvas.querySelectorAll('.structure-row-edit').forEach(el=>{
    el.addEventListener('focus',()=>{activeEl=el;saveRange();});
    el.addEventListener('input',()=>structureSyncRow(el,el.dataset.rid,el.dataset.col));
    el.addEventListener('keyup',saveRange);el.addEventListener('mouseup',saveRange);
  });
  canvas.querySelectorAll('.structure-group[data-ann-id]').forEach(group=>_bindStructureGroup(group));
  canvas.querySelector('[data-structure-unsectioned-toggle]')?.addEventListener('click',()=>{STRUCTURE_EXPANDED.has('unsectioned')?STRUCTURE_EXPANDED.delete('unsectioned'):STRUCTURE_EXPANDED.add('unsectioned');renderStructurePanel();});
}
function structureSyncRow(el,rid,col){
  const row=document.querySelector(`.xrow[data-rid="${CSS.escape(String(rid))}"]`);const target=row?.querySelector(`#${col==='t'?'tc':'oc'}-${rid} .cedit`);if(!target)return;
  target.innerHTML=el.innerHTML;cleanEmptyCell(target);autoSave();if(EDITOR_VIEW==='diagram')renderDiagram();
}
function _bindStructureGroup(group){
  const ann=ANNOTATIONS.find(item=>item.id===group.dataset.annId);if(!ann)return;
  const header=group.querySelector('.structure-divider'),label=group.querySelector('.structure-divider-label');
  label.addEventListener('focus',()=>_annLabelFocusSnap(ann.id,label));
  label.addEventListener('input',()=>{ann.label=label.textContent.trim();autoSave();renderSectionStrips();if(EDITOR_VIEW==='diagram')renderDiagram();});
  label.addEventListener('blur',()=>_annLabelBlurSnap(ann.id,ann));
  group.querySelector('input[type="color"]')?.addEventListener('input',event=>{ann.color=event.target.value;autoSave();renderSectionStrips();if(EDITOR_VIEW==='diagram')renderDiagram();});
  group.querySelectorAll('[data-structure-action]').forEach(button=>button.addEventListener('click',()=>{const action=button.dataset.structureAction;if(action==='toggle'){STRUCTURE_EXPANDED.has(ann.id)?STRUCTURE_EXPANDED.delete(ann.id):STRUCTURE_EXPANDED.add(ann.id);renderStructurePanel();return;}if(action==='delete'){deleteSection(ann.id);renderStructurePanel();return;}ann.structureLane=action==='reset'?-2:Math.max(-2,Math.min(2,_structureLane(ann)+(action==='left'?-1:1)));autoSave();renderStructurePanel();}));
  group.querySelectorAll('[data-structure-range]').forEach(select=>select.addEventListener('change',()=>structureSetRange(ann.id,group.querySelector('[data-structure-range="start"]').value,group.querySelector('[data-structure-range="end"]').value)));
  header.addEventListener('dragstart',event=>{if(event.target!==header){event.preventDefault();return;}event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',ann.id);});
  header.addEventListener('dragend',event=>{const rect=document.getElementById('structure-panel-canvas')?.getBoundingClientRect();if(!rect)return;const delta=Math.round((event.clientX-rect.left)/120)-2;ann.structureLane=Math.max(-2,Math.min(2,delta));autoSave();renderStructurePanel();});
}
function structureSetRange(id,startRid,endRid){
  const ann=ANNOTATIONS.find(item=>item.id===id);if(!ann)return;const rids=_realRows().map(row=>String(row.dataset.rid));const start=rids.indexOf(String(startRid)),end=rids.indexOf(String(endRid));if(start<0||end<0)return;
  const lo=Math.min(start,end),hi=Math.max(start,end);if(rids.some((_,i)=>i>=lo&&i<=hi&&_rowInOtherSection(rids,i,id))){toast('Sections cannot overlap.');renderStructurePanel();return;}
  ann.startRid=rids[lo];ann.endRid=rids[hi];autoSave();renderSectionStrips();if(EDITOR_VIEW==='diagram')renderDiagram();renderStructurePanel();
}
function structureAddSection(){
  const rids=_realRows().map(row=>String(row.dataset.rid));const first=rids.find((rid,i)=>!_rowInOtherSection(rids,i,null));if(!first){toast('Every row is already inside a section.');return;}
  const ann={id:_annId(),type:'section',startRid:first,endRid:first,label:'',color:'#534AB7',structureLane:-2};ANNOTATIONS.push(ann);autoSave();renderSectionStrips();renderStructurePanel();setTimeout(()=>document.querySelector(`.structure-group[data-ann-id="${ann.id}"] .structure-divider-label`)?.focus(),0);
}

/* ── Collection compare ──────────────────────────────────────────────
   Each pane owns a parsed project payload. It never calls projLoad(), so
   editing either chapter cannot replace the primary editor's active project. */
let COMPARE_LINK_SELECTION=[null,null];
function _collectionAvailableProjects(){
  if(!ACTIVE_COLLECTION)return [];
  return ACTIVE_COLLECTION.members.map(member=>projIndex().find(project=>project.id===member.projectId)).filter(project=>project&&!projIsTrashed(project)).sort((a,b)=>(b.savedAt||0)-(a.savedAt||0));
}
async function _compareReadProject(id){
  let raw=null;try{raw=await pIdbGet(id);}catch(_){}if(!raw)raw=localStorage.getItem(PROJ_DATA_KEY(id));
  try{return raw?JSON.parse(raw):null;}catch(_){return null;}
}
async function renderCollectionCompare(){
  const host=document.getElementById('collection-compare-panes'),empty=document.getElementById('collection-compare-empty');if(!host)return;
  const available=_collectionAvailableProjects();
  document.getElementById('view-btn-compare')?.toggleAttribute('hidden',available.length<2);
  if(available.length<2){host.innerHTML='';if(empty){empty.hidden=false;empty.textContent=typeof t==='function'?t('compare.empty'):'Open a Collection with at least two available chapters to compare them here.';}return;}
  if(empty)empty.hidden=true;
  for(let i=0;i<2;i++)if(!COMPARE_PANES[i]||!available.some(project=>project.id===COMPARE_PANES[i].projectId))await compareLoadPane(i,available[i]?.id);
  host.innerHTML=COMPARE_PANES.map((pane,i)=>_comparePaneHTML(pane,i,available)).join('');
  host.querySelectorAll('.compare-edit').forEach(el=>{el.addEventListener('focus',()=>{activeEl=el;saveRange();});el.addEventListener('input',()=>compareEdit(Number(el.dataset.comparePane),el.dataset.rid,el.dataset.col,el));el.addEventListener('keyup',saveRange);el.addEventListener('mouseup',saveRange);});
  host.querySelectorAll('[data-compare-annotation]').forEach(el=>{el.addEventListener('focus',()=>{activeEl=el;saveRange();});el.addEventListener('input',()=>{const [index,id]=el.dataset.compareAnnotation.split(':');compareAnnotationLabel(Number(index),id,el);});el.addEventListener('keyup',saveRange);el.addEventListener('mouseup',saveRange);});
  host.querySelectorAll('[data-compare-annotation-color]').forEach(el=>el.addEventListener('input',()=>{const [index,id]=el.dataset.compareAnnotationColor.split(':');compareAnnotationColor(Number(index),id,el.value);}));
}
async function compareLoadPane(index,id){
  if(!id)return;const data=await _compareReadProject(id);if(!data)return;
  COMPARE_PANES[index]={projectId:id,data,view:COMPARE_PANES[index]?.view||'phrasing',saveTimer:null};
}
function _comparePaneOptions(index,available,pane){
  const other=COMPARE_PANES[index===0?1:0]?.projectId;
  return available.map(project=>`<option value="${project.id}"${project.id===pane.projectId?' selected':''}${project.id===other?' disabled':''}>${escH(project.name||'Untitled')} · ${escH(project.verseRef||'—')}</option>`).join('');
}
function _compareSectionsAt(data,rid){return (data.annotations||[]).filter(ann=>ann.type==='section'&&String(ann.startRid)===String(rid));}
function _compareDividersAt(data,rid){return (data.annotations||[]).filter(ann=>ann.type==='divider'&&String(ann.beforeRid||ann.afterRid)===String(rid));}
function _compareSectionsCovering(data,rid){
  const rows=data.rows||[],at=rows.findIndex(row=>String(row.rid)===String(rid));if(at<0)return [];
  const rowIndex=new Map(rows.map((row,index)=>[String(row.rid),index]));
  return (data.annotations||[]).filter(ann=>{
    if(ann.type!=='section')return false;const start=rowIndex.get(String(ann.startRid)),end=rowIndex.get(String(ann.endRid));
    return start!==undefined&&end!==undefined&&at>=Math.min(start,end)&&at<=Math.max(start,end);
  });
}
function _compareCommentButton(index,rid){return `<button type="button" class="cmtbtn compare-cmtbtn" title="Add or edit comment" aria-label="Add or edit comment" onclick="event.stopPropagation();compareToggleComment(${index},'${rid}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button>`;}
function _compareAnnotationHtml(ann,index,kind){
  const label=ann.label||(typeof t==='function'?t(`compare.${kind}`):(kind==='section'?'Section':'Proposition'));
  return `<div class="compare-${kind}-divider" style="--compare-annotation-color:${escH(ann.color||(kind==='section'?'#534AB7':'#C8A84B'))}" dir="auto"><span class="compare-annotation-line"></span><div class="compare-annotation-label" contenteditable="true" data-compare-annotation="${index}:${ann.id}">${escH(label)}</div><input type="color" value="${escH(ann.color||(kind==='section'?'#534AB7':'#C8A84B'))}" data-compare-annotation-color="${index}:${ann.id}" title="Annotation color"></div>`;
}
function _comparePhrasingContent(data,index){
  const isRTL=!!data.isRTL;
  return (data.rows||[]).map(row=>{
    const sections=_compareSectionsAt(data,row.rid).map(ann=>_compareAnnotationHtml(ann,index,'section')).join('');
    const dividers=_compareDividersAt(data,row.rid).map(ann=>_compareAnnotationHtml(ann,index,'proposition')).join('');
    const covered=_compareSectionsCovering(data,row.rid)[0],rail=covered?` style="--compare-section-color:${escH(covered.color||'#534AB7')}"`:'';
    return `${sections}${dividers}<article class="compare-row${covered?' has-section':''}"${rail}><div class="compare-row-meta"><span dir="auto">${escH(row.lineId||'—')}</span>${_compareCommentButton(index,row.rid)}</div><div><div class="compare-edit compare-original" dir="${isRTL?'rtl':'ltr'}" contenteditable="true" data-compare-pane="${index}" data-rid="${row.rid}" data-col="o" style="margin-inline-start:${Number(row.origIndent||0)*18}px">${row.origHTML||''}</div>${data.isSingle?'':`<div class="compare-edit compare-translation" dir="ltr" contenteditable="true" data-compare-pane="${index}" data-rid="${row.rid}" data-col="t" style="margin-inline-start:${Number(row.transIndent||0)*18}px">${row.transHTML||''}</div>`}</div></article>`;
  }).join('');
}
function _compareDiagramContent(data,index){
  const isRTL=!!data.isRTL;
  return `<div class="compare-diagram${isRTL?' is-rtl':''}">${(data.rows||[]).map((row,i)=>{
    const sections=_compareSectionsAt(data,row.rid).map(ann=>_compareAnnotationHtml(ann,index,'section')).join('');
    const dividers=_compareDividersAt(data,row.rid).map(ann=>_compareAnnotationHtml(ann,index,'proposition')).join('');
    const covered=_compareSectionsCovering(data,row.rid)[0],align=['flex-end','center','flex-start'][i%3],mirrored=isRTL?(align==='flex-end'?'flex-start':align==='flex-start'?'flex-end':align):align;
    return `${sections}${dividers}<article class="compare-diagram-card${covered?' has-section':''}" data-compare-card="${index}:${row.rid}" style="--compare-align:${mirrored};${covered?`--compare-section-color:${escH(covered.color||'#534AB7')};`:''}" onclick="compareDiagramLink(${index},'${row.rid}')"><div class="compare-diagram-card-top">${_compareCommentButton(index,row.rid)}<span dir="auto">${escH(row.lineId||'—')}</span></div><div class="compare-edit compare-original" dir="${isRTL?'rtl':'ltr'}" contenteditable="true" data-compare-pane="${index}" data-rid="${row.rid}" data-col="o" style="margin-inline-start:${Number(row.origIndent||0)*18}px">${row.origHTML||''}</div>${data.isSingle?'':`<small class="compare-edit compare-translation" dir="ltr" contenteditable="true" data-compare-pane="${index}" data-rid="${row.rid}" data-col="t">${row.transHTML||''}</small>`}</article>`;
  }).join('')}<p class="compare-ref">${(data.diagramData?.connectors||[]).length} relationship${(data.diagramData?.connectors||[]).length===1?'':'s'} · click two cards to link</p></div>`;
}
function _comparePaneHTML(pane,index,available){
  if(!pane?.data)return `<section class="compare-pane"><div class="compare-pane-body">Could not load this chapter.</div></section>`;
  const data=pane.data,rows=data.rows||[];const isDiagram=pane.view==='diagram',phraseLabel=typeof t==='function'?t('compare.phrasing'):'Phrasing',diagramLabel=typeof t==='function'?t('compare.diagram'):'Diagram';
  const content=isDiagram?_compareDiagramContent(data,index):_comparePhrasingContent(data,index);
  return `<section class="compare-pane${data.isRTL?' is-rtl':''}" data-compare-pane="${index}" onfocusin="compareActivateNotes(${index})"><header class="compare-pane-hdr"><select aria-label="Choose collection chapter" onchange="compareChoosePane(${index},this.value)">${_comparePaneOptions(index,available,pane)}</select><button type="button" class="${!isDiagram?'active':''}" onclick="compareSetView(${index},'phrasing')">${escH(phraseLabel)}</button><button type="button" class="${isDiagram?'active':''}" onclick="compareSetView(${index},'diagram')">${escH(diagramLabel)}</button><button type="button" onclick="compareAddRow(${index})" title="Add row">＋</button><button type="button" onclick="compareAddSection(${index})" title="Add section">§</button><button type="button" onclick="compareDeleteFocusedRow(${index})" title="Delete focused row">−</button></header><div class="compare-pane-hdr"><button type="button" onclick="compareFormat(${index},'bold')"><b>B</b></button><button type="button" onclick="compareFormat(${index},'italic')"><i>I</i></button><button type="button" onclick="compareFormat(${index},'underline')"><u>U</u></button><button type="button" onclick="compareIndent(${index},-1)">⇤</button><button type="button" onclick="compareIndent(${index},1)">⇥</button>${isDiagram?`<button type="button" onclick="compareRemoveLastLink(${index})" title="Remove last relationship">⌫</button>`:''}<span class="compare-ref" dir="auto">${escH(data.verseRef||'Untitled passage')}</span></div><div class="compare-pane-body">${content||'<div class="structure-empty">This chapter has no phrasing rows yet.</div>'}</div></section>`;
}
async function compareChoosePane(index,id){if(COMPARE_PANES[index===0?1:0]?.projectId===id){toast('Choose a different collection chapter for each pane.');return;}await compareLoadPane(index,id);renderCollectionCompare();if(COMPARE_NOTE_CONTEXT?.index===index)compareOpenNotes(index);}
function compareSetView(index,view){if(COMPARE_PANES[index]){COMPARE_PANES[index].view=view;renderCollectionCompare();}}
function compareEdit(index,rid,col,el){const pane=COMPARE_PANES[index],row=pane?.data?.rows?.find(item=>String(item.rid)===String(rid));if(!row)return;row[col==='t'?'transHTML':'origHTML']=el.innerHTML;if(pane.projectId===CURRENT_PROJECT_ID){const primary=document.querySelector(`.xrow[data-rid="${CSS.escape(String(rid))}"] #${col==='t'?'tc':'oc'}-${rid} .cedit`);if(primary&&primary!==el)primary.innerHTML=el.innerHTML;if(EDITOR_VIEW==='diagram')renderDiagram();}compareScheduleSave(index);}
function compareFormat(index,command){const active=activeEl;if(!active?.matches?.(`.compare-edit[data-compare-pane="${index}"]`))return;active.focus();restoreRange();document.execCommand(command,false,null);compareEdit(index,active.dataset.rid,active.dataset.col,active);}
function compareIndent(index,delta){const active=activeEl;if(!active?.matches?.(`.compare-edit[data-compare-pane="${index}"]`))return;const pane=COMPARE_PANES[index],row=pane.data.rows.find(item=>String(item.rid)===String(active.dataset.rid));const key=active.dataset.col==='t'?'transIndent':'origIndent';row[key]=String(Math.max(0,Number(row[key]||0)+delta));compareScheduleSave(index);renderCollectionCompare();}
function compareAddRow(index){const pane=COMPARE_PANES[index];if(!pane)return;const data=pane.data,rid=String(Math.max(Number(data.RC)||0,...(data.rows||[]).map(row=>Number(row.rid)||0))+1);data.RC=Number(rid);data.rows.push({rid,verse:'',lineId:'—',origHTML:'',transHTML:'',origIndent:'0',transIndent:'0',cid:''});compareScheduleSave(index);renderCollectionCompare();}
function compareAddSection(index){const pane=COMPARE_PANES[index],active=activeEl;if(!pane||!active?.matches?.(`.compare-edit[data-compare-pane="${index}"]`))return;const rid=active.dataset.rid,sections=pane.data.annotations||(pane.data.annotations=[]);if(sections.some(ann=>ann.type==='section'&&String(ann.startRid)===String(rid)))return;const id=`ann-compare-${Date.now()}-${Math.random().toString(36).slice(2,5)}`;sections.push({id,type:'section',startRid:rid,endRid:rid,label:'Section',color:'#534AB7',structureLane:-2});compareScheduleSave(index);renderCollectionCompare();}
function compareDeleteFocusedRow(index){const pane=COMPARE_PANES[index],active=activeEl;if(!pane||!active?.matches?.(`.compare-edit[data-compare-pane="${index}"]`))return;const rid=String(active.dataset.rid);pane.data.rows=pane.data.rows.filter(row=>String(row.rid)!==rid);pane.data.cmts=(pane.data.cmts||[]).filter(comment=>String(comment.rid)!==rid);pane.data.annotations=(pane.data.annotations||[]).filter(ann=>String(ann.startRid)!==rid&&String(ann.endRid)!==rid);pane.data.diagramData={...(pane.data.diagramData||{}),connectors:(pane.data.diagramData?.connectors||[]).filter(link=>String(link.fromRid)!==rid&&String(link.toRid)!==rid)};compareScheduleSave(index);renderCollectionCompare();if(COMPARE_NOTE_CONTEXT?.index===index)renderCompareNotes();}
function compareAnnotationLabel(index,id,el){const ann=COMPARE_PANES[index]?.data?.annotations?.find(item=>item.id===id);if(!ann)return;ann.label=el.textContent.trim();compareScheduleSave(index);}
function compareAnnotationColor(index,id,value){const ann=COMPARE_PANES[index]?.data?.annotations?.find(item=>item.id===id);if(!ann)return;ann.color=value;compareScheduleSave(index);renderCollectionCompare();}
function compareToggleComment(index,rid){compareOpenNotes(index,rid);}
function compareDiagramLink(index,rid){const pane=COMPARE_PANES[index];if(!pane||pane.view!=='diagram')return;const previous=COMPARE_LINK_SELECTION[index];if(!previous){COMPARE_LINK_SELECTION[index]=rid;document.querySelector(`[data-compare-card="${index}:${rid}"]`)?.focus();return;}if(previous!==rid){const data=pane.data,links=data.diagramData?.connectors||(data.diagramData={...(data.diagramData||{}),connectors:[],labels:data.diagramData?.labels||[]}).connectors;links.push({id:`compare-cnx-${Date.now()}-${Math.random().toString(36).slice(2,5)}`,fromRid:previous,toRid:rid,kind:'curve'});compareScheduleSave(index);}COMPARE_LINK_SELECTION[index]=null;renderCollectionCompare();}
function compareRemoveLastLink(index){const links=COMPARE_PANES[index]?.data?.diagramData?.connectors;if(!links?.length)return;links.pop();compareScheduleSave(index);renderCollectionCompare();}
function compareScheduleSave(index){const pane=COMPARE_PANES[index];if(!pane)return;clearTimeout(pane.saveTimer);pane.saveTimer=setTimeout(async()=>{try{await pIdbSet(pane.projectId,JSON.stringify(pane.data));const idx=projIndex(),entry=idx.find(item=>item.id===pane.projectId);if(entry){entry.savedAt=Date.now();entry.verseRef=pane.data.verseRef||entry.verseRef;projStoreIndex(idx);}if(typeof acctMarkDirty==='function')acctMarkDirty(pane.projectId);}catch(_){toast('Could not save this comparison chapter.');}},500);}

/* Feature 3: Add comment anchored to the currently focused or last-focused row */
function addCommentOnFocusedRow(){
  if(EDITOR_VIEW==='diagram'){
    // In Diagram View: require a selected block
    if(!SELECTED_DIAG_RID){
      toast(typeof t==='function'?t('toast.select-block-first'):'Select a block first.');
      return;
    }
    _createCommentForRow(SELECTED_DIAG_RID);
    return;
  }
  // Phrasing View: use lastFocusedRowEl
  if(lastFocusedRowEl){
    const rid=lastFocusedRowEl.dataset.rid;
    if(rid) _createCommentForRow(rid);
  }
}

/* ════════════════════════════════════════
   COLUMN / MARGIN RESIZE
════════════════════════════════════════ */
function startCR(e,col){
  e.preventDefault();const sx=e.clientX;
  const hdr=document.getElementById('ch-'+col);const sw=hdr?hdr.offsetWidth:200;
  const mm=ev=>{
    const nw=Math.max(60,sw+ev.clientX-sx);
    COL_WIDTHS[col]=nw; // persist for new rows + PDF
    if(col==='v'){
      document.querySelectorAll('.xcell.mid').forEach((el,i)=>{if(i%5===0){el.style.width=nw+'px';el.style.minWidth=nw+'px';}});
      if(hdr){hdr.style.width=nw+'px';hdr.style.minWidth=nw+'px';}
    } else if(col==='o'){
      if(hdr){hdr.style.flex='none';hdr.style.width=nw+'px';}
      document.querySelectorAll('[id^="oc-"]').forEach(el=>{el.style.flex='none';el.style.width=nw+'px';});
    } else if(col==='t'){
      if(hdr){hdr.style.flex='none';hdr.style.width=nw+'px';}
      document.querySelectorAll('[id^="tc-"]').forEach(el=>{el.style.flex='none';el.style.width=nw+'px';});
    }
    drawConns();
  };
  const mu=()=>{document.removeEventListener('mousemove',mm);document.removeEventListener('mouseup',mu);};
  document.addEventListener('mousemove',mm);document.addEventListener('mouseup',mu);
}


/* ════════════════════════════════════════
   LINKED SCROLL / SHORTCUTS / RESTART
════════════════════════════════════════ */
document.addEventListener('keydown',e=>{
  if(!(e.ctrlKey||e.metaKey))return;
  const noteEditor=e.target?.closest?.('.study-note-title,.study-note-body');
  if(noteEditor&&!e.shiftKey&&!e.altKey){
    const command={b:'bold',i:'italic',u:'underline'}[String(e.key||'').toLowerCase()];
    if(command){e.preventDefault();studyNotebookRememberFocus(noteEditor);studyNotebookFormat(command);return;}
  }
  // In Screen 1: only allow Ctrl+O, Ctrl+, and Ctrl+Shift+1
  const inS1=!document.getElementById('s1').classList.contains('hidden');
  if(inS1){
    if((e.key==='o'||e.key==='O')&&!e.shiftKey&&!e.altKey){e.preventDefault();document.getElementById('s1-load-file')?.click();return;}
    if(e.key===','){e.preventDefault();openSettings();return;}
    return;
  }
  // Projects/Bible handled in separate listener below
  if(e.shiftKey){
    if(e.key==='E'||e.key==='e'){
      const inEditor=getComputedStyle(document.getElementById('app')).display!=='none';
      if(inEditor){e.preventDefault();toggleExportPopup(e);}
      return;
    }
    if(e.key==='X'||e.key==='x'){e.preventDefault();fmtCmd('strikeThrough');return;}  // Ctrl+Shift+X  Strikethrough
    if(e.key==='R'||e.key==='r'){e.preventDefault();restartSess();return;}
    if(e.key==='L'||e.key==='l'){e.preventDefault();clearAll();return;}
    if(e.key==='M'||e.key==='m'){e.preventDefault();addCommentOnFocusedRow();return;}
    if(e.key==='\\'||e.key==='|'){e.preventDefault();if(typeof bTogglePin==='function')bTogglePin();return;}
    if(e.key==='Backspace'){e.preventDefault();deleteFocusedRowContent();return;}      // Ctrl+Shift+Backspace  Delete row content
    return;
  }
  if(e.key==='z'){e.preventDefault();undo();}
  if(e.key==='y'){e.preventDefault();redo();}
  if(e.key==='b'){e.preventDefault();fmtCmd('bold');}
  if(e.key==='i'){e.preventDefault();fmtCmd('italic');}
  if(e.key==='.'){e.preventDefault();fmtCmd('superscript');}
  if(e.key==='s'){e.preventDefault();projSave();}                                    // Ctrl+S  Save to app
  if(e.key==='o'){
    e.preventDefault();
    const inEditor=document.getElementById('app').style.display!=='none';
    document.getElementById(inEditor?'lfile':'s1-load-file').click();
  }
  if(e.key==='h'&&e.altKey){e.preventDefault();applyHl();return;}   // Ctrl+Alt+H  Highlight
  if(e.key==='h'&&!e.altKey){e.preventDefault();openHelp();}
  if(e.key===','){e.preventDefault();openSettings();}
  if(e.key==='p'||e.key==='P'){
    e.preventDefault();
    const inEditor=getComputedStyle(document.getElementById('app')).display!=='none';
    toast(inEditor?(typeof t==='function'?t('toast.export-only'):'Use Export ▾ or Ctrl+Shift+E to export this document.'):(typeof t==='function'?t('toast.no-export'):'Nothing to export yet — open or start a project first.'));
    return;
  }
  // Ctrl+Shift+1/2 handled in shiftKey block below
  if(e.key==='\\'){e.preventDefault();window.bToggleSplit?.();}
  if(e.key==='='||e.key==='+'){
    e.preventDefault();
    if(EDITOR_VIEW==='diagram'){ diagramZoomIn(); }
    else { addEmptyRowUndoable(lastFocusedRowEl||undefined); }
  }
  if(e.key==='-'){
    e.preventDefault();
    if(EDITOR_VIEW==='diagram'){ diagramZoomOut(); }
    else if(lastFocusedRowEl){ mergeRowUp(lastFocusedRowEl.dataset.rid); }
  }
  if(e.key==='0'){
    e.preventDefault();
    if(EDITOR_VIEW==='diagram'){ setDiagramZoom(100); }
  }
});

/* Escape handler */
document.addEventListener('keydown',function(e){
  if(e.key!=='Escape')return;
  var setModal=document.getElementById('set-modal');
  if(setModal&&!setModal.classList.contains('hidden')){e.preventDefault();if(typeof settingsEscOrClickOutside==='function')settingsEscOrClickOutside();return;}
  var helpModal=document.getElementById('help-modal');
  if(helpModal&&!helpModal.classList.contains('hidden')){e.preventDefault();if(typeof closeHelp==='function')closeHelp();return;}
  var acctModal=document.getElementById('acct-modal');
  if(acctModal&&!acctModal.classList.contains('hidden')){e.preventDefault();if(typeof closeAccount==='function')closeAccount();return;}
  var expPopup=document.getElementById('export-popup');
  if(expPopup&&expPopup.classList.contains('show')){e.preventDefault();expPopup.classList.remove('show');return;}
  var cpp=document.getElementById('color-palette-popover');
  if(cpp&&cpp.style.display!=='none'){e.preventDefault();if(typeof closeColorPalette==='function')closeColorPalette();return;}
  var fszp=document.getElementById('fsz-popover');
  if(fszp&&fszp.style.display!=='none'){e.preventDefault();if(typeof closeFontSizePopup==='function')closeFontSizePopup();return;}
  var cep=document.getElementById('conn-edit-popup');
  if(cep&&cep.style.display!=='none'){e.preventDefault();if(typeof closeConnEditPopup==='function')closeConnEditPopup();return;}
});
function restartSess(){
  if(!confirm(typeof t==='function'?t('confirm.restart'):'Restart session? All unsaved changes will be lost.'))return;
  // Clear editor canvas
  document.getElementById('rows-body').innerHTML='';
  document.querySelectorAll('.ccard').forEach(c=>c.remove());
  document.getElementById('refin').value='';
  document.getElementById('svgl')?.replaceChildren();
  const pta=document.getElementById('paste-ta');if(pta)pta.innerHTML='';
  setSourceCitation('');
  RC=CC=0;ROW_STACK.length=0;ROW_REDO.length=0;SESS='';
  COL_WIDTHS.v=null;COL_WIDTHS.o=null;COL_WIDTHS.t=null;
  CURRENT_FILENAME=null;CURRENT_PROJECT_ID=null;
  DIAGRAM_DATA={connectors:[], labels:[]};
  CNX=0;LBL=0;
  SELECTED_CNX_ID=null;
  document.getElementById('conn-edit-popup')?.style.setProperty('display','none');
  cancelRightAngleArm();
  setDiagramZoom(100);
  // Reset diagram edit mode cleanly — Ctrl+Shift+R's Shift keydown would have
  // triggered temporary edit mode; must be cleared before navigating away.
  if(typeof _applyDiagramEditMode==='function') _applyDiagramEditMode(false);
  DIAGRAM_EDIT_MODE=false;
  if(typeof _demAltTemp!=='undefined') _demAltTemp=false;
  // Reset bracket locked mode
  document.body.classList.remove('brk-locked','brk-shift','brk-active');
  if(typeof _brkExitLockedMode==='function') _brkExitLockedMode();
  // Reset connector mode
  if(typeof _exitConnectorMode==='function') _exitConnectorMode();
  // Use setEditorView so ALL toolbar state (annotation buttons etc.) resets cleanly
  EDITOR_VIEW='';
  setEditorView('phrasing');
  const cmtBtnRS=document.getElementById('btn-cmt-pane');
  if(cmtBtnRS) cmtBtnRS.disabled=false;
  // Reset bracket, annotation, and legacy deck state.
  BRACKETS=[]; BRK_CTR=0; SELECTED_BRK_ID=null;
  ANNOTATIONS=[]; ANN_CTR=0;
  STUDY_NOTEBOOK=[]; STUDY_NOTE_CTR=0; STUDY_NOTE_ACTIVE_ID=null; window.studyNotebookBibleSelection=null;
  renderStudyNotebook();
  if(typeof _brkCancelPending==='function') _brkCancelPending();
  LEGACY_SLIDES_DECK={slides:[]};
  sessionVersionLabel='';
  const vsub=document.getElementById('version-sub');if(vsub)vsub.textContent='';
  const vsubI=document.getElementById('version-sub-input');if(vsubI)vsubI.value='';
  if(typeof window.s2PickerInited!=='undefined')window.s2PickerInited=false;
  // Full Bible Module reset
  if(typeof bFullReset==='function')bFullReset();
  // Close Projects panel
  if(typeof closeProjects==='function')closeProjects();
  // Navigate to Screen 1
  document.getElementById('app').style.display='none';
  document.getElementById('s2').classList.add('hidden');
  document.getElementById('s1').classList.remove('hidden');
  if(typeof _updateS12Pill==='function') _updateS12Pill();
  if(typeof renderS1Recent==='function')renderS1Recent();
}

/* ════════════════════════════════════════
   SETTINGS
════════════════════════════════════════ */

/* ── Modal guard: returns true when Help or Settings is open ── */
function _isModalOpen(){
  const help=document.getElementById('help-modal');
  const settings=document.getElementById('set-modal');
  return (help&&!help.classList.contains('hidden'))||
         (settings&&!settings.classList.contains('hidden'));
}

function openHelp(){
  const m=document.getElementById('help-modal');
  if(m){m.classList.remove('hidden');m.classList.add('screen');}
  // Close sidebars so they don't overlap the modal
  if(typeof closeProjects==='function')closeProjects();
  if(typeof closeBible==='function')closeBible();
  // Always open on Tutorial tab and render content
  helpSwitchTab('tutorial');
  if(typeof renderTutorial==='function') renderTutorial();
  // Click outside to close
  setTimeout(()=>{
    const handler=e=>{
      const card=document.querySelector('#help-modal .mcard');
      if(card&&!card.contains(e.target)){closeHelp();document.removeEventListener('mousedown',handler);}
    };
    document.addEventListener('mousedown',handler);
  },50);
}
function closeHelp(){
  const m=document.getElementById('help-modal');
  if(m)m.classList.add('hidden');
}
function helpSwitchTab(tab){
  // Toggle tab buttons
  document.querySelectorAll('.help-tab').forEach(btn=>{
    btn.classList.toggle('active',btn.id==='htab-'+tab);
  });
  // Toggle panes
  const tutPane=document.getElementById('help-pane-tutorial');
  const scPane=document.getElementById('help-pane-shortcuts');
  if(tutPane)tutPane.style.display=tab==='tutorial'?'flex':'none';
  if(scPane)scPane.style.display=tab==='shortcuts'?'block':'none';
}

function _currentThemeId(){
  try{
    const saved=localStorage.getItem(THEME_KEY);
    return saved==='dark'||saved==='midnight' ? 'dark' : 'light';
  }catch(_){ return 'light'; }
}
function setThemeMode(mode){
  const normalized=mode==='dark'?'dark':'light';
  _applyColorSet(normalized==='dark'?DARK_COLORS:LIGHT_COLORS);
  document.documentElement.dataset.theme=normalized;
  const toggle=document.getElementById('dark-mode-toggle');
  if(toggle) toggle.checked=normalized==='dark';
  try{
    localStorage.setItem(THEME_KEY,normalized);
    localStorage.removeItem(LEGACY_COLORS_KEY);
  }catch(_){}
}
function openSettings(){
  const m=document.getElementById('set-modal');
  if(m){m.classList.remove('hidden');}
  // Close sidebars so they don't overlap the modal
  if(typeof closeProjects==='function')closeProjects();
  if(typeof closeBible==='function')closeBible();
  const toggle=document.getElementById('dark-mode-toggle');
  if(toggle) toggle.checked=_currentThemeId()==='dark';
  // Appearance changes apply immediately, so closing Settings never needs a
  // discard confirmation.
  setTimeout(()=>{
    const handler=e=>{
      const card=document.querySelector('#set-modal .mcard');
      if(card&&!card.contains(e.target)){closeSettings();}
    };
    document.addEventListener('mousedown',handler);
    document._settingsOutsideHandler=handler;
  },50);
}
function settingsEscOrClickOutside(){ closeSettings(); }
function closeSettings(){
  const m=document.getElementById('set-modal');
  if(m)m.classList.add('hidden');
  if(document._settingsOutsideHandler){
    document.removeEventListener('mousedown',document._settingsOutsideHandler);
    document._settingsOutsideHandler=null;
  }
}

/* ════════════════════════════════════════
   SAVE / LOAD / AUTOSAVE
════════════════════════════════════════ */
/* Real editor rows only — scoped to #rows-body so UI clones never get
   counted as persisted project content. */
function _realRows(){
  const body=document.getElementById('rows-body');
  return body ? Array.from(body.querySelectorAll('.xrow')) : [];
}
function collectData(){
  const rows=[];
  _realRows().forEach(row=>{
    const rid=row.dataset.rid;
    const vi=row.querySelector('.vin');
    const lid=row.querySelector('.lid');
    const oc=row.querySelector(`#oc-${rid} .cedit`);
    const tc=row.querySelector(`#tc-${rid} .cedit`);
    rows.push({rid,verse:vi?vi.value:'',lineId:lid?lid.textContent:'',
      origHTML:oc?oc.innerHTML:'',transHTML:tc?tc.innerHTML:'',
      origIndent:oc?(oc.dataset.indent||'0'):'0',
      transIndent:tc?(tc.dataset.indent||'0'):'0',
      cid:row.dataset.cid||''});
  });
  const cmts=[];
  const commentCards=COMPARE_NOTE_CONTEXT?COMPARE_PRIMARY_NOTE_NODES:[...document.querySelectorAll('.ccard')];
  commentCards.forEach(card=>{
    const ed=card.querySelector('.cedit-c');
    cmts.push({cid:card.dataset.cid,rid:card.dataset.rid,html:ed?ed.innerHTML:''});
  });
  return{lang:SESS,langLabel:LANG,isRTL:IS_RTL,isSingle:IS_SINGLE,
    verseRef:document.getElementById('refin').value,
    versionLabel:sessionVersionLabel||document.getElementById('version-sub-input')?.value.trim()||'',
    rows,cmts,RC,CC,
    colWidths:{...COL_WIDTHS},
    editorView:EDITOR_VIEW,CNX,LBL,
    diagramEditMode:DIAGRAM_EDIT_MODE,
    diagramFontSize:DIAGRAM_FONT_SIZE,
    diagramData:{connectors:[...DIAGRAM_DATA.connectors], labels:[...DIAGRAM_DATA.labels]},
    brackets: typeof collectBracketData==='function' ? collectBracketData() : [],
    annotations: ANNOTATIONS.map(a=>({...a})),
    structureLayoutVersion:STRUCTURE_LAYOUT_VERSION,
    annCtr: ANN_CTR,
    studyNotebook:{entries:STUDY_NOTEBOOK.map(note=>({...note,attachments:(note.attachments||[]).map(link=>({...link}))})),nextId:STUDY_NOTE_CTR},
    sourceCitation: SOURCE_CITATION,
    deck: LEGACY_SLIDES_DECK};
}

/* Strips legacy inline styling baked into HTML from old saved projects or
   source-app pastes (Logos/BibleArc/Word), every time that HTML loads:
    - background/background-color — source-app page-background tints.
    - font-size — relative sizes (e.g. 133%, 166%, 83%) some sources embed
      per-span for cantillation/accent marks, which compound on top of the
      cell's own font-size setting and make that saved content render at
      an inflated, inconsistent size no matter what the toolbar's Hebrew/
      Translation size controls say. New pastes never get either style in
      the first place (see _PASTE_SAFE_STYLES), but old saved rows need
      them stripped on every load.
   .hl spans are exempted from the background strip only — the app's own
   Highlight tool (applyHl()) stores its color as an inline background-color
   on a .hl span, and stripping that too would silently erase user-applied
   highlights on reload. Font-size is never meaningful on a .hl span, so it's
   stripped there as well. DOM-based (not regex) so it can check each
   element's own class before touching its style. */
function _stripBgFromHTML(html){
  if(!html) return html;
  const tmp=document.createElement('div');
  tmp.innerHTML=html;
  tmp.querySelectorAll('[style]').forEach(el=>{
    if(!el.classList.contains('hl')){
      el.style.removeProperty('background');
      el.style.removeProperty('background-color');
    }
    el.style.removeProperty('font-size');
    if(!el.getAttribute('style')) el.removeAttribute('style');
  });
  tmp.querySelectorAll('[bgcolor]').forEach(el=>el.removeAttribute('bgcolor'));
  return tmp.innerHTML;
}

function loadData(data){
  document.getElementById('rows-body').innerHTML='';
  document.querySelectorAll('.ccard').forEach(c=>c.remove());
  window.studyNotebookBibleSelection=null;
  RC=data.RC||0;CC=data.CC||0;CNX=data.CNX||0;LBL=data.LBL||0;
  // data.colors (per-project color snapshot) is deliberately no longer read
  // — the global theme (Settings) is now the single source of truth for
  // color, so an old project's saved palette doesn't override it. Any
  // colors field in old saved JSON is simply inert/unused going forward.
  // Restore column widths
  if(data.colWidths){
    Object.assign(COL_WIDTHS, data.colWidths);
    // Re-apply to header
    const chO=document.getElementById('ch-o'), chT=document.getElementById('ch-t');
    if(COL_WIDTHS.o&&chO){chO.style.flex='none';chO.style.width=COL_WIDTHS.o+'px';}
    if(COL_WIDTHS.t&&chT){chT.style.flex='none';chT.style.width=COL_WIDTHS.t+'px';}
    if(COL_WIDTHS.v){
      const chV=document.getElementById('ch-v');
      if(chV){chV.style.width=COL_WIDTHS.v+'px';chV.style.minWidth=COL_WIDTHS.v+'px';}
    }
  }
  if(data.verseRef)document.getElementById('refin').value=data.verseRef;
  setSourceCitation(data.sourceCitation||'');
  const isSingle=data.isSingle||false,isRTL=data.isRTL||false;
  (data.rows||[]).forEach(rd=>{
    const rid=rd.rid||++RC;const rtl=isRTL?' rtl':'';
    const origPH=isRTL?'טקסט עברי…':isSingle?(data.langLabel||'Text')+'…':(data.langLabel||'Original')+' text…';
    const transCell=isSingle?'':`<div class="vdiv"></div><div class="xcell grow" id="tc-${rid}"><div class="cedit" contenteditable="true" spellcheck="false" data-ph="Translation…" onfocus="trackFocus(this,${rid});_textFocusSnap(this,${rid},'t')" onblur="autoSave();_textBlurSnap(this,${rid},'t')" oninput="cleanEmptyCell(this)" onkeydown="onKey(event,'t',${rid})"></div></div>`;
    const row=document.createElement('div');
    row.className='xrow'+(rd.cid?' has-cmt':'');row.dataset.rid=rid;if(rd.cid)row.dataset.cid=rd.cid;
    row.innerHTML=`<div class="xcell mid" style="width:60px;min-width:60px"><input class="vin" type="text" maxlength="8" placeholder="v" spellcheck="false" value="${escH(rd.verse||'')}" oninput="recomputeIds();autoSave()" onkeydown="onVerseKey(event,${rid})"/></div><div class="xcell mid" style="width:52px;min-width:52px"><div class="lid">—</div></div><div class="vdiv"></div><div class="xcell grow" id="oc-${rid}"><div class="cedit${rtl}" contenteditable="true" spellcheck="false" data-ph="${origPH}" onfocus="trackFocus(this,${rid});_textFocusSnap(this,${rid},'o')" onblur="autoSave();_textBlurSnap(this,${rid},'o')" oninput="cleanEmptyCell(this)" onkeydown="onKey(event,'o',${rid})"></div></div>${transCell}<div class="xcell mid" style="width:40px;min-width:40px"><button class="cmtbtn${rd.cid?' on':''}" title="Comment" onclick="toggleCmt(this,${rid})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button></div>`;
    const oc=row.querySelector(`#oc-${rid} .cedit`);
    if(oc&&rd.origHTML)oc.innerHTML=_stripBgFromHTML(rd.origHTML);
    if(oc&&rd.origIndent){oc.dataset.indent=rd.origIndent;}
    const tc=row.querySelector(`#tc-${rid} .cedit`);
    if(tc&&rd.transHTML)tc.innerHTML=_stripBgFromHTML(rd.transHTML);
    if(tc&&rd.transIndent){tc.dataset.indent=rd.transIndent;}
    // Unlike makeRowEl (used by addRow/split/etc.), this template never
    // applied the current session font-size — _applySessionFontDefaults()
    // is called BEFORE loadData() at every one of its call sites (project
    // load, JSON load, language selection), so its own bulk re-apply loop
    // always runs against zero rows and is a no-op here. Loaded rows fell
    // back to whatever bare CSS default .cedit has, which is why a freshly
    // split/added row (styled correctly at creation via makeRowEl) could
    // visibly mismatch every row that came from the loaded project.
    if(oc) oc.style.fontSize=CEDIT_O_SIZE+'px';
    if(tc) tc.style.fontSize=CEDIT_T_SIZE+'px';
    document.getElementById('rows-body').appendChild(row);
  });
  recomputeIds();
  restoreAllIndents();
  const list=_commentList();
  COMMENT_HTML_CACHE={};
  (data.cmts||[]).forEach(c=>{
    const row=document.querySelector(`.xrow[data-rid="${c.rid}"]`);
    const lid=row?(row.querySelector('.lid')?.textContent||''):'';
    // Some older saves only stored the relationship on the comment itself.
    // Restore the row anchor as well so badges, PDF footnotes, and the
    // one-comment-per-row rule remain intact.
    if(row && c.cid){
      row.dataset.cid=c.cid;row.classList.add('has-cmt');
      row.querySelector('.cmtbtn')?.classList.add('on');
    }
    // Legacy per-card geometry is intentionally ignored: Notes are a list.
    const card=_buildCmtCard(c.cid,c.rid,lid,undefined,undefined,undefined,c.html||'');
    if(c.cid) COMMENT_HTML_CACHE[c.cid]=c.html||'';
    list?.appendChild(card);
    const idNumber=Number(c.cid);
    if(Number.isFinite(idNumber)) CC=Math.max(CC,idNumber);
  });
  _syncCommentList();
  const savedNotebook=data.studyNotebook;
  STUDY_NOTEBOOK=Array.isArray(savedNotebook?.entries)?savedNotebook.entries.filter(note=>note&&typeof note.id==='string'&&/^[A-Za-z0-9_-]+$/.test(note.id)&&STUDY_STAGES.includes(note.stage)).map(note=>({
    id:note.id,stage:note.stage,title:typeof note.title==='string'?note.title:'',bodyHTML:typeof note.bodyHTML==='string'?note.bodyHTML:'',
    attachments:Array.isArray(note.attachments)?note.attachments.filter(link=>link&&typeof link.type==='string'&&typeof link.label==='string').map(link=>({...link})):[],
    createdAt:Number.isFinite(note.createdAt)?note.createdAt:Date.now(),updatedAt:Number.isFinite(note.updatedAt)?note.updatedAt:Date.now()
  })):[];
  STUDY_NOTE_CTR=Number.isFinite(savedNotebook?.nextId)?savedNotebook.nextId:STUDY_NOTEBOOK.length;
  STUDY_NOTE_ACTIVE_ID=null;renderStudyNotebook();
  // Restore Diagram View data — connectors are fully wired up as of Stage 3
  // (solid-line, block-to-block by row ID, rendered when Diagram View is
  // active) with selection/style/color/delete added afterward. Floating
  // labels remain a stub array until a later stage. Legacy saves from
  // before the translation-layout fix may still carry a transGap field —
  // it's simply ignored now that translation text renders below the block
  // with a fixed, non-adjustable gap.
  DIAGRAM_DATA={
    connectors: Array.isArray(data.diagramData?.connectors) ? data.diagramData.connectors : [],
    labels: Array.isArray(data.diagramData?.labels) ? data.diagramData.labels : []
  };
  // Migrate legacy connectors through however many shape-changes they
  // predate. Each stage checks for the PRESENCE of its own legacy field
  // (not the absence of the target field), converts it, and deletes the
  // legacy field — so a connector can cascade through multiple stages in
  // the same pass (oldest `style`-only connectors go through both A and
  // B), while a connector that already has the newest shape skips both
  // stages entirely, since it never had the older fields to begin with.
  DIAGRAM_DATA.connectors.forEach(c=>{
    if(!c.kind) c.kind='curve'; // every pre-existing connector was a freeform curve

    // Stage A: oldest `style` field ('solid'/'dotted'/'arrow', where
    // 'arrow' meant double-headed) -> pattern + an intermediate arrowMode.
    if(c.style!==undefined){
      if(c.style==='dotted'){ c.pattern='dotted'; c.arrowMode='none'; }
      else if(c.style==='arrow'){ c.pattern='solid'; c.arrowMode='double'; }
      else { c.pattern='solid'; c.arrowMode='none'; }
      delete c.style;
    }
    if(c.pattern===undefined) c.pattern='solid';

    // Stage B: intermediate arrowMode ('none'/'single'/'double', single
    // meaning "arrow at the end only") -> independent startCap/endCap.
    if(c.arrowMode!==undefined){
      if(c.arrowMode==='single'){ c.startCap='none'; c.endCap='arrow'; }
      else if(c.arrowMode==='double'){ c.startCap='arrow'; c.endCap='arrow'; }
      else { c.startCap='none'; c.endCap='none'; }
      delete c.arrowMode;
    }
    if(c.startCap===undefined) c.startCap='none';
    if(c.endCap===undefined) c.endCap='arrow'; // matches the current creation default

    // Legacy connectors saved before the line-weight option existed always
    // rendered at 1px — preserve that exact look rather than silently
    // changing already-drawn diagrams.
    if(c.weight===undefined) c.weight=1;
  });
  // Defensive: if CNX wasn't saved (legacy file) or is stale, bump it past the
  // highest numeric suffix already in use so new connector IDs never collide.
  DIAGRAM_DATA.connectors.forEach(c=>{
    const n=parseInt(String(c.id||'').replace(/^cnx/,''),10);
    if(!isNaN(n) && n>=CNX) CNX=n+1;
  });
  // Always reopen on Phrasing View when loading a project — avoids landing
  // mid-drag-state in a different project's diagram. Zoom is a view
  // preference, not saved project data, so it resets too rather than
  // carrying over a confusing zoom level into a different project.
  setDiagramZoom(100);
  setEditorView('phrasing');
  // Restore brackets (after rows are in DOM, loadBracketData defers render)
  if(typeof loadBracketData==='function') loadBracketData(data.brackets||[]);
  // Restore annotations
  const structureNeedsLeftMigration=Number(data.structureLayoutVersion||0)<STRUCTURE_LAYOUT_VERSION;
  ANNOTATIONS=Array.isArray(data.annotations)?data.annotations.map(a=>a.type==='section'?{...a,structureLane:structureNeedsLeftMigration?-2:_structureLane(a)}:{...a}):[];
  ANN_CTR=data.annCtr||0;
  // Ensure ANN_CTR is at least as large as the highest existing id
  ANNOTATIONS.forEach(a=>{ const n=parseInt(String(a.id||'').replace(/^ann-/,''),10); if(!isNaN(n)&&n>=ANN_CTR) ANN_CTR=n+1; });
  // Re-render dividers in phrasing view after rows exist in DOM
  setTimeout(()=>{ renderDividers(); renderSectionStrips(); renderStructurePanel(); if(EDITOR_VIEW==='diagram') renderAnnLayer(); }, 50);
  // Restore diagram edit mode (persistent across saves)
  DIAGRAM_EDIT_MODE=data.diagramEditMode===true;
  if(DIAGRAM_EDIT_MODE) setTimeout(()=>_applyDiagramEditMode(true), 80);
  // Restore diagram font size
  if(data.diagramFontSize) setTimeout(()=>setDiagramFontSize(data.diagramFontSize), 0);
  LEGACY_SLIDES_DECK=(data.deck&&typeof data.deck==='object')?data.deck:{slides:[]};
  if(typeof syncWorkspaceChrome==='function') syncWorkspaceChrome(CURRENT_PROJECT_ID?'saved':'draft');
}

const storeKey=()=>'exeg7-'+SESS+(IS_SINGLE?'-'+LANG:'');
/* ════════════════════════════════════════
   PROJECTS — localStorage persistence
════════════════════════════════════════ */
const PROJ_INDEX_KEY='exeg-proj-index';
const PROJ_DATA_KEY =id=>'exeg-proj-'+id;
const PROJ_AUTOSAVE_KEY='exeg-autosave-current'; // tracks which project is "open"
// Folders are LOCAL-ONLY (never synced to the cloud) — the shared
// phrasing_projects Supabase table has a fixed column set with no folder
// field, and adding one is a schema migration out of scope here. A project
// entry's folderId is deliberately never included in acctCloudPayload().
const PROJ_FOLDERS_KEY='exeg-proj-folders';
const COLLECTION_INDEX_KEY='exeg-study-collections-index';
const COLLECTION_TRASH_RETENTION_MS=30*24*60*60*1000;

let CURRENT_PROJECT_ID=null; // null = new unsaved project
let ACTIVE_COLLECTION_ID=null;
let ACTIVE_COLLECTION=null;
let COLLECTION_MEMBERS_OPEN=false;
let collectionSaveTimer=null;

function projIndex(){
  try{ return JSON.parse(localStorage.getItem(PROJ_INDEX_KEY)||'[]'); }
  catch(_){ return []; }
}
function projFolders(){
  try{ return JSON.parse(localStorage.getItem(PROJ_FOLDERS_KEY)||'[]'); }
  catch(_){ return []; }
}
function projSaveFolders(folders){
  try{ localStorage.setItem(PROJ_FOLDERS_KEY,JSON.stringify(folders)); }catch(_){}
}

/* ── Project data storage: IndexedDB ──
   Only the full per-project session blobs (PROJ_DATA_KEY(id)) live here —
   the index/folders above are tiny and stay in localStorage untouched.
   A separate DB from bible.js's exeg-bible-v3 (not a new store on that DB)
   so the Bible cache's own clear-cache code can never accidentally touch
   project data — different DB makes that structurally impossible, not
   just "currently doesn't happen". Values are stored as JSON STRINGS (a
   deliberate deviation from bible.js's bIdbGet/bIdbSet, which store raw
   objects via structured clone) — every existing read/write path already
   stringifies/parses at the localStorage boundary, so matching that keeps
   identical serialization semantics and makes _exportAllJSON's
   zip.file(fname, raw) stay byte-preserving with no re-serialization. */
let projIdb=null;
async function pOpenIDB(){
  return new Promise((res,rej)=>{
    const r=indexedDB.open('exeg-proj-v1',2);
    r.onupgradeneeded=e=>{const db=e.target.result;if(!db.objectStoreNames.contains('projdata'))db.createObjectStore('projdata');if(!db.objectStoreNames.contains('collections'))db.createObjectStore('collections');};
    r.onsuccess=e=>res(e.target.result);
    r.onerror=()=>rej(r.error);
  });
}
async function cIdbGet(id){if(!projIdb)projIdb=await pOpenIDB();return new Promise((res,rej)=>{const r=projIdb.transaction('collections','readonly').objectStore('collections').get(id);r.onsuccess=e=>res(e.target.result);r.onerror=()=>rej(r.error);});}
async function cIdbSet(id,val){if(!projIdb)projIdb=await pOpenIDB();return new Promise((res,rej)=>{const r=projIdb.transaction('collections','readwrite').objectStore('collections').put(val,id);r.onsuccess=()=>res();r.onerror=()=>rej(r.error);});}
async function cIdbDelete(id){if(!projIdb)projIdb=await pOpenIDB();return new Promise((res,rej)=>{const r=projIdb.transaction('collections','readwrite').objectStore('collections').delete(id);r.onsuccess=()=>res();r.onerror=()=>rej(r.error);});}

/* ── Study Collections: shared, project-independent research records ── */
function collectionIndex(){try{return JSON.parse(localStorage.getItem(COLLECTION_INDEX_KEY)||'[]');}catch(_){return [];}}
function collectionStoreIndex(items){try{localStorage.setItem(COLLECTION_INDEX_KEY,JSON.stringify(items));}catch(_){}}
function collectionNewId(){return 'collection-'+Date.now()+'-'+Math.random().toString(36).slice(2,8);}
function collectionIsTrashed(item){return Number.isFinite(item?.trashedAt)&&item.trashedAt>0;}
function collectionActiveEntries(){return collectionIndex().filter(item=>!collectionIsTrashed(item));}
function collectionSummary(data){return {id:data.id,name:data.name||'Untitled collection',savedAt:data.updatedAt||Date.now(),trashedAt:data.trashedAt,memberCount:(data.members||[]).length,cloudAt:data.cloudAt};}
function collectionNormalise(data){
  const raw=data&&typeof data==='object'?data:{};
  return {id:String(raw.id||collectionNewId()),name:String(raw.name||'Untitled collection'),createdAt:Number(raw.createdAt)||Date.now(),updatedAt:Number(raw.updatedAt)||Date.now(),trashedAt:Number(raw.trashedAt)||undefined,cloudAt:Number(raw.cloudAt)||undefined,members:Array.isArray(raw.members)?raw.members.filter(m=>m&&m.projectId).map(m=>({projectId:String(m.projectId),label:String(m.label||''),reference:String(m.reference||''),addedAt:Number(m.addedAt)||Date.now()})):[],notebook:{entries:Array.isArray(raw.notebook?.entries)?raw.notebook.entries:[],nextId:Number(raw.notebook?.nextId)||0}};
}
async function collectionRead(id){try{const raw=await cIdbGet(id);return raw?collectionNormalise(JSON.parse(raw)):null;}catch(_){return null;}}
async function collectionWrite(data,{queue=true}={}){
  const collection=collectionNormalise(data);collection.updatedAt=Date.now();
  await cIdbSet(collection.id,JSON.stringify(collection));
  const idx=collectionIndex(),pos=idx.findIndex(item=>item.id===collection.id),summary=collectionSummary(collection);
  if(pos===-1)idx.unshift(summary);else idx[pos]=summary;
  collectionStoreIndex(idx);
  if(queue&&typeof acctQueueCollectionPush==='function'&&!collectionIsTrashed(collection))acctQueueCollectionPush(collection.id,collection,true);
  if(ACTIVE_COLLECTION_ID===collection.id){ACTIVE_COLLECTION=collection;}
  renderProjPanel();renderS1Recent();return collection;
}
function collectionSaveActive(){if(!ACTIVE_COLLECTION)return;const pending=ACTIVE_COLLECTION;clearTimeout(collectionSaveTimer);collectionSaveTimer=setTimeout(async()=>{try{await collectionWrite(pending);}catch(_){toast(typeof t==='function'?t('toast.storage-full'):'Storage full');}},450);}
async function collectionCreate(){
  const name=await cModalPrompt('collection.create.title','collection.create.hint','');if(!name||!name.trim())return;
  const now=Date.now(),data={id:collectionNewId(),name:name.trim(),createdAt:now,updatedAt:now,members:[],notebook:{entries:[],nextId:0}};
  await collectionWrite(data);await collectionOpen(data.id);
}
async function collectionOpen(id){
  const data=await collectionRead(id);if(!data||collectionIsTrashed(data))return;
  ACTIVE_COLLECTION_ID=id;ACTIVE_COLLECTION=data;COLLECTION_MEMBERS_OPEN=false;STUDY_NOTE_ACTIVE_ID=null;
  // A Collection is a working workspace, not a landing-page modal. Hide the
  // landing screen before revealing its notebook dock; previously the dock
  // opened correctly but remained obscured by #s1.
  if(typeof closeProjects==='function')closeProjects();
  const available=data.members.map(member=>projIndex().find(project=>project.id===member.projectId)).filter(project=>project&&!projIsTrashed(project)).sort((a,b)=>(b.savedAt||0)-(a.savedAt||0));
  if(available.length&&available[0].id!==CURRENT_PROJECT_ID){
    await projLoad(available[0].id,{keepCollection:true});
  }else{
    document.getElementById('s1')?.classList.add('hidden');
    document.getElementById('s2')?.classList.add('hidden');
    const app=document.getElementById('app');if(app)app.style.display='flex';
  }
  const dock=document.getElementById('study-notebook');if(dock?.classList.contains('pane-hidden'))toggleStudyNotebook();else renderStudyNotebook();
  COMPARE_PANES=[null,null];
  syncWorkspaceChrome();
  toast((typeof t==='function'?t('collection.opened'):'Opened collection: ')+data.name);
}
async function collectionRename(id){const data=await collectionRead(id);if(!data)return;const name=await cModalPrompt('collection.rename.title','collection.rename.hint',data.name);if(name&&name.trim()){data.name=name.trim();await collectionWrite(data);}}
async function collectionDuplicate(id){const source=await collectionRead(id);if(!source)return;const copy=collectionNormalise({...source,id:collectionNewId(),name:(typeof t==='function'?t('collection.copy.prefix'):'Copy of ')+source.name,createdAt:Date.now(),updatedAt:Date.now(),cloudAt:undefined,trashedAt:undefined});await collectionWrite(copy);}
async function collectionMoveToTrash(id){const data=await collectionRead(id);if(!data)return;data.trashedAt=Date.now();await collectionWrite(data,{queue:false});if(ACTIVE_COLLECTION_ID===id){ACTIVE_COLLECTION=null;ACTIVE_COLLECTION_ID=null;renderStudyNotebook();}}
async function collectionRestore(id){const data=await collectionRead(id);if(!data)return;delete data.trashedAt;await collectionWrite(data);}
async function collectionDeletePermanently(id){const data=await collectionRead(id);if(!data||!confirm(typeof t==='function'?t('collection.delete.confirm'):'Permanently delete this collection?'))return;await cIdbDelete(id);collectionStoreIndex(collectionIndex().filter(item=>item.id!==id));if(typeof acctQueueCollectionDelete==='function')acctQueueCollectionDelete(id);if(ACTIVE_COLLECTION_ID===id){ACTIVE_COLLECTION=null;ACTIVE_COLLECTION_ID=null;renderStudyNotebook();}renderProjPanel();renderS1Recent();}
async function collectionToggleMember(collectionId,projectId){const data=await collectionRead(collectionId);if(!data)return;const at=data.members.findIndex(item=>item.projectId===projectId);if(at>=0){data.members.splice(at,1);await collectionWrite(data);if(ACTIVE_COLLECTION_ID===collectionId){ACTIVE_COLLECTION=data;COMPARE_PANES=[null,null];renderStudyNotebook();syncWorkspaceChrome();}return;}const project=projIndex().find(item=>item.id===projectId);if(!project)return;data.members.push({projectId,label:project.name||'Untitled',reference:project.verseRef||'',addedAt:Date.now()});await collectionWrite(data);if(ACTIVE_COLLECTION_ID===collectionId){ACTIVE_COLLECTION=data;COMPARE_PANES=[null,null];renderStudyNotebook();syncWorkspaceChrome();}}
async function collectionAddCurrent(id){if(!CURRENT_PROJECT_ID){toast(typeof t==='function'?t('collection.member.no-project'):'Open a saved project first.');return;}await collectionToggleMember(id,CURRENT_PROJECT_ID);}
async function collectionPurgeTrash(){const expired=collectionIndex().filter(item=>collectionIsTrashed(item)&&Date.now()-item.trashedAt>=COLLECTION_TRASH_RETENTION_MS);for(const item of expired){await cIdbDelete(item.id);if(typeof acctQueueCollectionDelete==='function')acctQueueCollectionDelete(item.id);}if(expired.length)collectionStoreIndex(collectionIndex().filter(item=>!expired.some(x=>x.id===item.id)));}
async function pIdbGet(id){
  if(!projIdb) projIdb=await pOpenIDB();
  return new Promise((res,rej)=>{
    const r=projIdb.transaction('projdata','readonly').objectStore('projdata').get(id);
    r.onsuccess=e=>res(e.target.result); r.onerror=()=>rej(r.error);
  });
}
async function pIdbSet(id,val){
  if(!projIdb) projIdb=await pOpenIDB();
  return new Promise((res,rej)=>{
    const r=projIdb.transaction('projdata','readwrite').objectStore('projdata').put(val,id);
    r.onsuccess=()=>res(); r.onerror=()=>rej(r.error);
  });
}
async function pIdbDelete(id){
  if(!projIdb) projIdb=await pOpenIDB();
  return new Promise((res,rej)=>{
    const r=projIdb.transaction('projdata','readwrite').objectStore('projdata').delete(id);
    r.onsuccess=()=>res(); r.onerror=()=>rej(r.error);
  });
}
// Cursor-walk for the storage indicator — IndexedDB has no synchronous
// "sum all values" API, mirrors bClearCache's cursor pattern (bible.js).
async function pIdbUsedBytes(){
  if(!projIdb) projIdb=await pOpenIDB();
  return new Promise((res,rej)=>{
    const store=projIdb.transaction('projdata','readonly').objectStore('projdata');
    let total=0; const req=store.openCursor();
    req.onsuccess=e=>{ const c=e.target.result; if(c){ total+=(String(c.value||'').length)*2; c.continue(); } else res(total); };
    req.onerror=()=>rej(req.error);
  });
}

/* ── One-time migration: exeg-proj-{id} blobs, localStorage → IndexedDB ──
   Sweeps localStorage directly (not via projIndex(), which could miss an
   orphaned blob with no index entry) rather than trusting the index alone.
   Per key: validate JSON, write to IDB, read back and compare, ONLY THEN
   remove the localStorage source — a failed/unverified write always
   leaves the original untouched. The flag is only set once every key
   succeeds, so a partial run safely retries next load: already-migrated
   ids are already gone from localStorage, so the sweep just finds less
   to do — never a state where data exists in neither store. */
async function projMigrateToIdbOnce(){
  if(localStorage.getItem('exeg-proj-idb-migrated-v1')==='1') return;
  let allOk=true;
  const keys=[];
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if(k && k.indexOf('exeg-proj-')===0 && k!==PROJ_INDEX_KEY && k!==PROJ_FOLDERS_KEY) keys.push(k);
  }
  for(const key of keys){
    const id=key.slice('exeg-proj-'.length);
    const raw=localStorage.getItem(key);
    if(raw==null) continue;
    try{ JSON.parse(raw); }catch(_e){ allOk=false; continue; }
    try{
      await pIdbSet(id, raw);
      if((await pIdbGet(id))!==raw){ allOk=false; continue; }
      localStorage.removeItem(key);
    }catch(_e){ allOk=false; }
  }
  if(allOk) localStorage.setItem('exeg-proj-idb-migrated-v1','1');
}
async function projSave(showPanel){
  if(document.getElementById('app').style.display==='none') return;
  // Ensure a name exists
  const ref=document.getElementById('refin').value.trim();
  if(!ref&&!CURRENT_PROJECT_ID){
    const entered=await cModalPrompt('cmodal.save.title','cmodal.save.hint','');
    if(!entered||!entered.trim()){toast(typeof t==='function'?t('toast.save-cancel'):'Save cancelled');return;}
    document.getElementById('refin').value=entered.trim();
    autoSave();
  }
  const name=document.getElementById('refin').value.trim()||'Untitled';
  const isNewProject=!CURRENT_PROJECT_ID;
  // Duplicate-detection — only for a genuinely NEW project (overwriting your
  // own already-open project is normal, expected behavior, never a "duplicate").
  // Matches on verseRef, not name — name can now diverge intentionally after
  // a rename (see projRename), so it's no longer a reliable duplicate signal.
  if(isNewProject && ref){
    const dupe=projActiveEntries().find(e=>(e.verseRef||'').trim().toLowerCase()===ref.toLowerCase());
    if(dupe){
      const msg=(typeof t==='function'?t('confirm.dup-project'):'A project with this verse reference already exists ("{name}"). Save as a new, separate project anyway?').replace('{name}',dupe.name||'Untitled');
      if(!confirm(msg)){ toast(typeof t==='function'?t('toast.save-cancel'):'Save cancelled'); return; }
    }
  }
  const id=CURRENT_PROJECT_ID||(CURRENT_PROJECT_ID='proj-'+Date.now());
  const data=collectData();
  const now=Date.now();
  // Update data store
  try{ await pIdbSet(id,JSON.stringify(data)); }
  catch(e){
    if(e && e.name==='QuotaExceededError') toast(typeof t==='function'?t('toast.storage-full-quota'):'Storage is full. Use Export All to back up your projects, then delete some to free space.');
    else toast(typeof t==='function'?t('toast.storage-full'):'Storage full — please export and clear some projects');
    return;
  }
  // Update index
  const idx=projIndex();
  const entry=idx.find(e=>e.id===id);
  if(entry){ if(!entry.renamed) entry.name=name; entry.lang=LANG;entry.verseRef=ref;entry.savedAt=now; }
  else { idx.unshift({id,name,lang:LANG,verseRef:ref,savedAt:now}); }
  localStorage.setItem(PROJ_INDEX_KEY,JSON.stringify(idx));
  // Update status bar. Use 'd' not 't' — a LATER const t in this function
  // would put every earlier typeof t==='function' check in this function's
  // temporal dead zone, throwing "Cannot access 't' before initialization"
  // instead of falling back to the English string (see projLoad for the
  // same fix, and autoSave which already avoided this).
  const d=new Date(now);
  const ts=d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  document.getElementById('stbar').textContent=(typeof t==='function'?t('toast.saved-ts'):'Saved · ')+ts;
  renderProjPanel();
  renderS1Recent();
  if(typeof syncWorkspaceChrome==='function') syncWorkspaceChrome('saved');
  toast(typeof t==='function'?t('toast.saved'):'Saved to app');
  // Cloud push is additive and fire-and-forget — never delays or blocks
  // the local save above. account.js is optional; guard its absence.
  if(typeof acctQueuePush==='function') acctQueuePush(id,data,name,true);
}

async function projLoad(id,options={}){
  try{
    if(!options.keepCollection){ACTIVE_COLLECTION=null;ACTIVE_COLLECTION_ID=null;}
    if(projIsTrashed(projIndex().find(entry=>entry.id===id))) return;
    // IndexedDB is the primary store; fall back to legacy localStorage if
    // a specific id somehow wasn't migrated (or IDB is unreachable) —
    // costs nothing in the normal case, real safety net for "my project
    // won't open" otherwise. Existing onclick="projLoad(...)" call sites
    // need no changes — an async function works fine as an event handler.
    let raw=null;
    try{ raw=await pIdbGet(id); }catch(_e){}
    if(!raw) raw=localStorage.getItem(PROJ_DATA_KEY(id));
    if(!raw) return;
    const data=JSON.parse(raw);
    // Restore session language
    if(data.lang){
      SESS=data.lang;IS_RTL=data.isRTL||false;IS_SINGLE=data.isSingle||false;
      _applySessionFontDefaults();
      LANG=data.langLabel||(SESS==='greek'?'Greek':SESS==='hebrew'?'Hebrew':'Custom');
    }
    // Always navigate to editor (even if called from Screen 1)
    document.getElementById('s1').classList.add('hidden');
    document.getElementById('s2').classList.add('hidden');
    openEditor();
    // Apply session UI labels
    if(data.lang){
      document.getElementById('sess-lbl').textContent=LANG+' Session';
      document.getElementById('ch-o-lbl').textContent=IS_SINGLE?LANG:LANG+' Text';
      document.getElementById('ch-t').style.display=IS_SINGLE?'none':'';
      if(data.versionLabel !== undefined){
        sessionVersionLabel=data.versionLabel;
        const vsub=document.getElementById('version-sub');
        if(vsub)vsub.textContent=sessionVersionLabel||t('version.ph')||'Version (e.g., ESV, BHS, NA28)';
        const vsubI=document.getElementById('version-sub-input');
        if(vsubI)vsubI.value=sessionVersionLabel||'';
      }
    }
    loadData(data);
    CURRENT_PROJECT_ID=id;
    CURRENT_FILENAME=null;
    const entry=projIndex().find(e=>e.id===id);
    // Use 'd' not 't' — see the identical fix + explanation in projSave.
    // This one isn't just a silent fallback: the EARLIER t('version.ph')
    // call above (inside the versionLabel block) sits in the temporal
    // dead zone of this const, and throws instead of falling back —
    // which is what was actually landing every load in the catch below.
    const d=new Date(entry?.savedAt||Date.now());
    const ts=d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    document.getElementById('stbar').textContent=(typeof t==='function'?t('toast.loaded'):'Loaded · ')+ts;
    if(typeof window.spClose==='function')window.spClose();
    toast((typeof t==='function'?t('toast.opened'):'Opened: ')+(entry?.name||'project'));
  }catch(_){ toast(typeof t==='function'?t('toast.proj-error'):'Could not open project'); }
}

function projTogglePin(id,e){
  e?.stopPropagation?.();
  const idx=projIndex(), entry=idx.find(item=>item.id===id);
  if(!entry||projIsTrashed(entry)) return;
  entry.pinned=!entry.pinned;
  projStoreIndex(idx); renderProjPanel(); renderS1Recent();
}

async function projDuplicate(id,e){
  e?.stopPropagation?.();
  const entry=projIndex().find(item=>item.id===id);
  if(!entry||projIsTrashed(entry)) return;
  let raw=null;
  try{raw=await pIdbGet(id);}catch(_e){}
  if(!raw) raw=localStorage.getItem(PROJ_DATA_KEY(id));
  if(!raw){toast(typeof t==='function'?t('toast.proj-error'):'Could not open project');return;}
  const copyId=projNewId();
  try{await pIdbSet(copyId,raw);}catch(_e){toast(typeof t==='function'?t('toast.storage-full'):'Storage full — please export and clear some projects');return;}
  const idx=projIndex();
  idx.unshift({...entry,id:copyId,name:(typeof t==='function'?t('proj.copy.prefix'):'Copy of ') +(entry.name||'Untitled'),savedAt:Date.now(),pinned:false,trashedAt:undefined,renamed:true});
  projStoreIndex(idx); renderProjPanel(); renderS1Recent();
  toast(typeof t==='function'?t('proj.copy.done'):'Project copied');
}

async function projMoveToTrash(id,e){
  e?.stopPropagation?.();
  const idx=projIndex(), entry=idx.find(item=>item.id===id);
  if(!entry||projIsTrashed(entry)) return;
  if(!confirm(typeof t==='function'?t('confirm.trash-proj'):'Move this project to Trash? You can restore it for 30 days.')) return;
  entry.trashedAt=Date.now();
  entry.trashedFolderId=entry.folderId||null;
  entry.pinned=false;
  projStoreIndex(idx);
  if(CURRENT_PROJECT_ID===id){CURRENT_PROJECT_ID=null;if(typeof syncWorkspaceChrome==='function')syncWorkspaceChrome('draft');}
  renderProjPanel(); renderS1Recent();
  toast(typeof t==='function'?t('proj.trash.moved'):'Moved to Trash');
}

async function projRestore(id,e){
  e?.stopPropagation?.();
  const idx=projIndex(), entry=idx.find(item=>item.id===id);
  if(!entry||!projIsTrashed(entry)) return;
  const folderExists=projFolders().some(folder=>folder.id===entry.trashedFolderId);
  entry.folderId=folderExists?entry.trashedFolderId:null;
  delete entry.trashedAt; delete entry.trashedFolderId;
  projStoreIndex(idx); renderProjPanel(); renderS1Recent();
  toast(typeof t==='function'?t('proj.trash.restored'):'Project restored');
}

async function projPermanentRemove(id){
  try{ await pIdbDelete(id); }catch(_e){}
  localStorage.removeItem(PROJ_DATA_KEY(id)); // also clear any un-migrated legacy copy
  const idx=projIndex().filter(e=>e.id!==id);
  projStoreIndex(idx);
  if(CURRENT_PROJECT_ID===id) CURRENT_PROJECT_ID=null;
  renderProjPanel();
  renderS1Recent();
  // Cloud deletion is intentionally deferred until the item leaves Trash.
  if(typeof acctQueueDelete==='function') acctQueueDelete(id);
}
async function projDeletePermanently(id,e){
  e?.stopPropagation?.();
  if(!confirm(typeof t==='function'?t('confirm.delete-proj'):'Delete this project permanently?\n\nThis cannot be undone.')) return;
  await projPermanentRemove(id);
  toast(typeof t==='function'?t('proj.trash.deleted'):'Project deleted permanently');
}
async function projPurgeTrash(){
  const expired=projIndex().filter(entry=>projIsTrashed(entry)&&Date.now()-entry.trashedAt>=PROJ_TRASH_RETENTION_MS);
  for(const entry of expired) await projPermanentRemove(entry.id);
  return expired.length;
}
async function projEmptyTrash(){
  const entries=projIndex().filter(projIsTrashed);
  if(!entries.length) return;
  if(!confirm(typeof t==='function'?t('confirm.empty-trash'):'Delete every project in Trash permanently? This cannot be undone.')) return;
  for(const entry of entries) await projPermanentRemove(entry.id);
  toast(typeof t==='function'?t('proj.trash.emptied'):'Trash emptied');
}
// Compatibility entry point for older controls and shortcuts.
function projDelete(id,e){ return projMoveToTrash(id,e); }
async function projRename(id,ev){
  if(ev) ev.stopPropagation();
  const idx=projIndex();
  const entry=idx.find(e=>e.id===id);
  if(!entry) return;
  const newName=await cModalPrompt('proj.rename.title','proj.rename.hint',entry.name||'');
  if(!newName||!newName.trim()) return;
  entry.name=newName.trim();
  entry.renamed=true; // stops projSave()/autoSave() from overwriting this with #refin's value
  localStorage.setItem(PROJ_INDEX_KEY,JSON.stringify(idx));
  renderProjPanel();
  renderS1Recent();
  // Name is the one project-organization field that DOES stay cloud-synced
  // (acctCloudPayload already prefers entry.name) — folderId, by contrast,
  // is deliberately local-only, see PROJ_FOLDERS_KEY's comment above.
  if(typeof acctMarkDirty==='function') acctMarkDirty(id);
}

// A backup may contain projects created by an older compatible release, so
// validation is intentionally structural rather than tied to every optional
// field. It still rejects arbitrary JSON before anything reaches IndexedDB.
function projValidPayload(data){
  return !!data&&typeof data==='object'&&!Array.isArray(data)&&typeof data.lang==='string'&&
    (!Object.prototype.hasOwnProperty.call(data,'rows')||Array.isArray(data.rows))&&
    (!Object.prototype.hasOwnProperty.call(data,'cmts')||Array.isArray(data.cmts));
}
function collectionValidPayload(data){return !!data&&typeof data==='object'&&!Array.isArray(data)&&typeof data.id==='string'&&typeof data.name==='string'&&Array.isArray(data.members)&&data.notebook&&Array.isArray(data.notebook.entries);}

async function projCreateBackup(){
  const entries=projIndex();
  const collections=collectionIndex();
  if(!entries.length&&!collections.length){toast(typeof t==='function'?t('toast.no-projects-export'):'No projects saved.');return;}
  try{
    await _loadJSZip();
    const zip=new JSZip();
    const manifest={kind:PROJ_BACKUP_KIND,version:PROJ_BACKUP_VERSION,createdAt:Date.now(),folders:projFolders(),projects:[],collections:[]};
    for(const entry of entries){
      let raw=null;
      try{raw=await pIdbGet(entry.id);}catch(_e){}
      if(!raw) raw=localStorage.getItem(PROJ_DATA_KEY(entry.id));
      if(!raw) throw new Error('missing-project');
      let data=null; try{data=JSON.parse(raw);}catch(_e){}
      if(!projValidPayload(data)) throw new Error('invalid-project');
      const path='projects/'+entry.id+'.json';
      zip.file(path,raw);
      manifest.projects.push({entry,path});
    }
    for(const entry of collections){
      const raw=await cIdbGet(entry.id);if(!raw)throw new Error('missing-collection');
      const data=JSON.parse(raw);if(!collectionValidPayload(data))throw new Error('invalid-collection');
      const path='collections/'+entry.id+'.json';zip.file(path,raw);manifest.collections.push({entry,path});
    }
    if(!manifest.projects.length&&!manifest.collections.length) throw new Error('empty-backup');
    zip.file('manifest.json',JSON.stringify(manifest,null,2));
    const blob=await zip.generateAsync({type:'blob'});
    _downloadBlob(blob,'ExegProjectBackup_'+_dateStamp()+'.zip');
    toast(typeof t==='function'?t('proj.backup.created'):'Backup created');
  }catch(_e){toast(typeof t==='function'?t('proj.backup.error'):'Could not create backup');}
}

async function projRestoreBackupInput(ev){
  const file=ev?.target?.files?.[0]; if(!file) return;
  try{await projRestoreBackupFile(file);}finally{ev.target.value='';}
}

async function projRestoreBackupFile(file){
  try{
    await _loadJSZip();
    const zip=await JSZip.loadAsync(file);
    const manifestFile=zip.file('manifest.json');
    if(!manifestFile) throw new Error('missing-manifest');
    const manifest=JSON.parse(await manifestFile.async('string'));
    if(!manifest||manifest.kind!==PROJ_BACKUP_KIND||![1,2].includes(manifest.version)||!Array.isArray(manifest.projects)||!Array.isArray(manifest.folders)) throw new Error('unsupported-backup');
    const staged=[];
    const seenIds=new Set();
    for(const item of manifest.projects){
      const entry=item?.entry, path=item?.path;
      if(!entry||typeof entry.id!=='string'||!path||seenIds.has(entry.id)) throw new Error('invalid-project');
      seenIds.add(entry.id);
      const source=zip.file(path); if(!source) throw new Error('missing-project');
      const raw=await source.async('string');
      const data=JSON.parse(raw);
      if(!projValidPayload(data)) throw new Error('invalid-project');
      staged.push({entry,raw});
    }
    const stagedCollections=[];const collectionIds=new Set();
    for(const item of (manifest.collections||[])){
      const entry=item?.entry,path=item?.path;if(!entry||typeof entry.id!=='string'||!path||collectionIds.has(entry.id))throw new Error('invalid-collection');
      collectionIds.add(entry.id);const source=zip.file(path);if(!source)throw new Error('missing-collection');const raw=await source.async('string');const data=JSON.parse(raw);if(!collectionValidPayload(data))throw new Error('invalid-collection');stagedCollections.push({entry,raw,data});
    }
    if(!staged.length&&!stagedCollections.length) throw new Error('empty-backup');

    const folders=projFolders().slice(), folderIds=new Set(folders.map(folder=>folder.id)), folderMap=new Map(), seenFolderIds=new Set();
    for(const sourceFolder of manifest.folders){
      if(!sourceFolder||typeof sourceFolder.id!=='string'||typeof sourceFolder.name!=='string') throw new Error('invalid-folder');
      if(seenFolderIds.has(sourceFolder.id)) throw new Error('invalid-folder');
      seenFolderIds.add(sourceFolder.id);
      const nextId=folderIds.has(sourceFolder.id)?projNewId('fold'):sourceFolder.id;
      folderIds.add(nextId); folderMap.set(sourceFolder.id,nextId);
      folders.push({id:nextId,name:sourceFolder.name.trim()||'Restored folder',order:folders.length+1});
    }
    const existingIds=new Set(projIndex().map(entry=>entry.id)), projectMap=new Map();
    const now=Date.now(), imported=[];
    for(const source of staged){
      const conflict=existingIds.has(source.entry.id);
      const id=conflict?projNewId():source.entry.id;
      projectMap.set(source.entry.id,id);
      existingIds.add(id);
      const folderId=source.entry.folderId?folderMap.get(source.entry.folderId)||null:null;
      const trashedFolderId=source.entry.trashedFolderId?folderMap.get(source.entry.trashedFolderId)||null:null;
      imported.push({id,raw:source.raw,entry:{...source.entry,id,name:(conflict?(typeof t==='function'?t('proj.restored.prefix'):'Restored ') :'')+(source.entry.name||'Untitled'),folderId,trashedFolderId,pinned:!!source.entry.pinned,trashedAt:Number.isFinite(source.entry.trashedAt)?source.entry.trashedAt:undefined,cloudAt:undefined,renamed:true,restoredAt:now}});
    }
    const importedCollections=[],existingCollectionIds=new Set(collectionIndex().map(entry=>entry.id));
    for(const source of stagedCollections){
      const conflict=existingCollectionIds.has(source.entry.id),id=conflict?collectionNewId():source.entry.id;existingCollectionIds.add(id);
      const data=collectionNormalise({...source.data,id,name:(conflict?(typeof t==='function'?t('proj.restored.prefix'):'Restored '):'')+source.data.name,cloudAt:undefined});
      data.members=data.members.map(member=>({...member,projectId:projectMap.get(member.projectId)||member.projectId}));
      importedCollections.push(data);
    }
    const written=[];
    try{for(const item of imported){await pIdbSet(item.id,item.raw);written.push(item.id);}}
    catch(err){for(const id of written){try{await pIdbDelete(id);}catch(_e){}}throw err;}
    const collectionWritten=[];
    try{for(const item of importedCollections){await cIdbSet(item.id,JSON.stringify(item));collectionWritten.push(item.id);}}
    catch(err){for(const id of written){try{await pIdbDelete(id);}catch(_e){}}for(const id of collectionWritten){try{await cIdbDelete(id);}catch(_e){}}throw err;}
    const idx=projIndex(); idx.unshift(...imported.map(item=>item.entry));
    const cidx=collectionIndex();cidx.unshift(...importedCollections.map(collectionSummary));collectionStoreIndex(cidx);
    projSaveFolders(folders); projStoreIndex(idx); renderProjPanel(); renderS1Recent();
    toast((typeof t==='function'?t('proj.backup.restored'):'Restored ')+(imported.length+importedCollections.length)+' '+(typeof t==='function'?t('proj.backup.projects'):'item(s)'));
  }catch(_e){toast(typeof t==='function'?t('proj.backup.invalid'):'That backup could not be restored. No projects were changed.');}
}

/* ════════════════════════════════════════
   EXPORT ALL PROJECTS
   Bundles all saved projects as a ZIP of
   either PDF or JSON files using JSZip.
════════════════════════════════════════ */
/* ── Export All popup toggle ── */
function toggleExportAllPopup(e){
  e.stopPropagation();
  const idx=projActiveEntries();
  if(!idx.length){
    toast(typeof t==='function'?t('toast.no-projects-export'):'No projects saved.');
    return;
  }
  const pop=document.getElementById('export-all-popup');
  if(!pop) return;
  const isOpen=pop.classList.contains('show');
  closeExportPopup(); // close the other export popup if open
  if(!isOpen){
    pop.classList.add('show');
    // Close when user clicks anywhere else
    setTimeout(()=>document.addEventListener('click',closeExportAllPopup,{once:true}),10);
  } else {
    pop.classList.remove('show');
  }
}
function closeExportAllPopup(){
  document.getElementById('export-all-popup')?.classList.remove('show');
}
function projExportAll(){
  // Legacy entry point — just open the popup if called directly
  const idx=projActiveEntries();
  if(!idx.length){toast(typeof t==='function'?t('toast.no-projects-export'):'No projects saved.');return;}
  document.getElementById('export-all-popup')?.classList.add('show');
}
function projExportAllPDF(){
  const idx=projActiveEntries();
  if(!idx.length){toast(typeof t==='function'?t('toast.no-projects-export'):'No projects saved.');return;}
  _exportAllPDF(idx);
}
function projExportAllJSON(){
  const idx=projActiveEntries();
  if(!idx.length){toast(typeof t==='function'?t('toast.no-projects-export'):'No projects saved.');return;}
  _exportAllJSON(idx);
}

function projExportAllDiagPDF(){
  const idx=projActiveEntries();
  if(!idx.length){toast(typeof t==='function'?t('toast.no-projects-export'):'No projects saved.');return;}
  _exportAllDiagPDF(idx);
}

async function _exportAllDiagPDF(idx){
  if(typeof JSZip==='undefined'){
    toast(typeof t==='function'?t('toast.loading'):'Loading…');
    await _loadJSZip();
  }
  const {jsPDF}=window.jspdf;
  if(!jsPDF){toast('PDF library not loaded.');return;}
  const zip=new JSZip();
  const total=idx.length;
  let count=0;

  // Save current session
  const savedData=collectData();
  const savedProjId=CURRENT_PROJECT_ID;
  const savedView=EDITOR_VIEW;

  for(let i=0;i<idx.length;i++){
    const entry=idx[i];
    showProgress(Math.round((i/total)*88),'Diagram PDF '+(i+1)+' of '+total+': '+(entry.name||'Untitled'));
    try{
      const raw=await pIdbGet(entry.id);
      if(!raw) continue;
      const data=JSON.parse(raw);

      // Load project, switch to diagram view — exactly as a user would
      SESS=data.lang||SESS; LANG=data.langLabel||LANG;
      IS_RTL=data.isRTL||false; IS_SINGLE=data.isSingle||false;
      loadData(data);
      recomputeIds();
      setEditorView('diagram');

      // Wait for renderDiagram + loadBracketData rAF + bracket SVG render
      await new Promise(r=>setTimeout(r,150));
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));

      const ref=(data.verseRef||entry.name||'Untitled').trim();
      const langSrc=data.langLabel||'';
      const doc=await _runDiagramPDFExport(ref, langSrc, 'a4', 'landscape');
      if(doc){
        const fname=buildDiagramFilename(ref);
        const pdfArrayBuffer=doc.output('arraybuffer');
        zip.file(fname+'.pdf', pdfArrayBuffer);
        count++;
      }
    }catch(e){console.warn('Diagram PDF export failed for',entry.name,e);}
  }

  // Restore original session
  SESS=savedData.lang||SESS; LANG=savedData.langLabel||LANG;
  IS_RTL=savedData.isRTL||false; IS_SINGLE=savedData.isSingle||false;
  CURRENT_PROJECT_ID=savedProjId;
  loadData(savedData);
  recomputeIds();
  if(EDITOR_VIEW!==savedView) setEditorView(savedView);

  if(!count){hideProgress();toast(typeof t==='function'?t('toast.no-projects-export'):'No projects saved.');return;}
  showProgress(96,'Zipping…');
  const blob=await zip.generateAsync({type:'blob'});
  hideProgress();
  _downloadBlob(blob,'ExegDiagrams_'+_dateStamp()+'.zip');
  toast((typeof t==='function'?t('toast.export-all-done'):'Exported ')+count+' project'+(count!==1?'s':'')+' as Diagram PDF.');
}



async function _exportAllJSON(idx){
  // Load JSZip on demand
  if(typeof JSZip==='undefined'){
    toast(typeof t==='function'?t('toast.loading'):'Loading…');
    await _loadJSZip();
  }
  const zip=new JSZip();
  let count=0;
  for(const entry of idx){
    try{
      const raw=await pIdbGet(entry.id);
      if(!raw) continue;
      // Sanitise filename
      const fname=_safeName(entry.name||'Untitled')+'.json';
      zip.file(fname, raw);
      count++;
    }catch(_){}
  }
  if(!count){ toast(typeof t==='function'?t('toast.no-projects-export'):'No projects saved.'); return; }
  showProgress(80,'Building ZIP…');
  const blob=await zip.generateAsync({type:'blob'});
  hideProgress();
  _downloadBlob(blob,'ExegProjects_'+_dateStamp()+'.zip');
  toast((typeof t==='function'?t('toast.export-all-done'):'Exported ')+count+' project'+(count!==1?'s':'')+' as JSON.');
}

async function _exportAllPDF(idx){
  // Uses the live exportPDF() engine for faithful output — loads each project
  // temporarily, captures the PDF blob, then restores the original session.
  if(typeof JSZip==='undefined'){
    toast(typeof t==='function'?t('toast.loading'):'Loading…');
    await _loadJSZip();
  }
  const {jsPDF}=window.jspdf;
  if(!jsPDF){toast('PDF library not loaded.');return;}
  const zip=new JSZip();
  const total=idx.length;
  let count=0;

  // Save current session
  const savedData=collectData();
  const savedProjId=CURRENT_PROJECT_ID;
  const savedView=EDITOR_VIEW;

  for(let i=0;i<idx.length;i++){
    const entry=idx[i];
    showProgress(Math.round((i/total)*88),'PDF '+(i+1)+' of '+total+': '+(entry.name||'Untitled'));
    try{
      const raw=await pIdbGet(entry.id);
      if(!raw) continue;
      const data=JSON.parse(raw);
      // Load project into live session (phrasing view required for exportPDF)
      if(EDITOR_VIEW!=='phrasing') setEditorView('phrasing');
      SESS=data.lang||SESS; LANG=data.langLabel||LANG;
      IS_RTL=data.isRTL||false; IS_SINGLE=data.isSingle||false;
      loadData(data);
      recomputeIds();
      // Wait one frame for layout
      await new Promise(r=>requestAnimationFrame(r));
      const pdfBlob=await _capturePhrasingPDFBlob(data.verseRef||entry.name||'Untitled');
      if(pdfBlob){
        const fname=buildFilename(data.verseRef||entry.name||'Untitled');
        zip.file(fname+'.pdf',pdfBlob);
        count++;
      }
    }catch(e){console.warn('PDF export failed for',entry.name,e);}
  }

  // Restore original session
  if(EDITOR_VIEW!==savedView) setEditorView(savedView);
  SESS=savedData.lang||SESS; LANG=savedData.langLabel||LANG;
  IS_RTL=savedData.isRTL||false; IS_SINGLE=savedData.isSingle||false;
  CURRENT_PROJECT_ID=savedProjId;
  loadData(savedData);
  recomputeIds();

  if(!count){hideProgress();toast(typeof t==='function'?t('toast.no-projects-export'):'No projects saved.');return;}
  showProgress(94,'Zipping…');
  const blob=await zip.generateAsync({type:'blob'});
  hideProgress();
  _downloadBlob(blob,'ExegProjects_'+_dateStamp()+'.zip');
  toast((typeof t==='function'?t('toast.export-all-done'):'Exported ')+count+' project'+(count!==1?'s':'')+' as PDF.');
}

// Capture the current session as a phrasing PDF blob (no file-save dialog).
// Returns a Blob or null on failure.
async function _capturePhrasingPDFBlobLegacy(ref){
  const {jsPDF}=window.jspdf;
  if(!jsPDF) return null;
  ref=ref||document.getElementById('refin')?.value.trim()||'Untitled';
  const orientation=IS_SINGLE?'portrait':'landscape';
  const doc=new jsPDF({orientation,unit:'pt',format:'a4'});
  const pW=doc.internal.pageSize.getWidth();
  const pH=doc.internal.pageSize.getHeight();
  const MAR=28, usableW=pW-MAR*2;
  const PT_PX=72/96;
  const vWpt=26, lWpt=32;
  const SIG=[73,53,72], ACC=[200,168,75];
  const LANG_=LANG||'';
  const HDR_H=18, ROW_PAD=4, MIN_H=22;

  // Footnote text is pulled from user comments, which routinely quote the
  // Hebrew/Greek source text — needs a Unicode-capable font (see
  // _embedPdfUnicodeFont), not jsPDF's Latin-only built-ins.
  const FN_FONT=await _embedPdfUnicodeFont(doc);

  function drawPageHeader(y){
    doc.setFont('helvetica','bold');doc.setFontSize(15);
    doc.setTextColor(31,30,30);doc.text(ref,MAR,y);
    doc.setFont('helvetica','normal');doc.setFontSize(8);
    doc.setTextColor(168,159,144);
    doc.text(LANG_+' \u00B7 Exegetical Phrasing',MAR,y+12);
    return y+24;
  }
  function drawColHeaders(y){
    doc.setFillColor(...SIG);doc.rect(MAR,y,usableW,HDR_H,'F');
    doc.setFont('helvetica','bold');doc.setFontSize(7);doc.setTextColor(247,243,233);
    const tableBodyW=usableW-vWpt-lWpt;
    const origHdrW=IS_SINGLE?tableBodyW:Math.round(tableBodyW*0.6);
    const transHdrW=IS_SINGLE?0:tableBodyW-origHdrW;
    const labels=IS_SINGLE?['VERSE','LINE',LANG_.toUpperCase()+' TEXT']:['VERSE','LINE',LANG_.toUpperCase()+' TEXT','TRANSLATION'];
    const hdrW=IS_SINGLE?[vWpt,lWpt,origHdrW]:[vWpt,lWpt,origHdrW,transHdrW];
    let cx=MAR;hdrW.forEach((w,i)=>{doc.text(labels[i]||'',cx+3,y+HDR_H/2+2.5);cx+=w;});
    return y+HDR_H;
  }

  const PDF_SCALE=2;
  async function cellToImg(el){
    if(!el||!el.innerText.trim()) return null;
    const naturalPx=el.offsetWidth||400;
    try{
      const canvas=await html2canvas(el,{scale:PDF_SCALE,useCORS:true,allowTaint:true,backgroundColor:'#ffffff',logging:false,width:naturalPx,windowWidth:window.innerWidth});
      const naturalWidthPt=(canvas.width/PDF_SCALE)*PT_PX;
      return{canvas,scale:PDF_SCALE,naturalWidthPt};
    }catch(e){return null;}
  }

  const FN_LINE_H=13,FN_GAP=5,FN_SEP_H=10;
  const rowEls=_realRows();
  const totalRows=rowEls.length;

  function stripHtml(html){
    return html.replace(/<br\s*\/?>/gi,' ').replace(/<\/p>/gi,' ').replace(/<\/div>/gi,' ')
      .replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&')
      .replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
  }
  function fnH(fn){const cpl=Math.floor(usableW/5.5);const lines=Math.ceil((fn.text.length||1)/cpl);return lines*FN_LINE_H+FN_GAP;}
  function fnZoneH(fns){if(!fns.length)return 0;return FN_SEP_H+fns.reduce((s,fn)=>s+fnH(fn),0);}
  function drawFns(fns){
    if(!fns.length)return;
    const zone=fnZoneH(fns);
    let y=pH-MAR-zone;
    doc.setDrawColor(...SIG);doc.setLineWidth(0.4);doc.line(MAR,y,MAR+usableW*0.3,y);y+=6;
    fns.forEach(fn=>{
      const labelW=fn.lineId.length*4.5+4;
      doc.setFontSize(9);doc.setFont('helvetica','bold');doc.setTextColor(73,53,72);doc.text(fn.lineId,MAR,y+FN_LINE_H-3);
      doc.setFontSize(10);doc.setFont(FN_FONT,'normal');doc.setTextColor(31,30,30);
      const cpl=Math.floor((usableW-labelW)/5.5);const words=fn.text.split(' ');const lines=[];let line='';
      words.forEach(w=>{const test=line?line+' '+w:w;if(test.length>cpl&&line){lines.push(line);line=w;}else line=test;});
      if(line)lines.push(line);
      // isInputVisual:false — this text is stored in normal reading
      // (logical) order, same as it displays on-screen; jsPDF's default
      // (isInputVisual:true) assumes the opposite, which corrupts any line
      // containing Hebrew by reversing the ENTIRE line — including the
      // English portions — rather than just reordering the Hebrew run.
      lines.forEach((l,i)=>{doc.text(l,MAR+labelW,y+FN_LINE_H+i*FN_LINE_H-3,{isInputVisual:false});});
      y+=Math.max(1,lines.length)*FN_LINE_H+FN_GAP;
    });
  }

  let curY=drawPageHeader(MAR+12);
  curY=drawColHeaders(curY);
  let rowIdx=0,pageFns=[];

  for(const row of rowEls){
    const rid=row.dataset.rid;
    const vi=row.querySelector('.vin');
    const lid=row.querySelector('.lid');
    const oc=row.querySelector('#oc-'+rid+' .cedit');
    const tc=row.querySelector('#tc-'+rid+' .cedit');
    const cid=row.dataset.cid;
    const cmtEl=cid?document.querySelector('.ccard[data-cid="'+cid+'"] .cedit-c'):null;
    const verse=vi?vi.value:'';
    const lineid=(lid&&lid.textContent!=='—')?lid.textContent:'';
    let thisFn=null;
    if(cmtEl&&cmtEl.innerText.trim()){const txt=stripHtml(cmtEl.innerHTML);if(txt)thisFn={lineId:lineid||verse,text:txt};}
    const richEls=IS_SINGLE?[oc]:[oc,tc];
    const tableBodyW=usableW-vWpt-lWpt;
    const MIN_TRANS=60;
    const canvases=await Promise.all(richEls.map(el=>el?cellToImg(el):Promise.resolve(null)));
    const displayWidths=[];
    canvases.forEach((obj,i)=>{
      if(IS_SINGLE){displayWidths.push(tableBodyW);return;}
      if(i===0){const natPt=obj?obj.naturalWidthPt:tableBodyW-MIN_TRANS;displayWidths.push(Math.min(Math.max(natPt,60),tableBodyW-MIN_TRANS));}
      else{displayWidths.push(Math.max(MIN_TRANS,tableBodyW-displayWidths[0]));}
    });
    let rowH=MIN_H;
    canvases.forEach((obj,i)=>{
      if(!obj)return;
      const{canvas,scale:ps}=obj;
      const natPt=(canvas.width/ps)*PT_PX;
      const scaleFactor=displayWidths[i]/natPt;
      const h=(canvas.height/ps)*PT_PX*scaleFactor+ROW_PAD*2;
      if(h>rowH)rowH=h;
    });
    const futureFns=thisFn?[...pageFns,thisFn]:pageFns;
    const reserved=fnZoneH(futureFns);
    const safeBottom=pH-MAR-reserved;
    if(curY+rowH>safeBottom){
      drawFns(pageFns);doc.addPage();
      curY=drawPageHeader(MAR+12);curY=drawColHeaders(curY);pageFns=[];
    }
    if(thisFn)pageFns.push(thisFn);
    doc.setFillColor(255,255,255);doc.rect(MAR,curY,usableW,rowH,'F');
    const prevVerse=rowIdx>0?rowEls[rowIdx-1].querySelector('.vin')?.value:null;
    if(verse&&verse!==prevVerse){doc.setFont('helvetica','bold');doc.setFontSize(10);doc.setTextColor(...SIG);doc.text(verse,MAR+vWpt/2,curY+rowH/2+3,{align:'center'});}
    doc.setFont('helvetica','normal');doc.setFontSize(10);doc.setTextColor(...ACC);
    if(lineid)doc.text(lineid,MAR+vWpt+lWpt/2,curY+rowH/2+3,{align:'center'});
    let cx=MAR+vWpt+lWpt;
    canvases.forEach((obj,i)=>{
      if(obj){const{canvas,scale:ps}=obj;const imgW2=displayWidths[i];const natPt=(canvas.width/ps)*PT_PX;const scaleFactor=imgW2/natPt;const imgH2=(canvas.height/ps)*PT_PX*scaleFactor;doc.addImage(canvas.toDataURL('image/jpeg',0.92),'JPEG',cx+3,curY+ROW_PAD,imgW2-3,imgH2);}
      cx+=displayWidths[i];
    });
    curY+=rowH;rowIdx++;
  }
  drawFns(pageFns);
  return doc.output('blob');
}


async function _renderProjectPDF(data, name){
  const {jsPDF}=window.jspdf;
  if(!jsPDF) return null;
  const isSingle=data.isSingle||false;
  const isRTL=data.isRTL||false;
  const langLabel=data.langLabel||'';
  const ref=data.verseRef||name;

  // Build off-screen render host
  const host=document.createElement('div');
  host.style.cssText='position:fixed;left:-9999px;top:0;width:860px;'
    +'background:#F7F3E9;font-family:sans-serif;padding:12px 0;';
  document.body.appendChild(host);

  // Compute line IDs the same way recomputeIds() does
  const _counts={};let _lastVerse='';
  const _lineIds=(data.rows||[]).map(rd=>{
    const v=(rd.verse||'').trim();
    const effective=v||_lastVerse;
    if(v)_lastVerse=v;
    if(!effective)return'—';
    if(!_counts[effective])_counts[effective]=0;
    const letter=String.fromCharCode(97+_counts[effective]++);
    return effective+letter;
  });

  (data.rows||[]).forEach((rd,i)=>{
    const row=document.createElement('div');
    row.style.cssText='display:flex;gap:8px;padding:5px 8px;border-bottom:1px solid rgba(0,0,0,.06);align-items:flex-start;';
    // Verse column
    const vEl=document.createElement('div');
    vEl.style.cssText='width:38px;flex-shrink:0;font-size:11px;font-weight:700;color:#493548;padding-top:2px;';
    vEl.textContent=rd.verse||'';
    // Line ID column
    const lid=_lineIds[i];
    const lEl=document.createElement('div');
    lEl.style.cssText='width:36px;flex-shrink:0;font-size:10px;font-weight:600;color:#C8A84B;padding-top:3px;';
    lEl.textContent=(lid&&lid!=='—')?lid:'';
    // Orig column
    const oEl=document.createElement('div');
    oEl.style.cssText='flex:1;font-size:13px;line-height:1.7;'+(isRTL?'direction:rtl;text-align:right;':'');
    oEl.innerHTML=_stripBgFromHTML(rd.origHTML)||'';
    row.appendChild(vEl);
    row.appendChild(lEl);
    row.appendChild(oEl);
    if(!isSingle&&rd.transHTML){
      const tEl=document.createElement('div');
      tEl.style.cssText='flex:1;font-size:13px;line-height:1.7;';
      tEl.innerHTML=_stripBgFromHTML(rd.transHTML)||'';
      row.appendChild(tEl);
    }
    host.appendChild(row);
  });

  let pdfBlob=null;
  try{
    const canvas=await html2canvas(host,{
      scale:2,useCORS:true,backgroundColor:'#F7F3E9',logging:false
    });
    document.body.removeChild(host);

    const orientation=isSingle?'portrait':'landscape';
    const doc=new jsPDF({orientation,unit:'pt',format:'a4'});
    const pW=doc.internal.pageSize.getWidth();
    const pH=doc.internal.pageSize.getHeight();
    const MAR=28;
    const usableW=pW-MAR*2;

    // Header
    doc.setFont('helvetica','bold');doc.setFontSize(13);
    doc.setTextColor(31,30,30);doc.text(ref,MAR,MAR+10);
    doc.setFont('helvetica','normal');doc.setFontSize(8);
    doc.setTextColor(168,159,144);
    doc.text(langLabel+' \u00B7 Exegetical Phrasing',MAR,MAR+22);

    // Image — paginate if needed
    const imgW=usableW;
    const imgH=(canvas.height/canvas.width)*imgW;
    const usableH=pH-MAR*2-30;
    let srcY=0;
    let pageY=MAR+30;

    while(srcY<canvas.height){
      const slicePxH=Math.min(
        canvas.height-srcY,
        Math.round((usableH/imgH)*canvas.height)
      );
      const sliceCanvas=document.createElement('canvas');
      sliceCanvas.width=canvas.width;
      sliceCanvas.height=slicePxH;
      sliceCanvas.getContext('2d').drawImage(
        canvas,0,srcY,canvas.width,slicePxH,0,0,canvas.width,slicePxH
      );
      const sliceImgH=(slicePxH/canvas.width)*imgW;
      if(srcY>0){ doc.addPage(); pageY=MAR; }
      doc.addImage(sliceCanvas.toDataURL('image/png'),'PNG',MAR,pageY,imgW,sliceImgH);
      srcY+=slicePxH;
    }
    pdfBlob=doc.output('blob');
  }catch(e){
    if(document.body.contains(host)) document.body.removeChild(host);
    console.warn('PDF render error:',e);
  }
  return pdfBlob;
}

async function _loadJSZip(){
  return new Promise((res,rej)=>{
    if(typeof JSZip!=='undefined'){res();return;}
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    s.onload=res; s.onerror=rej;
    document.head.appendChild(s);
  });
}

// Comment/footnote text in PDF exports can contain Hebrew or Greek (users
// routinely quote the source text in a comment) — jsPDF's built-in fonts
// (helvetica/times/courier) only cover Latin (WinAnsi encoding), so those
// glyphs render as tofu/garbled boxes with no embedded Unicode font.
//
// Two separate fonts are used, picked by session language, rather than one
// font for everything:
//   - Greek/other sessions: "Gentium Plus" (--serif in app.css, the same
//     font already used on-screen — verified to render Greek correctly
//     through jsPDF's embedded-font pipeline).
//   - Hebrew sessions: "Noto Serif Hebrew". Gentium Plus's own Hebrew
//     glyphs are present in the font and render correctly in-browser, but
//     jsPDF 2.5.1's (and even 4.2.1's) TrueType cmap parser fails to find
//     them at all when the font is embedded via addFont — Hebrew
//     characters are SILENTLY DROPPED (jsPDF's text2FontObject: an
//     unresolved cmap lookup falls through to "append nothing" rather than
//     erroring), while the exact same font's Greek/Latin glyphs resolve
//     fine. Confirmed by rendering test PDFs through pdf.js: Gentium Plus
//     drops all Hebrew (plain letters, not just combining marks) under
//     both jsPDF versions; Noto Serif Hebrew's cmap resolves correctly for
//     the identical text. This is a jsPDF/font-specific bug, not a general
//     Hebrew-in-PDF limitation.
// Both are lazily fetched and base64-encoded so they can be embedded into
// a jsPDF doc via addFileToVFS/addFont, and cached after first use so
// repeat exports (e.g. "Export All") don't re-fetch them.
const _PDF_UNICODE_FONTS={
  greek:  {file:'GentiumPlus-Regular.ttf',    name:'GentiumPlus',   b64:null},
  hebrew: {file:'NotoSerifHebrew-Regular.ttf', name:'NotoSerifHeb', b64:null}
};
async function _loadPdfUnicodeFontB64(which){
  const entry=_PDF_UNICODE_FONTS[which];
  if(entry.b64) return entry.b64;
  const buf=await fetch('./fonts/'+entry.file).then(r=>r.arrayBuffer());
  const bytes=new Uint8Array(buf);
  let binary='';
  const chunkSize=8192; // avoid String.fromCharCode.apply stack limits on large files
  for(let i=0;i<bytes.length;i+=chunkSize){
    binary+=String.fromCharCode.apply(null, bytes.subarray(i,i+chunkSize));
  }
  entry.b64=btoa(binary);
  return entry.b64;
}
// Embeds the Unicode font appropriate for the CURRENT session's language
// into a jsPDF doc and returns the font name to use for any text that
// might contain Hebrew/Greek — falls back to 'helvetica' (Latin-only, so
// such text would still show garbled/missing glyphs) only if the font
// file can't be loaded (e.g. offline on first-ever visit, before the
// service worker has cached it).
async function _embedPdfUnicodeFont(doc){
  const which=SESS==='hebrew'?'hebrew':'greek';
  const entry=_PDF_UNICODE_FONTS[which];
  try{
    const b64=await _loadPdfUnicodeFontB64(which);
    doc.addFileToVFS(entry.file, b64);
    doc.addFont(entry.file, entry.name, 'normal');
    return entry.name;
  }catch(e){
    console.warn('Could not embed '+entry.name+' font for PDF export — Hebrew/Greek text (e.g. in comments/footnotes) may render as garbled or missing characters:',e);
    return 'helvetica';
  }
}

function _downloadBlob(blob, filename){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);document.body.removeChild(a);},1000);
}

function _safeName(str){
  return str.replace(/[\\/:*?"<>|]/g,'_').replace(/\s+/g,' ').trim().slice(0,80)||'Project';
}

function _dateStamp(){
  const d=new Date();
  return d.getFullYear()+('0'+(d.getMonth()+1)).slice(-2)+('0'+d.getDate()).slice(-2);
}

let PROJ_SEARCH_Q='';
let PROJ_SORT='date-desc';
let PROJ_VIEW='all';
const PROJ_TRASH_RETENTION_MS=30*24*60*60*1000;
const PROJ_BACKUP_KIND='exeg-project-library';
const PROJ_BACKUP_VERSION=2;

function projSetSearch(v){ PROJ_SEARCH_Q=v||''; renderProjPanel(); }
function projSetSort(v){ PROJ_SORT=v||'date-desc'; renderProjPanel(); }
function projSetView(view){
  PROJ_VIEW=['all','pinned','trash','collections'].includes(view)?view:'all';
  renderProjPanel();
}
function projIsTrashed(entry){ return Number.isFinite(entry?.trashedAt)&&entry.trashedAt>0; }
function projActiveEntries(){ return projIndex().filter(entry=>!projIsTrashed(entry)); }
function projNewId(prefix='proj'){ return prefix+'-'+Date.now()+'-'+Math.random().toString(36).slice(2,7); }
function projStoreIndex(idx){ localStorage.setItem(PROJ_INDEX_KEY,JSON.stringify(idx)); }

function _projFilterSort(idx){
  let out=idx;
  const q=PROJ_SEARCH_Q.trim().toLowerCase();
  if(q) out=out.filter(e=>(e.name||'').toLowerCase().includes(q)||(e.verseRef||'').toLowerCase().includes(q));
  return out.slice().sort((a,b)=>{
    if(PROJ_SORT==='name-asc')  return (a.name||'').localeCompare(b.name||'');
    if(PROJ_SORT==='name-desc') return (b.name||'').localeCompare(a.name||'');
    if(PROJ_SORT==='date-asc')  return (a.savedAt||0)-(b.savedAt||0);
    return (b.savedAt||0)-(a.savedAt||0); // date-desc, default — matches today's implicit unshift order
  });
}

function _projViewEntries(idx){
  if(PROJ_VIEW==='trash') return idx.filter(projIsTrashed);
  if(PROJ_VIEW==='pinned') return idx.filter(entry=>!projIsTrashed(entry)&&entry.pinned);
  return idx.filter(entry=>!projIsTrashed(entry));
}

function _projTrashDaysRemaining(entry){
  return Math.max(0,Math.ceil((PROJ_TRASH_RETENTION_MS-(Date.now()-entry.trashedAt))/(24*60*60*1000)));
}

function _projCardHTML(e){
  const d=new Date(e.savedAt);
  const when=d.toLocaleDateString([],{month:'short',day:'numeric'})+' · '+
              d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  const active=e.id===CURRENT_PROJECT_ID?' style="border-color:var(--sig);background:rgba(73,53,72,.04)"':'';
  const cloudBadge=typeof acctBadgeHTML==='function'?acctBadgeHTML(e):'';
  if(projIsTrashed(e)){
    const days=_projTrashDaysRemaining(e);
    return `<div class="proj-card is-trashed" data-proj-id="${e.id}">
  <div class="proj-card-name">${escH(e.name||'Untitled')}</div>
  <div class="proj-card-actions"><button class="proj-card-restore" onclick="projRestore('${e.id}',event)" title="Restore">↶</button><button class="proj-card-permanent" onclick="projDeletePermanently('${e.id}',event)" title="Delete permanently">×</button></div>
  <div class="proj-card-meta proj-trash-meta"><span>${escH(e.verseRef||'')}</span><span>·</span><span>${days} ${typeof t==='function'?t('proj.trash.days'):'days left'}</span></div>
</div>`;
  }
  const pin=e.pinned?'<span class="proj-pin-marker" title="Pinned">★</span>':'';
  return `<div class="proj-card${e.pinned?' is-pinned':''}" data-proj-id="${e.id}" role="button" tabindex="0" onclick="projLoad('${e.id}')" onkeydown="if(event.target===this&&(event.key==='Enter'||event.key===' ')){event.preventDefault();projLoad('${e.id}')}"${active}>
  <div class="proj-card-name">${escH(e.name||'Untitled')}${cloudBadge}</div>
  <div class="proj-card-actions"><button class="proj-card-pin" onclick="projTogglePin('${e.id}',event)" title="${e.pinned?'Unpin':'Pin'}">${e.pinned?'★':'☆'}</button><button class="proj-card-more" onclick="projOpenCardMenu('${e.id}',event)" title="Project options">⋯</button></div>
  <div class="proj-card-meta">
    <span class="proj-lang-badge">${escH(e.lang||'—')}</span>${pin}
    <span>${escH(e.verseRef||'')}</span>
    <span>·</span><span>${when}</span>
  </div>
</div>`;
}

// Collapse state is session-local only (not persisted) — keeps the feature
// simple; re-opening the panel next session shows everything expanded.
let PROJ_FOLDERS_COLLAPSED=new Set();
function projFolderToggle(folderId){
  if(PROJ_FOLDERS_COLLAPSED.has(folderId)) PROJ_FOLDERS_COLLAPSED.delete(folderId);
  else PROJ_FOLDERS_COLLAPSED.add(folderId);
  renderProjPanel();
}
async function projFolderCreate(){
  const name=await cModalPrompt('proj.folder.new-title','proj.folder.new-hint','');
  if(!name||!name.trim()) return;
  const folders=projFolders();
  const maxOrder=folders.reduce((m,f)=>Math.max(m,f.order||0),0);
  folders.push({id:'fold-'+Date.now(),name:name.trim(),order:maxOrder+1});
  projSaveFolders(folders);
  renderProjPanel();
}

function _projFolderSectionHTML(folder,cards,isUnfiled){
  const collapsed=PROJ_FOLDERS_COLLAPSED.has(folder.id)?' collapsed':'';
  const dotsBtn=isUnfiled?'':`<button class="proj-folder-dots" onclick="event.stopPropagation();projShowFolderMenu('${folder.id}',event)" title="Folder options">⋯</button>`;
  const body=cards.length
    ? cards.map(_projCardHTML).join('')
    : `<div class="proj-folder-empty">${typeof t==='function'?t('proj.folder.empty'):'No projects here yet — drag one in.'}</div>`;
  return `<div class="proj-folder-section${collapsed}" data-folder-id="${folder.id}">
  <div class="proj-folder-hdr" onclick="projFolderToggle('${folder.id}')">
    <svg class="proj-folder-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
    <span class="proj-folder-name">${escH(folder.name)}</span>
    <span class="proj-folder-count">${cards.length}</span>
    ${dotsBtn}
  </div>
  <div class="proj-folder-cards">${body}</div>
</div>`;
}

function _collectionCardHTML(entry){
  const when=new Date(entry.savedAt||Date.now()).toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'});
  const isTrash=collectionIsTrashed(entry);
  if(isTrash)return `<div class="proj-card proj-collection-card is-trashed"><div class="proj-card-name">${escH(entry.name)}</div><div class="proj-card-actions"><button onclick="collectionRestore('${entry.id}',event)" title="Restore">↶</button><button onclick="collectionDeletePermanently('${entry.id}',event)" title="Delete permanently">×</button></div><div class="proj-card-meta proj-trash-meta"><span>${typeof t==='function'?t('collection.trashed'):'In Trash'}</span></div></div>`;
  return `<div class="proj-card proj-collection-card" role="button" tabindex="0" onclick="collectionOpen('${entry.id}')" onkeydown="if(event.target===this&&(event.key==='Enter'||event.key===' ')){event.preventDefault();collectionOpen('${entry.id}')}"><div class="proj-card-name">${escH(entry.name)}</div><div class="proj-card-actions"><button onclick="event.stopPropagation();collectionAddCurrent('${entry.id}')" title="${_studyEscAttr(typeof t==='function'?t('collection.add.current'):'Add current project')}">＋</button><button onclick="event.stopPropagation();collectionRename('${entry.id}')" title="Rename">✎</button><button onclick="event.stopPropagation();collectionDuplicate('${entry.id}')" title="Duplicate">⧉</button><button onclick="event.stopPropagation();collectionMoveToTrash('${entry.id}')" title="Move to Trash">×</button></div><div class="proj-card-meta proj-collection-meta"><span>${entry.memberCount||0} ${typeof t==='function'?t('collection.members'):'projects'}</span><span>·</span><span>${when}</span></div></div>`;
}
function _renderCollections(list){
  const all=collectionIndex();const q=PROJ_SEARCH_Q.trim().toLowerCase();
  let active=all.filter(item=>!collectionIsTrashed(item));if(q)active=active.filter(item=>(item.name||'').toLowerCase().includes(q));
  active=_projFilterSort(active);
  const trash=all.filter(collectionIsTrashed);
  list.innerHTML=(active.map(_collectionCardHTML).join('')||`<div id="proj-list-empty">${typeof t==='function'?t('collection.empty'):'No Study Collections yet.'}</div>`)+(trash.length?`<div class="proj-folder-section"><div class="proj-folder-hdr"><span class="proj-folder-name">${typeof t==='function'?t('collection.trash'):'Collection Trash'}</span><span class="proj-folder-count">${trash.length}</span></div><div class="proj-folder-cards">${trash.map(_collectionCardHTML).join('')}</div></div>`:'');
}

function renderProjPanel(){
  const list=document.getElementById('proj-list');
  const idxAll=projIndex();
  const folders=projFolders().slice().sort((a,b)=>(a.order||0)-(b.order||0));
  const collectionEntries=collectionIndex();
  const counts={all:idxAll.filter(e=>!projIsTrashed(e)).length,pinned:idxAll.filter(e=>!projIsTrashed(e)&&e.pinned).length,trash:idxAll.filter(projIsTrashed).length,collections:collectionEntries.filter(e=>!collectionIsTrashed(e)).length};
  Object.entries(counts).forEach(([view,count])=>{
    const countEl=document.getElementById('proj-count-'+view); if(countEl) countEl.textContent=count;
    const tab=document.querySelector('.proj-library-tab[data-view="'+view+'"]');
    if(tab){const active=view===PROJ_VIEW;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active));}
  });
  if(typeof projUpdateStorageIndicator==='function') projUpdateStorageIndicator();
  const hint=document.getElementById('proj-folders-hint');
  if(hint) hint.hidden=folders.length===0||PROJ_VIEW!=='all';
  const trashActions=document.getElementById('proj-trash-actions'); if(trashActions) trashActions.hidden=PROJ_VIEW!=='trash'||!counts.trash;
  const folderButton=document.getElementById('proj-new-folder-btn'); if(folderButton) folderButton.disabled=PROJ_VIEW==='trash'||PROJ_VIEW==='collections';
  const collectionButton=document.getElementById('proj-new-collection-btn');if(collectionButton)collectionButton.hidden=PROJ_VIEW!=='collections';
  if(PROJ_VIEW==='collections'){_renderCollections(list);return;}
  const scoped=_projViewEntries(idxAll);
  const idx=_projFilterSort(scoped);
  if(!idx.length){
    const empty=PROJ_SEARCH_Q.trim()&&scoped.length?(typeof t==='function'?t('proj.search-empty'):'No projects match your search.'):(typeof t==='function'?t('proj.empty'):'No saved projects yet.<br>Press <b>Ctrl+S</b> to save your current work.');
    list.innerHTML='<div id="proj-list-empty">'+empty+'</div>';
    return;
  }
  if(PROJ_VIEW!=='all'||!folders.length){
    // No folders exist at all — skip the grouped layout entirely, render
    // exactly as before this feature (cheapest path, zero visual change
    // for anyone who never creates a folder).
    list.innerHTML=idx.map(_projCardHTML).join('');
    return;
  }
  let html='';
  folders.forEach(f=>{
    html+=_projFolderSectionHTML(f, idx.filter(e=>e.folderId===f.id), false);
  });
  // Unfiled — always rendered last, even if empty, so it stays a valid
  // drop target for removing a project from any folder.
  const unfiledCards=idx.filter(e=>e.folderId==null || !folders.some(f=>f.id===e.folderId));
  html+=_projFolderSectionHTML({id:'__unfiled__',name:(typeof t==='function'?t('proj.folder.unfiled'):'Unfiled')}, unfiledCards, true);
  list.innerHTML=html;
}

async function openProjects(){
  try{await projPurgeTrash();await collectionPurgeTrash();}catch(_e){}
  if(typeof window.spOpen==='function')window.spOpen('projects');else{const p=document.getElementById('proj-panel');if(p)p.classList.add('open');}
  projUpdateStorageIndicator();
}
function closeProjects(){if(typeof window.spClose==='function')window.spClose();}

/* ── Drag a project card into a folder ──
   Uses the same
   pointer-event skeleton (threshold-gated ghost drag + rect hit-test drop
   highlighting), not HTML5 native drag-and-drop, which this codebase
   doesn't use anywhere. Drop targets are .proj-folder-hdr rows, including
   the always-present "Unfiled" header (the explicit remove-from-folder
   target). #proj-list is rebuilt via innerHTML on every render, so this
   listener is delegated once on the stable parent rather than re-attached
   per card. */
function projStartCardDrag(ev, projId, cardEl){
  // Without this, the pointer crossing sibling card titles mid-drag
  // triggers the browser's native text-selection, same as every other
  // pointer-drag entry point in this codebase (startBlockDrag, column
  // resize, the bracket serif drag, the Bible pinned-divider resize) —
  // all call preventDefault() as the first thing in their drag-start fn.
  ev.preventDefault();
  const list=document.getElementById('proj-list'); if(!list) return;
  let dragStarted=false;
  const startX=ev.clientX, startY=ev.clientY;
  let ghost=null;

  const onMove=mv=>{
    if(!dragStarted && Math.abs(mv.clientX-startX)<4 && Math.abs(mv.clientY-startY)<4) return;
    if(!dragStarted){
      dragStarted=true;
      ghost=cardEl.cloneNode(true);
      ghost.style.cssText=`position:fixed;z-index:9999;width:${cardEl.offsetWidth}px;opacity:.75;pointer-events:none;box-shadow:0 8px 24px rgba(0,0,0,.25);border-radius:var(--r);`;
      document.body.appendChild(ghost);
      cardEl.style.opacity='0.3';
    }
    if(ghost){
      const r=cardEl.getBoundingClientRect();
      ghost.style.left=r.left+'px';
      ghost.style.top=(mv.clientY-cardEl.offsetHeight/2)+'px';
    }
    list.querySelectorAll('.proj-folder-hdr').forEach(hdr=>{
      hdr.classList.remove('drag-over');
      const r=hdr.getBoundingClientRect();
      if(mv.clientX>=r.left&&mv.clientX<=r.right&&mv.clientY>=r.top&&mv.clientY<r.bottom) hdr.classList.add('drag-over');
    });
  };

  const onUp=mv=>{
    document.removeEventListener('pointermove',onMove);
    document.removeEventListener('pointerup',onUp);
    if(ghost){ ghost.remove(); ghost=null; }
    cardEl.style.opacity='';
    if(!dragStarted) return; // was just a click — the card's own onclick handles it

    let targetFolderId;
    list.querySelectorAll('.proj-folder-hdr').forEach(hdr=>{
      hdr.classList.remove('drag-over');
      const r=hdr.getBoundingClientRect();
      if(mv.clientX>=r.left&&mv.clientX<=r.right&&mv.clientY>=r.top&&mv.clientY<r.bottom){
        targetFolderId=hdr.closest('.proj-folder-section')?.dataset.folderId;
      }
    });
    if(targetFolderId!==undefined){
      projMoveToFolder(projId, targetFolderId==='__unfiled__'?null:targetFolderId);
    }
  };

  document.addEventListener('pointermove',onMove);
  document.addEventListener('pointerup',onUp);
}

function projMoveToFolder(id,folderId){
  const idx=projIndex();
  const entry=idx.find(e=>e.id===id);
  if(!entry || entry.folderId===folderId) return;
  entry.folderId=folderId||null;
  localStorage.setItem(PROJ_INDEX_KEY,JSON.stringify(idx));
  renderProjPanel();
  // Local-only — folderId is deliberately excluded from acctCloudPayload
  // (see PROJ_FOLDERS_KEY's comment), so no acctMarkDirty here.
}

document.getElementById('proj-list')?.addEventListener('pointerdown', ev=>{
  if(ev.button!==0) return;
  if(PROJ_VIEW==='collections') return;
  if(PROJ_VIEW==='trash'||ev.target.closest('.proj-card-actions')||ev.target.closest('.proj-folder-hdr')) return;
  const card=ev.target.closest('.proj-card');
  if(!card) return;
  projStartCardDrag(ev, card.dataset.projId, card);
});
document.getElementById('proj-list')?.addEventListener('contextmenu', ev=>{
  if(PROJ_VIEW==='collections') return;
  const card=ev.target.closest('.proj-card');
  if(!card) return;
  ev.preventDefault();
  projShowCardCtxMenu(card.dataset.projId, ev.clientX, ev.clientY);
});

/* ── Project/folder right-click menu — shared popup, content built fresh
   on every open, so it never
   shows stale content from whichever menu was opened last. Also the
   non-drag "Move to folder" path (accessibility/touch alternative to §3's
   drag-and-drop). ── */
function projShowCtxMenu(cx,cy){
  const menu=document.getElementById('proj-ctx-menu'); if(!menu) return;
  menu.style.display='block';
  const mw=180,mh=140;
  let x=cx,y=cy;
  if(x+mw>window.innerWidth-8) x=cx-mw;
  if(y+mh>window.innerHeight-8) y=cy-mh;
  menu.style.left=x+'px'; menu.style.top=y+'px';
  applyLang();
}
function projHideCtxMenu(){ const m=document.getElementById('proj-ctx-menu'); if(m) m.style.display='none'; }
document.addEventListener('pointerdown',ev=>{ if(!ev.target.closest('#proj-ctx-menu')) projHideCtxMenu(); });

function projShowCardCtxMenu(projId, clientX, clientY){
  const idx=projIndex();
  const entry=idx.find(e=>e.id===projId);
  if(!entry||projIsTrashed(entry)) return;
  const folders=projFolders();
  const folderItems=folders.map(f=>
    `<button class="proj-ctx-item"${entry.folderId===f.id?' disabled':''} onclick="projHideCtxMenu();projMoveToFolder('${projId}','${f.id}')">${escH(f.name)}</button>`
  ).join('');
  const unfiledItem=`<button class="proj-ctx-item"${!entry.folderId?' disabled':''} onclick="projHideCtxMenu();projMoveToFolder('${projId}',null)">${typeof t==='function'?t('proj.folder.unfiled'):'Unfiled'}</button>`;
  const menu=document.getElementById('proj-ctx-menu'); if(!menu) return;
  menu.innerHTML=`
    <button class="proj-ctx-item" onclick="projHideCtxMenu();projTogglePin('${projId}')">${entry.pinned?(typeof t==='function'?t('proj.unpin'):'Unpin'):(typeof t==='function'?t('proj.pin'):'Pin')}</button>
    <button class="proj-ctx-item" onclick="projHideCtxMenu();projDuplicate('${projId}')">${typeof t==='function'?t('proj.duplicate'):'Duplicate'}</button>
    <button class="proj-ctx-item" onclick="projHideCtxMenu();projRename('${projId}')">${typeof t==='function'?t('proj.rename.title'):'Rename'}</button>
    <div class="proj-ctx-sep"></div>
    ${folders.length?`<div class="proj-ctx-label">${typeof t==='function'?t('proj.ctx.move-to'):'Move to folder'}</div>${unfiledItem}${folderItems}<div class="proj-ctx-sep"></div>`:''}
    <button class="proj-ctx-item proj-ctx-del" onclick="projHideCtxMenu();projMoveToTrash('${projId}')">${typeof t==='function'?t('proj.trash.move'):'Move to Trash'}</button>`;
  projShowCtxMenu(clientX,clientY);
}
function projOpenCardMenu(projId,ev){
  ev?.stopPropagation?.();
  projShowCardCtxMenu(projId,ev?.clientX||0,ev?.clientY||0);
}

async function projFolderRename(folderId){
  const folders=projFolders();
  const folder=folders.find(f=>f.id===folderId);
  if(!folder) return;
  const newName=await cModalPrompt('proj.folder.rename-title','proj.folder.rename-hint',folder.name);
  if(!newName||!newName.trim()) return;
  folder.name=newName.trim();
  projSaveFolders(folders);
  renderProjPanel();
}

function projFolderDelete(folderId){
  const folders=projFolders();
  const folder=folders.find(f=>f.id===folderId);
  if(!folder) return;
  const count=projIndex().filter(e=>e.folderId===folderId).length;
  const msg=(typeof t==='function'?t('confirm.delete-folder'):'Delete folder "{name}"? {n} project(s) inside will become Unfiled — nothing is deleted.\n\nThis cannot be undone.')
    .replace('{name}',folder.name).replace('{n}',count);
  if(!confirm(msg)) return;
  // Contained projects become unfiled — deleting a folder is purely
  // organizational and must never delete the projects inside it.
  const idx=projIndex();
  idx.forEach(e=>{ if(e.folderId===folderId) e.folderId=null; });
  localStorage.setItem(PROJ_INDEX_KEY,JSON.stringify(idx));
  projSaveFolders(folders.filter(f=>f.id!==folderId));
  renderProjPanel();
}

function projShowFolderMenu(folderId, ev){
  ev.stopPropagation();
  const menu=document.getElementById('proj-ctx-menu'); if(!menu) return;
  menu.innerHTML=`
    <button class="proj-ctx-item" onclick="projHideCtxMenu();projFolderRename('${folderId}')">${typeof t==='function'?t('proj.folder.rename-title'):'Rename folder'}</button>
    <div class="proj-ctx-sep"></div>
    <button class="proj-ctx-item proj-ctx-del" onclick="projHideCtxMenu();projFolderDelete('${folderId}')">${typeof t==='function'?t('proj.folder.delete'):'Delete folder'}</button>`;
  projShowCtxMenu(ev.clientX,ev.clientY);
}

// navigator.storage.estimate() reports the ORIGIN's overall quota, which
// modern browsers often grant as tens/hundreds of MB — much larger than
// localStorage's own conventional ~5MB-per-origin ceiling, which is where
// QuotaExceededError actually originates. estimate() alone would therefore
// under-report how close a save is to actually failing. The character-
// length sum against the conventional 5MB figure is the metric that
// actually matters for THIS warning's purpose, so it's the primary number;
// estimate() (when available) is only a supplementary tooltip figure.
let PROJ_STORAGE_WARNED_80=false, PROJ_STORAGE_WARNED_95=false;
let PROJ_AUTOSAVE_QUOTA_WARNED=false;
// Project data now lives in IndexedDB (see pIdbSet/pOpenIDB above), which
// has no fixed ~5MB-style ceiling the way localStorage did — the old
// "% of a hardcoded 5MB" framing no longer means anything. Two separate
// numbers instead: a precise "MB used by your projects" figure (cursor-
// walked from the projdata store, same UTF-16 char-length×2 heuristic the
// old number used, just correctly scoped), and a browser-storage
// percentage bar driven by navigator.storage.estimate() — deliberately
// labeled separately, since estimate() is origin-wide (includes the Bible
// text cache, service worker cache), not just this app's saved projects.
async function projUpdateStorageIndicator(){
  const el=document.getElementById('proj-storage-indicator'); if(!el) return;
  let usedBytes=0;
  try{ usedBytes=await pIdbUsedBytes(); }catch(_e){}
  let pct=null, estimateTip='';
  if(navigator.storage && navigator.storage.estimate){
    try{
      const est=await navigator.storage.estimate();
      if(est.quota){
        pct=Math.min(100,Math.round((est.usage/est.quota)*100));
        estimateTip=' · browser storage: '+(est.usage/1024/1024).toFixed(1)+' / '+(est.quota/1024/1024).toFixed(0)+' MB';
      }
    }catch(_){}
  }
  el.innerHTML='<span>'+(usedBytes/1024/1024).toFixed(1)+' MB used by your projects</span>'
    +(pct!=null?'<div class="proj-storage-bar"><div class="proj-storage-bar-fill" style="width:'+pct+'%"></div></div>':'');
  el.title='Your saved projects.'+estimateTip;
  if(pct!=null){
    el.classList.toggle('proj-storage-warn', pct>=80 && pct<95);
    el.classList.toggle('proj-storage-critical', pct>=95);
    if(pct>=95 && !PROJ_STORAGE_WARNED_95){
      PROJ_STORAGE_WARNED_95=true;
      toast(typeof t==='function'?t('toast.storage-full-quota'):'Storage nearly full — export projects now to avoid losing new work');
    } else if(pct>=80 && !PROJ_STORAGE_WARNED_80){
      PROJ_STORAGE_WARNED_80=true;
      toast(typeof t==='function'?t('toast.storage-warn'):'Storage is getting full — consider using Export All to back up and free space');
    }
  } else {
    el.classList.remove('proj-storage-warn','proj-storage-critical');
  }
}

function renderS1Recent(){
  const el=document.getElementById('s1-recent');
  const returning=document.getElementById('s1-returning');
  const continueCard=document.getElementById('s1-continue-card');
  const collectionEl=document.getElementById('s1-collection-continue');
  const latestCollection=collectionActiveEntries().slice().sort((a,b)=>(b.savedAt||0)-(a.savedAt||0))[0];
  if(collectionEl){collectionEl.hidden=!latestCollection;collectionEl.innerHTML=latestCollection?`<button type="button" onclick="collectionOpen('${latestCollection.id}')"><span>${escH(typeof t==='function'?t('collection.continue'):'Continue collection')}</span><span>${escH(latestCollection.name)}</span><span>→</span></button>`:'';}
  if(!el||!returning||!continueCard) return;
  const active=projActiveEntries().slice().sort((a,b)=>(b.savedAt||0)-(a.savedAt||0));
  returning.hidden=!(active.length||latestCollection);
  continueCard.hidden=!active.length;
  if(!active.length){el.innerHTML='';return;}
  const latest=active[0], latestDate=new Date(latest.savedAt||Date.now());
  const latestWhen=latestDate.toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'})+' · '+latestDate.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  const cloudBadge=typeof acctBadgeHTML==='function'?acctBadgeHTML(latest):'';
  continueCard.onclick=()=>projLoad(latest.id);
  continueCard.innerHTML=`<span class="s1-continue-title">${escH(latest.name||'Untitled')}${cloudBadge}</span><span class="s1-continue-meta"><span class="proj-lang-badge">${escH(latest.lang||'—')}</span><span>${escH(latest.verseRef||'')}</span><span>·</span><span>${latestWhen}</span></span><span class="s1-continue-action">${typeof t==='function'?t('s1.continue.action'):'Continue project →'}</span>`;
  el.innerHTML=active.slice(1,4).map(e=>{
    const when=new Date(e.savedAt).toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'});
    const badge=typeof acctBadgeHTML==='function'?acctBadgeHTML(e):'';
    return `<button class="s1-proj-row" type="button" onclick="projLoad('${e.id}')"><span class="proj-lang-badge">${escH(e.lang||'—')}</span><span class="s1-proj-name">${escH(e.name||'Untitled')}${badge}</span><span class="s1-proj-meta">${when}</span></button>`;
  }).join('');
}

/* ── Auto-save to localStorage project ── */
function autoSave(){
  if(!SESS)return;
  // Keep comment HTML available while the Notes dock is collapsed.
  document.querySelectorAll('.ccard').forEach(card=>{
    const cid=card.dataset.cid; if(!cid) return;
    const ed=card.querySelector('.cedit-c');
    if(ed) COMMENT_HTML_CACHE[cid]=ed.innerHTML;
  });
  clearTimeout(asT);
  asT=setTimeout(async()=>{
    // Session autosave (crash recovery)
    try{ localStorage.setItem(storeKey(),JSON.stringify(collectData())); }catch(_){}
    if(!CURRENT_PROJECT_ID && typeof syncWorkspaceChrome==='function') syncWorkspaceChrome('draft');
    // Project autosave — only if a project is already open
    if(CURRENT_PROJECT_ID){
      const ref=document.getElementById('refin').value.trim();
      const name=ref||'Untitled';
      const data=collectData();
      const now=Date.now();
      try{ await pIdbSet(CURRENT_PROJECT_ID,JSON.stringify(data)); PROJ_AUTOSAVE_QUOTA_WARNED=false; }
      catch(e){
        // Was fully silent before — now surfaces QuotaExceededError specifically,
        // gated to once per occurrence so continuous typing doesn't spam a toast
        // every 700ms; the flag resets on the next successful write above.
        if(e && e.name==='QuotaExceededError' && !PROJ_AUTOSAVE_QUOTA_WARNED){
          PROJ_AUTOSAVE_QUOTA_WARNED=true;
          toast(typeof t==='function'?t('toast.storage-full-quota'):'Storage is full. Use Export All to back up your projects, then delete some to free space.');
        }
      }
      const idx=projIndex();
      const entry=idx.find(e=>e.id===CURRENT_PROJECT_ID);
      if(entry){ if(!entry.renamed) entry.name=name; entry.lang=LANG;entry.verseRef=ref;entry.savedAt=now;
        localStorage.setItem(PROJ_INDEX_KEY,JSON.stringify(idx)); }
      // Marks dirty only — NOT a cloud push on every keystroke burst. The
      // actual push happens on account.js's own coarse flusher (~30s,
      // plus visibility/online triggers), which would otherwise re-upload
      // the whole project payload on every 700ms autosave tick.
      if(typeof acctMarkDirty==='function') acctMarkDirty(CURRENT_PROJECT_ID);
      // Use 'd' not 't' to avoid shadowing the i18n t() function
      const d=new Date(now);
      const ts=d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
      const stbar=document.getElementById('stbar');
      if(stbar){
        stbar.textContent=(typeof t==='function'?t('toast.autosaved'):'Auto-saved · ')+ts;
        stbar.classList.add('stbar-saved');
        clearTimeout(stbar._resetT);
        stbar._resetT=setTimeout(()=>{
          stbar.textContent=typeof t==='function'?t('stbar.ready'):'Ready';
          stbar.classList.remove('stbar-saved');
        },2000);
      }
      if(typeof syncWorkspaceChrome==='function') syncWorkspaceChrome('saved');
    }
  },700);
}

/* ════════════════════════════════════════
   EXPORT POPUP
════════════════════════════════════════ */
function toggleExportPopup(e){
  e.stopPropagation();
  const p=document.getElementById('export-popup');
  const opening=!p.classList.contains('show');
  p.classList.toggle('show',opening);
  if(opening&&e.currentTarget){
    const r=e.currentTarget.getBoundingClientRect();
    p.style.transform='none';
    p.style.left=Math.max(8,Math.min(window.innerWidth-p.offsetWidth-8,r.right-p.offsetWidth))+'px';
    p.style.top=(r.bottom+8)+'px';
    p.style.bottom='auto';
  }
}
function closeExportPopup(){
  document.getElementById('export-popup').classList.remove('show');
}
async function doExportPDF(){
  closeExportPopup();
  exportPDF();
}

/* ── Diagram PDF export ──────────────────────────────────────────────── */
function openDiagPdfModal(){
  document.getElementById('diag-pdf-modal').classList.remove('hidden');
  applyLang(); // ensure i18n strings are fresh
}
function closeDiagPdfModal(){
  document.getElementById('diag-pdf-modal').classList.add('hidden');
}

/* Reads the Size and Orientation dropdowns from the modal and calls exportDiagramPDF */
function exportDiagramPDFFromModal(){
  const format     =(document.getElementById('diag-pdf-size')?.value    ||'a4');
  const orientation=(document.getElementById('diag-pdf-orient')?.value  ||'landscape');
  exportDiagramPDF(format, orientation);
}

async function exportDiagramPDF(format, orientation){
  closeDiagPdfModal();
  const canvas=document.getElementById('dcanvas');
  if(!canvas){ toast('No diagram canvas found.'); return; }
  const {jsPDF}=window.jspdf;
  if(!jsPDF){ toast('PDF library not loaded.'); return; }
  toast(typeof t==='function'?t('export.pdf.generating'):'Generating PDF\u2026');
  const ref=(document.getElementById('refin')?.value||'').trim()||'Diagram';
  const doc=await _runDiagramPDFExport(ref, LANG||'', format, orientation);
  if(!doc){ toast('PDF export failed.'); return; }
  doc.save(buildDiagramFilename(ref)+'.pdf');
}

/* ── Shared diagram PDF engine ──────────────────────────────────────────────
   Captures the live #dcanvas, slices into pages with footnotes and
   block-snap anti-cut logic, returns a jsPDF doc (or null on failure).
   Used by both exportDiagramPDF (single) and _exportAllDiagPDF (bulk). */
async function _runDiagramPDFExport(ref, langSrc, format, orientation){
  const canvas=document.getElementById('dcanvas');
  if(!canvas) return null;
  const {jsPDF}=window.jspdf;
  if(!jsPDF) return null;

  const PAGE_SIZES={
    a3:     {portrait:[841.89,1190.55], landscape:[1190.55,841.89]},
    a4:     {portrait:[595.28,841.89],  landscape:[841.89,595.28]},
    letter: {portrait:[612,792],        landscape:[792,612]},
    long:   {portrait:[612,936],        landscape:[936,612]}
  };
  const [pW,pH]=PAGE_SIZES[format]?.[orientation]||PAGE_SIZES.a4.landscape;
  const MAR=28, usableW=pW-MAR*2;

  // ── Clone canvas off-screen ────────────────────────────────────────
  const host=document.createElement('div');
  host.style.cssText='position:fixed;left:-9999px;top:0;overflow:visible;pointer-events:none;';
  document.body.appendChild(host);

  const clone=canvas.cloneNode(true);
  clone.style.zoom='1';
  clone.style.transform='';
  clone.style.position='static';

  // Measure the LIVE canvas's natural (unzoomed) width so the clone — which
  // renders at zoom:1 above — isn't pinned to whatever width the live,
  // possibly-zoomed canvas happens to occupy on screen. A position:static
  // block can't shrink-to-fit its own content, so an explicit pixel width is
  // still required; it just has to be the TRUE natural width. Desktop zoom
  // uses CSS `zoom` (affects scrollWidth); touch zoom uses `transform:scale`
  // (does NOT affect scrollWidth — see _applyDiagramZoomTransform). Clearing
  // both and restoring synchronously measures correctly either way.
  const liveZoom=canvas.style.zoom, liveTransform=canvas.style.transform;
  canvas.style.zoom='1'; canvas.style.transform='';
  const naturalWidth=canvas.scrollWidth;
  canvas.style.zoom=liveZoom; canvas.style.transform=liveTransform;
  clone.style.width=naturalWidth+'px';

  host.appendChild(clone);

  // Cancel leftover zoom counter-scaling that cloneNode copied onto the
  // connector SVGs (see setDiagramZoom / _applyDiagramZoomTransform) — once
  // the clone itself renders at zoom:1, these would otherwise misalign the
  // connector lines relative to the diagram blocks.
  clone.querySelectorAll('#dcard-surfaces,#dconns,#dconns-back').forEach(el=>{ el.style.zoom='1'; el.style.transform=''; });
  // The PDF represents the durable diagram, never its editing affordances.
  clone.querySelectorAll('.dra-handle,#dconns-hit,.dbrk-pip,.dsec-del,.dsec-color,.dem-merge-btn')
    .forEach(el=>el.style.display='none');
  clone.querySelectorAll('.selected,.dragging,.dconn-source,.dconn-target,.indent-preview')
    .forEach(el=>el.classList.remove('selected','dragging','dconn-source','dconn-target','indent-preview'));

  clone.querySelectorAll('.dcell.dv').forEach(el=>el.style.color='#A89F90');
  clone.querySelectorAll('.dcell.dl').forEach(el=>el.style.color='#C8A84B');
  clone.querySelectorAll('.dcell').forEach(el=>{ if(!el.style.color) el.style.color='#C8A84B'; });
  clone.style.background='#ffffff';

  await new Promise(r=>requestAnimationFrame(r));

  let capturedCanvas=null;
  try{
    capturedCanvas=await html2canvas(clone,{
      scale:2, useCORS:true, backgroundColor:'#ffffff', logging:false,
      scrollX:0, scrollY:0,
      width:  clone.scrollWidth  || canvas.scrollWidth,
      height: clone.scrollHeight || canvas.scrollHeight,
      windowWidth:  clone.scrollWidth  || canvas.scrollWidth,
      windowHeight: clone.scrollHeight || canvas.scrollHeight,
    });
  }catch(err){
    console.error('html2canvas error:',err);
  }finally{
    document.body.removeChild(host);
  }
  if(!capturedCanvas) return null;

  // ── Build footnote map ────────────────────────────────────────────
  const FN_LINE_H=13, FN_GAP=5, FN_SEP_H=10, FN_SPACE_ABOVE=14;
  const FN_LINE_H_S=10, FN_LBL_PT=7, FN_TXT_PT=8;
  const zoomRatio=DIAGRAM_ZOOM/100;
  const captureScale=2;

  function stripHtmlFn2(html){
    return html.replace(/<br\s*\/?>/gi,' ').replace(/<\/[^>]+>/g,' ')
      .replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&')
      .replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
  }

  // rowMap covers EVERY diagram row — block-snap must protect uncommented
  // rows too, not just commented ones. fn is null when the row has no
  // (non-empty) comment; footnote content-lookups below filter on r.fn,
  // while block-snap runs against the whole array.
  const rowMap=[];
  const cR=canvas.getBoundingClientRect();
  document.querySelectorAll('#dcanvas .drow').forEach(drow=>{
    const rid=drow.dataset.rid;
    const pRow=document.querySelector(`.xrow[data-rid="${rid}"]`);
    const cid=pRow?pRow.dataset.cid:null;
    let fn=null;
    if(cid){
      const cmtEl=document.querySelector(`.ccard[data-cid="${cid}"] .cedit-c`);
      if(cmtEl&&cmtEl.innerText.trim()){
        const txt=stripHtmlFn2(cmtEl.innerHTML);
        if(txt){
          const lid=pRow?pRow.querySelector('.lid')?.textContent||'':'';
          fn={lineId:lid&&lid!=='—'?lid:'',text:txt};
        }
      }
    }
    const dR=drow.getBoundingClientRect();
    const logTop=(dR.top-cR.top)/zoomRatio;
    const logBot=(dR.bottom-cR.top)/zoomRatio;

    // A section-start divider (.dsec-divider.dsec-start, from a type:'section'
    // annotation) is rendered as this row's immediately-preceding sibling
    // when this row begins a labeled section. It has no rowFnMap entry of
    // its own, so without this it's invisible to block-snap and can end up
    // stranded alone at the bottom of a page while the section's own first
    // row starts the next one. snapTopPx extends the row's snap boundary
    // up to the divider's own top when present, so the two are always kept
    // together by the exact same "push the whole span to the next page"
    // logic already used for rows — rowTopPx (the row's own true top)
    // stays untouched for footnote-page-assignment purposes below.
    const prevSib=drow.previousElementSibling;
    const divider=(prevSib&&prevSib.classList.contains('dsec-divider')&&prevSib.classList.contains('dsec-start'))?prevSib:null;
    const sR=divider?divider.getBoundingClientRect():dR;
    const snapLogTop=(sR.top-cR.top)/zoomRatio;

    rowMap.push({
      rowTopPx:Math.round(logTop*captureScale),
      rowBotPx:Math.round(logBot*captureScale),
      snapTopPx:Math.round(snapLogTop*captureScale),
      fn
    });
  });

  // ── Build jsPDF doc ──────────────────────────────────────────────
  const doc=new jsPDF({orientation,unit:'pt',format});
  const HEADER_H=34;
  const imgW=usableW;
  const imgH=(capturedCanvas.height/capturedCanvas.width)*imgW;
  const usableH=pH-MAR*2-HEADER_H;

  // Footnote text is pulled from user comments, which routinely quote the
  // Hebrew/Greek source text — needs a Unicode-capable font (see
  // _embedPdfUnicodeFont), not jsPDF's Latin-only built-ins.
  const FN_FONT=await _embedPdfUnicodeFont(doc);

  // Font-accurate word-wrap (jsPDF's splitTextToSize measures with whatever
  // font/size is currently set on doc) instead of a fixed chars-per-line
  // guess — needed now that footnote text can be Gentium Plus at a
  // different average glyph width than the char-count heuristic was tuned
  // for, and correct for the mixed Latin/Hebrew/Greek text real comments
  // contain either way.
  function fnTextLines(fn){
    doc.setFont(FN_FONT,'normal'); doc.setFontSize(FN_TXT_PT);
    return doc.splitTextToSize(fn.text, usableW);
  }
  function fnHeightPt(fn){ return Math.max(1,fnTextLines(fn).length)*FN_LINE_H_S+FN_GAP; }
  function fnZonePt(fns){ return fns.length?(FN_SEP_H+fns.reduce((s,fn)=>s+fnHeightPt(fn),0)):0; }

  function drawDiagHeader(){
    doc.setFont('helvetica','bold'); doc.setFontSize(13);
    doc.setTextColor(31,30,30);
    doc.text(ref,MAR,MAR+10);
    doc.setFont('helvetica','normal'); doc.setFontSize(8);
    doc.setTextColor(168,159,144);
    doc.text((langSrc?langSrc+' \u00B7 ':'')+'Exegetical Phrasing \u00B7 Diagram',MAR,MAR+22);
    return MAR+HEADER_H;
  }

  function drawFnsDiag(fns){
    if(!fns.length) return;
    const zone=fnZonePt(fns);
    let fy=pH-MAR-zone;
    doc.setDrawColor(73,53,72); doc.setLineWidth(0.4);
    doc.line(MAR,fy,MAR+usableW*0.3,fy);
    fy+=8;
    fns.forEach(fn=>{
      const labelW=fn.lineId?(fn.lineId.length*3.5+3):0;
      doc.setFontSize(FN_LBL_PT); doc.setFont('helvetica','bold'); doc.setTextColor(73,53,72);
      if(fn.lineId) doc.text(fn.lineId,MAR,fy+FN_LINE_H_S-3);
      doc.setTextColor(31,30,30);
      const lines=fnTextLines(fn);
      // isInputVisual:false — see the identical note in _capturePhrasingPDFBlob's
      // drawFns: this text is stored in normal reading (logical) order, and
      // jsPDF's default assumption otherwise corrupts any line containing
      // Hebrew by reversing the whole line, English portions included.
      lines.forEach((l,i)=>doc.text(l,MAR+labelW,fy+FN_LINE_H_S+i*FN_LINE_H_S-3,{isInputVisual:false}));
      fy+=Math.max(1,lines.length)*FN_LINE_H_S+FN_GAP;
    });
  }

  // ── Page slicing with block-snap ─────────────────────────────────
  let srcY=0, pageIdx=0;
  let lastContentBottom=0; // tracks where content ends on the final page, for the citation block below
  while(srcY<capturedCanvas.height){
    if(pageIdx>=300){
      console.warn('_runDiagramPDFExport: aborting after '+pageIdx+' pages — likely a runaway export (check DIAGRAM_ZOOM or diagram content).');
      return null;
    }
    const baseUsableH=usableH;
    const preEndY=srcY+Math.round((baseUsableH/imgH)*capturedCanvas.height);
    const preFns=rowMap.filter(r=>r.fn&&r.rowTopPx>=srcY&&r.rowTopPx<preEndY).map(r=>r.fn);
    const fnZone=preFns.length?(fnZonePt(preFns)+FN_SPACE_ABOVE):0;
    const adjustedUsableH=Math.max(baseUsableH*0.4,baseUsableH-fnZone);

    let slicePxH=Math.min(
      capturedCanvas.height-srcY,
      Math.max(1,Math.round((adjustedUsableH/imgH)*capturedCanvas.height))
    );

    // Block-snap: don't cut mid-row (checked against EVERY row via rowMap,
    // not just commented ones), and don't strand a section-start divider
    // alone at the bottom of a page either — snapTopPx is the divider's own
    // top when one immediately precedes this row, else the row's own top
    // (see rowMap construction above). Only let the cut stand when the
    // straddling span starts at the very top of this slice (srcY) —
    // nothing precedes it on this page, so it's simply taller than one
    // page's usable height and must be cut regardless. Otherwise, snapping
    // back to its top is always safe and always makes forward progress,
    // since slicePxH is then guaranteed > 0.
    const snapEndY=srcY+slicePxH;
    const rowsStraddling=rowMap.filter(r=>r.snapTopPx>=srcY&&r.snapTopPx<snapEndY&&r.rowBotPx>snapEndY);
    if(rowsStraddling.length&&rowsStraddling[0].snapTopPx>srcY){
      slicePxH=Math.max(1,rowsStraddling[0].snapTopPx-srcY);
    }

    const pageEndY=srcY+slicePxH;
    const thisFns=rowMap.filter(r=>r.fn&&r.rowTopPx>=srcY&&r.rowTopPx<pageEndY).map(r=>r.fn);

    const sliceC=document.createElement('canvas');
    sliceC.width=capturedCanvas.width;
    sliceC.height=slicePxH;
    sliceC.getContext('2d').drawImage(capturedCanvas,0,srcY,capturedCanvas.width,slicePxH,0,0,capturedCanvas.width,slicePxH);
    const sliceImgH=Math.min(adjustedUsableH,(slicePxH/capturedCanvas.width)*imgW);

    if(pageIdx>0) doc.addPage();
    const pageContentY=drawDiagHeader();
    doc.addImage(sliceC.toDataURL('image/jpeg',0.92),'JPEG',MAR,pageContentY,imgW,sliceImgH);
    if(thisFns.length) drawFnsDiag(thisFns);
    const thisFnZone=fnZonePt(thisFns);
    lastContentBottom=thisFnZone?Math.max(pageContentY+sliceImgH,pH-MAR-thisFnZone):pageContentY+sliceImgH;
    srcY+=slicePxH;
    pageIdx++;
  }

  // Source citation, if any — placed below whichever sits lower on the
  // last page: the diagram image or the pinned-to-bottom footnote zone.
  _drawPdfCitation(doc, lastContentBottom, MAR, usableW, pH);

  if(studyNotebookIncludeInPdf()) appendStudyNotebookPDF(doc);
  return doc;
}
async function doExportJSON(){
  closeExportPopup();
  // Prompt for filename
  const ref=document.getElementById('refin').value.trim();
  if(!ref){
    const entered=await cModalPrompt('cmodal.ref.title','cmodal.ref.hint','');
    if(!entered||!entered.trim()){toast(typeof t==='function'?t('toast.export-cancel2'):'Export cancelled');return;}
    document.getElementById('refin').value=entered.trim();autoSave();
  }
  const suggested=buildFilename(document.getElementById('refin').value.trim());
  const chosen=await cModalPrompt('cmodal.fname.title','cmodal.fname.hint',suggested);
  if(!chosen){toast(typeof t==='function'?t('toast.export-cancel2'):'Export cancelled');return;}
  downloadJSON(chosen);
}
// Close export popup on click outside
document.addEventListener('click',()=>closeExportPopup());

/* ════════════════════════════════════════
   SHARED FILENAME + DOWNLOAD
════════════════════════════════════════ */
function buildFilename(r){
  let s=r.replace(/[–—]/g,'-').replace(/\s+/g,' ').trim();
  const m=s.match(/^(.+?)\s+(\d+)(?:[:\.](\d+)(?:\s*-\s*(\d+))?)?/);
  if(!m) return s.replace(/[^\w ]/g,'_');
  const book=m[1].trim(),chap=m[2],vS=m[3],vE=m[4];
  if(vS&&vE) return `${book} ${chap}_${vS}-${vE}`;
  if(vS)     return `${book} ${chap}_${vS}`;
  return `${book} ${chap}`;
}

function buildDiagramFilename(r){
  let s=(r||'').replace(/[–—\u2013\u2014]/g,'-').replace(/\s+/g,' ').trim();
  const m=s.match(/^(.+?)\s+(\d+)(?:[:\.](\d+)(?:\s*[-–]\s*(\d+))?)?/);
  if(!m) return (s.replace(/[^\w ]/g,'_')||'Diagram')+' Diagram';
  const book=m[1].trim(),chap=m[2],vS=m[3],vE=m[4];
  if(vS&&vE) return `${book} ${chap}_${vS}-${vE} Diagram`;
  if(vS)     return `${book} ${chap}_${vS} Diagram`;
  return `${book} ${chap} Diagram`;
}

/* Shared download trigger */
function downloadJSON(fname){
  const data=collectData();
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=fname+'.json';
  a.click();
  CURRENT_FILENAME=fname;
  toast('Saved: '+fname+'.json');
}

/* Ctrl+S — save to same filename if one is known, otherwise Save As */
function saveJSON(){
  // Only works in the editor
  if(document.getElementById('app').style.display==='none') return;
  if(CURRENT_FILENAME){
    downloadJSON(CURRENT_FILENAME);
    return;
  }
  saveAsJSON();
}

/* Ctrl+Shift+S / Save As button — always prompt for filename */
async function saveAsJSON(){
  if(document.getElementById('app').style.display==='none') return;
  // Ensure verse reference exists first
  const refEl=document.getElementById('refin');
  let ref=refEl.value.trim();
  if(!ref){
    const entered=await cModalPrompt('cmodal.ref.title','cmodal.ref.hint','');
    if(!entered||!entered.trim()){toast(typeof t==='function'?t('toast.save-cancel2'):'Save cancelled — verse reference required');return;}
    ref=entered.trim(); refEl.value=ref; autoSave();
  }
  // Suggest a default name
  const suggested=buildFilename(ref);
  const entered=await cModalPrompt('cmodal.saveas.title','cmodal.saveas.hint',suggested);
  if(!entered||!entered.trim()){toast(typeof t==='function'?t('toast.save-cancel'):'Save cancelled');return;}
  let chosen=entered.trim();
  // If the chosen name matches the currently loaded file, append (1), (2)… to avoid confusion
  if(CURRENT_FILENAME && chosen===CURRENT_FILENAME){
    let n=1;
    while(true){
      const candidate=`${chosen} (${n})`;
      // We can't check the disk, but we track CURRENT_FILENAME —
      // keep incrementing until we find one that differs
      if(candidate!==CURRENT_FILENAME){chosen=candidate;break;}
      n++;
    }
    toast((typeof t==='function'?t('toast.save-renamed'):'Name matches existing file — saving as "')+chosen+'"');
  }
  downloadJSON(chosen);
}
function loadFile(e){
  const f=e.target.files[0];if(!f)return;
  // Store the loaded filename (minus .json extension) for Ctrl+S in-place save
  const loadedName=f.name.replace(/\.json$/i,'');
  const reader=new FileReader();
  reader.onload=ev=>{
    try{
      const data=JSON.parse(ev.target.result);
      if(data.lang&&data.lang!==SESS){
        SESS=data.lang;IS_RTL=data.isRTL||false;IS_SINGLE=data.isSingle||false;
        LANG=data.langLabel||(SESS==='greek'?'Greek':SESS==='hebrew'?'Hebrew':'Custom');
        document.getElementById('sess-lbl').textContent=LANG+' Session';
        document.getElementById('ch-o-lbl').textContent=IS_SINGLE?LANG:LANG+' Text';
  // ch-t-lbl always reads "Translation"; version shown in version-sub.
        document.getElementById('ch-t').style.display=IS_SINGLE?'none':'';
      }
      // Font size isn't part of the saved JSON at all (collectData() never
      // writes CEDIT_O_SIZE/CEDIT_T_SIZE) — it's purely derived from the
      // session language here. Must run on EVERY load with a lang, not just
      // when the language differs from the current session: loading a
      // second same-language file after the toolbar +/- was used on the
      // first one otherwise silently carries that leftover size into the
      // new file instead of resetting to that language's default.
      if(data.lang) _applySessionFontDefaults();
      loadData(data);
      CURRENT_FILENAME=loadedName;
      // A disk file is a fresh, independent document — never let it stay
      // silently bound to whatever project id was open before, or the next
      // Ctrl+S would overwrite that unrelated saved project.
      CURRENT_PROJECT_ID=null;
      toast((typeof t==='function'?t('toast.loaded'):'Loaded: ')+loadedName);
    }catch(_){toast(typeof t==='function'?t('toast.load-error'):'Could not read file');}
  };
  reader.readAsText(f);e.target.value='';
}
// Load JSON from Screen 1 — detects session language from file, skips language selection
function loadFromScreen1(e){
  const f=e.target.files[0];if(!f)return;
  const loadedName=f.name.replace(/\.json$/i,'');
  const reader=new FileReader();
  reader.onload=ev=>{
    try{
      const data=JSON.parse(ev.target.result);
      const lang=data.lang||'greek';
      const customLabel=data.langLabel||'';
      SESS=lang;IS_RTL=lang==='hebrew';IS_SINGLE=lang==='custom';
      _applySessionFontDefaults();
      LANG=lang==='greek'?'Greek':lang==='hebrew'?'Hebrew':(customLabel||'Custom');
      document.getElementById('s1').classList.add('hidden');
      document.getElementById('s2').classList.add('hidden');
      openEditor();
      loadData(data);
      CURRENT_FILENAME=loadedName;
      CURRENT_PROJECT_ID=null; // same reasoning as loadFile() above
      toast((typeof t==='function'?t('toast.loaded'):'Loaded: ')+loadedName);
    }catch(_){toast(typeof t==='function'?t('toast.load-error'):'Could not read file');}
  };
  reader.readAsText(f);e.target.value='';
}
function s1ImportFile(e){
  const file=e?.target?.files?.[0]; if(!file) return;
  if(/\.zip$/i.test(file.name)||file.type==='application/zip'){
    projRestoreBackupInput(e);
    return;
  }
  loadFromScreen1(e);
}
function clearAll(){
  if(!confirm(typeof t==='function'?t('confirm.clear'):'Clear all content?'))return;
  // Snapshot full state so Clear can be undone
  const snapshot=collectData();
  rowPush({type:'clear', snapshot});
  // Now clear
  document.getElementById('rows-body').innerHTML='';
  document.querySelectorAll('.ccard').forEach(c=>c.remove());
  STUDY_NOTEBOOK=[];STUDY_NOTE_CTR=0;STUDY_NOTE_ACTIVE_ID=null;window.studyNotebookBibleSelection=null;renderStudyNotebook();
  document.getElementById('refin').value='';
  document.getElementById('svgl')?.replaceChildren();
  setSourceCitation('');
  RC=CC=0;
  DIAGRAM_DATA={connectors:[], labels:[]};
  CNX=0;LBL=0;
  SELECTED_CNX_ID=null;
  document.getElementById('conn-edit-popup')?.style.setProperty('display','none');
  cancelRightAngleArm();
  // Clear brackets
  if(typeof BRACKETS!=='undefined'){ BRACKETS=[]; BRK_CTR=0; SELECTED_BRK_ID=null; }
  if(typeof _brkCancelPending==='function') _brkCancelPending();
  if(typeof _brkCloseEditPopup==='function') _brkCloseEditPopup();
  addEmptyRow();
  localStorage.removeItem(storeKey());
  toast(typeof t==='function'?t('toast.cleared'):'Cleared — press Ctrl+Z to undo');
}

/* Draws the passage's source citation (SOURCE_CITATION — see
   setSourceCitation), if any, as a small italic block starting at
   startY. Adds a fresh page first if it wouldn't fit on the current one.
   Standalone (no closure vars) so both the Phrasing and Diagram PDF
   exporters can share it. Returns nothing — mutates doc directly. */
function _drawPdfCitation(doc, startY, MAR, usableW, pH){
  if(!SOURCE_CITATION) return;
  const citText=SOURCE_CITATION
    .replace(/<br\s*\/?>/gi,' ').replace(/<[^>]+>/g,'')
    .replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .trim();
  if(!citText) return;
  const FONT=8.5, LINE_H=11;
  const charsPerLine=Math.max(20,Math.floor(usableW/4.6));
  const words=citText.split(' ');
  const lines=[]; let line='';
  words.forEach(w=>{
    const test=line?line+' '+w:w;
    if(test.length>charsPerLine&&line){ lines.push(line); line=w; }
    else line=test;
  });
  if(line) lines.push(line);
  const blockH=12+lines.length*LINE_H+8;
  let y=startY;
  if(y+blockH>pH-28){ doc.addPage(); y=40; }
  else y+=10;
  doc.setDrawColor(73,53,72); doc.setLineWidth(0.4);
  doc.line(MAR,y,MAR+usableW*0.3,y);
  y+=12;
  doc.setFont('helvetica','italic'); doc.setFontSize(FONT);
  doc.setTextColor(120,112,100);
  lines.forEach(l=>{ doc.text(l,MAR,y); y+=LINE_H; });
}

/* ── Shared phrasing-PDF renderer ──────────────────────────────────────
   The old exporter rendered original and translation cells independently.
   That meant two expensive html2canvas passes for every row and preserved
   Hebrew's larger on-screen default (24px) beside a 14px translation.  The
   shared renderer below snapshots both cells together, once per row. */
const PHRASING_PDF_SCALE=1.5;

function _pdfPhrasingLayout(){
  const orig=document.querySelector('[id^="oc-"] .cedit');
  const trans=!IS_SINGLE?document.querySelector('[id^="tc-"] .cedit'):null;
  const origCell=orig?.closest('.xcell');
  const transCell=trans?.closest('.xcell');
  const origPx=Math.max(80,origCell?.getBoundingClientRect().width||0);
  const transPx=IS_SINGLE?0:Math.max(80,transCell?.getBoundingClientRect().width||0);
  const total=origPx+transPx;
  return {
    origPx,
    transPx,
    origRatio:IS_SINGLE?1:(total?origPx/total:.6)
  };
}

/* Create a detached, off-screen row that contains only the original and
   translation text cells.  The translation receives the original cell's
   computed size in this clone only: project data and the live editor never
   change. */
async function _pdfPhrasingRowSnapshot(origEl, transEl, layout){
  const hasOrig=!!origEl?.innerText?.trim();
  const hasTrans=!!transEl?.innerText?.trim();
  if(!hasOrig&&!hasTrans) return null;

  const originalSize=getComputedStyle(origEl||transEl).fontSize;
  const host=document.createElement('div');
  host.className='pdf-phrasing-row-snapshot';
  host.style.cssText='position:fixed;left:-100000px;top:0;display:flex;align-items:flex-start;'
    +'box-sizing:border-box;background:#fff;pointer-events:none;z-index:-1;'
    +'width:'+(layout.origPx+layout.transPx)+'px;';

  function cloneCell(source, width, normaliseSize){
    const sourceCell=source?.closest('.xcell');
    const cell=sourceCell?sourceCell.cloneNode(true):document.createElement('div');
    cell.removeAttribute('id');
    cell.style.flex='0 0 '+width+'px';
    cell.style.width=width+'px';
    cell.style.minWidth=width+'px';
    cell.style.boxSizing='border-box';
    const editor=cell.querySelector('.cedit');
    if(editor){
      editor.removeAttribute('id');
      editor.setAttribute('contenteditable','false');
      editor.style.width='100%';
      if(normaliseSize) editor.style.fontSize=originalSize;
    }
    return cell;
  }

  host.appendChild(cloneCell(origEl,layout.origPx,false));
  if(!IS_SINGLE) host.appendChild(cloneCell(transEl,layout.transPx,true));
  document.body.appendChild(host);
  try{
    const canvas=await html2canvas(host,{
      scale:PHRASING_PDF_SCALE,useCORS:true,allowTaint:true,
      backgroundColor:'#ffffff',logging:false,width:host.offsetWidth,
      windowWidth:window.innerWidth
    });
    return {canvas,scale:PHRASING_PDF_SCALE};
  }finally{
    host.remove();
  }
}

function _pdfNextPaint(){
  return new Promise(resolve=>requestAnimationFrame(resolve));
}

// Notes can be collapsed while exporting. HTMLElement.innerText depends on
// rendered visibility, so it can be empty even though the comment is saved.
// HTML and the comment cache remain available in either dock state.
function _pdfCommentHtml(cid){
  if(!cid) return '';
  const live=document.querySelector('.ccard[data-cid="'+cid+'"] .cedit-c');
  return live?.innerHTML||COMMENT_HTML_CACHE?.[cid]||'';
}

/* Returns a jsPDF document.  Both a normal download and a bulk ZIP call this
   function so page layout, PDF-only sizing, and performance behavior cannot
   drift apart. */
async function _buildPhrasingPDF(ref, onProgress){
  const {jsPDF}=window.jspdf||{};
  if(!jsPDF) throw new Error('PDF library not loaded.');

  const doc=new jsPDF({orientation:IS_SINGLE?'portrait':'landscape',unit:'pt',format:'a4'});
  const pW=doc.internal.pageSize.getWidth();
  const pH=doc.internal.pageSize.getHeight();
  const MAR=28, usableW=pW-MAR*2, PT_PX=72/96;
  const vWpt=26,lWpt=32,tableBodyW=usableW-vWpt-lWpt;
  const SIG=[73,53,72],ACC=[200,168,75];
  const HDR_H=18,ROW_PAD=4,MIN_H=22;
  const layout=_pdfPhrasingLayout();
  const origHdrW=IS_SINGLE?tableBodyW:tableBodyW*layout.origRatio;
  const transHdrW=IS_SINGLE?0:tableBodyW-origHdrW;
  const update=(pct,label)=>{ if(typeof onProgress==='function') onProgress(pct,label); };

  function drawPageHeader(y){
    doc.setFont('helvetica','bold');doc.setFontSize(15);doc.setTextColor(31,30,30);doc.text(ref,MAR,y);
    doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(168,159,144);
    doc.text(LANG+' · Exegetical Phrasing',MAR,y+12);
    return y+24;
  }
  function drawColHeaders(y){
    doc.setFillColor(...SIG);doc.rect(MAR,y,usableW,HDR_H,'F');
    doc.setFont('helvetica','bold');doc.setFontSize(7);doc.setTextColor(247,243,233);
    const labels=IS_SINGLE
      ?['VERSE','LINE',(LANG||'').toUpperCase()+' TEXT']
      :['VERSE','LINE',(LANG||'').toUpperCase()+' TEXT','TRANSLATION'];
    const widths=IS_SINGLE?[vWpt,lWpt,origHdrW]:[vWpt,lWpt,origHdrW,transHdrW];
    let x=MAR; widths.forEach((w,i)=>{doc.text(labels[i],x+3,y+HDR_H/2+2.5);x+=w;});
    return y+HDR_H;
  }
  function stripHtml(html){
    return html.replace(/<br\s*\/?>/gi,' ').replace(/<\/p>/gi,' ').replace(/<\/div>/gi,' ')
      .replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&')
      .replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
  }

  const FN_LINE_H=13,FN_GAP=5,FN_SEP_H=10;
  const fnFont=await _embedPdfUnicodeFont(doc);
  function fnH(fn){return Math.ceil((fn.text.length||1)/Math.floor(usableW/5.5))*FN_LINE_H+FN_GAP;}
  function fnZoneH(fns){return fns.length?FN_SEP_H+fns.reduce((sum,fn)=>sum+fnH(fn),0):0;}
  function drawFns(fns){
    if(!fns.length) return;
    let y=pH-MAR-fnZoneH(fns);
    doc.setDrawColor(...SIG);doc.setLineWidth(.4);doc.line(MAR,y,MAR+usableW*.3,y);y+=6;
    fns.forEach(fn=>{
      const labelW=fn.lineId.length*4.5+4;
      doc.setFontSize(9);doc.setFont('helvetica','bold');doc.setTextColor(...SIG);doc.text(fn.lineId,MAR,y+FN_LINE_H-3);
      doc.setFontSize(10);doc.setFont(fnFont,'normal');doc.setTextColor(31,30,30);
      const chars=Math.floor((usableW-labelW)/5.5),lines=[];let line='';
      fn.text.split(' ').forEach(word=>{
        const candidate=line?line+' '+word:word;
        if(candidate.length>chars&&line){lines.push(line);line=word;}else line=candidate;
      });
      if(line) lines.push(line);
      lines.forEach((text,i)=>doc.text(text,MAR+labelW,y+FN_LINE_H+i*FN_LINE_H-3,{isInputVisual:false}));
      y+=Math.max(1,lines.length)*FN_LINE_H+FN_GAP;
    });
  }

  const rowEls=_realRows();
  const rowIndex=new Map(rowEls.map((row,index)=>[String(row.dataset.rid),index]));
  const showPropDividers=!document.body.classList.contains('hide-dividers');
  const showSectionDividers=!document.body.classList.contains('hide-sections');
  const propByRid=new Map(),sectionStartsByRid=new Map(),sectionsByRid=new Map();
  const PROP_PLAIN_H=8,PROP_LABEL_H=14,SECTION_H=16;
  // The PDF keeps section rails in a dedicated margin lane so proposition
  // dividers can never cut through (or visually interrupt) a section.
  const SECTION_RAIL_X=MAR+2,SECTION_RAIL_W=3,SECTION_RAIL_STRIDE=5,ANNOTATION_GAP=7;

  function addToMap(map,key,value){
    if(!map.has(key)) map.set(key,[]);
    map.get(key).push(value);
  }
  function annotationColor(value,fallback){
    const hex=String(value||fallback).replace('#','');
    return /^[0-9a-f]{6}$/i.test(hex)
      ? [parseInt(hex.slice(0,2),16),parseInt(hex.slice(2,4),16),parseInt(hex.slice(4,6),16)]
      : fallback;
  }

  const pdfAnnotations=Array.isArray(ANNOTATIONS)?ANNOTATIONS:[];
  if(showPropDividers){
    pdfAnnotations.filter(ann=>ann.type==='divider').forEach(ann=>{
      const rid=String(ann.beforeRid||ann.afterRid||'');
      if(rowIndex.has(rid)) addToMap(propByRid,rid,ann);
    });
  }
  if(showSectionDividers){
    pdfAnnotations.filter(ann=>ann.type==='section').forEach(ann=>{
      const start=rowIndex.get(String(ann.startRid)),end=rowIndex.get(String(ann.endRid));
      if(start===undefined||end===undefined) return;
      const first=Math.min(start,end),last=Math.max(start,end);
      const section={...ann,first,last};
      addToMap(sectionStartsByRid,String(rowEls[first].dataset.rid),section);
      for(let index=first;index<=last;index++) addToMap(sectionsByRid,String(rowEls[index].dataset.rid),section);
    });
  }
  const maxSectionDepth=Math.max(1,...[...sectionsByRid.values()].map(sections=>sections.length));
  const annotationX=SECTION_RAIL_X+(maxSectionDepth-1)*SECTION_RAIL_STRIDE+SECTION_RAIL_W+ANNOTATION_GAP;
  function sectionLane(section,rid){
    const lane=(sectionsByRid.get(rid)||[]).indexOf(section);
    return lane<0?0:lane;
  }
  function sectionRailX(lane){return SECTION_RAIL_X+lane*SECTION_RAIL_STRIDE;}
  function annotationHeight(rid){
    const sectionH=(sectionStartsByRid.get(rid)||[]).length*SECTION_H;
    const propH=(propByRid.get(rid)||[]).reduce((sum,ann)=>sum+(String(ann.label||'').trim()?PROP_LABEL_H:PROP_PLAIN_H),0);
    return sectionH+propH;
  }
  function drawSectionHeader(section,y,lane){
    const color=annotationColor(section.color,[83,74,183]);
    const railX=sectionRailX(lane),ruleY=y+SECTION_H-3;
    // Starting the rule at the rail makes the title and its continuous
    // section marker read as one visual unit.
    doc.setDrawColor(...color);doc.setLineWidth(1);doc.line(railX,ruleY,MAR+usableW,ruleY);
    const label=String(section.label||'').trim();
    if(label){
      doc.setFont(fnFont,'normal');doc.setFontSize(8);doc.setTextColor(...color);
      // The embedded Unicode face has no bold variant. A light second pass
      // gives every label (including Hebrew/Greek) the same bold treatment.
      doc.text(label,annotationX,y+9,{isInputVisual:false});
      doc.text(label,annotationX+.28,y+9,{isInputVisual:false});
    }
  }
  function drawPropDivider(ann,y){
    const height=String(ann.label||'').trim()?PROP_LABEL_H:PROP_PLAIN_H;
    const color=annotationColor(ann.color,[200,168,75]);
    const label=String(ann.label||'').trim();
    if(label){
      doc.setFont(fnFont,'normal');doc.setFontSize(7.5);doc.setTextColor(...color);
      doc.text(label,annotationX,y+8,{isInputVisual:false});
    }
    doc.setDrawColor(...color);doc.setLineWidth(.65);doc.line(annotationX,y+height-2,MAR+usableW,y+height-2);
    return height;
  }
  function drawSectionGutters(rid,annotationY,rowY,rowH,sectionHeaders){
    const headerY=new Map(sectionHeaders.map(header=>[header.section,header.y]));
    const railEndY=rowY+rowH;
    (sectionsByRid.get(rid)||[]).forEach((section,index)=>{
      const color=annotationColor(section.color,[83,74,183]);
      doc.setFillColor(...color);
      // Existing sections carry directly from the previous row. A new
      // section begins at its title rule, leaving the title-height space
      // clear so adjacent sections do not read as one uninterrupted rail.
      const headerStartY=headerY.get(section);
      const railStartY=headerStartY===undefined?annotationY:headerStartY+SECTION_H-3;
      doc.rect(sectionRailX(index),railStartY,SECTION_RAIL_W,Math.max(1,railEndY-railStartY),'F');
    });
  }
  function drawRowAnnotations(rid,y){
    let nextY=y;
    const sectionHeaders=[];
    (sectionStartsByRid.get(rid)||[]).forEach(section=>{
      const lane=sectionLane(section,rid);
      sectionHeaders.push({section,y:nextY});
      drawSectionHeader(section,nextY,lane);nextY+=SECTION_H;
    });
    (propByRid.get(rid)||[]).forEach(ann=>{nextY+=drawPropDivider(ann,nextY);});
    return {rowY:nextY,sectionHeaders};
  }

  let curY=drawColHeaders(drawPageHeader(MAR+12));
  let rowIdx=0,pageFns=[];
  update(0,'Exporting PDF…');

  for(const row of rowEls){
    const rid=row.dataset.rid;
    const verse=row.querySelector('.vin')?.value||'';
    const lineId=row.querySelector('.lid')?.textContent||'';
    const cleanLineId=lineId==='—'?'':lineId;
    const orig=row.querySelector('#oc-'+rid+' .cedit');
    const trans=row.querySelector('#tc-'+rid+' .cedit');
    const cid=row.dataset.cid;
    const footnoteText=stripHtml(_pdfCommentHtml(cid));
    const footnote=footnoteText?{lineId:cleanLineId||verse,text:footnoteText}:null;

    await _pdfNextPaint();
    const snapshot=await _pdfPhrasingRowSnapshot(orig,trans,layout);
    const natW=snapshot?(snapshot.canvas.width/snapshot.scale)*PT_PX:tableBodyW;
    const imageH=snapshot?(snapshot.canvas.height/snapshot.scale)*PT_PX*(tableBodyW/natW):0;
    const rowH=Math.max(MIN_H,imageH+ROW_PAD*2);
    const annH=annotationHeight(String(rid));
    const reserved=fnZoneH(footnote?[...pageFns,footnote]:pageFns);
    if(curY+annH+rowH>pH-MAR-reserved){
      drawFns(pageFns);doc.addPage();curY=drawColHeaders(drawPageHeader(MAR+12));pageFns=[];
    }
    if(footnote?.text) pageFns.push(footnote);

    const annotationY=curY;
    const rowAnnotations=drawRowAnnotations(String(rid),curY);
    curY=rowAnnotations.rowY;

    doc.setFillColor(255,255,255);doc.rect(MAR,curY,usableW,rowH,'F');
    drawSectionGutters(String(rid),annotationY,curY,rowH,rowAnnotations.sectionHeaders);
    const previous=rowIdx?rowEls[rowIdx-1].querySelector('.vin')?.value:null;
    if(verse&&verse!==previous){doc.setFont('helvetica','bold');doc.setFontSize(10);doc.setTextColor(...SIG);doc.text(verse,MAR+vWpt/2,curY+rowH/2+3,{align:'center'});}
    doc.setFont('helvetica','normal');doc.setFontSize(10);doc.setTextColor(...ACC);
    if(cleanLineId) doc.text(cleanLineId,MAR+vWpt+lWpt/2,curY+rowH/2+3,{align:'center'});
    if(snapshot) doc.addImage(snapshot.canvas.toDataURL('image/jpeg',.92),'JPEG',MAR+vWpt+lWpt,curY+ROW_PAD,tableBodyW,imageH);

    curY+=rowH;rowIdx++;
    update(Math.round((rowIdx/Math.max(1,rowEls.length))*90),'Rendering row '+rowIdx+' of '+rowEls.length+'…');
  }
  drawFns(pageFns);
  const lastFnZone=fnZoneH(pageFns);
  _drawPdfCitation(doc,lastFnZone?Math.max(curY,pH-MAR-lastFnZone):curY,MAR,usableW,pH);
  if(studyNotebookIncludeInPdf()) appendStudyNotebookPDF(doc);
  return doc;
}

function studyNotebookIncludeInPdf(){return !!document.getElementById('export-study-notebook')?.checked&&STUDY_NOTEBOOK.length>0;}
function appendStudyNotebookPDF(doc){
  const margin=36,width=doc.internal.pageSize.getWidth()-margin*2,height=doc.internal.pageSize.getHeight(),stageGroups=STUDY_STAGES.map(stage=>[stage,STUDY_NOTEBOOK.filter(note=>note.stage===stage)]).filter(([,notes])=>notes.length);
  if(!stageGroups.length)return;
  doc.addPage();let y=margin;
  const pageHeader=()=>{doc.setFont('helvetica','bold');doc.setFontSize(18);doc.setTextColor(73,53,72);doc.text(typeof t==='function'?t('study.notebook.title'):'Study Notebook',margin,y);y+=26;};
  const ensure=need=>{if(y+need>height-margin){doc.addPage();y=margin;pageHeader();}};
  pageHeader();
  for(const [stage,notes] of stageGroups){
    ensure(28);doc.setFont('helvetica','bold');doc.setFontSize(11);doc.setTextColor(200,168,75);doc.text(_studyStageLabel(stage).toUpperCase(),margin,y);y+=16;
    for(const note of notes){
      const title=_studyStripHtml(note.title)||_studyStageLabel(stage);
      const body=_studyStripHtml(note.bodyHTML)||'';
      const links=(note.attachments||[]).map(link=>link.label).filter(Boolean).join(' · ');
      const titleLines=doc.splitTextToSize(title,width),bodyLines=body?doc.splitTextToSize(body,width):[],linkLines=links?doc.splitTextToSize(links,width):[];
      const need=titleLines.length*13+bodyLines.length*12+linkLines.length*10+18;ensure(Math.min(need,height-margin*2));
      doc.setFont('helvetica','bold');doc.setFontSize(10);doc.setTextColor(31,30,30);doc.text(titleLines,margin,y);y+=titleLines.length*13;
      if(bodyLines.length){doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(55,52,50);doc.text(bodyLines,margin,y);y+=bodyLines.length*12;}
      if(linkLines.length){doc.setFont('helvetica','italic');doc.setFontSize(8);doc.setTextColor(120,98,35);doc.text(linkLines,margin,y);y+=linkLines.length*10;}
      y+=8;
    }
    y+=4;
  }
}

async function _capturePhrasingPDFBlob(ref){
  const doc=await _buildPhrasingPDF(ref);
  return doc.output('blob');
}

function exportPDF(){
  const refEl=document.getElementById('refin');
  let ref=refEl.value.trim();
  if(!ref){
    const entered=prompt(typeof t==='function'?t('prompt.export-ref'):'Enter the verse reference before exporting.\n\nExample: John 1:1–10');
    if(!entered||!entered.trim()){toast(typeof t==='function'?t('toast.export-cancel'):'Export cancelled — verse reference required');return;}
    ref=entered.trim();refEl.value=ref;autoSave();
  }
  showProgress(0,'Exporting PDF…');
  _buildPhrasingPDF(ref,(pct,label)=>showProgress(pct,label))
    .then(doc=>{
      showProgress(95,'Saving PDF…');
      doc.save(buildFilename(ref)+' Phrasing.pdf');
      toast((typeof t==='function'?t('toast.pdf-done'):'Downloaded: ')+buildFilename(ref)+' Phrasing.pdf');
    })
    .catch(err=>{toast((typeof t==='function'?t('toast.pdf-error'):'Export error: ')+err.message);console.error(err);})
    .finally(()=>hideProgress());
}

/* ════════════════════════════════════════
   PDF EXPORT
   Font pre-loaded at session start (instant).
   Each cell rendered via html2canvas so all
   formatting — font colors, bold, highlights —
   is preserved exactly as seen on screen.
════════════════════════════════════════ */
function exportPDFLegacy(){
  // 1. Require verse reference
  const refEl=document.getElementById('refin');
  let ref=refEl.value.trim();
  if(!ref){
    const entered=prompt(typeof t==='function'?t('prompt.export-ref'):'Enter the verse reference before exporting.\n\nExample: John 1:1\u201310');
    if(!entered||!entered.trim()){toast(typeof t==='function'?t('toast.export-cancel'):'Export cancelled — verse reference required');return;}
    ref=entered.trim(); refEl.value=ref; autoSave();
  }

  // 2. Filename
  function buildFilename(r){
    let s=r.replace(/[\u2013\u2014]/g,'-').replace(/\s+/g,' ').trim();
    const m=s.match(/^(.+?)\s+(\d+)(?:[:\.](\d+)(?:\s*-\s*(\d+))?)?/);
    if(!m) return s.replace(/[^\w ]/g,'_')+' Phrasing';
    const book=m[1].trim(),chap=m[2],vS=m[3],vE=m[4];
    if(vS&&vE) return `${book} ${chap}_${vS}-${vE} Phrasing`;
    if(vS)     return `${book} ${chap}_${vS} Phrasing`;
    return `${book} ${chap} Phrasing`;
  }
  const fname=buildFilename(ref);

  toast(typeof t==='function'?t('toast.building-pdf'):'Building PDF…');

  const {jsPDF}=window.jspdf;
  const orientation=IS_SINGLE?'portrait':'landscape';
  const doc=new jsPDF({orientation,unit:'pt',format:'a4'});

  const pW=doc.internal.pageSize.getWidth();
  const pH=doc.internal.pageSize.getHeight();
  const MAR=28;
  const usableW=pW-MAR*2;
  const PT_PX=72/96; // 0.75 — converts screen px to PDF points

  // Read actual rendered column widths from the DOM so PDF matches the editor.
  // Fall back to proportional defaults if columns haven't been resized.
  const vWpt=26, lWpt=32, bodyWpt=usableW-vWpt-lWpt;

  function getColPts(){
    const chO=document.getElementById('ch-o');
    const chT=document.getElementById('ch-t');
    const ocEl=document.querySelector('[id^="oc-"]');
    const tcEl=document.querySelector('[id^="tc-"]');

    // Measure the actual pixel widths of orig and trans columns
    const oPx = (COL_WIDTHS.o) || (ocEl ? ocEl.offsetWidth : null);
    const tPx = (!IS_SINGLE && COL_WIDTHS.t) || (!IS_SINGLE && tcEl ? tcEl?.offsetWidth : null);

    if(oPx){
      // We have real measurements — convert px→pt and scale to fit usableW
      const rawOpt = oPx * PT_PX;
      const rawTpt = (tPx && !IS_SINGLE) ? tPx * PT_PX : 0;
      const rawCpt = bodyWpt - rawOpt - rawTpt;
      // Clamp negatives — if columns are wider than the page, redistribute
      const oFinal = Math.max(40, rawOpt);
      const tFinal = IS_SINGLE ? 0 : Math.max(IS_SINGLE?0:40, rawTpt);
      const cFinal = Math.max(30, bodyWpt - oFinal - tFinal);
      if(IS_SINGLE) return [vWpt, lWpt, oFinal, cFinal];
      return [vWpt, lWpt, oFinal, tFinal, cFinal];
    }
    // Default proportional fallback
    if(IS_SINGLE) return [vWpt,lWpt,Math.round(bodyWpt*0.65),Math.round(bodyWpt*0.35)];
    return [vWpt,lWpt,Math.round(bodyWpt*0.37),Math.round(bodyWpt*0.33),Math.round(bodyWpt*0.30)];
  }

  const colPts = getColPts();

  const SIG=[73,53,72], ACC=[200,168,75];
  const HDR_H=18, ROW_PAD=4, MIN_H=22;

  // Draw page header + column labels
  function drawPageHeader(y){
    doc.setFont('helvetica','bold'); doc.setFontSize(15);
    doc.setTextColor(31,30,30); doc.text(ref,MAR,y);
    doc.setFont('helvetica','normal'); doc.setFontSize(8);
    doc.setTextColor(168,159,144);
    doc.text(LANG+' \u00B7 Exegetical Phrasing',MAR,y+12);
    return y+24;
  }

  function drawColHeaders(y){
    doc.setFillColor(...SIG);
    doc.rect(MAR,y,usableW,HDR_H,'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(7);
    doc.setTextColor(247,243,233);
    // Header: Verse | Line | Orig (flexible) | Translation (right-remainder)
    // We don't know per-row widths at header time, so use the page proportions
    const tableBodyW=usableW-vWpt-lWpt;
    const origHdrW=IS_SINGLE?tableBodyW:Math.round(tableBodyW*0.6);
    const transHdrW=IS_SINGLE?0:tableBodyW-origHdrW;
    const labels=IS_SINGLE
      ?['VERSE','LINE',LANG.toUpperCase()+' TEXT']
      :['VERSE','LINE',LANG.toUpperCase()+' TEXT','TRANSLATION'];
    const hdrW=IS_SINGLE?[vWpt,lWpt,origHdrW]:[vWpt,lWpt,origHdrW,transHdrW];
    let cx=MAR;
    hdrW.forEach((w,i)=>{doc.text(labels[i]||'',cx+3,y+HDR_H/2+2.5); cx+=w;});
    return y+HDR_H;
  }

  const PDF_SCALE=2;

  // Capture a cedit element at its NATURAL screen width (no reflow).
  // Returns {canvas, scale, naturalWidthPt} — caller decides how wide to place it.
  async function cellToImg(el){
    if(!el||!el.innerText.trim()) return null;

    // Capture at the element's current rendered width — no forced reflow.
    // This preserves indentation exactly as the user sees it on screen.
    const naturalPx = el.offsetWidth || 400;

    let canvas;
    try {
      canvas = await html2canvas(el, {
        scale:           PDF_SCALE,
        useCORS:         true,
        allowTaint:      true,
        backgroundColor: '#ffffff',
        logging:         false,
        width:           naturalPx,
        windowWidth:     window.innerWidth
      });
    } catch(e){ return null; }

    // How wide is this image in PDF points?
    const naturalWidthPt = (canvas.width / PDF_SCALE) * PT_PX;
    return {canvas, scale: PDF_SCALE, naturalWidthPt};
  }

  async function run(){
    // ── Footnote helpers ──────────────────────
    const FN_LINE_H=13, FN_GAP=5, FN_SEP_H=10;
    const rowEls=_realRows();
    const totalRows=rowEls.length;

    showProgress(0,'Exporting PDF…');

    // Footnote text is pulled from user comments, which routinely quote the
    // Hebrew/Greek source text — needs a Unicode-capable font (see
    // _embedPdfUnicodeFont), not jsPDF's Latin-only built-ins.
    const FN_FONT=await _embedPdfUnicodeFont(doc);

    function stripHtml(html){
      return html
        .replace(/<br\s*\/?>/gi,' ').replace(/<\/p>/gi,' ').replace(/<\/div>/gi,' ')
        .replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&')
        .replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
    }
    // Estimate height of one footnote. Use char-count heuristic — no font API needed.
    function fnH(fn){
      const charsPerLine=Math.floor(usableW/5.5);
      const lines=Math.ceil((fn.text.length||1)/charsPerLine);
      return lines*FN_LINE_H+FN_GAP;
    }
    // Total reserved zone for a list of footnotes
    function fnZoneH(fns){
      if(!fns.length)return 0;
      return FN_SEP_H+fns.reduce((s,fn)=>s+fnH(fn),0);
    }
    // Draw separator + footnotes pinned to bottom of page; return nothing
    function drawFns(fns){
      if(!fns.length)return;
      const zone=fnZoneH(fns);
      let y=pH-MAR-zone;
      doc.setDrawColor(...SIG);doc.setLineWidth(0.4);
      doc.line(MAR,y,MAR+usableW*0.3,y);
      y+=6;
      fns.forEach(fn=>{
        const labelW=fn.lineId.length*4.5+4; // wider at 9pt
        doc.setFontSize(9);doc.setFont('helvetica','bold');doc.setTextColor(73,53,72);
        doc.text(fn.lineId,MAR,y+FN_LINE_H-3);
        doc.setFontSize(10);doc.setFont(FN_FONT,'normal');doc.setTextColor(31,30,30);
        const charsPerLine=Math.floor((usableW-labelW)/5.5);
        const words=fn.text.split(' ');
        const drawnLines=[];let line='';
        words.forEach(w=>{
          const test=line?line+' '+w:w;
          if(test.length>charsPerLine&&line){drawnLines.push(line);line=w;}
          else line=test;
        });
        if(line)drawnLines.push(line);
        // isInputVisual:false — see the identical note in
        // _capturePhrasingPDFBlob's drawFns: this text is stored in normal
        // reading (logical) order, and jsPDF's default assumption
        // otherwise corrupts any line containing Hebrew by reversing the
        // whole line, English portions included.
        drawnLines.forEach((l,i)=>{doc.text(l,MAR+labelW,y+FN_LINE_H+i*FN_LINE_H-3,{isInputVisual:false});});
        y+=Math.max(1,drawnLines.length)*FN_LINE_H+FN_GAP;
      });
    }

    // ── Main render ───────────────────────────
    let curY=drawPageHeader(MAR+12);
    curY=drawColHeaders(curY);
    let rowIdx=0;
    let pageFns=[];

    for(const row of rowEls){
      const rid=row.dataset.rid;
      const vi=row.querySelector('.vin');
      const lid=row.querySelector('.lid');
      const oc=row.querySelector('#oc-'+rid+' .cedit');
      const tc=row.querySelector('#tc-'+rid+' .cedit');
      const cid=row.dataset.cid;
      const cmtEl=cid?document.querySelector('.ccard[data-cid="'+cid+'"] .cedit-c'):null;

      const verse=vi?vi.value:'';
      const lineid=(lid&&lid.textContent!=='—')?lid.textContent:'';

      let thisFn=null;
      if(cmtEl&&cmtEl.innerText.trim()){
        const txt=stripHtml(cmtEl.innerHTML);
        if(txt)thisFn={lineId:lineid||verse,text:txt};
      }

      // Render cells at natural screen width — no forced reflow, preserves indentation
      const richEls=IS_SINGLE?[oc]:[oc,tc];
      const tableBodyW=usableW-vWpt-lWpt;
      const MIN_TRANS=60; // minimum translation column pt width

      const canvases=await Promise.all(
        richEls.map(el=>el?cellToImg(el):Promise.resolve(null))
      );

      // Calculate display widths: orig uses its natural width (capped at page),
      // translation takes whatever is left.
      const displayWidths=[];
      canvases.forEach((obj,i)=>{
        if(IS_SINGLE){ displayWidths.push(tableBodyW); return; }
        if(i===0){
          // Orig: natural width scaled to fit within available space
          const natPt=obj?obj.naturalWidthPt:tableBodyW-MIN_TRANS;
          displayWidths.push(Math.min(Math.max(natPt,60), tableBodyW-MIN_TRANS));
        } else {
          // Trans: remainder
          displayWidths.push(Math.max(MIN_TRANS, tableBodyW-displayWidths[0]));
        }
      });

      let rowH=MIN_H;
      canvases.forEach((obj,i)=>{
        if(!obj) return;
        const {canvas,scale:ps}=obj;
        const natPt=(canvas.width/ps)*PT_PX;
        const scaleFactor=displayWidths[i]/natPt;
        const h=(canvas.height/ps)*PT_PX*scaleFactor + ROW_PAD*2;
        if(h>rowH) rowH=h;
      });

      // Page-break check: reserve space for current pageFns + this row's fn
      const futureFns=thisFn?[...pageFns,thisFn]:pageFns;
      const reserved=fnZoneH(futureFns);
      // Safe bottom = page bottom minus margin minus footnote zone
      const safeBottom=pH-MAR-reserved;

      if(curY+rowH>safeBottom){
        drawFns(pageFns);
        doc.addPage();
        curY=drawPageHeader(MAR+12);
        curY=drawColHeaders(curY);
        pageFns=[];
      }
      if(thisFn)pageFns.push(thisFn);

      // Draw row
      doc.setFillColor(255,255,255);
      doc.rect(MAR,curY,usableW,rowH,'F');

      const prevVerse=rowIdx>0?rowEls[rowIdx-1].querySelector('.vin')?.value:null;
      if(verse&&verse!==prevVerse){
        doc.setFont('helvetica','bold');doc.setFontSize(10);doc.setTextColor(...SIG);
        doc.text(verse,MAR+vWpt/2,curY+rowH/2+3,{align:'center'});
      }
      doc.setFont('helvetica','normal');doc.setFontSize(10);doc.setTextColor(...ACC);
      if(lineid)doc.text(lineid,MAR+vWpt+lWpt/2,curY+rowH/2+3,{align:'center'});

      let cx=MAR+vWpt+lWpt;
      canvases.forEach((obj,i)=>{
        if(obj){
          const {canvas,scale:ps}=obj;
          const imgW=displayWidths[i];
          const natPt=(canvas.width/ps)*PT_PX;
          const scaleFactor=imgW/natPt;
          const imgH=(canvas.height/ps)*PT_PX*scaleFactor;
          doc.addImage(canvas.toDataURL('image/jpeg',0.92),'JPEG',cx+3,curY+ROW_PAD,imgW-3,imgH);
        }
        cx+=displayWidths[i];
      });

      curY+=rowH;
      rowIdx++;
      // Update progress bar: rows are 80% of the work, saving is the last 20%
      showProgress(Math.round((rowIdx/totalRows)*80), 'Rendering row '+rowIdx+' of '+totalRows+'…');
    }

    // Flush last page footnotes
    drawFns(pageFns);
    // Source citation, if any — placed below whichever sits lower on the
    // last page: the row content or the pinned-to-bottom footnote zone.
    const lastFnZone=fnZoneH(pageFns);
    _drawPdfCitation(doc, lastFnZone?Math.max(curY,pH-MAR-lastFnZone):curY, MAR, usableW, pH);

    showProgress(95,'Saving PDF…');
    doc.save(fname+'.pdf');
    hideProgress();
    toast((typeof t==='function'?t('toast.pdf-done'):'Downloaded: ')+fname+'.pdf');
  }
  run().catch(err=>{ hideProgress(); toast((typeof t==='function'?t('toast.pdf-error'):'Export error: ')+err.message); console.error(err); });
}

/* ════════════════════════════════════════
   PROGRESS BAR
════════════════════════════════════════ */
function showProgress(pct, label){
  const bar=document.getElementById('pdf-progress');
  const fill=document.getElementById('pdf-progress-fill');
  const pctEl=document.getElementById('pdf-pct');
  const lbl=bar.querySelector('#pdf-progress-label span:first-child');
  bar.classList.add('show');
  fill.style.width=Math.min(100,Math.round(pct))+'%';
  pctEl.textContent=Math.min(100,Math.round(pct))+'%';
  if(label) lbl.textContent=label;
}
function hideProgress(){
  document.getElementById('pdf-progress').classList.remove('show');
}
let tT=null;
function toast(msg){
  const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');
  document.getElementById('stbar').textContent=msg;
  clearTimeout(tT);tT=setTimeout(()=>{el.classList.remove('show');document.getElementById('stbar').textContent=(typeof t==='function'?t('stbar.ready'):'Ready');},3000);
}

/* ════════════════════════════════════════
   BRACKETING SYSTEM — Diagram View only
   ───────────────────────────────────────
   Brackets are anchored to ROW IDs.
   They render as SVG beside diagram blocks.
   X position = rightmost block right-edge
   among all rows spanned by the bracket.
   Shift+click block pip → second Shift+click
   → bracket created with inline label prompt.
   All brackets refresh live during block drag.
   Undo/redo integrated via ROW_STACK.
════════════════════════════════════════ */

/* ── State ── */
let BRACKETS       = [];    // [{id,startRid,endRid,label,color,thickness,lane}]
let BRACKET_PENDING= null;  // {rid, pipEl} | null — after first Shift+click
let SELECTED_BRK_ID= null;  // id of currently selected bracket
let BRK_CTR        = 0;     // ever-incrementing id seed

const BRK_PIP_OFFSET = 8;   // px gap between block right edge and the bracket line
const BRK_LANE_W     = 22;  // px per lane (for stacked brackets)
const BRK_SERIF_W    = 7;   // px width of top/bottom serifs
const BRK_LABEL_GAP  = 5;   // px between bracket line and label text

/* ── Compute X position of a bracket in canvas-local px ──
   Finds the rightmost right-edge among all .dblock elements
   in the spanned row range. */
function _brkComputeX(startRid, endRid, lane){
  const canvas = document.getElementById('dcanvas');
  if(!canvas) return 200;
  const canvasRect = canvas.getBoundingClientRect();
  const zoom = DIAGRAM_ZOOM / 100;

  const rows  = Array.from(document.querySelectorAll('.xrow'));
  const rids  = rows.map(r=>r.dataset.rid);
  const si    = rids.indexOf(String(startRid));
  const ei    = rids.indexOf(String(endRid));
  if(si<0||ei<0) return 200;
  const lo = Math.min(si,ei), hi = Math.max(si,ei);
  const spannedRids = rids.slice(lo, hi+1);

  let maxRight = 0;
  spannedRids.forEach(rid=>{
    const block = canvas.querySelector(`.dblock[data-rid="${rid}"]`);
    if(!block) return;
    const r = block.getBoundingClientRect();
    const right = (r.right - canvasRect.left) / zoom;
    if(right > maxRight) maxRight = right;
  });

  // lane 1 = closest to blocks, higher lanes step right
  return maxRight + BRK_PIP_OFFSET + (lane-1)*BRK_LANE_W;
}

/* ── Lane assignment ── */
/* ════════════════════════════════════════
   BRACKET LANE ASSIGNMENT — Stage 2
   Containment-aware nesting:
   • Inner brackets (fully contained by another) get lower lane numbers
     (closer to blocks — left side)
   • Outer brackets get higher lane numbers (further right)
   • Partial overlaps get different lanes side-by-side (Stage 1 behaviour)
   
   Algorithm:
   1. Build span indices [lo,hi] for every bracket
   2. Sort by span size: narrowest first → these are innermost, get lane 1
   3. Assign lanes greedily: bracket gets lowest lane with no conflict
      among already-assigned brackets in that lane
   4. Store result back into brk.lane; caller re-renders
════════════════════════════════════════ */

function _brkReassignAllLanes(){
  if(!BRACKETS.length) return;
  const rows=Array.from(document.querySelectorAll('.xrow'));
  const rids=rows.map(r=>r.dataset.rid);

  // Build spans
  const spans=BRACKETS.map(brk=>{
    const si=rids.indexOf(String(brk.startRid));
    const ei=rids.indexOf(String(brk.endRid));
    if(si<0||ei<0) return {brk,lo:0,hi:0,size:0};
    const lo=Math.min(si,ei), hi=Math.max(si,ei);
    return {brk, lo, hi, size: hi-lo};
  });

  // Sort: narrowest span first (innermost → lane 1 = closest to blocks)
  spans.sort((a,b)=>a.size-b.size);

  // Greedy lane assignment: find the lowest lane with no conflicting bracket
  const laneOccupants={}; // lane → [{lo,hi}]
  spans.forEach(({brk,lo,hi})=>{
    for(let lane=1;lane<=20;lane++){
      const occupants=laneOccupants[lane]||[];
      const conflict=occupants.some(o=>!(hi<o.lo||lo>o.hi));
      if(!conflict){
        brk.lane=lane;
        laneOccupants[lane]=[...(laneOccupants[lane]||[]),{lo,hi}];
        return;
      }
    }
    brk.lane=1; // fallback
  });
}

/* ── Assign lane for a single new bracket (called at creation time),
   then immediately re-assign all lanes for nesting correctness ── */
function _brkAssignLane(startRid, endRid){
  // Return a temporary lane of 1; _brkReassignAllLanes will correct it
  // after the bracket is pushed to BRACKETS
  return 1;
}

/* ── Render brackets into a cloned #dcanvas for PDF export ──

/* ── Pips are now part of each .drow — no rail, no position sync needed ── */
function _brkSyncPips(){ /* no-op: pips render in makeDiagramRowEl */ }

/* ── Handle Shift+click on a block ── */
function _brkHandleClick(rid, pipEl){
  if(!BRACKET_PENDING){
    BRACKET_PENDING = {rid, pipEl};
    pipEl.classList.add('brk-pending');
    document.body.classList.add('brk-active');
    const stbar = document.getElementById('stbar');
    if(stbar){ stbar.textContent=t('bracket.start-hint'); stbar.classList.add('stbar-brk'); }
  } else {
    const startRid = BRACKET_PENDING.rid;
    const endRid   = rid;
    _brkCancelPending();
    if(startRid===endRid){ toast(t('bracket.cancel')); return; }
    // Exit locked mode after completing a bracket
    if(document.body.classList.contains('brk-locked')) _brkExitLockedMode();
    _brkCreate(startRid, endRid);
  }
}

/* ── Cancel pending first-click ── */
function _brkCancelPending(){
  if(!BRACKET_PENDING) return;
  BRACKET_PENDING.pipEl.classList.remove('brk-pending');
  BRACKET_PENDING = null;
  document.body.classList.remove('brk-active');
  const stbar = document.getElementById('stbar');
  if(stbar){ stbar.textContent=t('stbar.ready'); stbar.classList.remove('stbar-brk'); }
}

/* ── Create bracket, push to undo stack ── */
function _brkCreate(startRid, endRid){
  const id   = 'brk-'+(++BRK_CTR);
  const brk  = {id, startRid, endRid, label:'', color:'#493548', thickness:1, lane:1, labelOffsetY:0};
  BRACKETS.push(brk);
  _brkReassignAllLanes(); // re-sort all lanes with nesting awareness
  rowPush({type:'brk-add', brk:{...brk}});
  refreshBrackets();
  autoSave();
}

/* ── Measure label pixel width using a canvas context (no DOM needed) ── */
let _brkMeasureCtx = null;
function _brkMeasureLabelWidth(text){
  if(!text) return 0;
  if(!_brkMeasureCtx){
    const c = document.createElement('canvas');
    _brkMeasureCtx = c.getContext('2d');
    _brkMeasureCtx.font = '600 11px var(--ui, system-ui, sans-serif)';
  }
  return Math.ceil(_brkMeasureCtx.measureText(text).width);
}

/* ── Main render entry point ── */
function refreshBrackets(){
  if(EDITOR_VIEW==='diagram') _brkRenderDiagram();
}

/* ── Render all brackets into #dbrk-svg ── */
function _brkRenderDiagram(){
  _brkSyncPips();

  let dsvg = document.getElementById('dbrk-svg');
  if(dsvg) dsvg.remove();
  if(!BRACKETS.length) return;

  const canvas = document.getElementById('dcanvas');
  if(!canvas) return;
  const canvasRect = canvas.getBoundingClientRect();
  const zoom = DIAGRAM_ZOOM / 100;

  dsvg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  dsvg.id = 'dbrk-svg';
  dsvg.setAttribute('preserveAspectRatio','none');
  canvas.appendChild(dsvg);

  // Pre-compute rows list once
  const rows = Array.from(document.querySelectorAll('.xrow'));
  const rids = rows.map(r=>r.dataset.rid);

  // Rightmost edge among a bracket's spanned rows — checks BOTH the
  // Greek/Hebrew block AND its translation (a separate sibling element,
  // not nested inside the block, with its own independent width), since a
  // translation longer than the original-text line was previously
  // invisible to this calculation and could overlap the bracket.
  function brkMaxRight(brk){
    const si = rids.indexOf(String(brk.startRid));
    const ei = rids.indexOf(String(brk.endRid));
    if(si<0||ei<0) return null;
    const lo = Math.min(si,ei), hi = Math.max(si,ei);
    let maxRight = 0;
    rids.slice(lo, hi+1).forEach(rid=>{
      const block = canvas.querySelector(`.dblock[data-rid="${rid}"]`);
      if(block){
        const r = block.getBoundingClientRect();
        const right = (r.right - canvasRect.left) / zoom;
        if(right > maxRight) maxRight = right;
      }
      const drow = canvas.querySelector(`.drow[data-rid="${rid}"]`);
      const trans = drow ? drow.querySelector('.dblock-trans') : null;
      if(trans){
        const tr = trans.getBoundingClientRect();
        const transRight = (tr.right - canvasRect.left) / zoom;
        if(transRight > maxRight) maxRight = transRight;
      }
    });
    return maxRight;
  }

  // Per-bracket X (NOT per-lane): each bracket's own natural baseX comes
  // from its OWN blocks. Brackets sharing a lane never overlap in row
  // range (that's what _brkReassignAllLanes guarantees), so they must
  // never push each other — only a genuine step to a NEW, higher lane
  // (nested/overlapping brackets needing to clear an inner lane's label)
  // should shift X rightward. The previous version keyed a single shared
  // X per lane number and chained the "clear the previous label" push
  // across every bracket regardless of lane, so adding any new same-lane
  // bracket kept shoving every earlier bracket's shared X further right.
  const bracketX = new Map();
  const sorted = [...BRACKETS].sort((a,b)=>a.lane-b.lane);
  let prevLane = null, prevLaneMaxX = null, prevLaneMaxLabelW = 0;
  let curLaneMaxX = null, curLaneMaxLabelW = 0;

  sorted.forEach(brk=>{
    const maxRight = brkMaxRight(brk);
    if(maxRight===null) return;
    const baseX = maxRight + BRK_PIP_OFFSET + BRK_LANE_W * 0.5;

    if(brk.lane !== prevLane){
      if(prevLane !== null){ prevLaneMaxX = curLaneMaxX; prevLaneMaxLabelW = curLaneMaxLabelW; }
      curLaneMaxX = null; curLaneMaxLabelW = 0;
      prevLane = brk.lane;
    }

    const laneX = prevLaneMaxX === null
      ? baseX
      : Math.max(baseX, prevLaneMaxX + (prevLaneMaxLabelW > 0 ? prevLaneMaxLabelW + BRK_LABEL_GAP + 20 : BRK_LANE_W));

    bracketX.set(brk.id, laneX);
    curLaneMaxX = curLaneMaxX===null ? laneX : Math.max(curLaneMaxX, laneX);
    curLaneMaxLabelW = Math.max(curLaneMaxLabelW, _brkMeasureLabelWidth(brk.label));
  });

  // Now draw each bracket using its own computed X
  BRACKETS.forEach(brk=>{
    const si = rids.indexOf(String(brk.startRid));
    const ei = rids.indexOf(String(brk.endRid));
    if(si<0||ei<0) return;
    const lo = Math.min(si,ei), hi = Math.max(si,ei);

    const startDrow = canvas.querySelector(`.drow[data-rid="${rids[lo]}"]`);
    const endDrow   = canvas.querySelector(`.drow[data-rid="${rids[hi]}"]`);
    if(!startDrow||!endDrow) return;

    const sRect = startDrow.getBoundingClientRect();
    const eRect = endDrow.getBoundingClientRect();
    const yStart = (sRect.top    - canvasRect.top) / zoom;
    const yEnd   = (eRect.bottom - canvasRect.top) / zoom;

    const laneX = bracketX.get(brk.id) ?? (100 + (brk.lane-1)*BRK_LANE_W);
    _brkDrawSVG(dsvg, brk, laneX, yStart, yEnd);
  });
}

/* ── Draw one bracket with draggable label and resizable serifs ── */
function _brkDrawSVG(svg, brk, laneX, yStart, yEnd){
  const c   = brk.color||'#493548';
  const sw  = brk.thickness||2;
  const sel = brk.id===SELECTED_BRK_ID;
  const cls = 'brk-line'+(sel?' brk-selected':'');

  // Label Y: midpoint + user's drag offset, clamped inside bracket span
  const midY     = (yStart+yEnd)/2;
  const rawLabelY= midY + (brk.labelOffsetY||0);
  const labelY   = Math.max(yStart+2, Math.min(yEnd-2, rawLabelY));

  const g = document.createElementNS('http://www.w3.org/2000/svg','g');
  g.dataset.brkId = brk.id;

  function ln(x1,y1,x2,y2){
    const l=document.createElementNS('http://www.w3.org/2000/svg','line');
    l.setAttribute('x1',x1); l.setAttribute('y1',y1);
    l.setAttribute('x2',x2); l.setAttribute('y2',y2);
    l.setAttribute('stroke',c); l.setAttribute('stroke-width',sw);
    l.setAttribute('stroke-linecap','round');
    l.className.baseVal = cls;
    g.appendChild(l);
    return l;
  }

  ln(laneX, yStart, laneX, yEnd);                         // vertical
  ln(laneX-BRK_SERIF_W, yStart, laneX, yStart);           // top serif (visible)
  ln(laneX-BRK_SERIF_W, yEnd,   laneX, yEnd);             // bottom serif (visible)
  ln(laneX, labelY, laneX+BRK_LABEL_GAP, labelY);         // label tick

  // Wide transparent hit line for bracket selection
  const hit = document.createElementNS('http://www.w3.org/2000/svg','line');
  hit.setAttribute('x1',laneX); hit.setAttribute('y1',yStart);
  hit.setAttribute('x2',laneX); hit.setAttribute('y2',yEnd);
  hit.setAttribute('stroke','transparent'); hit.setAttribute('stroke-width',14);
  hit.style.cursor='pointer'; hit.style.pointerEvents='stroke';
  hit.addEventListener('click', ev=>{ ev.stopPropagation(); _brkSelect(brk.id,ev); });
  g.appendChild(hit);

  // ── Serif drag handles (transparent, wide hit area) ──────────────────
  // Top serif handle — drag to move startRid
  const topHandle = document.createElementNS('http://www.w3.org/2000/svg','line');
  topHandle.setAttribute('x1', laneX-BRK_SERIF_W-4); topHandle.setAttribute('y1', yStart);
  topHandle.setAttribute('x2', laneX+6);              topHandle.setAttribute('y2', yStart);
  topHandle.setAttribute('stroke','transparent'); topHandle.setAttribute('stroke-width',12);
  topHandle.style.cursor = 'ns-resize';
  topHandle.style.pointerEvents = 'stroke';
  topHandle.style.touchAction = 'none';
  topHandle.addEventListener('pointerdown', ev=>{
    ev.stopPropagation(); ev.preventDefault();
    _brkStartSerifDrag(ev, brk.id, 'start');
  });
  g.appendChild(topHandle);

  // Bottom serif handle — drag to move endRid
  const botHandle = document.createElementNS('http://www.w3.org/2000/svg','line');
  botHandle.setAttribute('x1', laneX-BRK_SERIF_W-4); botHandle.setAttribute('y1', yEnd);
  botHandle.setAttribute('x2', laneX+6);              botHandle.setAttribute('y2', yEnd);
  botHandle.setAttribute('stroke','transparent'); botHandle.setAttribute('stroke-width',12);
  botHandle.style.cursor = 'ns-resize';
  botHandle.style.pointerEvents = 'stroke';
  botHandle.style.touchAction = 'none';
  botHandle.addEventListener('pointerdown', ev=>{
    ev.stopPropagation(); ev.preventDefault();
    _brkStartSerifDrag(ev, brk.id, 'end');
  });
  g.appendChild(botHandle);

  // ── Label — contenteditable div, always in place ────────────────────
  // Works exactly like (translation): click → caret appears → type directly.
  // Empty state shows CSS placeholder. Drag > 4px vertically repositions.
  const labelX = laneX + BRK_LABEL_GAP + 3;
  const fo = document.createElementNS('http://www.w3.org/2000/svg','foreignObject');
  fo.setAttribute('x', labelX);
  fo.setAttribute('y', labelY - 10);
  fo.setAttribute('width', 160);
  fo.setAttribute('height', 20);
  fo.className.baseVal = 'brk-label-fo';
  fo.style.overflow = 'visible';

  const div = document.createElement('div');
  div.contentEditable = 'true';
  div.spellcheck = false;
  div.className = 'brk-label-ce';
  div.dataset.ph = t('bracket.label-ph');
  div.style.cssText = `font-family:var(--ui,sans-serif);font-size:11px;`
    + `color:${sel?'var(--active,#C8A84B)':c};white-space:nowrap;`
    + `line-height:20px;outline:none;min-width:40px;cursor:text;`
    + `user-select:text;background:transparent;border:none;`;
  div.textContent = brk.label || '';

  // Commit on blur
  const oldLabel = brk.label;
  div.addEventListener('blur', ()=>{
    const newLabel = div.textContent.trim();
    if(newLabel !== brk.label){
      const prev = brk.label;
      brk.label = newLabel;
      rowPush({type:'brk-style', id:brk.id, prop:'label', oldVal:prev, newVal:newLabel});
      autoSave();
    }
    // Re-render to update width and color
    refreshBrackets();
  });

  // Enter commits, Escape reverts
  div.addEventListener('keydown', ev=>{
    if(ev.key==='Enter'){ ev.preventDefault(); div.blur(); }
    if(ev.key==='Escape'){
      ev.preventDefault();
      div.textContent = brk.label || '';
      div.blur();
    }
  });

  // Mousedown: distinguish drag (vertical > 4px) from click-to-edit
  div.addEventListener('pointerdown', ev=>{
    if(ev.button!==0) return;
    ev.stopPropagation(); // don't bubble to canvas deselect

    const downY = ev.clientY;
    const startOffset = brk.labelOffsetY || 0;
    const zoom = DIAGRAM_ZOOM / 100;
    let dragActive = false;

    const onMove = mv=>{
      if(_pinchActive) return;
      if(dragActive) return;
      if(Math.abs(mv.clientY - downY) > 4){
        dragActive = true;
        // Prevent focus from landing on the div during drag
        div.blur();

        const mid = (yStart + yEnd) / 2;
        const halfLabel = 10;
        const onDragMove = dmv=>{
          if(_pinchActive) return;
          const dy = (dmv.clientY - downY) / zoom;
          const newAbsY = Math.max(yStart+halfLabel, Math.min(yEnd-halfLabel, mid+startOffset+dy));
          brk.labelOffsetY = Math.round(newAbsY - mid);
          refreshBrackets();
        };
        const onDragUp = ()=>{
          document.removeEventListener('pointermove', onDragMove);
          document.removeEventListener('pointerup',   onDragUp);
          if(brk.labelOffsetY !== startOffset){
            rowPush({type:'brk-style', id:brk.id, prop:'labelOffsetY',
                     oldVal:startOffset, newVal:brk.labelOffsetY});
          }
          autoSave();
        };
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup',   onUp);
        document.addEventListener('pointermove', onDragMove);
        document.addEventListener('pointerup',   onDragUp);
      }
    };
    const onUp = ()=>{
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup',   onUp);
      // Not a drag — let the click land on the div naturally (browser focuses it)
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup',   onUp);
  });

  fo.appendChild(div);
  g.appendChild(fo);
  svg.appendChild(g);
}

/* ── Serif drag: resize bracket span by dragging top or bottom serif ── */
function _brkStartSerifDrag(ev, brkId, which){
  const brk = BRACKETS.find(b=>b.id===brkId); if(!brk) return;

  const canvas = document.getElementById('dcanvas'); if(!canvas) return;
  const zoom   = DIAGRAM_ZOOM / 100;
  const oldRid = which==='start' ? brk.startRid : brk.endRid;

  // Build ordered list of row rids and their canvas-Y midpoints
  const rows = Array.from(document.querySelectorAll('.xrow'));
  const rids = rows.map(r=>r.dataset.rid);
  const canvasRect = canvas.getBoundingClientRect();

  // Pre-compute midY of each drow in canvas-local px
  const rowMids = rids.map(rid=>{
    const drow = canvas.querySelector(`.drow[data-rid="${rid}"]`);
    if(!drow) return null;
    const r = drow.getBoundingClientRect();
    return (r.top + r.height/2 - canvasRect.top) / zoom;
  });

  // Which row index is the fixed end?
  const fixedRid = which==='start' ? brk.endRid : brk.startRid;
  const fixedIdx = rids.indexOf(String(fixedRid));

  let currentRid = oldRid;

  const onMove = mv=>{
    if(_pinchActive) return;
    // Convert mouse Y to canvas-local Y
    const mouseY = (mv.clientY - canvasRect.top) / zoom;
    // Find nearest row
    let nearest = -1, nearestDist = Infinity;
    rowMids.forEach((mid,i)=>{
      if(mid===null) return;
      // Don't allow drag past fixed end (must keep at least 1 row span)
      if(which==='start' && i >= fixedIdx) return;
      if(which==='end'   && i <= fixedIdx) return;
      const dist = Math.abs(mid - mouseY);
      if(dist < nearestDist){ nearestDist=dist; nearest=i; }
    });
    if(nearest<0) return;
    const targetRid = rids[nearest];
    if(targetRid === currentRid) return;
    currentRid = targetRid;
    if(which==='start') brk.startRid = targetRid;
    else                brk.endRid   = targetRid;
    // Re-assign all lanes so nesting stays correct after span change
    _brkReassignAllLanes();
    refreshBrackets();
  };

  const onUp = ()=>{
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup',   onUp);
    if(currentRid !== oldRid){
      rowPush({type:'brk-style', id:brkId,
               prop: which==='start' ? 'startRid' : 'endRid',
               oldVal:oldRid, newVal:currentRid});
    }
    autoSave();
  };

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup',   onUp);
}

/* ── Select bracket → show edit popup ── */
function _brkSelect(id, ev){
  SELECTED_BRK_ID = id;
  refreshBrackets();
  const brk = BRACKETS.find(b=>b.id===id);
  if(brk) _brkOpenEditPopup(ev.clientX, ev.clientY, brk);
}

function _brkDeselect(){
  if(!SELECTED_BRK_ID) return;
  SELECTED_BRK_ID = null;
  _brkCloseEditPopup();
  refreshBrackets();
}

/* ── Edit popup ── */
function _brkOpenEditPopup(cx, cy, brk){
  const popup = document.getElementById('brk-edit-popup');
  if(!popup) return;
  document.getElementById('brk-label-input').value = brk.label||'';
  document.getElementById('brk-color-input').value = brk.color||'#493548';
  popup.querySelectorAll('.brk-wt-btn').forEach(btn=>{
    btn.classList.toggle('active', parseInt(btn.dataset.w)===brk.thickness);
  });
  popup.style.display='flex';
  const pw=220, ph=165;
  let x=cx+12, y=cy-20;
  if(x+pw>window.innerWidth-10)  x=cx-pw-12;
  if(y+ph>window.innerHeight-10) y=window.innerHeight-ph-10;
  if(y<10) y=10;
  popup.style.left=x+'px'; popup.style.top=y+'px';
  applyLang();
}
function _brkCloseEditPopup(){
  const popup=document.getElementById('brk-edit-popup');
  if(popup) popup.style.display='none';
}

/* ── Popup field handlers (called from HTML) ── */
function brkEditLabelChange(val){
  const brk=BRACKETS.find(b=>b.id===SELECTED_BRK_ID); if(!brk) return;
  const old=brk.label;
  brk.label=val;
  rowPush({type:'brk-style', id:brk.id, prop:'label', oldVal:old, newVal:val});
  refreshBrackets(); autoSave();
}
function brkEditWeight(w){
  const brk=BRACKETS.find(b=>b.id===SELECTED_BRK_ID); if(!brk) return;
  const old=brk.thickness;
  brk.thickness=w;
  rowPush({type:'brk-style', id:brk.id, prop:'thickness', oldVal:old, newVal:w});
  document.querySelectorAll('.brk-wt-btn').forEach(btn=>{
    btn.classList.toggle('active', parseInt(btn.dataset.w)===w);
  });
  refreshBrackets(); autoSave();
}
function brkEditColorChange(val){
  const brk=BRACKETS.find(b=>b.id===SELECTED_BRK_ID); if(!brk) return;
  const old=brk.color;
  brk.color=val;
  rowPush({type:'brk-style', id:brk.id, prop:'color', oldVal:old, newVal:val});
  refreshBrackets(); autoSave();
}
function brkDeleteCurrent(){
  if(!SELECTED_BRK_ID) return;
  const brk=BRACKETS.find(b=>b.id===SELECTED_BRK_ID);
  if(!brk) return;
  rowPush({type:'brk-remove', brk:{...brk}});
  BRACKETS=BRACKETS.filter(b=>b.id!==SELECTED_BRK_ID);
  SELECTED_BRK_ID=null;
  _brkCloseEditPopup();
  _brkReassignAllLanes();
  refreshBrackets(); autoSave();
}

/* ── Serialise / restore ── */
function collectBracketData(){
  return BRACKETS.map(b=>({...b}));
}
function loadBracketData(arr){
  BRACKETS=Array.isArray(arr)?arr.map(b=>({labelOffsetY:0, ...b})):[];
  BRACKETS.forEach(b=>{
    const n=parseInt(String(b.id||'').replace(/^brk-/,''),10);
    if(!isNaN(n)&&n>=BRK_CTR) BRK_CTR=n+1;
  });
  SELECTED_BRK_ID=null;
  // Re-assign all lanes with nesting awareness after loading
  requestAnimationFrame(()=>{ _brkReassignAllLanes(); refreshBrackets(); });
}

/* ── Undo/redo handlers — wired into applyRowUndo / applyRowRedo ── */
function _brkApplyUndo(op){
  if(op.type==='brk-add'){
    BRACKETS=BRACKETS.filter(b=>b.id!==op.brk.id);
    if(SELECTED_BRK_ID===op.brk.id){ SELECTED_BRK_ID=null; _brkCloseEditPopup(); }
    _brkReassignAllLanes(); refreshBrackets(); return true;
  }
  if(op.type==='brk-remove'){
    if(!BRACKETS.find(b=>b.id===op.brk.id)) BRACKETS.push({...op.brk});
    _brkReassignAllLanes(); refreshBrackets(); return true;
  }
  if(op.type==='brk-style'){
    const brk=BRACKETS.find(b=>b.id===op.id);
    if(brk){
      brk[op.prop]=op.oldVal;
      // Re-assign lane if span changed
      if(op.prop==='startRid'||op.prop==='endRid')
        _brkReassignAllLanes();
      refreshBrackets();
    } return true;
  }
  return false;
}
function _brkApplyRedo(op){
  if(op.type==='brk-add'){
    if(!BRACKETS.find(b=>b.id===op.brk.id)) BRACKETS.push({...op.brk});
    refreshBrackets(); return true;
  }
  if(op.type==='brk-remove'){
    BRACKETS=BRACKETS.filter(b=>b.id!==op.brk.id);
    if(SELECTED_BRK_ID===op.brk.id){ SELECTED_BRK_ID=null; _brkCloseEditPopup(); }
    _brkReassignAllLanes(); refreshBrackets(); return true;
  }
  if(op.type==='brk-style'){
    const brk=BRACKETS.find(b=>b.id===op.id);
    if(brk){
      brk[op.prop]=op.newVal;
      if(op.prop==='startRid'||op.prop==='endRid')
        _brkReassignAllLanes();
      refreshBrackets();
    } return true;
  }
  return false;
}

/* Shared guard for the Shift-key listeners below: while the user is
   actively typing (a translation field, a label, a comment, any
   contentEditable or input/textarea), Shift is just part of normal
   typing (capitalizing a letter, etc.) and must never also trigger a
   diagram-wide mode like Bracket pips or Diagram Edit Mode. */
function _isEditingText(){
  const el=document.activeElement;
  if(!el) return false;
  const tag=el.tagName;
  return tag==='INPUT' || tag==='TEXTAREA' || el.isContentEditable===true;
}

/* ── Show pips while Shift is physically held down ── */
document.addEventListener('keydown', ev=>{
  if(ev.key==='Shift' && EDITOR_VIEW==='diagram' && !_isEditingText()){
    document.body.classList.add('brk-shift');
  }
});
document.addEventListener('keyup', ev=>{
  if(ev.key==='Shift'){
    document.body.classList.remove('brk-shift');
  }
});

/* ── Hook Escape ── */
document.addEventListener('keydown', ev=>{
  if(ev.key==='Escape'){
    if(BRACKET_PENDING){ _brkCancelPending(); toast(t('bracket.cancel')); }
    if(document.body.classList.contains('brk-locked')) _brkExitLockedMode();
    if(typeof _exitConnectorMode==='function') _exitConnectorMode();
    // Exit diagram edit mode (both temporary Shift-hold and permanently locked)
    if(DIAGRAM_EDIT_MODE || _demAltTemp){
      _demAltTemp=false;
      DIAGRAM_EDIT_MODE=false;
      _applyDiagramEditMode(false);
      autoSave();
    }
    _brkDeselect();
  }
}, true);

/* ── Click outside popup ── */
document.addEventListener('mousedown', ev=>{
  const popup=document.getElementById('brk-edit-popup');
  if(!popup||popup.style.display==='none') return;
  if(!popup.contains(ev.target)) _brkDeselect();
}, true);

/* ════════════════════════════════════════
   ANNOTATIONS SYSTEM
   Four types — dividers (phrasing view), free arrows, span markers,
   and arc connectors (all diagram view).
   All stored in the unified ANNOTATIONS array and persisted in the JSON.
════════════════════════════════════════ */

/* ── Helper: generate a new annotation id ── */
function _annId(){ return 'ann-'+(++ANN_CTR); }

/* ── Helper: currently selected annotation id ── */
let SELECTED_ANN_ID=null;

/* ═══════════════════════════════════════════
   1. DISCOURSE UNIT DIVIDERS  (Phrasing view)
   A thin horizontal rule between two rows
   with an editable relationship label.
   Stored: {id, afterRid, label, color}
═══════════════════════════════════════════ */
/* ── Bracket mode toggle (toolbar button / Alt+B) ──────────────────────────
   Toggles 'brk-locked' on body, which shows pips persistently (same CSS as
   brk-shift) so the user can click them without holding Shift.
   Dismissed by: clicking the button again, Alt+B again, or Escape. */
function addBracketHint(){
  if(EDITOR_VIEW!=='diagram') return;
  const body=document.body;
  const btn=document.getElementById('tb-add-bracket');
  if(body.classList.contains('brk-locked')){
    // Toggle off — cancel any pending first click and exit bracket mode
    _brkExitLockedMode();
  } else {
    body.classList.add('brk-locked');
    if(btn) btn.classList.add('on');
    toast(typeof t==='function'?t('ann.bracket.hint'):'Shift+click a pip dot to start a bracket. Click again or press Escape to cancel.');
  }
}

function _brkExitLockedMode(){
  document.body.classList.remove('brk-locked');
  const btn=document.getElementById('tb-add-bracket');
  if(btn) btn.classList.remove('on');
  if(BRACKET_PENDING) _brkCancelPending();
}

function addDivider(){
  // Add a proposition divider ABOVE the currently focused row, or the first row
  const focusedRow = lastFocusedRowEl
    || document.querySelector('.xrow');
  if(!focusedRow) return;
  const beforeRid = focusedRow.dataset.rid;
  const ann = { id:_annId(), type:'divider', beforeRid, label:'', color:'#C8A84B' };
  ANNOTATIONS.push(ann);
  renderDividers();
  autoSave();
  rowPush({type:'ann-add', ann:{...ann}});
  // Focus the new divider label for immediate editing
  setTimeout(()=>{
    const el=document.querySelector(`.ann-divider[data-ann-id="${ann.id}"] .ann-div-label`);
    if(el) el.focus();
  }, 60);
}

/* Section Divider — same idea as a Proposition Divider (single anchor
   row, implicit extent until the next one), but represents a HIGHER
   level grouping ("Introduction", "Body", ...) and renders very
   differently per view: a colored strip spanning every row in the
   section (Phrasing View) or a full-width rule with a large all-caps
   label (Diagram View). Deliberately its own type/functions rather than
   generalizing addDivider/deleteDivider, so the well-tested existing
   Proposition Divider code path is never at risk of being disturbed. */
// True if row index `idx` (into `rids`, the canonical DOM row order) falls
// within any section's [startRid,endRid] span, other than `excludeId` —
// used both to refuse creating a new section on an already-covered row,
// and to stop a drag-resize handle from expanding into another section's
// territory. Sections are never meant to overlap: "if there is a section
// divider from verse 1-3, another section divider should not occupy
// those verses."
function _rowInOtherSection(rids, idx, excludeId){
  return ANNOTATIONS.some(sec=>{
    if(sec.type!=='section' || sec.id===excludeId) return false;
    const si=rids.indexOf(String(sec.startRid));
    const ei=rids.indexOf(String(sec.endRid));
    if(si<0||ei<0) return false;
    const lo=Math.min(si,ei), hi=Math.max(si,ei);
    return idx>=lo && idx<=hi;
  });
}

function addSection(){
  // lastFocusedRowEl only updates from Phrasing View's text-field focus
  // handlers — clicking a diagram block never touches it, so Add Section
  // from Diagram View was always silently re-anchoring to whatever row
  // was last focused in Phrasing (often verse 1), no matter which block
  // was actually clicked. Diagram View has its OWN reliable "current
  // row" signal — SELECTED_DIAG_RID, set by selectDiagBlock() on every
  // block click — so use that when it's the active view.
  let anchorRid;
  if(EDITOR_VIEW==='diagram' && typeof SELECTED_DIAG_RID!=='undefined' && SELECTED_DIAG_RID){
    anchorRid=SELECTED_DIAG_RID;
  } else {
    const focusedRow=lastFocusedRowEl || document.querySelector('.xrow');
    if(!focusedRow) return;
    anchorRid=focusedRow.dataset.rid;
  }
  // Explicit start/end range (both anchors, not an implicit "until the
  // next section" point) — starts as a single-row span; startRid/endRid
  // are then independently drag-resizable, same interaction as the
  // Diagram bracket's start/end handles.
  const rids=Array.from(document.querySelectorAll('.xrow')).map(r=>r.dataset.rid);
  const anchorIdx=rids.indexOf(String(anchorRid));
  if(anchorIdx>=0 && _rowInOtherSection(rids, anchorIdx, null)){
    toast(typeof t==='function'?t('toast.section-overlap'):'This row is already inside another section.');
    return;
  }
  const ann = { id:_annId(), type:'section', startRid:anchorRid, endRid:anchorRid, label:'', color:'#534AB7', structureLane:-2 };
  ANNOTATIONS.push(ann);
  renderSectionStrips();
  renderStructurePanel();
  if(EDITOR_VIEW==='diagram') renderDiagram();
  autoSave();
  rowPush({type:'ann-add', ann:{...ann}});
  setTimeout(()=>{
    const sel = EDITOR_VIEW==='diagram'
      ? `.dsec-divider[data-ann-id="${ann.id}"] .dsec-label`
      : `.sec-strip[data-ann-id="${ann.id}"] .sec-strip-label`;
    const el=document.querySelector(sel);
    if(el) el.focus();
  }, 60);
}
function deleteSection(id){
  const ann=ANNOTATIONS.find(a=>a.id===id); if(!ann) return;
  ANNOTATIONS=ANNOTATIONS.filter(a=>a.id!==id);
  renderSectionStrips();
  renderStructurePanel();
  if(EDITOR_VIEW==='diagram') renderDiagram();
  autoSave();
  rowPush({type:'ann-remove', ann:{...ann}});
}

/* ── View toggles ──
   Phrasing: show/hide all Proposition Dividers.
   Diagram:  show/hide all block translations.
   Both are body-level classes so the state also applies to export clones
   (diagram exports clone #dcanvas into an off-screen host that is still
   inside <body>, so the CSS still matches; the phrasing PDF exporter
   renders cell-by-cell and never included dividers to begin with).
   States persist in localStorage. */
/* Both view toggles ALWAYS start ON (content visible) on every page load —
   no localStorage persistence, by design: a hard refresh should give a
   clean slate rather than replaying whatever state a previous session
   left behind. Each flip is pushed onto the same ROW_STACK used for
   indent/split/etc., so Ctrl+Z / Ctrl+Y step through toggle changes
   exactly like any other editor action (see applyRowUndo/applyRowRedo). */
function _setDividersVisible(visible){
  document.body.classList.toggle('hide-dividers', !visible);
  document.getElementById('tb-tgl-dividers')?.classList.toggle('tgl-on', visible);
  // Hiding/showing Proposition Dividers shifts row positions (they take
  // up vertical space via row.before(el)), which section strips — which
  // span multiple rows — need to recheck.
  if(typeof renderSectionStrips==='function') renderSectionStrips();
}
function _setDgTransVisible(visible){
  document.body.classList.toggle('dg-hide-trans', !visible);
  document.getElementById('tb-tgl-dgtrans')?.classList.toggle('tgl-on', visible);
  // Hiding/showing translations changes block height, which shifts block
  // positions — connectors (and brackets/labels, via the same call) never
  // got told to recheck, so they stayed frozen at the pre-toggle spot.
  // Fixed here (not in toggleDgTransVisible) so undo/redo — which call
  // this setter directly, bypassing the toggle function — are covered too.
  if(typeof refreshDiagramConnectors==='function') refreshDiagramConnectors();
}
function _setDgSecEndVisible(visible){
  document.body.classList.toggle('dg-hide-sec-end', !visible);
  document.getElementById('tb-tgl-dsec-end')?.classList.toggle('tgl-on', visible);
  // Same reasoning as _setDgTransVisible: hiding the end line is a
  // flow-inserted element disappearing, which shifts everything after it
  // — connectors need to recheck their positions. Fixed here (not in
  // toggleDgSecEndVisible) so undo/redo, which call this setter directly,
  // are covered too.
  if(typeof refreshDiagramConnectors==='function') refreshDiagramConnectors();
}
function toggleDgSecEndVisible(){
  const wasVisible=!document.body.classList.contains('dg-hide-sec-end');
  _setDgSecEndVisible(!wasVisible);
  rowPush({type:'tgl-dsec-end', prev:wasVisible, next:!wasVisible});
}
function _setSectionsVisible(visible){
  document.body.classList.toggle('hide-sections', !visible);
  document.getElementById('tb-tgl-sections')?.classList.toggle('tgl-on', visible);
}
function toggleSectionsVisible(){
  const wasVisible=!document.body.classList.contains('hide-sections');
  _setSectionsVisible(!wasVisible);
  rowPush({type:'tgl-sections', prev:wasVisible, next:!wasVisible});
}
function toggleDividersVisible(){
  const wasVisible=!document.body.classList.contains('hide-dividers');
  _setDividersVisible(!wasVisible);
  rowPush({type:'tgl-dividers', prev:wasVisible, next:!wasVisible});
}
function toggleDgTransVisible(){
  const wasVisible=!document.body.classList.contains('dg-hide-trans');
  _setDgTransVisible(!wasVisible);
  rowPush({type:'tgl-dgtrans', prev:wasVisible, next:!wasVisible});
}

function renderDividers(){
  // Remove all existing divider elements
  document.querySelectorAll('.ann-divider').forEach(e=>e.remove());
  // Render each proposition divider BEFORE its target row
  ANNOTATIONS.filter(a=>a.type==='divider').forEach(ann=>{
    // Support both old afterRid (legacy) and new beforeRid
    const rid=ann.beforeRid||ann.afterRid;
    const row=document.querySelector(`.xrow[data-rid="${rid}"]`);
    if(!row) return;
    const el=document.createElement('div');
    el.className='ann-divider';
    el.dataset.annId=ann.id;
    el.style.setProperty('--div-color', ann.color||'#C8A84B');

    const line=document.createElement('div');
    line.className='ann-div-line';

    const labelWrap=document.createElement('div');
    labelWrap.className='ann-div-label-wrap';

    const label=document.createElement('div');
    label.className='ann-div-label';
    label.contentEditable='true';
    label.spellcheck=false;
    label.setAttribute('data-ph', typeof t==='function'?t('ann.div.ph'):'Proposition…');
    label.textContent=ann.label||'';
    label.addEventListener('input',()=>{
      ann.label=label.textContent.trim();
      autoSave();
    });
    label.addEventListener('focus',()=>{ _annLabelFocusSnap(ann.id,label); });
    label.addEventListener('blur',()=>{ ann.label=label.textContent.trim(); _annLabelBlurSnap(ann.id,ann); autoSave(); });

    const del=document.createElement('button');
    del.className='ann-div-del';
    del.title=typeof t==='function'?t('ann.delete'):'Delete annotation';
    del.innerHTML='✕';
    del.addEventListener('click',()=>{ deleteDivider(ann.id); });

    // Color picker swatch
    const swatch=document.createElement('input');
    swatch.type='color'; swatch.className='ann-div-color';
    swatch.value=ann.color||'#C8A84B';
    swatch.title=typeof t==='function'?t('ann.color'):'Color';
    swatch.addEventListener('change',()=>{
      const oldVal=ann.color;
      ann.color=swatch.value;
      el.style.setProperty('--div-color', ann.color);
      autoSave();
      rowPush({type:'ann-edit', annId:ann.id, prop:'color', oldVal, newVal:ann.color});
    });

    labelWrap.append(label, swatch, del);
    el.append(line, labelWrap);
    row.before(el);  // Proposition divider appears ABOVE its row
  });
  _applyRowShading();
}

function deleteDivider(id){
  const ann=ANNOTATIONS.find(a=>a.id===id); if(!ann) return;
  ANNOTATIONS=ANNOTATIONS.filter(a=>a.id!==id);
  renderDividers();
  autoSave();
  rowPush({type:'ann-remove', ann:{...ann}});
}

/* ── Section Divider (Phrasing View): a colored strip spanning every row
   from its explicit startRid to its explicit endRid (both independently
   drag-resizable via the handles at each end — see _secStartDrag). ── */
function renderSectionStrips(){
  const scroll=document.getElementById('rows-scroll');
  if(!scroll) return;
  let layer=document.getElementById('section-strips');
  if(!layer){
    layer=document.createElement('div');
    layer.id='section-strips';
    scroll.appendChild(layer);
  }
  layer.innerHTML='';
  const sections=ANNOTATIONS.filter(a=>a.type==='section');
  if(!sections.length) return;

  const rows=_realRows();
  const ridToRow={};
  rows.forEach(r=>{ ridToRow[r.dataset.rid]=r; });

  const scrollRect=scroll.getBoundingClientRect();
  const scrollTop=scroll.scrollTop||0;

  sections.forEach(ann=>{
    const startRow=ridToRow[ann.startRid];
    const endRow=ridToRow[ann.endRid]||startRow;
    if(!startRow||!endRow) return;

    const startRect=startRow.getBoundingClientRect();
    const endRect=endRow.getBoundingClientRect();
    const top=Math.min(startRect.top,endRect.top)-scrollRect.top+scrollTop;
    const bottom=Math.max(startRect.bottom,endRect.bottom)-scrollRect.top+scrollTop;
    const height=Math.max(24,bottom-top);

    const strip=document.createElement('div');
    strip.className='sec-strip';
    strip.dataset.annId=ann.id;
    strip.style.top=top+'px';
    strip.style.height=height+'px';
    strip.style.setProperty('--sec-color', ann.color||'#534AB7');

    const del=document.createElement('button');
    del.className='sec-strip-del';
    del.title=typeof t==='function'?t('ann.delete'):'Delete annotation';
    del.innerHTML='✕';
    del.addEventListener('click',()=>{ deleteSection(ann.id); });

    const swatch=document.createElement('input');
    swatch.type='color'; swatch.className='sec-strip-color';
    swatch.value=ann.color||'#534AB7';
    swatch.title=typeof t==='function'?t('ann.color'):'Color';
    swatch.addEventListener('change',()=>{
      const oldVal=ann.color;
      ann.color=swatch.value;
      strip.style.setProperty('--sec-color', ann.color);
      if(EDITOR_VIEW==='diagram') renderDiagram();
      if(!document.getElementById('structure-panel')?.classList.contains('pane-hidden'))renderStructurePanel();
      autoSave();
      rowPush({type:'ann-edit', annId:ann.id, prop:'color', oldVal, newVal:ann.color});
    });

    const label=document.createElement('div');
    label.className='sec-strip-label';
    label.contentEditable='true';
    label.spellcheck=false;
    label.setAttribute('data-ph', typeof t==='function'?t('ann.section.ph'):'Section…');
    label.textContent=ann.label||'';
    label.addEventListener('input',()=>{ ann.label=label.textContent.trim(); autoSave(); });
    label.addEventListener('focus',()=>{ _annLabelFocusSnap(ann.id,label); });
    label.addEventListener('blur',()=>{ ann.label=label.textContent.trim(); _annLabelBlurSnap(ann.id,ann); autoSave(); if(!document.getElementById('structure-panel')?.classList.contains('pane-hidden'))renderStructurePanel(); });

    const topHandle=document.createElement('div');
    topHandle.className='sec-strip-handle sec-strip-handle-top';
    topHandle.style.touchAction='none';
    topHandle.addEventListener('pointerdown',ev=>{ ev.stopPropagation(); ev.preventDefault(); _secStartDrag(ev, ann.id, 'start'); });

    const botHandle=document.createElement('div');
    botHandle.className='sec-strip-handle sec-strip-handle-bot';
    botHandle.style.touchAction='none';
    botHandle.addEventListener('pointerdown',ev=>{ ev.stopPropagation(); ev.preventDefault(); _secStartDrag(ev, ann.id, 'end'); });

    strip.append(topHandle, swatch, del, label, botHandle);
    layer.appendChild(strip);
  });
}

/* Drag either end of a section's range to a different row — same
   nearest-row-by-Y-position technique as the Diagram bracket's serif
   drag (_brkStartSerifDrag), adapted to Phrasing's .xrow/#rows-scroll
   (no zoom factor to divide by, and no lane reassignment since sections
   don't nest the way brackets can). */
function _secStartDrag(ev, annId, which){
  const ann=ANNOTATIONS.find(a=>a.id===annId && a.type==='section'); if(!ann) return;
  const scroll=document.getElementById('rows-scroll'); if(!scroll) return;
  const oldRid = which==='start' ? ann.startRid : ann.endRid;

  const rows=_realRows();
  const rids=rows.map(r=>r.dataset.rid);
  const scrollRect=scroll.getBoundingClientRect();
  const scrollTop=scroll.scrollTop||0;
  const rowMids=rows.map(r=>{
    const rect=r.getBoundingClientRect();
    return (rect.top+rect.height/2-scrollRect.top+scrollTop);
  });

  const fixedRid = which==='start' ? ann.endRid : ann.startRid;
  const fixedIdx = rids.indexOf(String(fixedRid));

  let currentRid=oldRid;

  const onMove=mv=>{
    const mouseY=(mv.clientY-scrollRect.top+scrollTop);
    let nearest=-1, nearestDist=Infinity;
    rowMids.forEach((mid,i)=>{
      if(which==='start' && i>fixedIdx) return; // can't drag start past end
      if(which==='end'   && i<fixedIdx) return; // can't drag end before start
      if(_rowInOtherSection(rids, i, annId)) return; // can't expand into another section
      const dist=Math.abs(mid-mouseY);
      if(dist<nearestDist){ nearestDist=dist; nearest=i; }
    });
    if(nearest<0) return;
    const targetRid=rids[nearest];
    if(targetRid===currentRid) return;
    currentRid=targetRid;
    if(which==='start') ann.startRid=targetRid; else ann.endRid=targetRid;
    renderSectionStrips();
    if(EDITOR_VIEW==='diagram') renderDiagram();
  };
  const onUp=()=>{
    document.removeEventListener('pointermove',onMove);
    document.removeEventListener('pointerup',onUp);
    if(currentRid!==oldRid){
      rowPush({type:'sec-style', id:annId,
               prop: which==='start' ? 'startRid' : 'endRid',
               oldVal:oldRid, newVal:currentRid});
    }
    autoSave();
  };
  document.addEventListener('pointermove',onMove);
  document.addEventListener('pointerup',onUp);
}

/* ═══════════════════════════════════════════
   2. FREE ARROWS  (Diagram view)
   A draggable SVG arrow with optional label.
   Stored: {id, x1,y1,x2,y2, label, color, dashed}
   Coordinates are % of #dcanvas clientWidth/Height.
═══════════════════════════════════════════ */

/* ── Active annotation mode tracking ─────────────────────────────────────────
   Only one annotation draw mode (arrow, span, arc) can be active at a time.
   _cancelAnnMode() exits whatever mode is current.
   Each mode function calls _cancelAnnMode() before activating itself, and checks
   whether it is already the active mode (for toggle-off behaviour).
───────────────────────────────────────────────────────────────────────────── */
let _annActiveMode=null;           // 'arrow'|'span'|'arc'|null
let _annCancelFns=[];              // cleanup callbacks registered by the active mode

function _cancelAnnMode(){
  _annCancelFns.forEach(fn=>fn());
  _annCancelFns=[];
  _annActiveMode=null;
  // Deactivate all annotation tool buttons
  ['tb-add-arrow','tb-add-bracket'].forEach(id=>_setAnnBtnActive(id,false));
  const canvas=document.getElementById('dcanvas');
  if(canvas) canvas.classList.remove('ann-arrow-mode');
}

function _setAnnBtnActive(id, active){
  const btn=document.getElementById(id);
  if(btn) btn.classList.toggle('on', active);
}

/* Called from toolbar button or keyboard shortcut */
function startFreeArrow(){
  if(EDITOR_VIEW!=='diagram'){ toast(typeof t==='function'?t('ann.diagram-only'):'Switch to Diagram view to add arrows.'); return; }
  // Toggle off if arrow mode is already active
  if(_annActiveMode==='arrow'){ _cancelAnnMode(); return; }
  _cancelAnnMode(); // exit any other active mode first
  const canvas=document.getElementById('dcanvas'); if(!canvas) return;
  toast(typeof t==='function'?t('ann.arrow.hint'):'Click and drag on the canvas to draw an arrow.');
  canvas.classList.add('ann-arrow-mode');
  _setAnnBtnActive('tb-add-arrow', true);
  _annActiveMode='arrow';

  let x1,y1;
  const onDown=ev=>{
    if(!canvas.classList.contains('ann-arrow-mode')) return;
    ev.preventDefault();
    const r=canvas.getBoundingClientRect();
    const zoom=DIAGRAM_ZOOM/100;
    x1=((ev.clientX-r.left)/zoom)/canvas.scrollWidth*100;
    y1=((ev.clientY-r.top+canvas.scrollTop)/zoom)/canvas.scrollHeight*100;

    // Rubber-band preview arrow
    let rubber=document.getElementById('ann-arrow-rubber');
    if(!rubber){
      rubber=document.createElementNS('http://www.w3.org/2000/svg','line');
      rubber.id='ann-arrow-rubber';
      rubber.setAttribute('stroke','#C8A84B');
      rubber.setAttribute('stroke-width','2');
      rubber.setAttribute('stroke-dasharray','5,3');
      rubber.setAttribute('marker-end','url(#ann-arrowhead-preview)');
      const svg=document.getElementById('dconns'); if(svg) svg.appendChild(rubber);
    }

    const onMove=ev2=>{
      if(_pinchActive) return;
      const r2=canvas.getBoundingClientRect();
      let x2=((ev2.clientX-r2.left)/zoom)/canvas.scrollWidth*100;
      let y2=((ev2.clientY-r2.top+canvas.scrollTop)/zoom)/canvas.scrollHeight*100;
      // Snap to horizontal or vertical when Shift is held
      if(ev2.shiftKey){
        const dx=x2-x1, dy=y2-y1;
        // x/y are stored as percentages of canvas.scrollWidth/scrollHeight,
        // which usually aren't equal — comparing raw dx/dy without
        // converting back to true pixel space would bias the snap
        // decision toward whichever axis has the larger percent-per-pixel
        // ratio. Whichever axis has the larger PIXEL delta wins; the other
        // axis is pinned back to the start point, keeping its sign so all
        // four cardinal directions (left/right/up/down) snap correctly.
        const pxDx=dx*canvas.scrollWidth, pxDy=dy*canvas.scrollHeight;
        if(Math.abs(pxDx)>=Math.abs(pxDy)) y2=y1; else x2=x1;
      }
      _updateRubberArrow(rubber, x1,y1,x2,y2, canvas);
    };
    const onUp=ev2=>{
      document.removeEventListener('pointermove',onMove);
      document.removeEventListener('pointerup',onUp);
      if(rubber) rubber.remove();
      _cancelAnnMode(); // exits arrow mode, deactivates button

      const r2=canvas.getBoundingClientRect();
      let x2=((ev2.clientX-r2.left)/zoom)/canvas.scrollWidth*100;
      let y2=((ev2.clientY-r2.top+canvas.scrollTop)/zoom)/canvas.scrollHeight*100;
      if(ev2.shiftKey){
        const dx=x2-x1, dy=y2-y1;
        const pxDx=dx*canvas.scrollWidth, pxDy=dy*canvas.scrollHeight;
        if(Math.abs(pxDx)>=Math.abs(pxDy)) y2=y1; else x2=x1;
      }
      const dx=x2-x1, dy=y2-y1;
      if(Math.sqrt(dx*dx+dy*dy)<1) return; // too small — cancel
      const ann={id:_annId(),type:'arrow',x1,y1,x2,y2,label:'',color:'#C8A84B',dashed:false};
      ANNOTATIONS.push(ann);
      renderAnnLayer();
      autoSave();
      rowPush({type:'ann-add',ann:{...ann}});
    };
    document.addEventListener('pointermove',onMove);
    document.addEventListener('pointerup',onUp);
  };
  canvas.style.touchAction='none'; // only while the arrow-draw listener below is attached (removed with the rest of arrow mode on cancel)
  canvas.addEventListener('pointerdown',onDown);
  // Register a cancel callback so _cancelAnnMode() can clean up arrow mode
  _annCancelFns.push(()=>{
    canvas.classList.remove('ann-arrow-mode');
    canvas.removeEventListener('pointerdown',onDown);
    canvas.style.touchAction='';
    const rubber=document.getElementById('ann-arrow-rubber');
    if(rubber) rubber.remove();
  });
}

function _updateRubberArrow(line, x1,y1,x2,y2, canvas){
  const w=canvas.scrollWidth, h=canvas.scrollHeight;
  line.setAttribute('x1',x1/100*w); line.setAttribute('y1',y1/100*h);
  line.setAttribute('x2',x2/100*w); line.setAttribute('y2',y2/100*h);
}







/* ═══════════════════════════════════════════
   DIAGRAM ANNOTATION LAYER RENDERER
   Draws arrows, spans, and arcs as SVG on
   a dedicated layer above #dcanvas content.
═══════════════════════════════════════════ */

function renderAnnLayer(){
  const canvas=document.getElementById('dcanvas'); if(!canvas) return;

  const W=canvas.scrollWidth||canvas.offsetWidth||900;
  const H=canvas.scrollHeight||canvas.offsetHeight||500;

  // Get or create the annotation SVG layer
  let svg=document.getElementById('dann-svg');
  if(!svg){
    svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.id='dann-svg';
    canvas.appendChild(svg);
  }
  // Resize and reposition on every call so it always matches dcanvas layout
  svg.style.cssText='position:absolute;top:0;left:0;overflow:visible;pointer-events:none;z-index:20;';
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  // Defs with a generic arrowhead marker for arcs (arrows get per-colour markers in _renderArrow)
  svg.innerHTML=`<defs>
    <marker id="ann-ah" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#C8A84B"/>
    </marker>
  </defs>`;

  // Remove stale annotation overlay divs AND delete buttons (both appended to canvas)
  document.querySelectorAll('.ann-overlay-label,.ann-del-btn').forEach(e=>e.remove());

  // If the selected annotation was deleted, hide the popup
  if(SELECTED_ANN_ID && !ANNOTATIONS.find(a=>a.id===SELECTED_ANN_ID)){
    SELECTED_ANN_ID=null;
    const popup=document.getElementById('ann-edit-popup');
    if(popup) popup.style.display='none';
  }

  ANNOTATIONS.forEach(ann=>{
    if(ann.type==='arrow'){
      _renderArrow(svg, ann, W, H, canvas);
    }
    // span and arc types removed — old saves with these types are silently skipped
  });
}

function _renderArrow(svg, ann, W, H, canvas){
  const x1=ann.x1/100*W, y1=ann.y1/100*H;
  const x2=ann.x2/100*W, y2=ann.y2/100*H;
  const g=document.createElementNS('http://www.w3.org/2000/svg','g');
  g.dataset.annId=ann.id;
  g.style.pointerEvents='all';
  g.style.cursor='pointer';

  const line=document.createElementNS('http://www.w3.org/2000/svg','line');
  line.setAttribute('x1',x1); line.setAttribute('y1',y1);
  line.setAttribute('x2',x2); line.setAttribute('y2',y2);
  line.setAttribute('stroke',ann.color||'#C8A84B');
  line.setAttribute('stroke-width','2');
  if(ann.dashed) line.setAttribute('stroke-dasharray','6,3');
  // Per-arrow coloured arrowhead: inject a dedicated marker for this arrow's color
  const markerId='ann-ah-'+ann.id.replace(/[^a-z0-9]/gi,'_');
  let defs=svg.querySelector('defs');
  if(!defs){ defs=document.createElementNS('http://www.w3.org/2000/svg','defs'); svg.prepend(defs); }
  let mk=defs.querySelector('#'+markerId);
  if(!mk){
    mk=document.createElementNS('http://www.w3.org/2000/svg','marker');
    mk.setAttribute('id',markerId); mk.setAttribute('markerWidth','8');
    mk.setAttribute('markerHeight','8'); mk.setAttribute('refX','7');
    mk.setAttribute('refY','3'); mk.setAttribute('orient','auto');
    const p=document.createElementNS('http://www.w3.org/2000/svg','path');
    p.setAttribute('d','M0,0 L0,6 L8,3 z'); p.setAttribute('fill',ann.color||'#C8A84B');
    mk.appendChild(p); defs.appendChild(mk);
  } else { defs.querySelector('#'+markerId+' path')?.setAttribute('fill',ann.color||'#C8A84B'); }

  line.setAttribute('marker-end','url(#'+markerId+')');

  // Invisible wider hit area
  const hit=document.createElementNS('http://www.w3.org/2000/svg','line');
  hit.setAttribute('x1',x1); hit.setAttribute('y1',y1);
  hit.setAttribute('x2',x2); hit.setAttribute('y2',y2);
  hit.setAttribute('stroke','transparent'); hit.setAttribute('stroke-width','12');
  hit.addEventListener('click',ev=>{ ev.stopPropagation(); _selectAnn(ann.id); });

  g.append(hit, line);
  svg.appendChild(g);

  // Label
  if(ann.label){
    const mx=(x1+x2)/2, my=(y1+y2)/2;
    _addAnnOverlayLabel(canvas, ann, mx, my);
  }

  // Drag handles when selected
  if(SELECTED_ANN_ID===ann.id){
    _addDragHandle(svg, ann, x1, y1, 'p1', W, H);
    _addDragHandle(svg, ann, x2, y2, 'p2', W, H);
    _addAnnDeleteBtn(canvas, ann, x1, y1);
  }
}



/* ── Selection, editing, deletion ── */
function _selectAnn(id){
  SELECTED_ANN_ID=id;
  renderAnnLayer();
  // Show inline label editor in a floating popover
  const ann=ANNOTATIONS.find(a=>a.id===id); if(!ann) return;
  _showAnnEditPopup(ann);
}

function _showAnnEditPopup(ann){
  let popup=document.getElementById('ann-edit-popup');
  if(!popup){
    popup=document.createElement('div');
    popup.id='ann-edit-popup';
    popup.className='ann-popup';
    document.getElementById('dzone').appendChild(popup);
  }
  popup.innerHTML=`
    <div class="ann-popup-row">
      <input class="ann-popup-label" type="text" placeholder="${typeof t==='function'?t('ann.label-ph'):'Label…'}" value="${(ann.label||'').replace(/"/g,'&quot;')}"/>
      <input class="ann-popup-color" type="color" value="${ann.color||'#C8A84B'}"/>
      ${ann.type==='arrow'?`<label class="ann-popup-dashed"><input type="checkbox" ${ann.dashed?'checked':''}/>${typeof t==='function'?t('ann.dashed'):'Dashed'}</label>`:''}
    </div>
    <div class="ann-popup-row ann-popup-actions">
      <button class="ann-popup-del">${typeof t==='function'?t('ann.delete'):'Delete'}</button>
      <button class="ann-popup-close">${typeof t==='function'?t('ann.close'):'Done'}</button>
    </div>`;
  popup.style.display='block';

  const labelIn=popup.querySelector('.ann-popup-label');
  const colorIn=popup.querySelector('.ann-popup-color');
  labelIn.addEventListener('input',()=>{ ann.label=labelIn.value.trim(); autoSave(); });
  labelIn.addEventListener('change',()=>{ renderAnnLayer(); });
  colorIn.addEventListener('change',()=>{
    const oldColor=ann.color;
    ann.color=colorIn.value;
    renderAnnLayer();
    autoSave();
    rowPush({type:'ann-edit', annId:ann.id, prop:'color', oldVal:oldColor, newVal:ann.color});
  });
  const dashedCb=popup.querySelector('.ann-popup-dashed input');
  if(dashedCb) dashedCb.addEventListener('change',()=>{
    const oldDashed=ann.dashed;
    ann.dashed=dashedCb.checked;
    renderAnnLayer();
    autoSave();
    rowPush({type:'ann-edit', annId:ann.id, prop:'dashed', oldVal:oldDashed, newVal:ann.dashed});
  });
  popup.querySelector('.ann-popup-del').addEventListener('click',()=>{ deleteAnnotation(ann.id); popup.style.display='none'; });
  popup.querySelector('.ann-popup-close').addEventListener('click',()=>{ popup.style.display='none'; SELECTED_ANN_ID=null; renderAnnLayer(); });
}

function deleteAnnotation(id){
  const ann=ANNOTATIONS.find(a=>a.id===id); if(!ann) return;
  ANNOTATIONS=ANNOTATIONS.filter(a=>a.id!==id);
  SELECTED_ANN_ID=null;
  // Hide the edit popup immediately so it doesn't persist after deletion
  const popup=document.getElementById('ann-edit-popup');
  if(popup) popup.style.display='none';
  if(ann.type==='divider') renderDividers();
  else renderAnnLayer();
  autoSave();
  rowPush({type:'ann-remove',ann:{...ann}});
}

function _addAnnOverlayLabel(canvas, ann, cx, cy){
  const wrap=document.createElement('div');
  wrap.className='ann-overlay-label';
  wrap.style.cssText=`position:absolute;left:${cx+4}px;top:${cy-8}px;pointer-events:auto;`;
  wrap.textContent=ann.label;
  wrap.style.color=ann.color||'#C8A84B';
  canvas.appendChild(wrap);
}

function _addAnnDeleteBtn(canvas, ann, x, y){
  const btn=document.createElement('button');
  btn.className='ann-del-btn';
  btn.style.cssText=`position:absolute;left:${x-8}px;top:${y-20}px;pointer-events:auto;`;
  btn.textContent='✕';
  btn.title=typeof t==='function'?t('ann.delete'):'Delete';
  btn.addEventListener('click',ev=>{ ev.stopPropagation(); deleteAnnotation(ann.id); });
  canvas.appendChild(btn);
}

function _addDragHandle(svg, ann, x, y, point, W, H){
  const circle=document.createElementNS('http://www.w3.org/2000/svg','circle');
  circle.setAttribute('cx',x); circle.setAttribute('cy',y); circle.setAttribute('r','6');
  circle.setAttribute('fill','#fff'); circle.setAttribute('stroke',ann.color||'#C8A84B');
  circle.setAttribute('stroke-width','2');
  circle.style.pointerEvents='all'; circle.style.cursor='grab'; circle.style.touchAction='none';
  circle.addEventListener('pointerdown',ev=>{
    ev.stopPropagation(); ev.preventDefault();
    const canvas=document.getElementById('dcanvas');
    const onMove=ev2=>{
      if(_pinchActive) return;
      const r=canvas.getBoundingClientRect();
      const zoom=DIAGRAM_ZOOM/100;
      const px=((ev2.clientX-r.left)/zoom)/W*100;
      const py=((ev2.clientY-r.top+canvas.scrollTop)/zoom)/H*100;
      if(point==='p1'){ann.x1=px;ann.y1=py;}else{ann.x2=px;ann.y2=py;}
      renderAnnLayer();
    };
    const onUp=()=>{ document.removeEventListener('pointermove',onMove); document.removeEventListener('pointerup',onUp); autoSave(); };
    document.addEventListener('pointermove',onMove);
    document.addEventListener('pointerup',onUp);
  });
  svg.appendChild(circle);
}

/* Click on canvas background deselects annotation */
document.getElementById('dcanvas')?.addEventListener('click',()=>{
  if(SELECTED_ANN_ID){ SELECTED_ANN_ID=null; renderAnnLayer(); }
  const popup=document.getElementById('ann-edit-popup');
  if(popup) popup.style.display='none';
});

/* Re-render ann layer when diagram is rebuilt */
const _origRenderDiagram=typeof renderDiagram==='function'?renderDiagram:null;

/* ── Undo/redo for annotations ── */
function _annHidePopupIfStale(){
  // If the popup is showing for an annotation that no longer exists, hide it
  if(SELECTED_ANN_ID && !ANNOTATIONS.find(a=>a.id===SELECTED_ANN_ID)){
    SELECTED_ANN_ID=null;
    const popup=document.getElementById('ann-edit-popup');
    if(popup) popup.style.display='none';
  }
}

/* Per-annotation focus/blur label-text snap for undo — mirrors _cmtFocusSnap/
   _cmtBlurSnap's coalescing (divider + section labels, both plain-text). */
const _annLabelBefore={};
function _annLabelFocusSnap(annId,el){
  _annLabelBefore[annId]=el.textContent;
}
function _annLabelBlurSnap(annId,ann){
  const before=_annLabelBefore[annId]??'';
  const after=ann.label||'';
  if(after===before) return;
  const lastOp=ROW_STACK[ROW_STACK.length-1];
  if(lastOp&&lastOp.type==='ann-edit'&&lastOp.annId===annId&&lastOp.prop==='label'){
    lastOp.newVal=after;
  } else {
    rowPush({type:'ann-edit', annId, prop:'label', oldVal:before, newVal:after});
  }
  _annLabelBefore[annId]=after;
}

function _annApplyUndo(op){
  if(!op.type?.startsWith('ann-')) return false;
  if(op.type==='ann-add'){
    ANNOTATIONS=ANNOTATIONS.filter(a=>a.id!==op.ann.id);
    _annHidePopupIfStale();
    if(op.ann.type==='divider') renderDividers(); else if(op.ann.type==='section'){ renderSectionStrips(); if(EDITOR_VIEW==='diagram') renderDiagram(); } else renderAnnLayer();
    return true;
  }
  if(op.type==='ann-remove'){
    if(!ANNOTATIONS.find(a=>a.id===op.ann.id)) ANNOTATIONS.push({...op.ann});
    if(op.ann.type==='divider') renderDividers(); else if(op.ann.type==='section'){ renderSectionStrips(); if(EDITOR_VIEW==='diagram') renderDiagram(); } else renderAnnLayer();
    return true;
  }
  if(op.type==='ann-edit'){
    const ann=ANNOTATIONS.find(a=>a.id===op.annId); if(!ann) return true;
    ann[op.prop]=op.oldVal;
    if(ann.type==='divider') renderDividers(); else if(ann.type==='section'){ renderSectionStrips(); if(EDITOR_VIEW==='diagram') renderDiagram(); } else renderAnnLayer();
    // Re-open popup with updated values if this annotation is still selected
    if(SELECTED_ANN_ID===op.annId) _showAnnEditPopup(ann);
    return true;
  }
  return false;
}

function _annApplyRedo(op){
  if(!op.type?.startsWith('ann-')) return false;
  // Redo is the mirror of undo: ann-add re-adds, ann-remove re-removes
  if(op.type==='ann-add'){
    if(!ANNOTATIONS.find(a=>a.id===op.ann.id)) ANNOTATIONS.push({...op.ann});
    if(op.ann.type==='divider') renderDividers(); else if(op.ann.type==='section'){ renderSectionStrips(); if(EDITOR_VIEW==='diagram') renderDiagram(); } else renderAnnLayer();
    return true;
  }
  if(op.type==='ann-remove'){
    ANNOTATIONS=ANNOTATIONS.filter(a=>a.id!==op.ann.id);
    _annHidePopupIfStale();
    if(op.ann.type==='divider') renderDividers(); else if(op.ann.type==='section'){ renderSectionStrips(); if(EDITOR_VIEW==='diagram') renderDiagram(); } else renderAnnLayer();
    return true;
  }
  if(op.type==='ann-edit'){
    const ann=ANNOTATIONS.find(a=>a.id===op.annId); if(!ann) return true;
    ann[op.prop]=op.newVal;
    if(ann.type==='divider') renderDividers(); else if(ann.type==='section'){ renderSectionStrips(); if(EDITOR_VIEW==='diagram') renderDiagram(); } else renderAnnLayer();
    if(SELECTED_ANN_ID===op.annId) _showAnnEditPopup(ann);
    return true;
  }
  return false;
}

/* Hook into existing undo/redo */
const _origApplyRowUndo=typeof applyRowUndo==='function'?applyRowUndo:null;
const _origApplyRowRedo=typeof applyRowRedo==='function'?applyRowRedo:null;

/* Legacy deck payload is retained only for old-project compatibility. */
/* ════════════════════════════════════════
   RTF → HTML CONVERTER (Screen 2)
   Logos puts NO text/html flavor on the clipboard at all — only
   text/plain and text/rtf (confirmed by diagnostic: HTML length 0,
   RTF length ~15KB with a \colortbl). All formatting, including the
   font colors, lives exclusively in the RTF — the same flavor MS
   Word's "Keep Source Formatting" reads. This converter parses the
   subset of RTF that matters for our pipeline and emits HTML that
   then flows through _sanitizePasteHTML exactly like a native HTML
   paste would.
   Handled: \colortbl + \cfN (font color), \b, \i, \ul, \super/\sub,
   \par/\line (line breaks), \tab, \uN unicode (incl. negative values
   and surrogate pairs — this is how all Greek/Hebrew and the Logos
   PUA marker glyphs are encoded), \ucN fallback skipping, \'xx hex
   bytes (cp1252), escaped braces/backslash, and skipping of non-text
   destination groups (\fonttbl, \stylesheet, {\*\…}, etc).
   Deliberately ignored: \highlightN and \cbN (backgrounds — consistent
   with the app-wide policy of stripping source-app background tints),
   font faces and sizes (session typography governs those).
════════════════════════════════════════ */

const _RTF_SKIP_DESTS=new Set(['fonttbl','stylesheet','info','themedata','colorschememapping',
  'datastore','latentstyles','listtable','listoverridetable','rsidtbl','generator',
  'pict','object','header','footer','headerl','headerr','footerl','footerr','xmlnstbl',
  'ftnsep','ftnsepc','aftnsep','aftnsepc',
  // Footnote/endnote destination groups. Per RTF spec these hold the note's
  // own text, separate from the reference mark left inline in the body —
  // but some sources (observed with Logos, which embeds its Bible-edition
  // citation as a footnote) omit the \* optional-destination prefix that
  // would otherwise make the generic \{\*\...\} skip above catch it,
  // causing the citation text to be inlined into the body an extra time.
  'footnote','ftn','aftn']);

/* Windows-1252 upper range (0x80–0x9F) → Unicode; rest of \'xx is latin-1 */
const _CP1252_HI={
  0x80:0x20AC,0x82:0x201A,0x83:0x0192,0x84:0x201E,0x85:0x2026,0x86:0x2020,0x87:0x2021,
  0x88:0x02C6,0x89:0x2030,0x8A:0x0160,0x8B:0x2039,0x8C:0x0152,0x8E:0x017D,
  0x91:0x2018,0x92:0x2019,0x93:0x201C,0x94:0x201D,0x95:0x2022,0x96:0x2013,0x97:0x2014,
  0x98:0x02DC,0x99:0x2122,0x9A:0x0161,0x9B:0x203A,0x9C:0x0153,0x9E:0x017E,0x9F:0x0178};

function _rtfToHTML(rtf){
  const colors=[];      // colortbl entries: null (auto) or '#rrggbb'
  const lines=[[]];     // array of lines; each line = array of runs {text,cf,b,i,u,sup,sub}
  let state={cf:0,b:false,i:false,u:false,sup:false,sub:false,uc:1};
  const stack=[];
  let i=0;
  const n=rtf.length;
  let curText='';

  function pushRun(){
    if(!curText) return;
    lines[lines.length-1].push({text:curText,cf:state.cf,b:state.b,i:state.i,u:state.u,sup:state.sup,sub:state.sub});
    curText='';
  }
  function newLine(){ pushRun(); lines.push([]); }
  function emit(ch){ curText+=ch; }

  /* Skip an entire group starting at an already-consumed '{' */
  function skipGroup(){
    let depth=1;
    while(i<n&&depth>0){
      const c=rtf[i++];
      if(c==='\\'){ i++; continue; } // skip escaped char / control-word head
      if(c==='{') depth++;
      else if(c==='}') depth--;
    }
  }

  /* Parse the \colortbl group body (called with i just after the control word) */
  function parseColorTbl(){
    let depth=1, r=0,g=0,b=0, any=false;
    while(i<n&&depth>0){
      const c=rtf[i];
      if(c==='\\'){
        i++;
        let w=''; while(i<n&&/[a-z]/i.test(rtf[i])) w+=rtf[i++];
        let num=''; if(rtf[i]==='-'){num='-';i++;} while(i<n&&/[0-9]/.test(rtf[i])) num+=rtf[i++];
        if(rtf[i]===' ') i++;
        const v=num?parseInt(num,10):0;
        if(w==='red'){r=v;any=true;} else if(w==='green'){g=v;any=true;} else if(w==='blue'){b=v;any=true;}
      } else if(c===';'){
        colors.push(any?('#'+[r,g,b].map(x=>Math.max(0,Math.min(255,x)).toString(16).padStart(2,'0')).join('')):null);
        r=g=b=0; any=false; i++;
      } else if(c==='{'){ depth++; i++; }
      else if(c==='}'){ depth--; i++; }
      else i++;
    }
  }

  // Preflight: must look like RTF at all
  if(!/^\s*{\\rtf/.test(rtf)) throw new Error('not RTF');

  while(i<n){
    const c=rtf[i];

    if(c==='{'){
      i++;
      // Destination groups we skip wholesale: {\*\anything ...} and known tables
      let j=i;
      if(rtf[j]==='\\'){
        let k=j+1;
        if(rtf[k]==='*'){ skipGroup(); continue; }
        let w=''; while(k<n&&/[a-z]/i.test(rtf[k])) w+=rtf[k++];
        if(w==='colortbl'){
          // consume "\colortbl" then parse entries; parseColorTbl consumes the closing }
          i=k; if(rtf[i]===' ') i++;
          parseColorTbl();
          continue;
        }
        if(_RTF_SKIP_DESTS.has(w)){ skipGroup(); continue; }
      }
      pushRun(); // text before the group belongs to the PRE-group state
      stack.push({...state});
      continue;
    }
    if(c==='}'){
      i++;
      pushRun();
      if(stack.length) state=stack.pop();
      continue;
    }
    if(c==='\\'){
      i++;
      const cc=rtf[i];
      // Escaped literals & specials
      if(cc==='\\'||cc==='{'||cc==='}'){ emit(cc); i++; continue; }
      if(cc==="'"){ // \'xx hex byte (cp1252)
        const hex=rtf.substr(i+1,2); i+=3;
        const code=parseInt(hex,16);
        if(!isNaN(code)) emit(String.fromCharCode(_CP1252_HI[code]||code));
        continue;
      }
      if(cc==='~'){ emit('\u00A0'); i++; continue; }
      if(cc==='-'||cc==='_'){ i++; continue; } // optional hyphen markers — drop
      if(cc==='\n'||cc==='\r'){ i++; continue; } // escaped raw newline — ignore

      // Control word: letters then optional signed number then optional space
      let w=''; while(i<n&&/[a-z]/i.test(rtf[i])) w+=rtf[i++];
      let numStr=''; if(rtf[i]==='-'){numStr='-';i++;}
      while(i<n&&/[0-9]/.test(rtf[i])) numStr+=rtf[i++];
      if(rtf[i]===' ') i++;
      const num=numStr!==''?parseInt(numStr,10):null;

      // Any control word that mutates run-visible formatting state must
      // flush the pending text first, so already-emitted characters keep
      // the state they were typed under (runs are styled at flush time).
      if(w==='cf'||w==='b'||w==='i'||w==='ul'||w==='ulnone'||
         w==='super'||w==='sub'||w==='nosupersub'||w==='plain'){
        pushRun();
      }

      switch(w){
        case 'u': {
          // Signed 16-bit code unit; negative wraps by +65536. Surrogate
          // pairs (e.g. Logos PUA glyphs above BMP would be two \u words)
          // concatenate naturally via fromCharCode of each code unit.
          let cu=num==null?0:num;
          if(cu<0) cu+=65536;
          emit(String.fromCharCode(cu));
          // Skip `uc` fallback characters (plain chars or \'xx escapes)
          let toSkip=state.uc;
          while(toSkip>0&&i<n){
            if(rtf[i]==='\\'&&rtf[i+1]==="'"){ i+=4; }
            else if(rtf[i]==='\\'){ break; } // next control word — fallback absent
            else if(rtf[i]==='{'||rtf[i]==='}'){ break; }
            else { i++; }
            toSkip--;
          }
          break;
        }
        case 'uc': state.uc=num==null?1:num; break;
        case 'cf': state.cf=num==null?0:num; break;
        case 'b': state.b=num!==0; break;
        case 'i': state.i=num!==0; break;
        case 'ul': state.u=num!==0; break;
        case 'ulnone': state.u=false; break;
        case 'super': state.sup=num!==0; if(state.sup) state.sub=false; break;
        case 'sub': state.sub=num!==0; if(state.sub) state.sup=false; break;
        case 'nosupersub': state.sup=false; state.sub=false; break;
        case 'plain': state={...state,cf:0,b:false,i:false,u:false,sup:false,sub:false}; break;
        case 'par': case 'row': case 'sect': case 'page': newLine(); break;
        case 'line': newLine(); break;
        case 'tab': case 'cell': emit('\t'); break;
        case 'emdash': emit('\u2014'); break;
        case 'endash': emit('\u2013'); break;
        case 'lquote': emit('\u2018'); break;
        case 'rquote': emit('\u2019'); break;
        case 'ldblquote': emit('\u201C'); break;
        case 'rdblquote': emit('\u201D'); break;
        case 'bullet': emit('\u2022'); break;
        default: break; // every other control word (fonts, sizes, margins…) — ignore
      }
      continue;
    }
    if(c==='\n'||c==='\r'){ i++; continue; } // raw newlines are not content in RTF
    emit(c); i++;
  }
  pushRun();

  /* Render lines[] to HTML */
  const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const htmlLines=lines.map(runs=>{
    if(!runs.length) return '';
    let out='';
    runs.forEach(r=>{
      let piece=esc(r.text).replace(/\t/g,'&nbsp;&nbsp;&nbsp;&nbsp;');
      if(r.sup) piece='<sup>'+piece+'</sup>';
      if(r.sub) piece='<sub>'+piece+'</sub>';
      if(r.b) piece='<b>'+piece+'</b>';
      if(r.i) piece='<i>'+piece+'</i>';
      if(r.u) piece='<u>'+piece+'</u>';
      const col=colors[r.cf];
      if(col) piece='<span style="color:'+col+'">'+piece+'</span>';
      out+=piece;
    });
    return out;
  });
  // Trim leading/trailing empty lines, keep interior blanks as <br> lines
  while(htmlLines.length&&!htmlLines[0].trim()) htmlLines.shift();
  while(htmlLines.length&&!htmlLines[htmlLines.length-1].trim()) htmlLines.pop();
  return htmlLines.map(l=>'<div>'+(l||'<br>')+'</div>').join('');
}

/* Merges adjacent sibling elements that share the same tag and identical
   attributes into one. RTF (and Logos's export in particular) very
   commonly wraps each glyph in its own formatting group even when
   nothing actually changes between them — e.g. a discourse-marker pair
   like "‹+" can arrive as two back-to-back <span style="color:#1E6AFE">
   elements, one holding "‹" and the next holding "+". Marker detection
   matches within a single text node, so a token split across two
   separate (if identically-styled) nodes is invisible to it and gets
   silently treated as ordinary text — exactly the "opening marker left
   stranded behind instead of traveling with the next word" bug. Running
   this BEFORE marker detection glues such runs back into one text node,
   restoring normal detection with no other change needed. */
function _mergeAdjacentRuns(root){
  function attrsEqual(a,b){
    if(a.attributes.length!==b.attributes.length) return false;
    for(const attr of a.attributes){ if(b.getAttribute(attr.name)!==attr.value) return false; }
    return true;
  }
  function pass(el){
    let child=el.firstChild;
    while(child){
      const next=child.nextSibling;
      // Only merge INLINE formatting elements (span/b/i/u/sup/sub/...) —
      // never block-level line wrappers (div/p/li/...). Two sibling line
      // divs both happen to have zero attributes, which would otherwise
      // satisfy attrsEqual() trivially and silently fuse separate lines
      // into one, destroying the outline's line-break structure.
      if(child.nodeType===Node.ELEMENT_NODE && next && next.nodeType===Node.ELEMENT_NODE &&
         child.tagName===next.tagName && _PASTE_KEEP_TAGS.has(child.tagName.toLowerCase()) &&
         attrsEqual(child,next)){
        while(next.firstChild) child.appendChild(next.firstChild);
        next.remove();
        continue; // re-check the (now-grown) child against its new next sibling
      }
      if(child.nodeType===Node.ELEMENT_NODE) pass(child);
      child=next;
    }
  }
  pass(root);
  root.normalize(); // also coalesce any now-adjacent plain text nodes
}

/* ════════════════════════════════════════
   RICH PASTE SANITIZER (Screen 2)
   Intercepts clipboard HTML, keeps inline
   formatting (color, bold, italic, sup),
   strips scripts, images, tables, classes.
   Handles Logos and similar Bible software.
════════════════════════════════════════ */

/* Safe inline tags to keep intact */
const _PASTE_KEEP_TAGS = new Set(['b','strong','i','em','u','s','strike','sup','sub','span','br','wbr']);
/* Block tags to convert to <div> (for line-break detection) */
const _PASTE_BLOCK_TAGS = new Set(['p','div','li','tr','td','th','h1','h2','h3','h4','h5','h6','blockquote','dd','dt']);
/* Safe CSS properties to allow through on style= attributes */
/* Note: background-color is deliberately NOT allowed through — source
   apps (Logos, BibleArc, Word) often wrap lines in spans carrying page
   background tints, which would wash whole rows gray against the app's
   cream cells. Font colors, weights, and styles still come through.
   font-size is deliberately NOT allowed through either — sources like
   Logos/BibleWorks commonly mark cantillation/accent glyphs with relative
   sizes (133%, 166%, 83%...) that compound on the cell's own font-size and
   render at an inflated, inconsistent size no matter what the toolbar's
   Hebrew/Translation size controls say (this is also stripped from
   already-saved content on every load — see _stripBgFromHTML — so a paste
   kept here would only look right until the next reload anyway). */
const _PASTE_SAFE_STYLES = new Set(['color','font-weight','font-style','text-decoration','vertical-align']);

function _sanitizePasteHTML(rawHTML){
  // Resolve colors the way the browser actually would. Logos (and many
  // rich-text sources) commonly apply color via a CSS class plus an
  // embedded <style> block rather than an inline style="" on every span.
  // A DOMParser-based parse never runs style computation, so class-driven
  // colors were silently lost — only literal inline styles survived.
  // Fix: briefly attach the raw HTML to the live page (off-screen,
  // removed before this function returns) so any embedded <style> block
  // registers normally, read each element's actually-resolved color via
  // getComputedStyle, and bake it into an inline style attribute — the
  // existing sanitizeNode walk below then picks it up exactly like any
  // other inline-styled color, unchanged. innerHTML never executes
  // <script> tags, so this remains exactly as safe as the previous
  // DOMParser approach; the container is removed synchronously in the
  // same tick, before any other code can observe its attached styles.
  const liveHost=document.createElement('div');
  liveHost.style.cssText='position:fixed;left:-99999px;top:0;pointer-events:none;';
  document.body.appendChild(liveHost);
  liveHost.innerHTML=rawHTML;

  // Logos-specific cleanup: remove verse reference spans (usually aria-label or data-ref attrs)
  // and footnote markers before we process
  liveHost.querySelectorAll('[data-ref],[data-footnote],sup.footnote,sup.versenum.logos,a').forEach(el=>{
    // Keep <a> text content but remove the link
    if(el.tagName.toLowerCase()==='a'){
      el.replaceWith(...el.childNodes);
    } else {
      el.remove();
    }
  });

  // Bake each element's resolved color into an inline style, but only
  // where it actually differs from its parent's resolved color — keeps
  // output clean instead of stamping a redundant color onto every node.
  // Covers inline style, CSS classes, and legacy <font color> alike,
  // since computed style resolves all three the same way.
  liveHost.querySelectorAll('*').forEach(el=>{
    const own=window.getComputedStyle(el).color;
    const parentEl=el.parentElement;
    const parentColor=parentEl?window.getComputedStyle(parentEl).color:null;
    if(own && own!==parentColor){
      const existing=el.getAttribute('style')||'';
      const withoutColor=existing.split(';').filter(d=>!/^\s*color\s*:/i.test(d)).join(';');
      el.setAttribute('style', (withoutColor?withoutColor+';':'')+'color:'+own);
    }
  });

  function sanitizeNode(node){
    if(node.nodeType===Node.TEXT_NODE) return node.cloneNode(true);
    if(node.nodeType!==Node.ELEMENT_NODE) return null;

    const tag=node.tagName.toLowerCase();

    // Skip entirely: script, style, img, iframe, svg, head, meta, link, etc.
    if(['script','style','img','iframe','svg','head','meta','link','button','input','select','textarea','form','object','embed'].includes(tag)){
      return null;
    }

    let outTag=null;
    if(_PASTE_KEEP_TAGS.has(tag)){
      outTag=tag==='strong'?'b':tag==='em'?'i':tag;
    } else if(_PASTE_BLOCK_TAGS.has(tag)){
      outTag='div';
    } else if(tag==='table'||tag==='tbody'||tag==='thead'||tag==='tfoot'){
      outTag='div';
    } else {
      // Unknown tag — unwrap but keep children
      outTag=null;
    }

    // Sanitize style attribute
    let styleStr='';
    const rawStyle=node.getAttribute?.('style')||'';
    if(rawStyle){
      const kept=[];
      rawStyle.split(';').forEach(decl=>{
        const [prop,...rest]=decl.split(':');
        if(!prop) return;
        const p=prop.trim().toLowerCase();
        if(_PASTE_SAFE_STYLES.has(p)){
          const v=rest.join(':').trim();
          // Skip transparent/inherit colors that add no value
          if(v&&v!=='transparent'&&v!=='inherit') kept.push(`${p}:${v}`);
        }
      });
      if(kept.length) styleStr=kept.join(';');
    }

    // Process children recursively
    const children=Array.from(node.childNodes).map(sanitizeNode).filter(Boolean);
    if(!outTag){
      // Unwrap — return a DocumentFragment-like array via a span
      if(children.length===0) return null;
      if(children.length===1) return children[0];
      const wrap=document.createElement('span');
      children.forEach(c=>wrap.appendChild(c));
      return wrap;
    }

    const el=document.createElement(outTag);
    if(styleStr) el.setAttribute('style',styleStr);
    children.forEach(c=>el.appendChild(c));
    return el;
  }

  const out=document.createElement('div');
  Array.from(liveHost.childNodes).forEach(node=>{
    const sanitized=sanitizeNode(node);
    if(sanitized) out.appendChild(sanitized);
  });
  document.body.removeChild(liveHost);
  _mergeAdjacentRuns(out);

  // Flatten: if the result is a single wrapper div with no style, return its innerHTML
  if(out.children.length===1&&out.children[0].tagName==='DIV'&&!out.children[0].getAttribute('style')){
    return out.children[0].innerHTML;
  }
  return out.innerHTML;
}

/* ── Logos Private Use Area (PUA) character substitution ──────────────────
   Logos uses font glyphs from Unicode's Private Use Area (U+E000–U+F8FF)
   for discourse markers. These render as boxes without the Logos font.
   We replace known codepoints with readable Unicode equivalents and flag
   unknown PUA characters so they're visible rather than silent boxes.
   Add new entries to _LOGOS_PUA_MAP as you encounter them. */
const _LOGOS_PUA_MAP = {
  0xE917: '👤',   // singular participant marker
  0xE91F: '👥',   // group/plural participant marker
  0xE91B: '💬',   // speech box / direct speech marker
  0xE91A: '🕐',   // clock / temporal marker
  0xE916: '📢',   // redundant quotative frame marker
};

function _substitutePUAChars(el){
  // Walk all text nodes inside el and replace PUA characters
  const walker=document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
  const nodes=[];
  let node;
  while((node=walker.nextNode())) nodes.push(node);
  nodes.forEach(tn=>{
    const text=tn.textContent;
    let changed=false;
    let result='';
    for(let i=0;i<text.length;i++){
      const cp=text.codePointAt(i);
      // Skip low surrogate of a surrogate pair
      if(cp>0xFFFF) i++;
      if(cp>=0xE000&&cp<=0xF8FF){
        changed=true;
        const sub=_LOGOS_PUA_MAP[cp];
        if(sub){
          result+=sub;
        } else {
          // Unknown PUA — wrap as flagged placeholder
          result+=`\uFFFD`; // will be handled after text replacement
        }
      } else {
        result+=text[i];
        if(cp>0xFFFF) result+=text[i+1]; // low surrogate
      }
    }
    if(changed) tn.textContent=result;
  });
}

/* Convert plain text to simple HTML (line breaks → <div>s) */
function _plainToHTML(text){
  return text.split('\n').map(line=>`<div>${line||'<br>'}</div>`).join('');
}

/* ════════════════════════════════════════
   NA28 CRITICAL APPARATUS MARKS
   Signs from the NA28 introduction, colored via the --crit CSS variable
   (Settings → Critical Marks) and given a hover tooltip whose text lives
   in lang.js under crit.* keys (both en and zh).
════════════════════════════════════════ */
const CRIT_MARK_KEYS={
  '°':'omit-word',
  '⸋':'omit-words','⸌':'omit-words','⸍':'omit-words',
  '⸀':'replace-word','⸁':'replace-word',
  '⸂':'replace-words','⸃':'replace-words','⸄':'replace-words','⸅':'replace-words',
  '⸆':'insert','⸇':'insert',
  '⸉':'transpose-words','⸊':'transpose-words','⸈':'transpose-words',
  '⸓':'transposed',
  '˸':'punct',
  '*':'asterisk',
  '[':'sq-bracket',']':'sq-bracket',
  '⟦':'dbl-bracket','⟧':'dbl-bracket',
  '♦':'diamond',
  '✽':'chapter-mark',
};
/* Lexham discourse-feature symbols used inside ‹…› delimiter pairs.
   The open token is ‹ + symbol, the close token is symbol + ›. Note that
   👤, 👥, 💬 and 🕐 are exactly what _substitutePUAChars
   produces from the Logos PUA glyphs, and that substitution runs BEFORE
   _markupCriticalSigns, so the pipeline ordering is already correct. */
const DISC_MARK_KEYS={
  '✓':'disc-point',       '✕':'disc-counterpoint',
  '👤':'disc-rd',      '👥':'disc-cr',
  '+':'disc-add',              '☉':'disc-target',
  '→':'disc-ref',         '💬':'disc-meta',
  '🕐':'disc-hp',      '!':'disc-attn',
  '📢':'disc-rqf',
};
/* One combined matcher, longest alternatives first:
   • frame markers [TM/TM] [TP/TP] [CP/CP] [CD/CD] [LD/LD] [SP/SP]
     — colored AND superscripted (extra crit-frame class)
   • standalone [ ] — NA28 uncertain-authenticity brackets (kept separate
     from the frame-marker alternative above, and deliberately NOT given
     numeral absorption, since "[1" could otherwise be misread as a stray
     frame token by _critKeyFor's length check)
   • discourse pairs ‹✓ … ✓› etc. (open = ‹+symbol, close = symbol+›)
   • reported speech ‶ … ″ (double primes, per the Lexham export)
   • NA28 apparatus signs, absorbing immediately-attached numerals (°1, ˸2) */
const _CRIT_RE=new RegExp(
  '\\[(?:TM|TP|CP|CD|LD|SP)|(?:TM|TP|CP|CD|LD|SP)\\]'+
  '|\\[|\\]'+
  '|‹[✓✕👤👥+☉→💬🕐!📢]'+
  '|[✓✕👤👥+☉→💬🕐!📢]›'+
  '|[‶″]'+
  '|[°⸀⸁⸂⸃⸄⸅⸆⸇⸈⸉⸊⸋⸌⸍⸓˸*⟦⟧♦✽](?:[⁰-⁹¹²³]|\\d)*',
  'gu');

function _critKeyFor(tok){
  // length>1 guards against a lone "[" or "]" (added above) being
  // mistaken for a frame-marker token, which is always 3+ chars ("[TM").
  if(tok.length>1 && tok[0]==='[')      return 'frame-'+tok.slice(1).toLowerCase();    // [TM ...
  if(tok.length>1 && tok.endsWith(']')) return 'frame-'+tok.slice(0,-1).toLowerCase(); // ... TM]
  if(tok[0]==='‹')      return DISC_MARK_KEYS[[...tok].slice(1).join('')]||null;
  if(tok.endsWith('›')) return DISC_MARK_KEYS[[...tok].slice(0,-1).join('')]||null;
  if(tok==='‶'||tok==='″') return 'disc-speech';
  const base=tok.replace(/[⁰-⁹¹²³0-9]+$/,'');
  return CRIT_MARK_KEYS[base]||null;
}

/* Resolves which source citation to show under a crit-mark tooltip:
     1. a per-mark override, if one exists (e.g. the asterisk and the
        chapter-division mark each cite a specific NTG28 page number)
     2. Runge's LDGNT Glossary, for frame-* and disc-* keys (the
        discourse-feature markers)
     3. Aland's Novum Testamentum Graece, for every other (apparatus) sign
   Returns '' if none of the above resolve to real text. */
function _critSourceFor(key){
  if(typeof t!=='function') return '';
  const perMark=t('crit.source-'+key);
  if(perMark && perMark!=='crit.source-'+key) return perMark;
  if(key.indexOf('frame-')===0 || key.indexOf('disc-')===0){
    const runge=t('crit.source');
    return (runge&&runge!=='crit.source') ? runge : '';
  }
  const aland=t('crit.source-apparatus');
  return (aland&&aland!=='crit.source-apparatus') ? aland : '';
}

/* Wrap every critical sign inside el in <span class="crit-mark" data-crit="key">.
   Walks text nodes only, so existing inline formatting is untouched, and
   skips text that is already inside a .crit-mark span (idempotent). */
function _markupCriticalSigns(el){
  const walker=document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
  const nodes=[];
  let node;
  while((node=walker.nextNode())){
    if(node.parentElement&&node.parentElement.closest('.crit-mark')) continue;
    if(_CRIT_RE.test(node.textContent)){nodes.push(node);}
    _CRIT_RE.lastIndex=0;
  }
  nodes.forEach(tn=>{
    const text=tn.textContent;
    const frag=document.createDocumentFragment();
    let last=0, m;
    _CRIT_RE.lastIndex=0;
    while((m=_CRIT_RE.exec(text))){
      const key=_critKeyFor(m[0]);
      if(!key) continue;
      if(m.index>last) frag.appendChild(document.createTextNode(text.slice(last,m.index)));
      const sp=document.createElement('span');
      sp.className='crit-mark'+(key.indexOf('frame-')===0?' crit-frame':'');
      sp.dataset.crit=key;
      sp.textContent=m[0];
      // dir="ltr" gives the browser's bidi algorithm an explicit isolate for
      // this token, so it can never mirror its brackets or reorder relative
      // to surrounding Hebrew/RTL text — the actual fix for the
      // "[TM ... TM]" -> "TM]...[TM" bug (a blanket container-level
      // direction:rtl, tried previously, causes exactly that mirroring).
      sp.dir='ltr';
      frag.appendChild(sp);
      last=m.index+m[0].length;
    }
    if(last<text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    if(last>0) tn.replaceWith(frag);
  });

  // Absorb a trailing numeral suffix that RTF/Logos put in its OWN <sup>
  // element (e.g. "˸" then a separate <sup>1</sup>) into the mark it
  // belongs to. NA28's own apparatus notes explain these superscript
  // numerals distinguish multiple occurrences of the same variant kind
  // within one apparatus unit (e.g. °1/°2, ˸1/˸2) — the numeral is part
  // of the same sign, but the regex above can only see one text node at
  // a time, so a numeral living in a sibling element is invisible to it
  // and would otherwise stay unstyled, plain black text. Only applies to
  // apparatus signs (not frame/discourse markers, which never take these
  // numeral suffixes).
  el.querySelectorAll('.crit-mark').forEach(mk=>{
    if(mk.classList.contains('crit-frame')) return; // frame markers don't take these
    const key=mk.dataset.crit||'';
    if(DISC_MARK_KEYS && Object.values(DISC_MARK_KEYS).includes(key)) return; // nor discourse markers
    const next=mk.nextSibling;
    if(next && next.nodeType===Node.ELEMENT_NODE && next.tagName==='SUP' && /^\d+$/.test((next.textContent||'').trim())){
      const sup=document.createElement('sup');
      sup.textContent=next.textContent;
      mk.appendChild(sup);
      next.remove();
    }
  });
}

/* Wraps contiguous Latin-letter/digit runs (SENTENCE, "Ge", "1:1", bare
   verse numbers, ...) in an isolating dir="ltr" span, skipping anything
   already inside a .crit-mark (which _markupCriticalSigns already
   isolated). Screen 2 preview only: these tokens are stripped out during
   import and never reach a saved row, so this is purely cosmetic — it
   only adds non-content-altering span wrappers, so it can never change
   what the parser later reads from textContent. */
function _isolateLatinRunsForPreview(el){
  const LATIN_RUN_RE=/[A-Za-z0-9][A-Za-z0-9:.\-]*/g;
  const walker=document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
  const nodes=[];
  let node;
  while((node=walker.nextNode())){
    if(node.parentElement && node.parentElement.closest('.crit-mark, [dir="ltr"]')) continue;
    if(LATIN_RUN_RE.test(node.textContent)) nodes.push(node);
    LATIN_RUN_RE.lastIndex=0;
  }
  nodes.forEach(tn=>{
    const text=tn.textContent;
    const frag=document.createDocumentFragment();
    let last=0, m;
    LATIN_RUN_RE.lastIndex=0;
    while((m=LATIN_RUN_RE.exec(text))){
      if(m.index>last) frag.appendChild(document.createTextNode(text.slice(last,m.index)));
      const sp=document.createElement('span');
      sp.dir='ltr';
      sp.textContent=m[0];
      frag.appendChild(sp);
      last=m.index+m[0].length;
    }
    if(last<text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    if(last>0) tn.replaceWith(frag);
  });
}

/* Extract the HTML between two plain-text offsets of a (detached) element,
   preserving inline formatting via Range.cloneContents — partially covered
   spans are cloned with only the in-range portion of their text. Offsets
   are in el.textContent coordinates. */
function _sliceHTMLByText(root,start,end){
  function pos(off){
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,null);
    let acc=0,n;
    while((n=walker.nextNode())){
      const len=n.textContent.length;
      if(acc+len>=off) return [n,off-acc];
      acc+=len;
    }
    return null;
  }
  const p1=pos(start), p2=pos(end);
  if(!p1||!p2) return '';
  const r=document.createRange();
  r.setStart(p1[0],p1[1]); r.setEnd(p2[0],p2[1]);
  const d=document.createElement('div');
  d.appendChild(r.cloneContents());
  return d.innerHTML.trim();
}

/* Split one line's HTML at inline verse numbers, e.g.
     "…λόγος.* 2 οὗτος ἦν… 3 πάντα…"  (currentVerse=1)
   A standalone number only counts as a verse boundary if it
   (a) is delimited by whitespace (or string edge) on BOTH sides, and
   (b) continues the ascending sequence (=== currentVerse+1, then +1 again…).
   Apparatus numerals (˸1, °2, :1 — attached to a sign, or out of sequence)
   fail these tests and stay in the text, where _markupCriticalSigns then
   colors them. Returns [{verse, html}]: first segment has verse:'' meaning
   "continue the current verse"; later segments carry their new verse. */
function _splitInlineVerses(html,currentVerse){
  const host=document.createElement('div');
  host.innerHTML=html;
  const text=host.textContent;
  let expect=parseInt(currentVerse,10);
  if(isNaN(expect)) return [{verse:'',html}]; // no anchor verse — cannot validate ascending
  expect+=1;
  const cuts=[];
  const re=/\d{1,3}/g;
  let mm;
  while((mm=re.exec(text))){
    const s=mm.index, e=s+mm[0].length;
    const okBefore=(s===0)||/\s/.test(text[s-1]);
    const okAfter =(e===text.length)||/\s/.test(text[e]);
    if(okBefore&&okAfter&&(+mm[0])===expect){
      cuts.push({s,e,verse:mm[0]});
      expect++;
    }
  }
  if(!cuts.length) return [{verse:'',html}];
  const segs=[];
  let prevEnd=0, prevVerse='';
  for(const c of cuts){
    segs.push({verse:prevVerse, html:_sliceHTMLByText(host,prevEnd,c.s)});
    prevVerse=c.verse; prevEnd=c.e;
  }
  segs.push({verse:prevVerse, html:_sliceHTMLByText(host,prevEnd,text.length)});
  // Drop empty segments (e.g. a line that begins right at a cut)
  return segs.filter(sg=>{
    const t2=document.createElement('div'); t2.innerHTML=sg.html;
    return t2.textContent.trim().length>0;
  });
}

document.addEventListener('DOMContentLoaded',async()=>{
  // Normalize legacy saved palettes once: Midnight becomes Dark; every
  // retired or custom palette becomes the default Light appearance.
  setThemeMode(_currentThemeId());
  initWorkspaceChrome();
  // Runs once, blocking, before anything below touches project data (in
  // particular renderS1Recent() further down) — see projMigrateToIdbOnce
  // for why this is safe to await here (idempotent, resumable, leaves
  // localStorage untouched on any failure).
  try{ await projMigrateToIdbOnce(); }catch(_e){}
  try{ await projPurgeTrash(); await collectionPurgeTrash(); }catch(_e){}
  try{
    const savedCmtFs=parseInt(localStorage.getItem('exeg-cmt-fontsize'));
    _setCmtFontSize(isNaN(savedCmtFs)?CMT_FONT_SIZE:savedCmtFs);
  }catch(_){}
  document.getElementById('rows-scroll').addEventListener('scroll', drawConns);
  document.getElementById('dcanvas-scroll')?.addEventListener('scroll', drawConns);
  document.getElementById('cmargin')?.addEventListener('scroll', drawConns);
  // Reciprocal hover: hovering a comment card highlights its linked
  // Diagram View block. Delegated (not wired per-card) so it also covers
  // cards restored via undo/redo or loadData(). No-op outside Diagram View
  // since #dcanvas .dblock simply won't match.
  document.getElementById('cmargin')?.addEventListener('mouseover', ev=>{
    const card=ev.target.closest('.ccard');
    if(!card) return;
    const blk=document.querySelector(`#dcanvas .dblock[data-rid="${card.dataset.rid}"]`);
    if(blk) blk.classList.add('cmt-linked');
  });
  document.getElementById('cmargin')?.addEventListener('mouseout', ev=>{
    const card=ev.target.closest('.ccard');
    if(!card) return;
    const blk=document.querySelector(`#dcanvas .dblock[data-rid="${card.dataset.rid}"]`);
    if(blk) blk.classList.remove('cmt-linked');
  });
  window.addEventListener('resize',()=>{ drawConns(); refreshBrackets(); refreshDiagramConnectors(); if(typeof renderSectionStrips==='function') renderSectionStrips(); });
  // Rich paste handler for Screen 2
  const pasteTA=document.getElementById('paste-ta');
  if(pasteTA) pasteTA.addEventListener('paste', ev=>{
    ev.preventDefault();
    const html=ev.clipboardData.getData('text/html');
    const rtf=ev.clipboardData.getData('text/rtf');
    const plain=ev.clipboardData.getData('text/plain');
    // Logos puts no text/html on the clipboard at all — only RTF carries
    // its formatting (colors, bold, superscript). When HTML is absent but
    // RTF is present, convert the RTF to HTML ourselves ("Keep Source
    // Formatting"), then sanitize it exactly like a native HTML paste.
    let sanitized;
    if(html){
      sanitized=_sanitizePasteHTML(html);
    } else if(rtf&&/^\s*{\\rtf/.test(rtf)){
      try{ sanitized=_sanitizePasteHTML(_rtfToHTML(rtf)); }
      catch(err){ sanitized=_plainToHTML(plain); }
    } else {
      sanitized=_plainToHTML(plain);
    }
    // Insert at caret position or replace all if empty
    const sel=window.getSelection();
    if(sel&&sel.rangeCount){
      const range=sel.getRangeAt(0);
      range.deleteContents();
      const frag=range.createContextualFragment(sanitized);
      range.insertNode(frag);
      range.collapse(false);
      sel.removeAllRanges(); sel.addRange(range);
    } else {
      pasteTA.innerHTML=sanitized;
    }
    // Replace Logos PUA glyphs with readable substitutes
    _substitutePUAChars(pasteTA);
    // Color + bidi-isolate markers and plain Latin tokens so the RTL
    // preview reads correctly (matches what import will do to the text).
    _markupCriticalSigns(pasteTA);
    _isolateLatinRunsForPreview(pasteTA);
    // Best-effort preview cleanup: some sources (observed with Logos over
    // RTF) embed the trailing source citation twice — collapse an exact
    // duplicate down to one visible copy right here, so the preview
    // itself doesn't show it twice before the user ever confirms. The
    // authoritative pass (which actually routes the citation to
    // #citation-bar) runs later in parsePasteIntoRows regardless.
    {
      const lineEls=Array.from(pasteTA.children);
      const trailing=_findTrailingCitationLines(lineEls);
      const deduped=_dedupeCitationEls(trailing);
      if(deduped.length<trailing.length){
        trailing.filter(el=>!deduped.includes(el)).forEach(el=>el.remove());
      }
    }
  });
  renderS1Recent();
  // ── Critical-mark hover tooltip (one shared element, event delegation) ──
  const critTip=document.createElement('div');
  critTip.id='crit-tip';
  document.body.appendChild(critTip);
  document.addEventListener('mouseover',e=>{
    const tgt=e.target&&e.target.closest ? e.target : null;
    const mk=tgt ? tgt.closest('.crit-mark') : null;
    if(mk){
      // The apparatus/frame/discourse glossary (crit.*) is sourced from the
      // Lexham Discourse GREEK New Testament and doesn't necessarily hold
      // for Hebrew usage of the same bracket notation, so the popup only
      // appears in Greek sessions. The marks themselves stay colored and
      // bidi-isolated in every language — only the English glossary text
      // is Greek-specific and gated here.
      if(SESS!=='greek'){ critTip.classList.remove('show'); return; }
      const key=mk.dataset.crit||'';
      const txt=(typeof t==='function'?t('crit.'+key):'')||'';
      if(!txt||txt==='crit.'+key){critTip.classList.remove('show');return;}
      const srcLine=_critSourceFor(key);
      critTip.classList.add('wide');
      critTip.textContent='';
      const d1=document.createElement('div'); d1.className='crit-tip-desc'; d1.textContent=txt;
      critTip.appendChild(d1);
      if(srcLine){
        const d2=document.createElement('div'); d2.className='crit-tip-src'; d2.textContent=srcLine;
        critTip.appendChild(d2);
      }
      const r=mk.getBoundingClientRect();
      critTip.style.left=Math.max(8, Math.min(window.innerWidth-378, r.left))+'px';
      critTip.style.top=(r.bottom+8)+'px';
      critTip.classList.add('show');
      return;
    }
    // Proposition divider glossary tooltip: same label set (Sentence,
    // Complex, ...), but two separate glossaries by language \u2014 LDGNT for
    // Greek (also used as the fallback for Chinese/Custom sessions, since
    // no Chinese-specific glossary exists), LDHB for Hebrew.
    const dv=tgt ? tgt.closest('.ann-divider') : null;
    if(dv){
      const lblEl=dv.querySelector('.ann-div-label');
      const lbl=(lblEl?lblEl.textContent:'').trim().toLowerCase();
      const propPrefix=SESS==='hebrew' ? 'prop-he.' : 'prop.';
      const desc=lbl&&typeof t==='function' ? t(propPrefix+lbl) : '';
      if(!desc||desc===propPrefix+lbl){critTip.classList.remove('show');return;}
      const srcLine=(typeof t==='function'?t(propPrefix+'source'):'')||'';
      critTip.classList.add('wide');
      critTip.textContent='';
      const d1=document.createElement('div'); d1.textContent=desc;
      critTip.appendChild(d1);
      if(srcLine&&srcLine!==propPrefix+'source'){
        const d2=document.createElement('div'); d2.className='crit-tip-src'; d2.textContent=srcLine;
        critTip.appendChild(d2);
      }
      const r=(lblEl||dv).getBoundingClientRect();
      critTip.style.left=Math.max(8, Math.min(window.innerWidth-378, r.left))+'px';
      critTip.style.top=(r.bottom+8)+'px';
      critTip.classList.add('show');
      return;
    }
    critTip.classList.remove('show');
  });
  document.addEventListener('scroll',()=>critTip.classList.remove('show'),true);
  // Read the version straight from sw.js's APP_VERSION at runtime rather
  // than a separately-maintained <meta> tag — the two drifted apart
  // because APP_VERSION gets bumped on every deploy but nothing ever
  // touched the meta tag, so Screen 1 quietly stopped updating. sw.js is
  // always fetched fresh from the network (never cached — see sw.js's own
  // comment on this), so this is guaranteed current with no second place
  // to remember to update.
  const vEl=document.getElementById('s1-version-num');
  if(vEl){
    fetch('./sw.js',{cache:'no-store'}).then(r=>r.text()).then(txt=>{
      const m=txt.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
      if(m) vEl.textContent=m[1];
    }).catch(()=>{});
  }
  // Show "Updated" toast if page just reloaded after a SW update
  if(sessionStorage.getItem('sw-just-updated')){
    sessionStorage.removeItem('sw-just-updated');
    setTimeout(()=>toast(t('sw.updated-toast')), 800);
  }
});

/* ── Ctrl+Space — toggle UI language ── */
document.addEventListener('keydown',function(ev){
  if(!(ev.ctrlKey||ev.metaKey)||ev.shiftKey||ev.altKey)return;
  if(ev.key!==' '&&ev.key!=='Spacebar')return;
  ev.preventDefault();
  if(typeof toggleLang==='function')toggleLang();
});

/* ── Alt+1/2/3/4/T/L/D/A/B/S/J/K/H hotkeys ── */
document.addEventListener('keydown',function(ev){
  if(!ev.altKey||ev.shiftKey||ev.ctrlKey||ev.metaKey)return;
  if(!'1234tTlLdDaAbBcCeEsSjJkKhH'.includes(ev.key))return;
  const tag=(ev.target.tagName||'').toLowerCase();
  if(tag==='input'||tag==='textarea'||ev.target.isContentEditable)return;
  const s2Visible=!document.getElementById('s2')?.classList.contains('hidden');
  if(s2Visible)return;
  const s1Visible=!document.getElementById('s1')?.classList.contains('hidden');
  if(s1Visible&&ev.key!=='1')return;
  if(!s1Visible&&typeof _isModalOpen==='function'&&_isModalOpen())return;
  ev.preventDefault();
  if(ev.key==='1'&&typeof openProjects==='function')openProjects();
  if(ev.key==='2'&&typeof window.openBible==='function')window.openBible();
  if(ev.key==='3'&&!s1Visible) toggleCmtPane();
  if(ev.key==='4'&&!s1Visible) toggleStudyNotebook();
  if((ev.key==='t'||ev.key==='T')&&!s1Visible){
    setEditorView(EDITOR_VIEW==='diagram'?'phrasing':'diagram');
  }
  if((ev.key==='l'||ev.key==='L')&&!s1Visible&&EDITOR_VIEW==='diagram'){
    addDiagramLabel();
  }
  // Annotation shortcuts
  if((ev.key==='d'||ev.key==='D')&&!s1Visible&&EDITOR_VIEW==='phrasing'){
    addDivider();
  }
  if((ev.key==='h'||ev.key==='H')&&!s1Visible&&EDITOR_VIEW==='phrasing'){
    toggleDividersVisible();
  }
  if((ev.key==='s'||ev.key==='S')&&!s1Visible){
    addSection(); // view-aware internally (Phrasing vs Diagram anchor)
  }
  if((ev.key==='j'||ev.key==='J')&&!s1Visible&&EDITOR_VIEW==='diagram'){
    toggleDgTransVisible();
  }
  if((ev.key==='k'||ev.key==='K')&&!s1Visible){
    // Same key, contextual per view — each toggle only exists/matters in its own view
    if(EDITOR_VIEW==='diagram') toggleDgSecEndVisible();
    else if(EDITOR_VIEW==='phrasing') toggleSectionsVisible();
  }
  if((ev.key==='a'||ev.key==='A')&&!s1Visible&&EDITOR_VIEW==='diagram'){
    startFreeArrow();
  }
  if((ev.key==='e'||ev.key==='E')&&!s1Visible&&EDITOR_VIEW==='diagram'){
    toggleDiagramEditMode();
  }
});

/* ════════════════════════════════════════
   MOBILE/TABLET TWO-TIER TOOLBAR
   Desktop (fine pointer) keeps the single-row toolbar exactly as it has
   always worked. On coarse pointer, the view-specific groups — never
   duplicated, the actual same elements with their actual same handlers
   and ids — get physically moved into a collapsible panel below the
   always-visible top row (Undo/Redo, Phrasing/Diagram, this
   toggle, and the right-side cluster stay put either way). Reversible:
   if the pointer capability changes (matchMedia can update live, e.g. a
   mouse gets connected to a tablet), everything moves back to its exact
   original position.
════════════════════════════════════════ */
const MOBILE_TOOL_GROUPS=[
  {section:'Format',   ids:['phrasing-inline-fmt-grp','phrasing-sz-grp','phrasing-sz-split-grp','phrasing-color-grp','phrasing-indent-grp']},
  {section:'Dividers',  ids:['divider-grp','psection-grp']},
  {section:'Diagram view', ids:['dzoom-grp','dfont-grp','tb-tgl-dgtrans']},
  {section:'Sections',  ids:['dsection-grp']},
  {section:'Tools',    ids:['tb-add-label','tb-add-cmt','tb-dem','tb-add-arrow','tb-add-connector','tb-add-bracket']},
];
let _mobileToolbarActive=false;

function _syncMobileToolbarLayout(){
  const coarse=window.matchMedia('(pointer:coarse)').matches;
  if(coarse===_mobileToolbarActive) return;
  _mobileToolbarActive=coarse;
  const panel=document.getElementById('toolbar-panel');
  if(!panel) return;
  let inner=document.getElementById('toolbar-panel-inner');
  if(!inner){
    inner=document.createElement('div');
    inner.id='toolbar-panel-inner';
    panel.appendChild(inner);
  }

  if(coarse){
    inner.innerHTML='';
    MOBILE_TOOL_GROUPS.forEach(grp=>{
      const els=grp.ids.map(id=>document.getElementById(id)).filter(Boolean);
      if(!els.length) return;
      const sec=document.createElement('div'); sec.className='tp-section';
      const lbl=document.createElement('p'); lbl.className='tp-section-label'; lbl.textContent=grp.section;
      const row=document.createElement('div'); row.className='tp-row';
      els.forEach(el=>{
        // Leave a marker comment at the element's original spot so it can
        // be restored to the EXACT same position later — a plain JS
        // reference on the element itself (not an id lookup, comment
        // nodes can't have ids) since the element persists in memory the
        // whole time, it's only ever relocated, never destroyed/rebuilt.
        if(!el._mtAnchor){
          const anchor=document.createComment('mt-anchor');
          el.parentNode.insertBefore(anchor, el.nextSibling);
          el._mtAnchor=anchor;
        }
        row.appendChild(el);
      });
      sec.append(lbl, row);
      inner.appendChild(sec);
    });
    _refreshMobilePanelSections();
  } else {
    MOBILE_TOOL_GROUPS.forEach(grp=>{
      grp.ids.forEach(id=>{
        const el=document.getElementById(id);
        if(el && el._mtAnchor && el._mtAnchor.parentNode){
          el._mtAnchor.parentNode.insertBefore(el, el._mtAnchor);
        }
      });
    });
    inner.innerHTML='';
    panel.classList.remove('open');
    document.getElementById('tb-mobile-tools')?.classList.remove('on');
  }
}

// A .tp-section only exists to group buttons that are relevant to the
// CURRENT view — but the elements inside it are gated by setEditorView()
// independently of which section wraps them, so a section whose every
// button just got hidden (e.g. "Diagram view" while Phrasing is active)
// would otherwise still show its own label with nothing beneath it. Hide
// the whole section (label included) whenever none of its own children
// are currently visible.
function _refreshMobilePanelSections(){
  document.querySelectorAll('#toolbar-panel-inner .tp-section').forEach(sec=>{
    const row=sec.querySelector('.tp-row');
    const anyVisible=row && [...row.children].some(el=>getComputedStyle(el).display!=='none');
    sec.style.display=anyVisible?'':'none';
  });
}

function toggleMobileToolPanel(){
  const panel=document.getElementById('toolbar-panel');
  const btn=document.getElementById('tb-mobile-tools');
  if(!panel) return;
  const willOpen=!panel.classList.contains('open');
  panel.classList.toggle('open', willOpen);
  btn?.classList.toggle('on', willOpen);
}

// Stays open while interacting with anything inside it or the toggle
// button itself; dismisses on tapping anywhere else (canvas, content).
document.addEventListener('click', ev=>{
  const panel=document.getElementById('toolbar-panel');
  if(!panel || !panel.classList.contains('open')) return;
  const btn=document.getElementById('tb-mobile-tools');
  if(panel.contains(ev.target) || (btn && btn.contains(ev.target))) return;
  panel.classList.remove('open');
  btn?.classList.remove('on');
});

_syncMobileToolbarLayout();
if(window.matchMedia){
  const mq=window.matchMedia('(pointer:coarse)');
  if(mq.addEventListener) mq.addEventListener('change', _syncMobileToolbarLayout);
  else if(mq.addListener) mq.addListener(_syncMobileToolbarLayout); // older Safari
}

/* ════════════════════════════════════════
   DIAGRAM VIEW PINCH-TO-ZOOM (Stage 1)
   Touch-only, two-finger gesture wired directly into setDiagramZoom() —
   same clamping (50–200%) the existing +/- buttons already use. Pointer
   Events are inherently single-finger per event, so each finger's own
   down/move/up sequence is tracked independently by pointerId; when
   exactly two are simultaneously down, their distance is measured on
   each move and the CHANGE in distance (relative to where the pinch
   started) drives the zoom percentage.

   _pinchActive is checked at the top of every OTHER diagram drag
   handler's onMove (block drag, label drag/resize, bracket serif/label
   drag, free arrow draw/handle-drag, right-angle and curve connector
   drag/tap-tracking) — those listeners aren't scoped to a specific
   pointerId, so a second finger touching down mid-drag would otherwise
   feed its own movement into the same handler and make whatever was
   being dragged jump around erratically. Freezing those handlers the
   moment a pinch starts (rather than trying to actively cancel an
   already-in-progress drag, which the closure-based structure of those
   functions doesn't cleanly support) is what actually makes pinch safe
   to use near existing draggable content.

   No anchor-point compensation yet (Stage 2) — zoom applies from the
   same fixed origin the +/- buttons already use, just gesture-driven
   instead of click-driven.
════════════════════════════════════════ */
let _pinchActive=false;
const _pinchPointers=new Map(); // pointerId -> {x,y}
let _pinchStartDist=null;
let _pinchStartZoom=null;

function _initDiagramPinchZoom(){
  const scroll=document.getElementById('dcanvas-scroll');
  if(!scroll) return;

  scroll.addEventListener('pointerdown', ev=>{
    if(ev.pointerType!=='touch' || EDITOR_VIEW!=='diagram') return;
    _pinchPointers.set(ev.pointerId, {x:ev.clientX, y:ev.clientY});
    if(_pinchPointers.size===2){
      _pinchActive=true;
      // touch-action:pan-x pan-y (set in CSS) still lets the browser's
      // own native panning respond to the same two fingers while our JS
      // is independently driving zoom — two systems touching the
      // canvas's geometry at once. Fully disabling touch-action for the
      // duration of the gesture removes that possible race; pan-x pan-y
      // is restored the moment the pinch ends so normal one-finger
      // scrolling keeps working immediately after.
      scroll.style.touchAction='none';
      const pts=[..._pinchPointers.values()];
      _pinchStartDist=Math.hypot(pts[0].x-pts[1].x, pts[0].y-pts[1].y);
      _pinchStartZoom=DIAGRAM_ZOOM;
    }
  });

  scroll.addEventListener('pointermove', ev=>{
    if(!_pinchPointers.has(ev.pointerId)) return;
    _pinchPointers.set(ev.pointerId, {x:ev.clientX, y:ev.clientY});
    if(_pinchActive && _pinchPointers.size===2 && _pinchStartDist>0){
      const pts=[..._pinchPointers.values()];
      const dist=Math.hypot(pts[0].x-pts[1].x, pts[0].y-pts[1].y);
      setDiagramZoom(Math.round(_pinchStartZoom*(dist/_pinchStartDist)));
    }
  });

  const endPointer=ev=>{
    _pinchPointers.delete(ev.pointerId);
    if(_pinchPointers.size<2){
      const wasActive=_pinchActive;
      _pinchActive=false;
      _pinchStartDist=null;
      _pinchStartZoom=null;
      scroll.style.touchAction='';
      // Defensive final correction: whatever the cause of any drift
      // during the live gesture, force one definitive recompute against
      // the settled DOM once nothing else is still moving, so connectors
      // are guaranteed correct by the time the user's fingers lift, even
      // if the continuous mid-gesture updates weren't perfectly in sync.
      if(wasActive && typeof refreshDiagramConnectors==='function'){
        refreshDiagramConnectors();
      }
    }
  };
  scroll.addEventListener('pointerup', endPointer);
  scroll.addEventListener('pointercancel', endPointer);
}
_initDiagramPinchZoom();
