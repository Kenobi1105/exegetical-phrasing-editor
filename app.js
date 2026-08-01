/* ════════════════════════════════════════
   STATE
════════════════════════════════════════ */
let SESS='', LANG='', IS_RTL=false, IS_SINGLE=false;
// Per-column Phrasing font sizes (px). Hebrew sessions default the
// original-text column larger (18) since Hebrew glyphs read smaller
// than Latin translation text at the same nominal size; translation
// stays at the normal default. Not persisted per-project — resets to
// the session's default every time a session/project is (re)loaded,
// same philosophy as the Phrasing/Diagram view toggles.
let CEDIT_O_SIZE=14, CEDIT_T_SIZE=14;
let DEFAULT_O_SIZE=14, DEFAULT_T_SIZE=14; // this session's reset targets
const FSZ_MIN=8, FSZ_MAX=40, FSZ_STEP=1;
// NOTE: sessionVersionLabel is declared in bible.js as a shared global.
// Do not redeclare it here with let/var — that would throw a SyntaxError
// when both scripts are loaded in the same non-module scope.
let hlColor='#F0D08F';
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

// Tracks user-adjusted column widths (null = use flex/default)
const COL_WIDTHS={v:null, o:null, t:null};

const DCOLORS={bg:'#F7F3E9',accent:'#F0D08F',ink:'#1F1E1E',sig:'#493548',label:'#F7F3E9',active:'#C8A84B',crit:'#1E6AFE'};

/* ── Diagram View state ──
   EDITOR_VIEW: 'phrasing' | 'diagram' — which canvas is currently shown.
   DIAGRAM_DATA: connectors + labels, saved alongside rows in
   collectData()/loadData(). Translation text renders directly below each
   block with a fixed gap (see makeDiagramRowEl). Floating labels remain
   stubbed (empty array) until a later stage.
   SELECTED_CNX_ID: the currently-selected connector's id (or null), used
   to highlight it and show the style/color/delete edit popup.
   A connector's shape is `kind: 'curve' | 'rightangle'`:
   - 'curve': the original freeform Shift+drag connector, hooked S-curve,
     top/bottom-edge snapped anchors, rendered IN FRONT of block content.
   - 'rightangle': drawn from the small "+" at a block's left-edge midpoint
     (right-edge in RTL), always a single 90° bend, both ends fixed at the
     left-edge midpoint (mirrored in RTL) of their block, rendered BEHIND
     block content — for tracing clause/subordination logic without
     obscuring text.
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
let DIAGRAM_EDIT_MODE=false; // true = diagram word-edit mode active
let DIAGRAM_DATA={connectors:[], labels:[]};
let CNX=0; // connector ID counter, same idiom as RC (row counter) / CC (comment counter)
let LBL=0; // floating label ID counter
let SELECTED_CNX_ID=null;
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
  CEDIT_O_SIZE = DEFAULT_O_SIZE = (SESS==='hebrew') ? 18 : 14;
  CEDIT_T_SIZE = DEFAULT_T_SIZE = 14;
  document.documentElement.style.setProperty('--cedit-o-size', CEDIT_O_SIZE+'px');
  document.documentElement.style.setProperty('--cedit-t-size', CEDIT_T_SIZE+'px');
  document.querySelectorAll('[id^="oc-"] .cedit').forEach(c=>{ c.style.fontSize=CEDIT_O_SIZE+'px'; });
  document.querySelectorAll('[id^="tc-"] .cedit').forEach(c=>{ c.style.fontSize=CEDIT_T_SIZE+'px'; });
  const ot=document.getElementById('phrasing-sz-txt'); if(ot) ot.textContent=CEDIT_O_SIZE+'px';
  if(typeof setDiagramFontSize==='function') setDiagramFontSize(18);
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
  setSourceCitation(''); // parsePasteIntoRows (below, if pasting) sets it fresh
  if(typeof _brkCancelPending==='function') _brkCancelPending();
  if(typeof _brkCloseEditPopup==='function') _brkCloseEditPopup();
  document.getElementById('dbrk-svg')?.remove();
  if(typeof slLoadDeck==='function') slLoadDeck({slides:[]});
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
        onfocus="trackFocus(this,${rid})" onblur="autoSave()"
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
        oninput="recomputeIds();autoSave()"
        onkeydown="onVerseKey(event,${rid})"/>
    </div>
    <div class="xcell mid" style="width:52px;min-width:52px">
      <div class="lid">—</div>
    </div>
    <div class="vdiv"></div>
    <div class="xcell grow" id="oc-${rid}" style="${ocStyle}">
      <div class="cedit${rtl}" contenteditable="true" spellcheck="false"
        data-ph="${origPH}"
        onfocus="trackFocus(this,${rid})" onblur="autoSave()"
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

/* ════════════════════════════════════════
   DIAGRAM VIEW
   Stage 1: toggle between Phrasing View and
   Diagram View. Both render the SAME row
   data (text, verse, indent) — Diagram View
   adds no new data of its own yet.
════════════════════════════════════════ */
function setEditorView(view){
  // If presenting, end the presentation first before switching views
  if(SL_PROJ_WIN&&!SL_PROJ_WIN.closed){
    slEndPresent();
  }
  if(view!==EDITOR_VIEW){
    EDITOR_VIEW=view;
    autoSave();
  }
  const isDiagram=EDITOR_VIEW==='diagram';
  const isSlides =EDITOR_VIEW==='slides';
  const isPhrasing=!isDiagram&&!isSlides;
  document.getElementById('tzone').style.display    = (!isDiagram&&!isSlides)?'':'none';
  document.getElementById('dzone').style.display    = isDiagram?'':'none';
  document.getElementById('szone').style.display    = isSlides ?'flex':'none';
  document.getElementById('sl-presenter').style.display='none';
  // Section strips are measured via getBoundingClientRect() on Phrasing's
  // rows, which are always 0,0,0,0 while tzone is display:none (e.g. a
  // section created from Diagram View) — nothing recomputed them once
  // Phrasing became visible again, so a strip created elsewhere stayed
  // permanently collapsed. Recompute right after rows become visible.
  if(isPhrasing && typeof renderSectionStrips==='function') renderSectionStrips();
  // Hide comment pane in Slides View (it overlaps slide canvas and is irrelevant)
  const cmargin=document.getElementById('cmargin');
  if(cmargin){
    if(isSlides){
      cmargin.dataset.slHidden=cmargin.classList.contains('pane-hidden')?'1':'0';
      cmargin.classList.add('pane-hidden');
    } else if(cmargin.dataset.slHidden==='0'){
      cmargin.classList.remove('pane-hidden');
    }
  }
  document.getElementById('view-btn-phrasing')?.classList.toggle('active',EDITOR_VIEW==='phrasing');
  document.getElementById('view-btn-diagram')?.classList.toggle('active',isDiagram);
  document.getElementById('view-btn-slides')?.classList.toggle('active',isSlides);
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
  const slidesPdfBtn =document.getElementById('export-slides-pdf-btn');
  if(phrasePdfBtn)  phrasePdfBtn.style.display  =(!isDiagram&&!isSlides)?'':'none';
  if(diagPdfBtn)    diagPdfBtn.style.display     =isDiagram              ?'':'none';
  if(slidesPdfBtn)  slidesPdfBtn.style.display   =isSlides               ?'':'none';
  if(!isDiagram){
    SELECTED_DIAG_RID=null;
    document.querySelectorAll('#dcanvas .dblock.selected').forEach(b=>b.classList.remove('selected'));
    const popup=document.getElementById('conn-edit-popup');
    if(popup) popup.style.display='none';
    cancelRightAngleArm();
  }
  // Disable comment pane toggle in Slides View
  const cmtBtn=document.getElementById('btn-cmt-pane');
  if(cmtBtn) cmtBtn.disabled=isSlides;
  if(isDiagram) renderDiagram();
  if(isSlides) setTimeout(()=>slRenderAll(), 80);
  if(typeof refreshBrackets==='function') setTimeout(()=>refreshBrackets(), 80);
  if(typeof _refreshMobilePanelSections==='function') _refreshMobilePanelSections();
}

function _repositionCmtCards(isDiagram){
  const mg=document.getElementById('cmargin');
  if(!mg) return;
  const mr=mg.getBoundingClientRect();
  document.querySelectorAll('.ccard').forEach(card=>{
    const rid=card.dataset.rid;
    let rowEl=null;
    if(isDiagram){
      rowEl=document.querySelector(`#dcanvas .drow[data-rid="${rid}"]`);
    } else {
      rowEl=document.querySelector(`.xrow[data-rid="${rid}"]`);
    }
    if(!rowEl) return;
    const rr=rowEl.getBoundingClientRect();
    const scrollEl=isDiagram
      ? document.getElementById('dcanvas-scroll')
      : document.getElementById('rows-scroll');
    const scrollTop=scrollEl?scrollEl.scrollTop:0;
    const newTop=Math.max(4, rr.top-mr.top+scrollTop-6);
    card.style.top=newTop+'px';
  });
  setTimeout(drawConns,50);
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
  ['dconns','dconns-back'].forEach(id=>{
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
    ['dconns','dconns-back'].forEach(id=>{
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
  raHandle.setAttribute('aria-label', typeof t==='function'?t('diagram.rightangle-handle'):'Draw right-angle line');
  raHandle.innerHTML='+';
  raHandle.style.touchAction='none';
  raHandle.addEventListener('pointerdown', ev=>{ startRightAngleDraw(ev, rid); });
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
      const liveTc=document.querySelector(`#tc-${rid} .cedit`);
      if(liveTc) liveTc.innerHTML=transEl.innerHTML;
      autoSave();
    });
    // Also sync on blur as a defensive fallback (covers any edge case
    // where an 'input' event might not fire, e.g. some IME composition
    // flows) — matches the onblur="autoSave()" pattern Phrasing View cells
    // already use.
    transEl.addEventListener('blur', ()=>{
      const liveTc=document.querySelector(`#tc-${rid} .cedit`);
      if(liveTc) liveTc.innerHTML=transEl.innerHTML;
      autoSave();
    });
    transEl.addEventListener('focus', ()=>{ trackFocus(transEl, rid); });
    // Prevent Shift+drag-to-connect / plain-drag-to-indent from triggering
    // when interacting with the translation text itself — it's a normal
    // editable text field, not a draggable block.
    transEl.addEventListener('pointerdown', ev=>ev.stopPropagation());
    lane.appendChild(transEl);
  }

  // Always: verse | line | lane | spacer | pip — same in LTR and RTL
  dRow.appendChild(vCell);
  dRow.appendChild(lCell);
  dRow.appendChild(lane);

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
    label.addEventListener('blur',()=>{ ann.label=label.textContent.trim(); autoSave(); });
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
      ann.color=swatch.value;
      document.querySelectorAll(`.dsec-divider[data-ann-id="${ann.id}"]`)
        .forEach(d=>d.style.setProperty('--sec-color', ann.color));
      autoSave();
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

  const backSvg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  backSvg.id='dconns-back';
  backSvg.setAttribute('preserveAspectRatio','none');
  canvas.appendChild(backSvg);

  // Labels layer — kept as a structural placeholder but labels and brackets
  // are now appended directly to #dcanvas (position:relative), not here.
  // This avoids any counter-zoom % resolution complexity.
  const labelsLayer=document.createElement('div');
  labelsLayer.id='dlabels-layer';
  labelsLayer.style.cssText='position:absolute;inset:0;overflow:visible;pointer-events:none;';
  canvas.appendChild(labelsLayer);

  const rows=Array.from(document.querySelectorAll('.xrow'));
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

  // Front connector SVG layer is created fresh each render (innerHTML=''
  // above wiped any previous one) and appended LAST, after every block, so
  // curve connector lines paint IN FRONT of block content via normal DOM
  // stacking order — no z-index trickery needed. Same idiom as
  // drawConns()/#svgl.
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.id='dconns';
  svg.setAttribute('preserveAspectRatio','none');
  canvas.appendChild(svg);

  if(!rows.length) return;
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
    DIAGRAM_DATA.labels=DIAGRAM_DATA.labels.filter(l=>l.id!==lb.id);
    el.remove();
    autoSave();
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
    if(found) found.text=txt.textContent;
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
      const dx=IS_RTL?(startX-e.clientX):(e.clientX-startX);
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
  if(ev.ctrlKey || _connectorModeActive){
    ev.preventDefault();
    ev.stopPropagation();
    startConnectorDraw(ev, rid);
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
  hitPath.addEventListener('pointerdown', ev=>{ ev.stopPropagation(); });
  hitPath.addEventListener('click', ev=>{ ev.stopPropagation(); selectConnector(cnxId, ev); });
  return hitPath;
}

/* Build one CURVE connector with direction-aware endpoint placement.
   The arc travels through the SPACE BETWEEN the connected words/blocks:
   • Going DOWN (p1 above p2):  exits p1 BOTTOM (downward), lands on p2 TOP from above
   • Going UP   (p1 below p2):  exits p1 TOP (upward),    lands on p2 BOTTOM from below
   • Nearly horizontal:         use block fracY as-is (original behaviour)
   For word-level endpoints, the actual path endpoint is placed just outside
   the word edge (with WORD_ARROW_CLEARANCE) so the arrowhead sits clear of the text. */
function _makeCurveConnectorEl(cnx, fromEl, toEl, canvasRect, svg){
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
  g.setAttribute('class','dconn-group'+(isSelected?' selected':''));
  g.setAttribute('data-cnx-id',cnx.id);

  const path=document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('class','dconn-line');
  path.setAttribute('data-cnx-id',cnx.id);
  path.setAttribute('d', d);
  path.setAttribute('fill','none');
  _applyLineVisuals(path, cnx, svg);

  g.appendChild(_makeHitPath(d, cnx.id));
  g.appendChild(path);
  return g;
}

/* Formerly a small-belly variant for near-vertical connectors. The
   vertical-tangent S formula degrades gracefully to a straight drop as
   dx→0, so no separate shape is needed anymore — kept as a delegate so
   existing call sites (live diagram + slides clone) need no changes. */
function _connectorPathDTight(p1,p2,fromY,toY){
  return _connectorPathD(p1,p2,fromY,toY);
}

/* Build one RIGHT-ANGLE connector — single 90° bend, left/right-edge
   midpoint to left/right-edge midpoint. Rendered into the BACK svg layer
   (behind block content), otherwise structurally identical to a curve
   connector (same hit path, same style system). */
function _makeRightAngleConnectorEl(cnx, fromEl, toEl, canvasRect, svg, trunkX){
  const p1=_connectorPoint(fromEl, cnx.fromX??0, cnx.fromY??0.5, canvasRect);
  const p2=_connectorPoint(toEl, cnx.toX??0, cnx.toY??0.5, canvasRect);
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

  g.appendChild(_makeHitPath(d, cnx.id));
  g.appendChild(path);
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
  const canvas=document.getElementById('dcanvas');
  if(!svg||!backSvg||!canvas) return;
  // Place #dconns as the LAST child of #dcanvas so it paints ABOVE the block
  // ::before backgrounds. .dblock-text has position:relative; z-index:1 which
  // keeps text above the connector lines. #dconns-back stays first (right-angle
  // connectors remain behind blocks as structural lines).
  canvas.appendChild(svg);
  const canvasRect=canvas.getBoundingClientRect();
  svg.setAttribute('width', canvas.scrollWidth);
  svg.setAttribute('height', canvas.scrollHeight);
  svg.innerHTML='';
  backSvg.setAttribute('width', canvas.scrollWidth);
  backSvg.setAttribute('height', canvas.scrollHeight);
  backSvg.innerHTML='';
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
      backSvg.appendChild(_makeRightAngleConnectorEl(cnx, fromEl, toEl, canvasRect, backSvg, trunkX));
    } else {
      svg.appendChild(_makeCurveConnectorEl(cnx, fromEl, toEl, canvasRect, svg));
    }
  });
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
    toast(typeof t==='function'?t('ann.connector.hint'):'Ctrl+drag from any block or word to draw a connector. Drag to a word for word-level anchoring.');
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
function _onConnectorCommitted(){}

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
}

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
        pattern:'solid', startCap:'none', endCap:'arrow', weight:1.5, color:'#C8A84B'
      };
      DIAGRAM_DATA.connectors.push(newConnector);
      rowPush({type:'connector-add', connector:newConnector});
      autoSave();
      renderDiagramConnectors();
      _onConnectorCommitted();
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
    pattern:'solid', startCap:'none', endCap:'arrow', weight:1.5, color:'#C8A84B'
  };
  DIAGRAM_DATA.connectors.push(newConnector);
  rowPush({type:'connector-add', connector:newConnector});
  autoSave();
  renderDiagramConnectors();
  _onConnectorCommitted();
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
    pattern:'solid', startCap:'none', endCap:'arrow', weight:1, color:'#F0D08F'
  };
  DIAGRAM_DATA.connectors.push(newConnector);
  rowPush({type:'connector-add', connector:newConnector});
  autoSave();
  renderDiagramConnectors();
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
  renderDiagramConnectors(); // re-render so the selected line highlights
  openConnEditPopup(ev.clientX, ev.clientY);
}

function _selectedConnector(){
  return DIAGRAM_DATA.connectors.find(c=>c.id===SELECTED_CNX_ID) || null;
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
     e.target.closest('.dra-handle')) return;
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

  // Must be visible BEFORE measuring offsetWidth/Height for positioning.
  popup.style.display='flex';
  _refreshConnEditPopupControls();

  // Position near the click, clamped so it never renders off-screen.
  const pw=popup.offsetWidth||260, ph=popup.offsetHeight||40;
  let left=clientX-pw/2, top=clientY-ph-14;
  left=Math.max(8, Math.min(window.innerWidth-pw-8, left));
  top=Math.max(8, top);
  popup.style.left=left+'px';
  popup.style.top=top+'px';
}

function closeConnEditPopup(){
  const popup=document.getElementById('conn-edit-popup');
  if(popup) popup.style.display='none';
  closeCepDrops();
  closeColorPalette(); // a nested color palette shouldn't outlive its parent popup
  if(SELECTED_CNX_ID!==null){
    SELECTED_CNX_ID=null;
    renderDiagramConnectors(); // clear the selected-line highlight
  }
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
const PALETTE_TEXT_LIKE_TOOLS=['textColor','slTextColor','slShapeFill','slShapeStroke'];

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
  if(removeBtn) removeBtn.style.display=(toolKey==='highlight'||toolKey==='slHighlight')?'block':'none';

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
  } else if(PALETTE_ACTIVE_TOOL==='lineColor'){
    setConnectorColor(color);

    autoSave();
  } else if(PALETTE_ACTIVE_TOOL==='slTextColor'){
    slFmtColor(color);
    const btn=document.getElementById('sl-fmt-color-btn'); if(btn) btn.style.background=color;
  } else if(PALETTE_ACTIVE_TOOL==='slHighlight'){
    slFmtHighlight(color);
    const btn=document.getElementById('sl-fmt-hl-btn'); if(btn) btn.style.background=color;
    // Highlighting is a one-shot "paint and done" action, same as the main
    // editor's highlight tool — close immediately rather than leaving the
    // popover open (which invites re-clicking a preset against a selection
    // that's already been consumed/rewrapped in a span).
    closeColorPalette();
    return;
  } else if(PALETTE_ACTIVE_TOOL==='slShapeFill'){
    slShapeSetFill(color);
    const btn=document.getElementById('sl-shape-fill-btn'); if(btn){ btn.style.background=color; btn.classList.remove('sl-swatch-none'); }
  } else if(PALETTE_ACTIVE_TOOL==='slShapeStroke'){
    slShapeSetStroke(color);
    const btn=document.getElementById('sl-shape-stroke-btn'); if(btn){ btn.style.background=color; btn.classList.remove('sl-swatch-none'); }
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

// Dispatches the popover's "Remove highlight" button to whichever
// highlight-like tool currently owns it — the main editor's cell highlight
// (removeHl) or the Slides text-box highlight (slFmtHighlightClear).
function cppRemoveHl(){
  if(PALETTE_ACTIVE_TOOL==='slHighlight'){
    slFmtHighlightClear();
    closeColorPalette();
  } else {
    removeHl();
  }
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
  if(path.some(n=>n.closest && n.closest('#cep-color-swatch, #tb-hl, #tb-txt-color, #bep-color-swatch, #sl-shape-fill-btn, #sl-shape-stroke-btn, #sl-fmt-color-btn, #sl-fmt-hl-btn'))) return;
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
    const allRows=Array.from(document.querySelectorAll('.xrow'));
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

function applyRowUndo(op){
  // Slide ops
  if(typeof _slApplyUndo==='function' && _slApplyUndo(op)) return;
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
  // ── Comment box ops ───────────────────────────────────────────────────
  if(op.type==='cmt-add'){
    // Undo comment creation: remove the card and unmark the row
    const card=document.querySelector(`.ccard[data-cid="${op.cid}"]`);
    if(card) card.remove();
    const row=document.querySelector(`.xrow[data-rid="${op.rid}"]`);
    if(row){row.classList.remove('has-cmt');delete row.dataset.cid;
      const btn=row.querySelector('.cmtbtn');if(btn)btn.classList.remove('on');}
    drawConns(); return;
  }
  if(op.type==='cmt-remove'){
    // Undo comment deletion: restore the card
    const mg=document.getElementById('cmargin');if(!mg)return;
    const existing=document.querySelector(`.ccard[data-cid="${op.cid}"]`);
    if(!existing){
      const card=_buildCmtCard(op.cid,op.rid,op.lid,op.top,op.left,op.width,op.html);
      mg.appendChild(card);
      new ResizeObserver(drawConns).observe(card);
    }
    const row=document.querySelector(`.xrow[data-rid="${op.rid}"]`);
    if(row){row.dataset.cid=op.cid;row.classList.add('has-cmt');
      const btn=row.querySelector('.cmtbtn');if(btn)btn.classList.add('on');}
    drawConns(); return;
  }
  if(op.type==='cmt-move'){
    const card=document.querySelector(`.ccard[data-cid="${op.cid}"]`);
    if(card){card.style.left=op.prevLeft+'px';card.style.top=op.prevTop+'px';drawConns();}
    return;
  }
  if(op.type==='cmt-text'){
    const card=document.querySelector(`.ccard[data-cid="${op.cid}"]`);
    const ed=card?card.querySelector('.cedit-c'):null;
    if(ed){ed.innerHTML=op.before;_cmtTextBefore[op.cid]=op.before;}
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
  // Slide ops
  if(typeof _slApplyRedo==='function' && _slApplyRedo(op)) return;
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
    document.getElementById('svgl').innerHTML='';
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
  // ── Comment box ops ───────────────────────────────────────────────────
  if(op.type==='cmt-add'){
    // Redo comment creation: rebuild the card
    const mg=document.getElementById('cmargin');if(!mg)return;
    const existing=document.querySelector(`.ccard[data-cid="${op.cid}"]`);
    if(!existing){
      const card=_buildCmtCard(op.cid,op.rid,op.lid,op.top,op.left,op.width,'');
      mg.appendChild(card);
      new ResizeObserver(drawConns).observe(card);
    }
    const row=document.querySelector(`.xrow[data-rid="${op.rid}"]`);
    if(row){row.dataset.cid=op.cid;row.classList.add('has-cmt');
      const btn=row.querySelector('.cmtbtn');if(btn)btn.classList.add('on');}
    drawConns(); return;
  }
  if(op.type==='cmt-remove'){
    // Redo comment deletion: remove the card again
    const card=document.querySelector(`.ccard[data-cid="${op.cid}"]`);
    if(card) card.remove();
    const row=document.querySelector(`.xrow[data-rid="${op.rid}"]`);
    if(row){row.classList.remove('has-cmt');delete row.dataset.cid;
      const btn=row.querySelector('.cmtbtn');if(btn)btn.classList.remove('on');}
    drawConns(); return;
  }
  if(op.type==='cmt-move'){
    const card=document.querySelector(`.ccard[data-cid="${op.cid}"]`);
    if(card){card.style.left=op.nextLeft+'px';card.style.top=op.nextTop+'px';drawConns();}
    return;
  }
  if(op.type==='cmt-text'){
    const card=document.querySelector(`.ccard[data-cid="${op.cid}"]`);
    const ed=card?card.querySelector('.cedit-c'):null;
    if(ed){ed.innerHTML=op.after;_cmtTextBefore[op.cid]=op.after;}
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
    span.style.backgroundColor=hlColor;
    try{freshRange.surroundContents(span);}
    catch(e){const f=freshRange.extractContents();span.appendChild(f);freshRange.insertNode(span);}
  }

  const lastOp=ROW_STACK[ROW_STACK.length-1];
  if(lastOp&&lastOp.type==='fmtsnap') lastOp.after=ce.innerHTML;

  pushRecentColor('highlight', hlColor);
  _renderPaletteRows();
  closeColorPalette();
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
function toggleCmt(btn,rid){
  const row=document.querySelector(`.xrow[data-rid="${rid}"]`);if(!row)return;
  const ec=row.dataset.cid;
  if(ec){
    const card=document.querySelector(`.ccard[data-cid="${ec}"]`);
    if(card){const h=card.style.display==='none';card.style.display=h?'flex':'none';btn.classList.toggle('on',h);drawConns();}
    return;
  }
  const cid=++CC;
  row.dataset.cid=cid;row.classList.add('has-cmt');btn.classList.add('on');
  const lid=row.querySelector('.lid')?.textContent||'';
  const mg=document.getElementById('cmargin');
  const rr=row.getBoundingClientRect(),mr=mg.getBoundingClientRect();
  const top=rr.top-mr.top+(document.getElementById('rows-scroll').scrollTop||0);
  const initLeft=18, initTop=Math.max(4,top-6), initW=226;
  const card=_buildCmtCard(cid,rid,lid,initTop,initLeft,initW);
  mg.appendChild(card);
  new ResizeObserver(drawConns).observe(card);
  rowPush({type:'cmt-add',cid,rid,top:initTop,left:initLeft,width:initW,lid});
  setTimeout(()=>{card.querySelector('.cedit-c').focus();drawConns();},40);
  autoSave();
}

/* Build a comment card element — shared by toggleCmt and undo restore */
function _buildCmtCard(cid,rid,lid,top,left,width,html){
  const card=document.createElement('div');
  card.className='ccard';card.dataset.cid=cid;card.dataset.rid=rid;
  card.style.cssText=`top:${top}px;left:${left}px;width:${width}px;`;
  card.innerHTML=`
    <div class="chdr" onmousedown="startDrag(event,this.closest('.ccard'))">
      <span class="chdr-l">Comment</span><span class="chdr-i">${lid&&lid!=='—'?lid:''}</span>
      <button class="ccl" onclick="closeCmt('${cid}')">✕</button>
    </div>
    <div class="cbody">
      <div class="cedit-c" contenteditable="true" spellcheck="false"
        onfocus="_cmtFocusSnap(this,${cid})" onblur="_cmtBlurSnap(this,${cid});autoSave()"
        onkeydown="if(event.key==='Tab'){event.preventDefault();document.execCommand(event.shiftKey?'outdent':'indent',false,null);}setTimeout(()=>{saveRange();updateTb();},0)"></div>
    </div>
    <div class="crh" onmousedown="startCR2(event,this.closest('.ccard'))">
      <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="2" y1="10" x2="10" y2="2"/><line x1="6" y1="10" x2="10" y2="6"/></svg>
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

function closeCmt(cid){
  const card=document.querySelector(`.ccard[data-cid="${cid}"]`);if(!card)return;
  const rid=card.dataset.rid;
  const ed=card.querySelector('.cedit-c');
  const html=ed?ed.innerHTML:'';
  const top=parseInt(card.style.top)||4;
  const left=parseInt(card.style.left)||18;
  const width=card.offsetWidth||226;
  const lid=card.querySelector('.chdr-i')?.textContent||'';
  const row=document.querySelector(`.xrow[data-rid="${rid}"]`);
  if(row){row.classList.remove('has-cmt');delete row.dataset.cid;const btn=row.querySelector('.cmtbtn');if(btn)btn.classList.remove('on');}
  rowPush({type:'cmt-remove',cid,rid,top,left,width,html,lid});
  card.remove();drawConns();autoSave();
}
function drawConns(){
  const svg=document.getElementById('svgl');
  const cmarginEl=document.getElementById('cmargin');
  const mr=cmarginEl.getBoundingClientRect();
  // cmargin may scroll (overflow-y:auto). SVG is position:absolute;inset:0
  // so its coordinate origin is at cmargin's scroll origin, not viewport.
  // Add cmargin.scrollTop to all y values so lines track correctly.
  const cmScrollTop=cmarginEl.scrollTop||0;
  const totalH=Math.max(cmarginEl.scrollHeight, mr.height);
  svg.innerHTML='';
  svg.setAttribute('width',mr.width);
  svg.setAttribute('height',totalH);
  document.querySelectorAll('.ccard').forEach(card=>{
    if(card.style.display==='none')return;
    const rid=card.dataset.rid;
    // In Diagram View the Phrasing View rows (.xrow) are hidden (display:none)
    // so getBoundingClientRect() returns zeros. Use the .drow instead.
    let rowEl=null;
    if(EDITOR_VIEW==='diagram'){
      rowEl=document.querySelector(`#dcanvas .drow[data-rid="${rid}"]`);
    }
    if(!rowEl) rowEl=document.querySelector(`.xrow[data-rid="${rid}"]`);
    if(!rowEl)return;
    const rr=rowEl.getBoundingClientRect(),cr=card.getBoundingClientRect();
    // Convert viewport-relative coords to cmargin scroll-space coords
    const x1=2;
    const y1=rr.top+rr.height/2-mr.top+cmScrollTop;
    const x2=cr.left-mr.left;
    const y2=cr.top+20-mr.top+cmScrollTop;
    const cx1=x1+(x2-x1)*.55,cx2=x2-(x2-x1)*.25;
    const p=document.createElementNS('http://www.w3.org/2000/svg','path');
    p.setAttribute('class','cline');p.setAttribute('d',`M${x1},${y1} C${cx1},${y1} ${cx2},${y2} ${x2},${y2}`);svg.appendChild(p);
    const d=document.createElementNS('http://www.w3.org/2000/svg','circle');
    d.setAttribute('cx',x1);d.setAttribute('cy',y1);d.setAttribute('r','3');
    d.setAttribute('fill','var(--sig)');d.setAttribute('opacity','.45');svg.appendChild(d);
  });
}
function startDrag(e,card){
  if(e.target.classList.contains('ccl'))return;e.preventDefault();
  const sx=e.clientX,sy=e.clientY,sl=parseInt(card.style.left)||18,st=parseInt(card.style.top)||4;
  const cid=Number(card.dataset.cid);
  const mm=ev=>{card.style.left=Math.max(0,sl+ev.clientX-sx)+'px';card.style.top=Math.max(0,st+ev.clientY-sy)+'px';drawConns();};
  const mu=()=>{
    document.removeEventListener('mousemove',mm);document.removeEventListener('mouseup',mu);
    const nl=parseInt(card.style.left)||18,nt=parseInt(card.style.top)||4;
    if(nl!==sl||nt!==st) rowPush({type:'cmt-move',cid,prevLeft:sl,prevTop:st,nextLeft:nl,nextTop:nt});
    autoSave();
  };
  document.addEventListener('mousemove',mm);document.addEventListener('mouseup',mu);
}
function startCR2(e,card){
  e.preventDefault();e.stopPropagation();
  const sx=e.clientX,sy=e.clientY,sw=card.offsetWidth,sh=card.offsetHeight;
  const mm=ev=>{card.style.width=Math.max(180,sw+ev.clientX-sx)+'px';card.style.height=Math.max(100,sh+ev.clientY-sy)+'px';drawConns();};
  const mu=()=>{document.removeEventListener('mousemove',mm);document.removeEventListener('mouseup',mu);autoSave();};
  document.addEventListener('mousemove',mm);document.addEventListener('mouseup',mu);
}

/* Scroll #cmargin so the comment card nearest to the diagram viewport
   centre comes into view when the diagram canvas is scrolled. */
function _scrollCmarginToVisible(){
  const scrollEl=document.getElementById('dcanvas-scroll');
  const cmarginEl=document.getElementById('cmargin');
  if(!scrollEl||!cmarginEl) return;
  const cards=[...document.querySelectorAll('.ccard')]
    .filter(c=>c.style.display!=='none');
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
  // card.style.top is in cmargin scroll space — scroll to centre it
  const cardTop=parseInt(bestCard.style.top)||0;
  const cardH=bestCard.offsetHeight||100;
  const target=cardTop+cardH/2-cmarginEl.clientHeight/2;
  cmarginEl.scrollTo({top:Math.max(0,target),behavior:'smooth'});
}

/* Select a diagram block by rid — gold outline, deselects previous */
function selectDiagBlock(rid){
  // Clear previous selection
  document.querySelectorAll('#dcanvas .dblock.selected')
    .forEach(b=>b.classList.remove('selected'));
  SELECTED_DIAG_RID=rid||null;
  if(rid){
    const blk=document.querySelector(`#dcanvas .dblock[data-rid="${rid}"]`);
    if(blk) blk.classList.add('selected');
  }
}

/* Toggle the comment pane (#cmargin) show/hide */
function toggleCmtPane(){
  if(EDITOR_VIEW==='slides') return; // disabled in Slides View
  const cm=document.getElementById('cmargin');
  if(!cm) return;
  const hidden=cm.classList.toggle('pane-hidden');
  const btn=document.getElementById('btn-cmt-pane');
  if(btn) btn.classList.toggle('active',!hidden);
  if(!hidden) setTimeout(drawConns,50);
}

/* Feature 3: Add comment anchored to the currently focused or last-focused row */
function addCommentOnFocusedRow(){
  if(EDITOR_VIEW==='diagram'){
    // In Diagram View: require a selected block
    if(!SELECTED_DIAG_RID){
      toast(typeof t==='function'?t('toast.select-block-first'):'Select a block first.');
      return;
    }
    const rid=SELECTED_DIAG_RID;
    // Check if this row already has a comment card
    const pRow=document.querySelector(`.xrow[data-rid="${rid}"]`);
    const ec=pRow?pRow.dataset.cid:null;
    if(ec){
      // Toggle existing card visibility
      const card=document.querySelector(`.ccard[data-cid="${ec}"]`);
      if(card){
        const h=card.style.display==='none';
        card.style.display=h?'flex':'none';
        const btn=pRow?pRow.querySelector('.cmtbtn'):null;
        if(btn) btn.classList.toggle('on',h);
        drawConns();
      }
      return;
    }
    // Create new comment card positioned at the selected drow's vertical position
    const cid=++CC;
    if(pRow){pRow.dataset.cid=cid;pRow.classList.add('has-cmt');}
    const btn=pRow?pRow.querySelector('.cmtbtn'):null;
    if(btn) btn.classList.add('on');
    const lid=pRow?pRow.querySelector('.lid')?.textContent||'':'';
    const mg=document.getElementById('cmargin');
    // Compute top from the drow's position relative to cmargin
    const drow=document.querySelector(`#dcanvas .drow[data-rid="${rid}"]`);
    const mr=mg.getBoundingClientRect();
    let top=8;
    if(drow){
      const dr=drow.getBoundingClientRect();
      // In diagram view use dcanvas-scroll's scrollTop, not rows-scroll
      const scrollEl=document.getElementById('dcanvas-scroll');
      top=Math.max(4, dr.top-mr.top+(scrollEl?scrollEl.scrollTop:0));
    }
    const initLeft=18, initW=226;
    const card=_buildCmtCard(cid,rid,lid,top,initLeft,initW);
    mg.appendChild(card);
    new ResizeObserver(drawConns).observe(card);
    rowPush({type:'cmt-add',cid,rid,top,left:initLeft,width:initW,lid});
    setTimeout(()=>{card.querySelector('.cedit-c').focus();drawConns();},40);
    autoSave();
    return;
  }
  // Phrasing View: use lastFocusedRowEl
  if(lastFocusedRowEl){
    const rid=lastFocusedRowEl.dataset.rid;
    const btn=lastFocusedRowEl.querySelector('.cmtbtn');
    if(rid) toggleCmt(btn||{classList:{add:()=>{},toggle:()=>{},remove:()=>{}}},rid);
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
  // In Screen 1: only allow Ctrl+O and Ctrl+Shift+1
  const inS1=!document.getElementById('s1').classList.contains('hidden');
  if(inS1){
    if((e.key==='o'||e.key==='O')&&!e.shiftKey&&!e.altKey){e.preventDefault();document.getElementById('s1-load-file')?.click();return;}
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
    else { addEmptyRow(lastFocusedRowEl||undefined); }
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
  document.getElementById('svgl').innerHTML='';
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
  // Reset bracket, annotation, and slide state
  BRACKETS=[]; BRK_CTR=0; SELECTED_BRK_ID=null;
  ANNOTATIONS=[]; ANN_CTR=0;
  if(typeof _brkCancelPending==='function') _brkCancelPending();
  if(typeof slLoadDeck==='function') slLoadDeck({slides:[]});
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

function openSettings(){
  const m=document.getElementById('set-modal');
  if(m){m.classList.remove('hidden');}
  // Close sidebars so they don't overlap the modal
  if(typeof closeProjects==='function')closeProjects();
  if(typeof closeBible==='function')closeBible();
  // Snapshot current values for change detection
  window._settingsSnapshot={
    bg:document.getElementById('sc-bg')?.value,
    accent:document.getElementById('sc-accent')?.value,
    ink:document.getElementById('sc-ink')?.value,
    sig:document.getElementById('sc-sig')?.value,
    label:document.getElementById('sc-label')?.value,
    active:document.getElementById('sc-active')?.value,
    crit:document.getElementById('sc-crit')?.value,
  };
  // Click outside to close (with change detection)
  setTimeout(()=>{
    const handler=e=>{
      const card=document.querySelector('#set-modal .mcard');
      if(card&&!card.contains(e.target)){settingsEscOrClickOutside();document.removeEventListener('mousedown',handler);}
    };
    document.addEventListener('mousedown',handler);
    document._settingsOutsideHandler=handler;
  },50);
}
function settingsHasChanges(){
  const snap=window._settingsSnapshot;
  if(!snap)return false;
  return ['bg','accent','ink','sig','label','active','crit'].some(k=>{
    const el=document.getElementById('sc-'+k);
    return el&&el.value!==snap[k];
  });
}
function settingsEscOrClickOutside(){
  if(settingsHasChanges()){
    if(!confirm(typeof t==='function'?t('confirm.discard-colors'):'You have unsaved color changes. Discard them?'))return;
    // Restore snapshot values
    const snap=window._settingsSnapshot;
    if(snap){
      ['bg','accent','ink','sig','label','active','crit'].forEach(k=>{
        const el=document.getElementById('sc-'+k);
        if(el&&snap[k])el.value=snap[k];
      });
    }
  }
  closeSettings();
}
function closeSettings(){
  const m=document.getElementById('set-modal');
  if(m)m.classList.add('hidden');
  if(document._settingsOutsideHandler){
    document.removeEventListener('mousedown',document._settingsOutsideHandler);
    document._settingsOutsideHandler=null;
  }
}
function resetColors(){
  const R=document.documentElement;
  Object.entries(DCOLORS).forEach(([k,v])=>{R.style.setProperty('--'+k,v);document.getElementById('sc-'+k).value=v;});
  toast(typeof t==='function'?t('toast.cleared-short'):'Colors reset');
}
function cssHex(css){
  if(!css)return'#000000';
  if(css.startsWith('#')){if(css.length===4)return'#'+css[1]+css[1]+css[2]+css[2]+css[3]+css[3];return css;}
  const m=css.match(/\d+/g);if(!m)return'#000000';
  return'#'+m.slice(0,3).map(x=>(+x).toString(16).padStart(2,'0')).join('');
}
function applySettings(){
  const R=document.documentElement;
  const map={bg:'--bg',accent:'--accent',ink:'--ink',sig:'--sig',label:'--label',active:'--active',crit:'--crit'};
  Object.entries(map).forEach(([k,cssVar])=>{
    const el=document.getElementById('sc-'+k);
    if(el)R.style.setProperty(cssVar,el.value);
  });
  // Persist
  const colors={};
  Object.keys(map).forEach(k=>{const el=document.getElementById('sc-'+k);if(el)colors[k]=el.value;});
  try{localStorage.setItem('exeg-colors',JSON.stringify(colors));}catch(_){}
  closeSettings();
  toast(typeof t==='function'?t('toast.saved'):' Settings applied');
}

/* ════════════════════════════════════════
   SAVE / LOAD / AUTOSAVE
════════════════════════════════════════ */
function collectData(){
  const rows=[];
  document.querySelectorAll('.xrow').forEach(row=>{
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
  document.querySelectorAll('.ccard').forEach(card=>{
    const ed=card.querySelector('.cedit-c');
    cmts.push({cid:card.dataset.cid,rid:card.dataset.rid,html:ed?ed.innerHTML:'',
      top:card.style.top,left:card.style.left,width:card.style.width,height:card.style.height,hidden:card.style.display==='none'});
  });
  const R=getComputedStyle(document.documentElement);
  const colors={};['bg','accent','ink','sig','label','active','crit'].forEach(k=>{colors[k]=R.getPropertyValue('--'+k).trim();});
  return{lang:SESS,langLabel:LANG,isRTL:IS_RTL,isSingle:IS_SINGLE,
    verseRef:document.getElementById('refin').value,
    versionLabel:sessionVersionLabel||document.getElementById('version-sub-input')?.value.trim()||'',
    rows,cmts,RC,CC,colors,
    colWidths:{...COL_WIDTHS},
    editorView:EDITOR_VIEW,CNX,LBL,
    diagramEditMode:DIAGRAM_EDIT_MODE,
    diagramFontSize:DIAGRAM_FONT_SIZE,
    diagramData:{connectors:[...DIAGRAM_DATA.connectors], labels:[...DIAGRAM_DATA.labels]},
    brackets: typeof collectBracketData==='function' ? collectBracketData() : [],
    annotations: ANNOTATIONS.map(a=>({...a})),
    annCtr: ANN_CTR,
    sourceCitation: SOURCE_CITATION,
    deck: typeof slCollectDeck==='function' ? slCollectDeck() : {slides:[]}};
}

/* Strips any background-color from inline style="" attributes in saved
   HTML. Projects saved before 202607221100 may still carry source-app
   background tints (Logos/BibleArc page backgrounds) baked into their
   stored origHTML/transHTML; new pastes never get this style in the
   first place (see _PASTE_SAFE_STYLES), but old saved rows need it
   stripped every time they're loaded. Regex-based (not DOM-based) since
   this also runs inside the batch diagram-PDF export loop across many
   projects. */
function _stripBgFromHTML(html){
  if(!html) return html;
  return html
    .replace(/style="([^"]*)"/gi, (m,decls)=>{
      const kept=decls.split(';').map(d=>d.trim()).filter(d=>d && !/^background(-color)?\s*:/i.test(d));
      return kept.length ? `style="${kept.join('; ')}"` : '';
    })
    .replace(/\sbgcolor="[^"]*"/gi, ''); // legacy attribute form
}

function loadData(data){
  document.getElementById('rows-body').innerHTML='';
  document.querySelectorAll('.ccard').forEach(c=>c.remove());
  RC=data.RC||0;CC=data.CC||0;CNX=data.CNX||0;LBL=data.LBL||0;
  if(data.colors){const R=document.documentElement;Object.entries(data.colors).forEach(([k,v])=>{if(v)R.style.setProperty('--'+k,v);});}
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
    const transCell=isSingle?'':`<div class="vdiv"></div><div class="xcell grow" id="tc-${rid}"><div class="cedit" contenteditable="true" spellcheck="false" data-ph="Translation…" onfocus="trackFocus(this,${rid})" onblur="autoSave()" oninput="cleanEmptyCell(this)" onkeydown="onKey(event,'t',${rid})"></div></div>`;
    const row=document.createElement('div');
    row.className='xrow'+(rd.cid?' has-cmt':'');row.dataset.rid=rid;if(rd.cid)row.dataset.cid=rd.cid;
    row.innerHTML=`<div class="xcell mid" style="width:60px;min-width:60px"><input class="vin" type="text" maxlength="8" placeholder="v" spellcheck="false" value="${escH(rd.verse||'')}" oninput="recomputeIds();autoSave()" onkeydown="onVerseKey(event,${rid})"/></div><div class="xcell mid" style="width:52px;min-width:52px"><div class="lid">—</div></div><div class="vdiv"></div><div class="xcell grow" id="oc-${rid}"><div class="cedit${rtl}" contenteditable="true" spellcheck="false" data-ph="${origPH}" onfocus="trackFocus(this,${rid})" onblur="autoSave()" oninput="cleanEmptyCell(this)" onkeydown="onKey(event,'o',${rid})"></div></div>${transCell}<div class="xcell mid" style="width:40px;min-width:40px"><button class="cmtbtn${rd.cid?' on':''}" title="Comment" onclick="toggleCmt(this,${rid})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button></div>`;
    const oc=row.querySelector(`#oc-${rid} .cedit`);
    if(oc&&rd.origHTML)oc.innerHTML=_stripBgFromHTML(rd.origHTML);
    if(oc&&rd.origIndent){oc.dataset.indent=rd.origIndent;}
    const tc=row.querySelector(`#tc-${rid} .cedit`);
    if(tc&&rd.transHTML)tc.innerHTML=_stripBgFromHTML(rd.transHTML);
    if(tc&&rd.transIndent){tc.dataset.indent=rd.transIndent;}
    document.getElementById('rows-body').appendChild(row);
  });
  recomputeIds();
  restoreAllIndents();
  const margin=document.getElementById('cmargin');
  SL_CMT_CACHE={};  // reset comment cache
  (data.cmts||[]).forEach(c=>{
    const row=document.querySelector(`.xrow[data-rid="${c.rid}"]`);
    const lid=row?(row.querySelector('.lid')?.textContent||''):'';
    const card=document.createElement('div');card.className='ccard';card.dataset.cid=c.cid;card.dataset.rid=c.rid;
    card.style.cssText=`top:${c.top||'8px'};left:${c.left||'18px'};width:${c.width||'226px'};${c.height?'height:'+c.height+';':''}${c.hidden?'display:none;':''}`;
    card.innerHTML=`<div class="chdr" onmousedown="startDrag(event,this.closest('.ccard'))"><span class="chdr-l">Comment</span><span class="chdr-i">${lid!=='—'?lid:''}</span><button class="ccl" onclick="closeCmt('${c.cid}')">✕</button></div><div class="cbody"><div class="cedit-c" contenteditable="true" spellcheck="false" onfocus="activeEl=this" onblur="autoSave()" onkeydown="if(event.key==='Tab'){event.preventDefault();document.execCommand(event.shiftKey?'outdent':'indent',false,null);}setTimeout(()=>{saveRange();updateTb();},0)"></div></div><div class="crh" onmousedown="startCR2(event,this.closest('.ccard'))"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="2" y1="10" x2="10" y2="2"/><line x1="6" y1="10" x2="10" y2="6"/></svg></div>`;
    const ed=card.querySelector('.cedit-c');if(ed&&c.html)ed.innerHTML=c.html;
    // Cache comment HTML for use when pane is hidden (slides view)
    if(c.cid) SL_CMT_CACHE[c.cid]=c.html||'';
    margin.appendChild(card);new ResizeObserver(drawConns).observe(card);
  });
  setTimeout(drawConns,100);
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
  ANNOTATIONS=Array.isArray(data.annotations)?data.annotations.map(a=>({...a})):[];
  ANN_CTR=data.annCtr||0;
  // Ensure ANN_CTR is at least as large as the highest existing id
  ANNOTATIONS.forEach(a=>{ const n=parseInt(String(a.id||'').replace(/^ann-/,''),10); if(!isNaN(n)&&n>=ANN_CTR) ANN_CTR=n+1; });
  // Re-render dividers in phrasing view after rows exist in DOM
  setTimeout(()=>{ renderDividers(); renderSectionStrips(); if(EDITOR_VIEW==='diagram') renderAnnLayer(); }, 50);
  // Restore diagram edit mode (persistent across saves)
  DIAGRAM_EDIT_MODE=data.diagramEditMode===true;
  if(DIAGRAM_EDIT_MODE) setTimeout(()=>_applyDiagramEditMode(true), 80);
  // Restore diagram font size
  if(data.diagramFontSize) setTimeout(()=>setDiagramFontSize(data.diagramFontSize), 0);
  if(typeof slLoadDeck==='function') slLoadDeck(data.deck||{slides:[]});
}

const storeKey=()=>'exeg7-'+SESS+(IS_SINGLE?'-'+LANG:'');
/* ════════════════════════════════════════
   PROJECTS — localStorage persistence
════════════════════════════════════════ */
const PROJ_INDEX_KEY='exeg-proj-index';
const PROJ_DATA_KEY =id=>'exeg-proj-'+id;
const PROJ_AUTOSAVE_KEY='exeg-autosave-current'; // tracks which project is "open"

let CURRENT_PROJECT_ID=null; // null = new unsaved project

function projIndex(){
  try{ return JSON.parse(localStorage.getItem(PROJ_INDEX_KEY)||'[]'); }
  catch(_){ return []; }
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
  const id=CURRENT_PROJECT_ID||(CURRENT_PROJECT_ID='proj-'+Date.now());
  const data=collectData();
  const now=Date.now();
  // Update data store
  try{ localStorage.setItem(PROJ_DATA_KEY(id),JSON.stringify(data)); }
  catch(_){ toast(typeof t==='function'?t('toast.storage-full'):'Storage full — please export and clear some projects');return; }
  // Update index
  const idx=projIndex();
  const entry=idx.find(e=>e.id===id);
  if(entry){ entry.name=name;entry.lang=LANG;entry.verseRef=ref;entry.savedAt=now; }
  else { idx.unshift({id,name,lang:LANG,verseRef:ref,savedAt:now}); }
  localStorage.setItem(PROJ_INDEX_KEY,JSON.stringify(idx));
  // Update status bar
  const t=new Date(now);
  const ts=t.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  document.getElementById('stbar').textContent=(typeof t==='function'?t('toast.saved-ts'):'Saved · ')+ts;
  renderProjPanel();
  renderS1Recent();
  toast(typeof t==='function'?t('toast.saved'):'Saved to app');
}

function projLoad(id){
  try{
    const raw=localStorage.getItem(PROJ_DATA_KEY(id));
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
    const t=new Date(entry?.savedAt||Date.now());
    const ts=t.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    document.getElementById('stbar').textContent=(typeof t==='function'?t('toast.loaded'):'Loaded · ')+ts;
    if(typeof window.spClose==='function')window.spClose();
    toast((typeof t==='function'?t('toast.opened'):'Opened: ')+(entry?.name||'project'));
  }catch(_){ toast(typeof t==='function'?t('toast.proj-error'):'Could not open project'); }
}

function projDelete(id,e){
  e.stopPropagation();
  if(!confirm(typeof t==='function'?t('confirm.delete-proj'):'Delete this project from the app?\n\nThis cannot be undone.')) return;
  localStorage.removeItem(PROJ_DATA_KEY(id));
  const idx=projIndex().filter(e=>e.id!==id);
  localStorage.setItem(PROJ_INDEX_KEY,JSON.stringify(idx));
  if(CURRENT_PROJECT_ID===id) CURRENT_PROJECT_ID=null;
  renderProjPanel();
  renderS1Recent();
}
/* ════════════════════════════════════════
   EXPORT ALL PROJECTS
   Bundles all saved projects as a ZIP of
   either PDF or JSON files using JSZip.
════════════════════════════════════════ */
/* ── Export All popup toggle ── */
function toggleExportAllPopup(e){
  e.stopPropagation();
  const idx=projIndex();
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
  const idx=projIndex();
  if(!idx.length){toast(typeof t==='function'?t('toast.no-projects-export'):'No projects saved.');return;}
  document.getElementById('export-all-popup')?.classList.add('show');
}
function projExportAllPDF(){
  const idx=projIndex();
  if(!idx.length){toast(typeof t==='function'?t('toast.no-projects-export'):'No projects saved.');return;}
  _exportAllPDF(idx);
}
function projExportAllJSON(){
  const idx=projIndex();
  if(!idx.length){toast(typeof t==='function'?t('toast.no-projects-export'):'No projects saved.');return;}
  _exportAllJSON(idx);
}

function projExportAllDiagPDF(){
  const idx=projIndex();
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
      const raw=localStorage.getItem('exeg-proj-'+entry.id);
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
      const raw=localStorage.getItem('exeg-proj-'+entry.id);
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
      const raw=localStorage.getItem('exeg-proj-'+entry.id);
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
async function _capturePhrasingPDFBlob(ref){
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

  const PDF_SCALE=3;
  async function cellToImg(el){
    if(!el||!el.innerText.trim()) return null;
    const naturalPx=el.offsetWidth||400;
    try{
      const canvas=await html2canvas(el,{scale:PDF_SCALE,useCORS:true,allowTaint:true,backgroundColor:null,logging:false,width:naturalPx,windowWidth:window.innerWidth});
      const naturalWidthPt=(canvas.width/PDF_SCALE)*PT_PX;
      return{canvas,scale:PDF_SCALE,naturalWidthPt};
    }catch(e){return null;}
  }

  const FN_LINE_H=13,FN_GAP=5,FN_SEP_H=10;
  const rowEls=Array.from(document.querySelectorAll('.xrow'));
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
      doc.setFontSize(10);doc.setFont('helvetica','normal');doc.setTextColor(31,30,30);
      const cpl=Math.floor((usableW-labelW)/5.5);const words=fn.text.split(' ');const lines=[];let line='';
      words.forEach(w=>{const test=line?line+' '+w:w;if(test.length>cpl&&line){lines.push(line);line=w;}else line=test;});
      if(line)lines.push(line);
      lines.forEach((l,i)=>{doc.text(l,MAR+labelW,y+FN_LINE_H+i*FN_LINE_H-3);});
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
      if(obj){const{canvas,scale:ps}=obj;const imgW2=displayWidths[i];const natPt=(canvas.width/ps)*PT_PX;const scaleFactor=imgW2/natPt;const imgH2=(canvas.height/ps)*PT_PX*scaleFactor;doc.addImage(canvas.toDataURL('image/png'),'PNG',cx+3,curY+ROW_PAD,imgW2-3,imgH2);}
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

function renderProjPanel(){
  const list=document.getElementById('proj-list');
  const idx=projIndex();
  if(!idx.length){
    list.innerHTML='<div id="proj-list-empty" data-i18n-html="proj.empty">'+(typeof t==='function'?t('proj.empty'):'No saved projects yet.<br>Press <b>Ctrl+S</b> to save your current work.')+'</div>';
    return;
  }
  list.innerHTML=idx.map(e=>{
    const d=new Date(e.savedAt);
    const when=d.toLocaleDateString([],{month:'short',day:'numeric'})+' · '+
                d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    const active=e.id===CURRENT_PROJECT_ID?' style="border-color:var(--sig);background:rgba(73,53,72,.04)"':'';
    return `<div class="proj-card" onclick="projLoad('${e.id}')"${active}>
  <div class="proj-card-name">${e.name||'Untitled'}</div>
  <div class="proj-card-meta">
    <span class="proj-lang-badge">${e.lang||'—'}</span>
    <span>${e.verseRef||''}</span>
    <span>·</span><span>${when}</span>
  </div>
  <button class="proj-del" onclick="projDelete('${e.id}',event)" title="Delete project">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
    </svg>
  </button>
</div>`;
  }).join('');
}

function openProjects(){if(typeof window.spOpen==='function')window.spOpen('projects');else{const p=document.getElementById('proj-panel');if(p)p.classList.add('open');}}
function closeProjects(){if(typeof window.spClose==='function')window.spClose();}

/* Render up to 4 recent projects on Screen 1 */
function renderS1Recent(){
  const el=document.getElementById('s1-recent');
  if(!el) return;
  const idx=projIndex();
  if(!idx.length){
    el.innerHTML='<div style="font-size:11px;color:var(--muted);font-family:var(--ui);padding:12px 0">'+(typeof t==='function'?t('s1.no-projects'):'No saved projects yet.')+'</div>';
    return;
  }
  const recent=idx.slice(0,4);
  el.innerHTML=recent.map(e=>{
    const d=new Date(e.savedAt);
    const when=d.toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'});
    return `<div class="s1-proj-row" onclick="projLoad('${e.id}')">
  <span class="proj-lang-badge">${e.lang||'—'}</span>
  <span class="s1-proj-name">${e.name||'Untitled'}</span>
  <span class="s1-proj-meta">${when}</span>
  <button class="s1-proj-del" onclick="projDelete('${e.id}',event)" title="Delete project">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
  </button>
</div>`;
  }).join('');
}

/* ── Auto-save to localStorage project ── */
function autoSave(){
  if(!SESS)return;
  // Keep comment cache fresh for slide rendering (comment pane may be hidden)
  document.querySelectorAll('.ccard').forEach(card=>{
    const cid=card.dataset.cid; if(!cid) return;
    const ed=card.querySelector('.cedit-c');
    if(ed) SL_CMT_CACHE[cid]=ed.innerHTML;
  });
  clearTimeout(asT);
  asT=setTimeout(()=>{
    // Session autosave (crash recovery)
    try{ localStorage.setItem(storeKey(),JSON.stringify(collectData())); }catch(_){}
    // Project autosave — only if a project is already open
    if(CURRENT_PROJECT_ID){
      const ref=document.getElementById('refin').value.trim();
      const name=ref||'Untitled';
      const data=collectData();
      const now=Date.now();
      try{ localStorage.setItem(PROJ_DATA_KEY(CURRENT_PROJECT_ID),JSON.stringify(data)); }catch(_){}
      const idx=projIndex();
      const entry=idx.find(e=>e.id===CURRENT_PROJECT_ID);
      if(entry){ entry.name=name;entry.lang=LANG;entry.verseRef=ref;entry.savedAt=now;
        localStorage.setItem(PROJ_INDEX_KEY,JSON.stringify(idx)); }
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
    }
  },700);
}

/* ════════════════════════════════════════
   EXPORT POPUP
════════════════════════════════════════ */
function toggleExportPopup(e){
  e.stopPropagation();
  const p=document.getElementById('export-popup');
  p.classList.toggle('show');
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
  clone.style.position='static';
  clone.style.width=canvas.scrollWidth+'px';
  host.appendChild(clone);

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

  const rowFnMap=[];
  const cR=canvas.getBoundingClientRect();
  document.querySelectorAll('#dcanvas .drow').forEach(drow=>{
    const rid=drow.dataset.rid;
    const pRow=document.querySelector(`.xrow[data-rid="${rid}"]`);
    const cid=pRow?pRow.dataset.cid:null;
    if(!cid) return;
    const cmtEl=document.querySelector(`.ccard[data-cid="${cid}"] .cedit-c`);
    if(!cmtEl||!cmtEl.innerText.trim()) return;
    const txt=stripHtmlFn2(cmtEl.innerHTML);
    if(!txt) return;
    const lid=pRow?pRow.querySelector('.lid')?.textContent||'':'';
    const dR=drow.getBoundingClientRect();
    const logTop=(dR.top-cR.top)/zoomRatio;
    const logBot=(dR.bottom-cR.top)/zoomRatio;
    rowFnMap.push({
      rowTopPx:Math.round(logTop*captureScale),
      rowBotPx:Math.round(logBot*captureScale),
      fn:{lineId:lid&&lid!=='—'?lid:'',text:txt}
    });
  });

  function fnTextLines(fn){
    const cpl=Math.floor(usableW/5.5);
    const words=fn.text.split(' ');
    const lines=[];let line='';
    words.forEach(w=>{
      const test=line?line+' '+w:w;
      if(test.length>cpl&&line){lines.push(line);line=w;}
      else line=test;
    });
    if(line) lines.push(line);
    return lines;
  }
  function fnHeightPt(fn){ return Math.max(1,fnTextLines(fn).length)*FN_LINE_H_S+FN_GAP; }
  function fnZonePt(fns){ return fns.length?(FN_SEP_H+fns.reduce((s,fn)=>s+fnHeightPt(fn),0)):0; }

  // ── Build jsPDF doc ──────────────────────────────────────────────
  const doc=new jsPDF({orientation,unit:'pt',format});
  const HEADER_H=34;
  const imgW=usableW;
  const imgH=(capturedCanvas.height/capturedCanvas.width)*imgW;
  const usableH1=pH-MAR*2-HEADER_H;
  const usableHN=pH-MAR*2;

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
      doc.setFontSize(FN_TXT_PT); doc.setFont('helvetica','normal'); doc.setTextColor(31,30,30);
      const cpl=Math.floor(usableW/4.8);
      const words=fn.text.split(' '); const lines=[]; let line='';
      words.forEach(w=>{const test=line?line+' '+w:w;if(test.length>cpl&&line){lines.push(line);line=w;}else line=test;});
      if(line) lines.push(line);
      lines.forEach((l,i)=>doc.text(l,MAR+labelW,fy+FN_LINE_H_S+i*FN_LINE_H_S-3));
      fy+=Math.max(1,lines.length)*FN_LINE_H_S+FN_GAP;
    });
  }

  // ── Page slicing with block-snap ─────────────────────────────────
  let srcY=0, pageIdx=0;
  while(srcY<capturedCanvas.height){
    const baseUsableH=pageIdx===0?usableH1:usableHN;
    const preEndY=srcY+Math.round((baseUsableH/imgH)*capturedCanvas.height);
    const preFns=rowFnMap.filter(r=>r.rowTopPx>=srcY&&r.rowTopPx<preEndY).map(r=>r.fn);
    const fnZone=preFns.length?(fnZonePt(preFns)+FN_SPACE_ABOVE):0;
    const adjustedUsableH=Math.max(baseUsableH*0.4,baseUsableH-fnZone);

    let slicePxH=Math.min(
      capturedCanvas.height-srcY,
      Math.max(1,Math.round((adjustedUsableH/imgH)*capturedCanvas.height))
    );

    // Block-snap: don't cut mid-row
    const snapEndY=srcY+slicePxH;
    const rowsOnPage=rowFnMap.filter(r=>r.rowTopPx>=srcY&&r.rowBotPx<=snapEndY);
    const rowsStraddling=rowFnMap.filter(r=>r.rowTopPx>=srcY&&r.rowTopPx<snapEndY&&r.rowBotPx>snapEndY);
    if(rowsStraddling.length&&rowsOnPage.length>0){
      slicePxH=Math.max(1,rowsStraddling[0].rowTopPx-srcY);
    }

    const pageEndY=srcY+slicePxH;
    const thisFns=rowFnMap.filter(r=>r.rowTopPx>=srcY&&r.rowTopPx<pageEndY).map(r=>r.fn);

    const sliceC=document.createElement('canvas');
    sliceC.width=capturedCanvas.width;
    sliceC.height=slicePxH;
    sliceC.getContext('2d').drawImage(capturedCanvas,0,srcY,capturedCanvas.width,slicePxH,0,0,capturedCanvas.width,slicePxH);
    const sliceImgH=Math.min(adjustedUsableH,(slicePxH/capturedCanvas.width)*imgW);

    if(pageIdx>0) doc.addPage();
    const pageContentY=drawDiagHeader();
    doc.addImage(sliceC.toDataURL('image/png'),'PNG',MAR,pageContentY,imgW,sliceImgH);
    if(thisFns.length) drawFnsDiag(thisFns);
    srcY+=slicePxH;
    pageIdx++;
  }

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
      _applySessionFontDefaults();
        LANG=data.langLabel||(SESS==='greek'?'Greek':SESS==='hebrew'?'Hebrew':'Custom');
        document.getElementById('sess-lbl').textContent=LANG+' Session';
        document.getElementById('ch-o-lbl').textContent=IS_SINGLE?LANG:LANG+' Text';
  // ch-t-lbl always reads "Translation"; version shown in version-sub.
        document.getElementById('ch-t').style.display=IS_SINGLE?'none':'';
      }
      loadData(data);
      CURRENT_FILENAME=loadedName;
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
      toast((typeof t==='function'?t('toast.loaded'):'Loaded: ')+loadedName);
    }catch(_){toast(typeof t==='function'?t('toast.load-error'):'Could not read file');}
  };
  reader.readAsText(f);e.target.value='';
}
function clearAll(){
  if(!confirm(typeof t==='function'?t('confirm.clear'):'Clear all content?'))return;
  // Snapshot full state so Clear can be undone
  const snapshot=collectData();
  rowPush({type:'clear', snapshot});
  // Now clear
  document.getElementById('rows-body').innerHTML='';
  document.querySelectorAll('.ccard').forEach(c=>c.remove());
  document.getElementById('refin').value='';
  document.getElementById('svgl').innerHTML='';
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
  if(typeof slLoadDeck==='function') slLoadDeck({slides:[]});
  addEmptyRow();
  localStorage.removeItem(storeKey());
  toast(typeof t==='function'?t('toast.cleared'):'Cleared — press Ctrl+Z to undo');
}

/* ════════════════════════════════════════
   PDF EXPORT
   Font pre-loaded at session start (instant).
   Each cell rendered via html2canvas so all
   formatting — font colors, bold, highlights —
   is preserved exactly as seen on screen.
════════════════════════════════════════ */
function exportPDF(){
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

  const PDF_SCALE=3;

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
        backgroundColor: null,
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
    const rowEls=Array.from(document.querySelectorAll('.xrow'));
    const totalRows=rowEls.length;

    showProgress(0,'Exporting PDF…');

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
        doc.setFontSize(10);doc.setFont('helvetica','normal');doc.setTextColor(31,30,30);
        const charsPerLine=Math.floor((usableW-labelW)/5.5);
        const words=fn.text.split(' ');
        const drawnLines=[];let line='';
        words.forEach(w=>{
          const test=line?line+' '+w:w;
          if(test.length>charsPerLine&&line){drawnLines.push(line);line=w;}
          else line=test;
        });
        if(line)drawnLines.push(line);
        drawnLines.forEach((l,i)=>{doc.text(l,MAR+labelW,y+FN_LINE_H+i*FN_LINE_H-3);});
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
          doc.addImage(canvas.toDataURL('image/png'),'PNG',cx+3,curY+ROW_PAD,imgW-3,imgH);
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
function _brkSyncPipPositions(){ /* no-op: pips are in flex flow */ }

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

  // Sort brackets by lane so we can compute cumulative X correctly
  const sorted = [...BRACKETS].sort((a,b)=>a.lane-b.lane);

  // laneXMap: lane number → laneX (the X of the bracket's vertical line)
  // Each lane's X = max(previous laneX + previous label width + gap, baseline)
  // We compute this cumulatively, lane by lane.
  const laneXMap = {};
  let prevLaneX  = null;
  let prevLabelW = 0;

  sorted.forEach(brk=>{
    const si = rids.indexOf(String(brk.startRid));
    const ei = rids.indexOf(String(brk.endRid));
    if(si<0||ei<0) return;
    const lo = Math.min(si,ei), hi = Math.max(si,ei);
    const spannedRids = rids.slice(lo, hi+1);

    // Rightmost edge among spanned rows — checks BOTH the Greek/Hebrew
    // block AND its translation (a separate sibling element, not nested
    // inside the block, with its own independent width), since a
    // translation longer than the original-text line was previously
    // invisible to this calculation and could overlap the bracket.
    let maxRight = 0;
    spannedRids.forEach(rid=>{
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

    // Baseline X for this bracket if it were lane 1
    const baseX = maxRight + BRK_PIP_OFFSET + BRK_LANE_W * 0.5;

    // Step from previous lane: must clear previous label + gap
    let laneX;
    if(prevLaneX === null){
      laneX = baseX;
    } else {
      const minStep = prevLabelW > 0
        ? prevLabelW + BRK_LABEL_GAP + 20   // label width + gap + padding
        : BRK_LANE_W;                         // no label: use fixed minimum
      laneX = Math.max(baseX, prevLaneX + minStep);
    }

    laneXMap[brk.lane] = laneX;
    prevLaneX  = laneX;
    prevLabelW = _brkMeasureLabelWidth(brk.label);
  });

  // Now draw each bracket using its computed laneX
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

    const laneX = laneXMap[brk.lane] ?? (100 + (brk.lane-1)*BRK_LANE_W);
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
  const ann = { id:_annId(), type:'section', startRid:anchorRid, endRid:anchorRid, label:'', color:'#534AB7' };
  ANNOTATIONS.push(ann);
  renderSectionStrips();
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
    label.addEventListener('blur',()=>{ ann.label=label.textContent.trim(); autoSave(); });

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
      ann.color=swatch.value;
      el.style.setProperty('--div-color', ann.color);
      autoSave();
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

  const rows=Array.from(document.querySelectorAll('.xrow'));
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
      ann.color=swatch.value;
      strip.style.setProperty('--sec-color', ann.color);
      if(EDITOR_VIEW==='diagram') renderDiagram();
      autoSave();
    });

    const label=document.createElement('div');
    label.className='sec-strip-label';
    label.contentEditable='true';
    label.spellcheck=false;
    label.setAttribute('data-ph', typeof t==='function'?t('ann.section.ph'):'Section…');
    label.textContent=ann.label||'';
    label.addEventListener('input',()=>{ ann.label=label.textContent.trim(); autoSave(); });
    label.addEventListener('blur',()=>{ ann.label=label.textContent.trim(); autoSave(); });

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

  const rows=Array.from(document.querySelectorAll('.xrow'));
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
    renderAnnLayer();
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
    renderAnnLayer();
    if(SELECTED_ANN_ID===op.annId) _showAnnEditPopup(ann);
    return true;
  }
  return false;
}

/* Hook into existing undo/redo */
const _origApplyRowUndo=typeof applyRowUndo==='function'?applyRowUndo:null;
const _origApplyRowRedo=typeof applyRowRedo==='function'?applyRowRedo:null;

/* ═══════════════════════════════════════════
   SLIDES INTEGRATION
   Render dividers into phrasing clone,
   render arrows/spans/arcs into diagram clone.
═══════════════════════════════════════════ */

function slDrawDividersIntoClone(cloneRows, slide){
  ANNOTATIONS.filter(a=>a.type==='divider').forEach(ann=>{
    const rid=ann.beforeRid||ann.afterRid;
    const cloneRow=[...cloneRows].find(r=>r.dataset.rid===rid);
    if(!cloneRow) return;
    const el=document.createElement('div');
    el.className='ann-divider ann-divider-slide';
    el.style.setProperty('--div-color', ann.color||'#C8A84B');
    const line=document.createElement('div'); line.className='ann-div-line';
    const labelWrap=document.createElement('div'); labelWrap.className='ann-div-label-wrap';
    const label=document.createElement('div'); label.className='ann-div-label';
    label.textContent=ann.label||''; label.style.pointerEvents='none';
    labelWrap.appendChild(label);
    el.append(line,labelWrap);
    cloneRow.before(el);  // Proposition divider appears above its row in slides too
  });
}

function slDrawAnnotationsIntoClone(cloneCanvas, visibleRids){
  // Render diagram annotations (arrows, spans, arcs) into the slide diagram clone
  const annToRender=ANNOTATIONS.filter(a=>
    a.type==='arrow'||a.type==='span'||a.type==='arc'
  );
  if(!annToRender.length) return;

  let svg=cloneCanvas.querySelector('#dann-svg-clone');
  if(!svg){
    svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.id='dann-svg-clone';
    svg.style.cssText='position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:20;';
    svg.innerHTML=`<defs><marker id="ann-ah-c" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="context-stroke"/></marker></defs>`;
    cloneCanvas.appendChild(svg);
  }

  // Use live dcanvas dimensions as reference for % coordinates
  const liveCanvas=document.getElementById('dcanvas');
  if(!liveCanvas) return;
  const W=liveCanvas.scrollWidth, H=liveCanvas.scrollHeight;
  const cloneW=cloneCanvas.scrollWidth||W, cloneH=cloneCanvas.scrollHeight||H;

  annToRender.forEach(ann=>{
    if(ann.type==='arrow'){
      const x1=ann.x1/100*cloneW, y1=ann.y1/100*cloneH;
      const x2=ann.x2/100*cloneW, y2=ann.y2/100*cloneH;
      const line=document.createElementNS('http://www.w3.org/2000/svg','line');
      line.setAttribute('x1',x1);line.setAttribute('y1',y1);
      line.setAttribute('x2',x2);line.setAttribute('y2',y2);
      line.setAttribute('stroke',ann.color||'#C8A84B');
      line.setAttribute('stroke-width','2');
      if(ann.dashed) line.setAttribute('stroke-dasharray','6,3');
      line.setAttribute('marker-end','url(#ann-ah-c)');
      svg.appendChild(line);
      if(ann.label){
        const lbl=document.createElement('div');
        lbl.className='ann-overlay-label';
        lbl.style.cssText=`position:absolute;left:${(x1+x2)/2+4}px;top:${(y1+y2)/2-8}px;color:${ann.color||'#C8A84B'};pointer-events:none;font-size:11px;`;
        lbl.textContent=ann.label;
        cloneCanvas.appendChild(lbl);
      }
    }
    // Spans and arcs in clone require DOM layout — skip for now (they use live DOM rects)
    // They will be rendered when slDrawConnectorsIntoClone already handles layout-dependent items
  });
}



/* ── State ── */
/* ════════════════════════════════════════
   DIAGRAM EDIT MODE
   Allows splitting diagram blocks at the word level.
   Alt+click a word  → split: word + everything after moves to a new row
   Alt+click a label → merge: this row merges into the row above
   Ctrl+Z / Ctrl+Y undo/redo exactly like phrasing-view splits/merges.
   State: DIAGRAM_EDIT_MODE (bool), persisted in JSON.
════════════════════════════════════════ */

/* ── Tokenizer ── */

/* A token is a SPLITTABLE WORD only if it contains a character from the
   target manuscript script (Greek, Hebrew) or a lowercase ASCII letter.
   This excludes uppercase-only abbreviation labels like CP, TP, TR, fn
   even when they appear adjacent to brackets: "[CP", "CP]", "[TP]", etc.
   Emoji, symbols, pure punctuation, and all-caps abbreviations are excluded. */
const _DEM_WORD = /[\u0370-\u03FF\u1F00-\u1FFF\u0590-\u05FF\u00E0-\u00FF]|[a-z]/;

/* ── Group model ───────────────────────────────────────────────────────────
   The tokenizer produces a series of GROUPS rather than individual word spans.
   Each group owns: [non-word prefix tokens] + [one splittable word] + [non-word suffix tokens until next word].
   This ensures that surrounding markers like "‹👤 ‹+" or "[CP ... CP]" always
   travel together with their associated word when a split is performed.

   A split at group N means:
   - Everything in groups 0..N-1 stays in the original row
   - Everything in group N onward (prefix+word+suffix) moves to the new row

   Implementation:
   1. Walk text nodes (skip <sup>) and classify each whitespace-delimited run as
      WORD or NON-WORD.
   2. Build a flat list of DOM nodes in source order: text nodes and inline elements.
   3. Insert an invisible <span class="dedit-sp" data-idx="N"> marker just BEFORE
      each word group's first node (i.e., just after the previous word's last node).
      This marker is the actual cut point.
   4. Wrap each splittable word token in <span class="dedit-word">.
   5. On split: clone the textEl, split at the Nth .dedit-sp marker,
      unwrap all .dedit-sp and .dedit-word spans to produce clean HTML.
──────────────────────────────────────────────────────────────────────────── */

function _demTokenize(blockEl){
  const textEl=blockEl.querySelector('.dblock-text');
  if(!textEl||textEl.querySelector('.dedit-word')) return;

  // A block can arrive here already wrapped with .ann-word spans — every
  // block gets pre-wrapped that way the moment Ctrl is pressed in
  // Diagram View, for connector word-anchoring (_wrapBlockTextWords_
  // single), and that wrapping never gets removed short of a full
  // re-render. Unlike a color/formatting span, which wraps a whole RUN
  // of text together, .ann-word wraps EACH WORD in its own individual
  // span — so if tokenization ran on top of that, a preceding critical-
  // apparatus mark or superscript sitting just outside a word's own
  // .ann-word span would be structurally invisible to this function's
  // backward-walk group-boundary logic (which can only see siblings
  // within whatever span it's currently recursing inside). Stripping
  // any pre-existing .ann-word wrapping back to plain text first keeps
  // this function's input consistent no matter what touched the block
  // beforehand.
  if(textEl.querySelector('.ann-word')){
    textEl.querySelectorAll('.ann-word').forEach(sp=>sp.replaceWith(document.createTextNode(sp.textContent)));
    textEl.normalize();
  }

  /* Phase 1: walk all text nodes (skipping <sup> and .crit-mark subtrees —
     apparatus/discourse markers are annotation markup, never real "words"
     that should be independently splittable or connector-anchorable) */
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

  /* Phase 2: in each text node, wrap splittable word runs in .dedit-word spans */
  textNodes.forEach(tn=>{
    const text=tn.nodeValue;
    if(!text) return;
    const frag=document.createDocumentFragment();
    const parts=text.split(/(\s+)/);
    parts.forEach(part=>{
      if(!part) return;
      if(/^\s+$/.test(part)){
        frag.appendChild(document.createTextNode(part)); return;
      }
      if(_DEM_WORD.test(part)){
        const sp=document.createElement('span');
        sp.className='dedit-word'; sp.textContent=part;
        frag.appendChild(sp);
      } else {
        frag.appendChild(document.createTextNode(part));
      }
    });
    tn.parentNode.replaceChild(frag, tn);
  });

  /* Phase 3: insert split-point markers (.dedit-sp) just BEFORE each word's
     "group start" = the first non-word node after the previous word (or start).
     We walk the flat child list of textEl (and inline element children) in order,
     tracking when we last saw a .dedit-word. The next .dedit-word after any
     non-word content gets a split-point marker inserted before that non-word run. */
  let groupIdx=0;
  let prevWordNode=null; // the last .dedit-word seen

  // A bare <sup>letter</sup> (not a symbolic .crit-mark sign) can ALSO be
  // part of a matched pair — BHS brackets a phrase spanning MULTIPLE
  // words with the same letter repeated once before and once after it
  // (e.g. "aבִּימֵי שְׁפֹטa" — the note covers the whole phrase, not
  // either word alone), the same bracketing convention as [TM...TM]
  // frame markers, just using a letter instead of a symbol. Computed
  // once upfront: if the same letter appears in exactly two <sup>
  // elements in this block, the first is the opening half (sweeps
  // forward, attaches to the following word) and the second is the
  // closing half (attaches to the preceding word) — mirroring the
  // existing [ / ‹ opening vs ] / › closing logic for symbolic
  // crit-marks exactly. A letter appearing only once (or more than
  // twice, which shouldn't normally happen) is treated as standalone.
  const allSups=[...textEl.querySelectorAll('sup')];
  function _effectiveSupLetter(el){
    if(el.nodeName==='SUP') return el;
    if(el.querySelectorAll){
      const sups=el.querySelectorAll('sup');
      if(sups.length===1 && (el.textContent||'').trim()===(sups[0].textContent||'').trim()) return sups[0];
    }
    return null;
  }
  function _supLetterSide(sup){
    const letter=(sup.textContent||'').trim();
    if(!letter) return 'standalone';
    const matches=allSups.filter(s=>(s.textContent||'').trim()===letter);
    if(matches.length!==2) return 'standalone';
    return matches[0]===sup ? 'opening' : 'closing';
  }

  // Collect all top-level and inline children in DOM order using a flat walk
  function _insertSplitPoints(parent){
    const children=[...parent.childNodes];
    for(let i=0;i<children.length;i++){
      const ch=children[i];
      if(ch.nodeType===Node.ELEMENT_NODE && ch.classList.contains('dedit-word')){
        // This is a word node. Find its "group start" = the first node of this group.
        // The group start is: the first node after prevWordNode (or start of parent) that
        // is NOT a .dedit-word (non-word prefix nodes) OR this word itself if it
        // immediately follows a word (no prefix).
        // We insert the split marker just BEFORE the first prefix node of this group,
        // which is: the node immediately after prevWordNode in DOM order (or first child).
        // We already traversed those prefix nodes. The marker goes BEFORE ch's group start.
        // We track groupStart as the first node after prevWordNode. But we've already
        // passed those nodes. Instead, we use a different strategy: insert the marker
        // just BEFORE ch, then reorder it backward to the group start.
        // Simpler: insert marker before ch (the word) — then handle prefix association
        // in the SPLIT HANDLER by using the marker's data-idx.
        // For the group model, we insert the marker before ch.
        const marker=document.createElement('span');
        marker.className='dedit-sp'; marker.dataset.idx=String(groupIdx++);
        marker.style.cssText='display:none;font-size:0;line-height:0;pointer-events:none;';
        // Find the true group start: walk BACKWARD from ch to find the last .dedit-word
        // or start of parent, then insert the marker at the first node of this group's prefix.
        // A crit-mark may be wrapped inside a color/formatting span (RTF-imported
        // content nests them), so "is this a crit-mark?" is answered by looking
        // INSIDE elements, not only at the element itself.
        const _effectiveCritMark=el=>{
          if(el.classList&&el.classList.contains('crit-mark')) return el;
          if(el.querySelectorAll){
            const marks=el.querySelectorAll('.crit-mark');
            if(marks.length===1 && (el.textContent||'').trim()===(marks[0].textContent||'').trim()) return marks[0];
          }
          return null;
        };
        let groupStart=ch;
        let prev=ch.previousSibling;
        while(prev){
          if(prev.nodeType===Node.ELEMENT_NODE && (prev.classList.contains('dedit-word')||prev.classList.contains('dedit-sp'))){
            break; // found previous word or marker — group starts at the node after this
          }
          // A trailing-punctuation TEXT node ("⌝, " / ", " after θεοῦ)
          // belongs to the PRECEDING word, never to the clicked one. Only
          // a non-whitespace tail glued directly to what follows (e.g. the
          // "⸀" in "θεοῦ, ⸀word") counts as this group's prefix — split
          // the node there so the tail travels and the punctuation stays.
          if(prev.nodeType===Node.TEXT_NODE && /\S/.test(prev.textContent)){
            const txt=prev.textContent;
            const m=txt.match(/\s(\S+)$/);
            if(m){
              const tail=prev.splitText(txt.length-m[1].length);
              groupStart=tail;
            }
            break; // punctuation (and everything before it) stays behind
          }
          if(prev.nodeType===Node.ELEMENT_NODE){
            // An element containing a real word ends the group unconditionally
            // (can happen when words live inside color spans at this level).
            if(prev.querySelector && prev.querySelector('.dedit-word')) break;
            // A crit-mark's OWN glyph tells us which side it belongs to:
            //   • closing half of a pair (ends with ] or › or is ″) always
            //     belongs to whatever precedes it — never sweeps forward
            //     onto the next word, no matter how it's spaced or whether
            //     it's nested inside a color/formatting wrapper span.
            //   • opening half (starts with [ or ‹ or is ‶) always belongs
            //     to whatever follows it — sweeps forward normally.
            //   • ° and ⸀/⸁ (omit-word, replace-word) are ALSO always
            //     forward-attaching, per their own NA28 definition ("the
            //     word FOLLOWING is omitted/replaced") — this holds even
            //     when the sign sits with NO space on either side (e.g.
            //     "ζωὴ⸀ἦν"), where it would otherwise look identical to a
            //     touching-the-preceding-word suffix like "θεοῦ*,".
            //   • every other standalone, unpaired sign (*, ˸, ♦, ✽, ...)
            //     only counts as a SUFFIX of the preceding word when it
            //     directly touches it with no whitespace at all; otherwise
            //     it's a normal prefix of whatever follows.
            const mk=_effectiveCritMark(prev);
            if(mk){
              const mtxt=mk.textContent||'';
              const mkey=mk.dataset.crit||'';
              const isClosing = mtxt.endsWith(']') || mtxt.endsWith('›') || mtxt==='″';
              const isOpening = mtxt.startsWith('[') || mtxt.startsWith('‹') || mtxt==='‶'
                                 || mkey==='omit-word' || mkey==='replace-word';
              if(isClosing) break;
              if(!isOpening){
                let n=prev.previousSibling;
                while(n && n.nodeType===Node.ELEMENT_NODE && _effectiveCritMark(n)) n=n.previousSibling;
                if(n && n.nodeType===Node.ELEMENT_NODE && n.classList.contains('dedit-word')) break;
              }
            }
            // Same opening/closing principle, for a bare <sup>letter</sup>
            // that's part of a matched pair (not a symbolic .crit-mark
            // sign, which was already handled above) — the closing half
            // stops the walk here (belongs to whatever precedes it,
            // never sweeps forward), the opening half falls through and
            // keeps walking (belongs to whatever follows it).
            const sup=_effectiveSupLetter(prev);
            if(sup && _supLetterSide(sup)==='closing') break;
          }
          groupStart=prev;
          prev=prev.previousSibling;
        }
        parent.insertBefore(marker, groupStart);
        prevWordNode=ch;
      } else if(ch.nodeType===Node.ELEMENT_NODE && ch.nodeName!=='SUP'){
        // Recurse into inline elements (color spans, <b>, <i>, etc.) but not <sup>
        _insertSplitPoints(ch);
      }
    }
  }
  _insertSplitPoints(textEl);
}

function _demUntokenize(blockEl){
  const textEl=blockEl.querySelector('.dblock-text');
  if(!textEl) return;
  // Remove .dedit-word spans (replace with text content)
  textEl.querySelectorAll('.dedit-word').forEach(sp=>{
    sp.replaceWith(document.createTextNode(sp.textContent));
  });
  // Remove .dedit-sp markers
  textEl.querySelectorAll('.dedit-sp').forEach(sp=>sp.remove());
  // Normalize adjacent text nodes
  textEl.normalize();
}

/* ── Core toggle ── */

function toggleDiagramEditMode(){
  DIAGRAM_EDIT_MODE=!DIAGRAM_EDIT_MODE;
  _applyDiagramEditMode(DIAGRAM_EDIT_MODE);
  if(DIAGRAM_EDIT_MODE){
    toast(typeof t==='function'?t('diagram.edit-hint'):'Click a word to split it to a new row. Alt+click a row label to merge. Press Alt or Alt+E to exit.');
  }
  autoSave();
}

/* Shift keydown → enter edit mode temporarily (if not already locked on).
   Shift keyup → exit temporary mode (if button hasn't locked it on permanently).
   Shift was chosen over Alt because Alt triggers browser chrome menus on some
   platforms. Shift+click on words is safe — the bracket system only responds
   to Shift+click on pip dots, which are separate elements. */
let _demAltTemp=false; // true = edit mode was entered by Shift keydown, not by button

document.addEventListener('keydown', ev=>{
  if(ev.key!=='Shift'||EDITOR_VIEW!=='diagram') return;
  if(DIAGRAM_EDIT_MODE) return; // already on (locked by button)
  if(_isEditingText()) return; // Shift is part of normal typing here, not a mode trigger
  _demAltTemp=true;
  _applyDiagramEditMode(true);
});

document.addEventListener('keyup', ev=>{
  if(ev.key!=='Shift') return;
  if(!_demAltTemp) return; // was locked by button, not by Shift — don't exit
  _demAltTemp=false;
  _applyDiagramEditMode(false);
  DIAGRAM_EDIT_MODE=false;
});

function _applyDiagramEditMode(on){
  DIAGRAM_EDIT_MODE=on;
  const canvas=document.getElementById('dcanvas');
  const btn=document.getElementById('tb-dem');
  if(!canvas) return;

  if(on){
    canvas.classList.add('dem-active');
    if(btn) btn.classList.add('on');
    canvas.querySelectorAll('.dblock').forEach(blk=>_demTokenize(blk));
    // Add merge buttons to each label cell
    canvas.querySelectorAll('.dl').forEach(lCell=>{
      const drow=lCell.closest('.drow'); if(!drow) return;
      _demAddMergeBtn(lCell, drow.dataset.rid);
    });
    // Wire red-slash hover on all dedit-word spans
    canvas.querySelectorAll('.dedit-word').forEach(w=>_demWireWordHover(w));
  } else {
    canvas.classList.remove('dem-active');
    if(btn) btn.classList.remove('on');
    canvas.querySelectorAll('.dblock').forEach(blk=>_demUntokenize(blk));
    // Remove merge buttons
    canvas.querySelectorAll('.dem-merge-btn').forEach(b=>b.remove());
    // Remove any lingering red slash
    document.getElementById('dem-slash')?.remove();
  }
}

/* ── Red slash hover indicator ── */
// The invisible .dedit-sp marker _insertSplitPoints creates for each word
// is already correctly positioned at that word's true group boundary —
// before any preceding critical-apparatus mark or superscript that
// belongs with it, per all the same-side/opposite-side rules that
// function works out. Reusing its position (rather than duplicating that
// logic a second time here) is what makes the VISIBLE hover slash match it.
function _demFindSplitMarkerFor(wordEl){
  let n=wordEl.previousSibling;
  while(n){
    if(n.nodeType===Node.ELEMENT_NODE){
      if(n.classList && n.classList.contains('dedit-sp')) return n;
      if(n.classList && n.classList.contains('dedit-word')) return null; // hit the previous word first — shouldn't normally happen, every word gets a marker
    }
    n=n.previousSibling;
  }
  return null;
}

function _demWireWordHover(wordEl){
  if(wordEl.dataset.demHoverWired) return;
  wordEl.dataset.demHoverWired='1';

  wordEl.addEventListener('mouseenter', ()=>{
    if(!DIAGRAM_EDIT_MODE) return;
    // Remove any existing slash
    document.getElementById('dem-slash')?.remove();
    // Create the slash element
    const slash=document.createElement('span');
    slash.id='dem-slash';
    slash.setAttribute('aria-hidden','true');
    // Position at this word's true group boundary — before any critical-
    // apparatus mark or plain superscript (e.g. an "a" apparatus-note
    // reference letter) that belongs with this word, matching the
    // already-correct invisible split marker rather than naively
    // landing right before the word span, which would ignore anything
    // sitting between it and the previous word.
    const marker=_demFindSplitMarkerFor(wordEl);
    if(marker) marker.parentNode.insertBefore(slash, marker);
    else wordEl.parentNode.insertBefore(slash, wordEl);
  });

  wordEl.addEventListener('mouseleave', ()=>{
    document.getElementById('dem-slash')?.remove();
  });
}

/* ── Wire label cell for merge ── */
/* ── Merge button ── */
function _demAddMergeBtn(lCell, rid){
  if(lCell.querySelector('.dem-merge-btn')) return; // already added
  const btn=document.createElement('button');
  btn.className='dem-merge-btn';
  btn.title='Merge this row into the row above';
  btn.textContent='↑';
  btn.addEventListener('click', ev=>{
    ev.preventDefault(); ev.stopPropagation();
    if(!DIAGRAM_EDIT_MODE) return;
    mergeRowUp(rid);
    setTimeout(()=>{
      if(EDITOR_VIEW==='diagram') renderDiagram();
      if(DIAGRAM_EDIT_MODE) setTimeout(()=>_applyDiagramEditMode(true), 40);
    }, 30);
  });
  lCell.appendChild(btn);
}

/* ── Click on .dedit-word: split at that word's group ── */
document.addEventListener('click', ev=>{
  if(!DIAGRAM_EDIT_MODE) return;
  const wordEl=ev.target.closest('.dedit-word');
  if(!wordEl) return;
  ev.preventDefault(); ev.stopPropagation();

  const blockEl=wordEl.closest('.dblock');
  if(!blockEl) return;
  const textEl=blockEl.querySelector('.dblock-text');
  if(!textEl) return;
  const drow=blockEl.closest('.drow');
  if(!drow) return;
  const rid=drow.dataset.rid;

  // Find the split-point marker (.dedit-sp) for this word's group.
  // The marker was inserted just before this word's group start (including prefix non-words).
  // Walk backward from wordEl to find its .dedit-sp marker (it's the last one before wordEl).
  const allMarkers=[...textEl.querySelectorAll('.dedit-sp')];
  const allWords  =[...textEl.querySelectorAll('.dedit-word')];
  const wordIdx   =allWords.indexOf(wordEl);
  if(wordIdx<0) return;

  // The split marker for this word is the one with data-idx === wordIdx
  const marker=allMarkers.find(m=>m.dataset.idx===String(wordIdx));

  // Build beforeHTML / afterHTML by cloning and splitting at the marker.
  // "Before" = everything in textEl UP TO but not including the marker.
  // "After"  = everything FROM the marker onward (includes prefix non-words of this group).
  const clone=textEl.cloneNode(true);
  // Find the corresponding marker in the clone
  const cloneMarker=clone.querySelector(`.dedit-sp[data-idx="${wordIdx}"]`);

  let beforeHTML='', afterHTML='';
  if(!cloneMarker || wordIdx===0){
    // No previous content or clicking first word — everything goes to new row
    beforeHTML='';
    // afterHTML = full content (minus tokenization markup)
    const tmp=clone.cloneNode(true);
    tmp.querySelectorAll('.dedit-word').forEach(sp=>sp.replaceWith(document.createTextNode(sp.textContent)));
    tmp.querySelectorAll('.dedit-sp').forEach(sp=>sp.remove());
    tmp.normalize();
    afterHTML=tmp.innerHTML.replace(/^\s+|\s+$/g,'');
  } else {
    // Split into two ranges using the marker as the boundary
    // Before: from start of textEl to just before the marker
    const rangeBefore=document.createRange();
    rangeBefore.setStart(clone, 0);
    rangeBefore.setStartBefore(clone.firstChild);
    rangeBefore.setEndBefore(cloneMarker);
    const beforeFrag=rangeBefore.cloneContents();
    const beforeDiv=document.createElement('div');
    beforeDiv.appendChild(beforeFrag);
    // Unwrap tokenization spans
    beforeDiv.querySelectorAll('.dedit-word').forEach(sp=>sp.replaceWith(document.createTextNode(sp.textContent)));
    beforeDiv.querySelectorAll('.dedit-sp').forEach(sp=>sp.remove());
    beforeDiv.normalize();
    beforeHTML=beforeDiv.innerHTML.replace(/^\s+|\s+$/g,'');

    // After: from the marker to end of textEl
    const rangeAfter=document.createRange();
    rangeAfter.setStartBefore(cloneMarker);
    rangeAfter.setEnd(clone, clone.childNodes.length);
    const afterFrag=rangeAfter.cloneContents();
    const afterDiv=document.createElement('div');
    afterDiv.appendChild(afterFrag);
    afterDiv.querySelectorAll('.dedit-word').forEach(sp=>sp.replaceWith(document.createTextNode(sp.textContent)));
    afterDiv.querySelectorAll('.dedit-sp').forEach(sp=>sp.remove());
    afterDiv.normalize();
    afterHTML=afterDiv.innerHTML.replace(/^\s+|\s+$/g,'');
  }

  // Find the xrow and its cedit to update
  const xrow=document.querySelector(`.xrow[data-rid="${rid}"]`);
  if(!xrow) return;
  const oc=xrow.querySelector(`#oc-${rid} .cedit`);
  if(!oc) return;

  const origHTMLFull=oc.innerHTML;
  const verse=xrow.querySelector('.vin')?.value||'';

  oc.innerHTML=beforeHTML;

  const newRid=++RC;
  const newRow=makeRowEl(newRid,'','','',null);
  xrow.insertAdjacentElement('afterend',newRow);
  const newOc=newRow.querySelector(`#oc-${newRid} .cedit`);
  if(newOc) newOc.innerHTML=afterHTML;

  rowPush({
    type:'split',
    rid:String(rid), newRid:String(newRid),
    verse,
    origHTML:origHTMLFull,
    afterHTML:beforeHTML,
    newHTML:afterHTML,
    splitOffset:0
  });

  recomputeIds();
  autoSave();

  setTimeout(()=>{
    if(EDITOR_VIEW==='diagram') renderDiagram();
    if(DIAGRAM_EDIT_MODE) setTimeout(()=>_applyDiagramEditMode(true), 40);
  }, 30);
}, true);

/* ── Re-apply tokenization after diagram rebuilds is handled inside renderDiagram ── */

let SL_DECK       = { slides: [] };   // the deck
let SL_ACTIVE_IDX = 0;                // currently selected slide index
let SL_SEL_EL_ID  = null;             // selected element id on active slide
let SL_CTX_EL_ID  = null;             // element id for context menu
let SL_EL_CTR     = 0;                // element id seed
let SL_SLIDE_CTR  = 0;                // slide id seed
let SL_PROJ_WIN   = null;             // projector window reference
let SL_PRES_IDX   = 0;                // current slide index in presenter mode
let SL_CANVAS_W   = 960;              // computed canvas width in px
let SL_CANVAS_H   = 540;              // computed canvas height in px (16:9)
let SL_CMT_CACHE  = {};               // {cid: rawHTML} — comment cache for slide rendering (DOM may be hidden)
const SL_RENDER_W = 960;              // canonical render width — same for editor, presenter, projector
const SL_RENDER_H = 540;             // canonical render height (16:9)

const SL_RATIO    = 16/9;

/* ── Default visibility ── */
const SL_VIS_DEFAULT = {
  indentation:false, translation:false,
  comments:false, connectors:false, brackets:false, labels:false,
  dividers:true, annotations:true
};

/* ── Serialise / restore ── */
function slCollectDeck(){ return { slides: SL_DECK.slides.map(s=>({...s, elements:s.elements.map(e=>({...e}))})) }; }
function slLoadDeck(data){
  SL_DECK = { slides: Array.isArray(data?.slides) ? data.slides.map(s=>({...s, elements:(s.elements||[]).map(e=>({...e}))})) : [] };
  SL_DECK.slides.forEach(s=>{ s.id=s.id||'sl-'+(++SL_SLIDE_CTR); (s.elements||[]).forEach(e=>{ e.id=e.id||'el-'+(++SL_EL_CTR); }); });
  SL_ACTIVE_IDX = 0; SL_SEL_EL_ID = null;
  // Do NOT call slRenderAll here — setEditorView and explicit refresh calls handle rendering.
  // Calling slRenderAll from slLoadDeck causes triple-render when combined with
  // the setEditorView setTimeout and the autoSave cycle.
}

/* ── Undo/redo for deck ops ── */
function _slPush(op){ rowPush(op); }
function _slApplyUndo(op){
  if(!op.type?.startsWith('sl-')) return false;
  if(op.type==='sl-add-slide'){
    SL_DECK.slides.splice(op.idx,1);
    SL_ACTIVE_IDX=Math.max(0,Math.min(op.idx-1,SL_DECK.slides.length-1));
    slRenderAll(); return true;
  }
  if(op.type==='sl-remove-slide'){
    SL_DECK.slides.splice(op.idx,0,op.slide);
    SL_ACTIVE_IDX=op.idx; slRenderAll(); return true;
  }
  if(op.type==='sl-slide-prop'){
    const sl=SL_DECK.slides[op.idx]; if(!sl) return true;
    if(op.prop==='visibility') sl.visibility={...sl.visibility,[op.key]:op.oldVal};
    else if(op.prop==='rowIds') sl.rowIds=[...op.oldVal];
    else if(op.prop==='contentArea') Object.assign(sl.contentArea, op.oldVal);
    else sl[op.prop]=op.oldVal;
    slRenderAll(); return true;
  }
  if(op.type==='sl-move-slide'){
    // Undo: move back from toIdx to fromIdx
    const [moved]=SL_DECK.slides.splice(op.toIdx,1);
    SL_DECK.slides.splice(op.fromIdx,0,moved);
    SL_ACTIVE_IDX=op.fromIdx;
    slRenderAll(); return true;
  }
  if(op.type==='sl-add-el'){
    const sl=SL_DECK.slides[op.slideIdx]; if(!sl) return true;
    sl.elements=sl.elements.filter(e=>e.id!==op.el.id);
    if(SL_SEL_EL_ID===op.el.id){ SL_SEL_EL_ID=null; _slUpdateShapePropsVisibility(null); }
    slRenderActive(); slRenderThumb(op.slideIdx); return true;
  }
  if(op.type==='sl-remove-el'){
    const sl=SL_DECK.slides[op.slideIdx]; if(!sl) return true;
    sl.elements.splice(op.elIdx,0,op.el);
    slRenderActive(); slRenderThumb(op.slideIdx); return true;
  }
  if(op.type==='sl-el-prop'){
    const sl=SL_DECK.slides[op.slideIdx]; if(!sl) return true;
    const el=sl.elements.find(e=>e.id===op.elId); if(!el) return true;
    if(op.prop==='pos'){el.x=op.oldVal.x;el.y=op.oldVal.y;el.w=op.oldVal.w;el.h=op.oldVal.h;}
    else el[op.prop]=op.oldVal;
    slRenderActive(); slRenderThumb(op.slideIdx); return true;
  }
  if(op.type==='sl-zorder'){
    SL_DECK.slides[op.slideIdx].elements=op.oldOrder.map(id=>SL_DECK.slides[op.slideIdx].elements.find(e=>e.id===id)).filter(Boolean);
    slRenderActive(); slRenderThumb(op.slideIdx); return true;
  }
  return false;
}
function _slApplyRedo(op){
  if(!op.type?.startsWith('sl-')) return false;
  if(op.type==='sl-add-slide'){
    SL_DECK.slides.splice(op.idx,0,op.slide);
    SL_ACTIVE_IDX=op.idx; slRenderAll(); return true;
  }
  if(op.type==='sl-remove-slide'){
    SL_DECK.slides.splice(op.idx,1);
    SL_ACTIVE_IDX=Math.max(0,Math.min(op.idx,SL_DECK.slides.length-1));
    slRenderAll(); return true;
  }
  if(op.type==='sl-slide-prop'){
    const sl=SL_DECK.slides[op.idx]; if(!sl) return true;
    if(op.prop==='visibility') sl.visibility={...sl.visibility,[op.key]:op.newVal};
    else if(op.prop==='rowIds') sl.rowIds=[...op.newVal];
    else if(op.prop==='contentArea') Object.assign(sl.contentArea, op.newVal);
    else sl[op.prop]=op.newVal;
    slRenderAll(); return true;
  }
  if(op.type==='sl-move-slide'){
    // Redo: move from fromIdx to toIdx again
    const [moved]=SL_DECK.slides.splice(op.fromIdx,1);
    SL_DECK.slides.splice(op.toIdx,0,moved);
    SL_ACTIVE_IDX=op.toIdx;
    slRenderAll(); return true;
  }
  if(op.type==='sl-add-el'){
    const sl=SL_DECK.slides[op.slideIdx]; if(!sl) return true;
    if(!sl.elements.some(e=>e.id===op.el.id)) sl.elements.push({...op.el});
    SL_SEL_EL_ID=op.el.id;
    slRenderActive(); slRenderThumb(op.slideIdx); return true;
  }
  if(op.type==='sl-remove-el'){
    const sl=SL_DECK.slides[op.slideIdx]; if(!sl) return true;
    sl.elements=sl.elements.filter(e=>e.id!==op.el.id);
    if(SL_SEL_EL_ID===op.el.id){ SL_SEL_EL_ID=null; _slUpdateShapePropsVisibility(null); }
    slRenderActive(); slRenderThumb(op.slideIdx); return true;
  }
  if(op.type==='sl-el-prop'){
    const sl=SL_DECK.slides[op.slideIdx]; if(!sl) return true;
    const el=sl.elements.find(e=>e.id===op.elId); if(!el) return true;
    if(op.prop==='pos'){el.x=op.newVal.x;el.y=op.newVal.y;el.w=op.newVal.w;el.h=op.newVal.h;}
    else el[op.prop]=op.newVal;
    slRenderActive(); slRenderThumb(op.slideIdx); return true;
  }
  if(op.type==='sl-zorder'){
    SL_DECK.slides[op.slideIdx].elements=op.newOrder.map(id=>SL_DECK.slides[op.slideIdx].elements.find(e=>e.id===id)).filter(Boolean);
    slRenderActive(); slRenderThumb(op.slideIdx); return true;
  }
  return false;
}

/* ── Wire undo/redo into existing system ── */
const _slOrigApplyUndo=applyRowUndo;
// Patched into applyRowUndo/applyRowRedo at the top via the existing bracket pattern

/* ── Slide factory ── */
function slMakeBlank(){
  return {id:'sl-'+(++SL_SLIDE_CTR),type:'blank',view:'phrasing',rowIds:[],
    visibility:{...SL_VIS_DEFAULT},
    contentArea:{x:3,y:3,w:94,h:55},
    elements:[],notes:''};
}
function slMakeContent(){
  const allRids=Array.from(document.querySelectorAll('.xrow')).map(r=>r.dataset.rid).filter(Boolean);
  return {id:'sl-'+(++SL_SLIDE_CTR),type:'content',view:'phrasing',rowIds:allRids,
    visibility:{...SL_VIS_DEFAULT},
    contentArea:{x:3,y:3,w:94,h:55},
    elements:[],notes:''};
}

/* ── Add slide ── */
function slAddBlank(){
  const slide=slMakeBlank();
  const idx=SL_DECK.slides.length;
  SL_DECK.slides.push(slide);
  _slPush({type:'sl-add-slide',idx,slide:{...slide,elements:[...slide.elements]}});
  SL_ACTIVE_IDX=idx; slRenderAll(); autoSave();
}
function slAddContent(){
  const slide=slMakeContent();
  const idx=SL_DECK.slides.length;
  SL_DECK.slides.push(slide);
  _slPush({type:'sl-add-slide',idx,slide:{...slide,elements:[...slide.elements]}});
  SL_ACTIVE_IDX=idx; slRenderAll(); autoSave();
}

/* ── Delete slide ── */
function slDeleteSlide(idx){
  if(SL_DECK.slides.length<=1){ toast('Cannot delete the last slide.'); return; }
  const slide={...SL_DECK.slides[idx],elements:[...SL_DECK.slides[idx].elements]};
  SL_DECK.slides.splice(idx,1);
  _slPush({type:'sl-remove-slide',idx,slide});
  SL_ACTIVE_IDX=Math.max(0,Math.min(idx,SL_DECK.slides.length-1));
  slRenderAll(); autoSave();
}

/* ── Duplicate slide ── */
function slDuplicateSlide(idx){
  const src=SL_DECK.slides[idx];
  const copy={...JSON.parse(JSON.stringify(src)),id:'sl-'+(++SL_SLIDE_CTR)};
  copy.elements.forEach(e=>{e.id='el-'+(++SL_EL_CTR);});
  const newIdx=idx+1;
  SL_DECK.slides.splice(newIdx,0,copy);
  _slPush({type:'sl-add-slide',idx:newIdx,slide:JSON.parse(JSON.stringify(copy))});
  SL_ACTIVE_IDX=newIdx; slRenderAll(); autoSave();
}

/* ── Select slide — deselects any selected element, re-renders canvas ── */
function slSelectSlide(idx){
  SL_SEL_EL_ID=null; // always deselect elements when switching slides
  SL_ACTIVE_IDX=idx;
  document.getElementById('sl-shapeprops-section').style.display='none';
  document.getElementById('sl-textfmt-section').style.display='none';
  document.getElementById('sl-float-toolbar').style.display='none';
  SL_FMT_ACTIVE_INNER=null;
  slUpdatePropsPanel();
  slRefreshSlide();
  document.querySelectorAll('.sl-thumb').forEach((t,i)=>t.classList.toggle('active',i===idx));
}

/* ── Sync derived elements (floatlabels + commentboxes) from live data ──
   Called on every Refresh. Keeps positions of existing elements,
   adds new ones at defaults, removes stale ones. */
function slSyncDerivedElements(){
  const sl=SL_DECK.slides[SL_ACTIVE_IDX]; if(!sl) return;

  // ── Floating diagram labels → floatlabel elements ──
  if(sl.view==='diagram'){
    const existingLabels=sl.elements.filter(e=>e.type==='floatlabel');
    const newLabels=[];
    (DIAGRAM_DATA.labels||[]).forEach((lb,i)=>{
      const existing=existingLabels.find(e=>e.sourceId===lb.id);
      if(existing){
        // Update text from live data; keep user-moved position
        existing.html=lb.text||'';
        newLabels.push(existing);
      } else {
        // New label — add at its diagram position
        newLabels.push({
          id:'el-'+(++SL_EL_CTR), type:'floatlabel', sourceId:lb.id,
          x: parseFloat(lb.x)||5, y: parseFloat(lb.y)||5,
          w:18, h:8,
          html: lb.text||''
        });
      }
    });
    // Remove non-label and non-commentbox derived elements, keep user text boxes
    sl.elements=sl.elements.filter(e=>e.type!=='floatlabel');
    sl.elements.push(...newLabels);
  } else {
    // Clear floatlabels when in phrasing mode
    sl.elements=sl.elements.filter(e=>e.type!=='floatlabel');
  }

  // ── Comment boxes → commentbox elements ──
  const existingCmts=sl.elements.filter(e=>e.type==='commentbox');
  const newCmts=[];
  let cmtIdx=0;
  sl.rowIds.forEach(rid=>{
    const xrow=document.querySelector(`.xrow[data-rid="${rid}"]`);
    const cid=xrow?.dataset.cid; if(!cid) return;
    const raw=SL_CMT_CACHE[cid]
      ||(document.querySelector(`.ccard[data-cid="${cid}"] .cedit-c`)?.innerHTML||'');
    const txt=raw.replace(/<br\s*\/?>/gi,' ').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').trim();
    if(!txt) return;
    const lid=xrow.querySelector('.lid')?.textContent||'';
    const labelStr=lid!=='—'?lid:'';
    const existing=existingCmts.find(e=>e.sourceCid===cid);
    if(existing){
      existing.html=`<b style="color:#C8A84B">${labelStr}</b> ${txt}`;
      newCmts.push(existing);
    } else {
      // Default position: stagger in bottom-right
      const col=cmtIdx%2, row=Math.floor(cmtIdx/2);
      newCmts.push({
        id:'el-'+(++SL_EL_CTR), type:'commentbox', sourceCid:cid,
        x: 55+col*20, y: 70+row*15,
        w:38, h:12,
        html:`<b style="color:#C8A84B">${labelStr}</b> ${txt}`
      });
    }
    cmtIdx++;
  });
  sl.elements=sl.elements.filter(e=>e.type!=='commentbox');
  sl.elements.push(...newCmts);
}

/* ── Refresh current slide canvas + thumbnail from live project data ── */
let _slLastRefreshTime = 0;
function slRefreshSlide(){
  const now=Date.now();
  if(now-_slLastRefreshTime<100){ return; }
  _slLastRefreshTime=now;
  const sl=SL_DECK.slides[SL_ACTIVE_IDX]; if(!sl) return;
  // Sync derived elements from live data
  slSyncDerivedElements();
  slRenderActive();
  slRenderThumb(SL_ACTIVE_IDX);
}

/* ── Add text box ── */
/* ── Slide textbox rich-text formatting ──
   Applies directly to the live contentEditable DOM via execCommand —
   deliberately does NOT touch el.html or push its own undo entries.
   The existing blur-triggered commitText() (in slRenderSlideInto) already
   captures whatever the final innerHTML is as one consolidated undo step,
   exactly the same way it already does for plain text edits. Formatting
   commands piggybacking on that same, already-proven mechanism avoids
   corrupting its "old value" capture (which happens at blur time) and
   avoids cluttering undo history with one entry per formatting click. */
let SL_FMT_ACTIVE_INNER=null; // the .sl-el-textbox-inner currently being edited
let SL_FMT_SAVED_RANGE=null;  // selection range preserved across native color-picker focus theft
let SL_FMT_COMMIT_FN=null;    // forces the active textbox out of edit mode synchronously (see slSelectEl)

function slFmtSaveRange(){
  const s=window.getSelection();
  if(s && s.rangeCount && SL_FMT_ACTIVE_INNER && SL_FMT_ACTIVE_INNER.contains(s.anchorNode)){
    SL_FMT_SAVED_RANGE=s.getRangeAt(0).cloneRange();
  }
}
function slFmtRestoreRange(){
  if(!SL_FMT_ACTIVE_INNER) return;
  if(document.activeElement!==SL_FMT_ACTIVE_INNER) SL_FMT_ACTIVE_INNER.focus();
  if(!SL_FMT_SAVED_RANGE) return;
  try{
    const s=window.getSelection();
    s.removeAllRanges();
    s.addRange(SL_FMT_SAVED_RANGE);
  }catch(_){}
}

// B/I/U buttons use onpointerdown="event.preventDefault()" in the HTML,
// which keeps focus (and the live selection) on the textbox the whole
// time — no save/restore needed here, unlike the color inputs below,
// which open a native OS picker that unavoidably steals focus.
function slFmtCmd(cmd){
  if(!SL_FMT_ACTIVE_INNER) return;
  document.execCommand(cmd,false,null);
  slUpdateFmtToolbarState();
}

function slFmtFontFamily(family){
  if(!SL_FMT_ACTIVE_INNER) return;
  slFmtRestoreRange();
  // Default option (value="") — execCommand has no reliable "clear just
  // this one property" mode, so strip <font face> / font-family styling
  // from whatever intersects the selection directly, same approach as
  // removeHl/_unwrapHl below use for highlights.
  if(!family){
    const sel=window.getSelection();
    let range=null;
    if(sel && sel.rangeCount>0 && SL_FMT_ACTIVE_INNER.contains(sel.getRangeAt(0).commonAncestorContainer)){
      range=sel.getRangeAt(0);
    } else if(SL_FMT_SAVED_RANGE){
      range=SL_FMT_SAVED_RANGE;
    }
    if(range && !range.collapsed) _slClearFontFamilyInRange(range);
    SL_FMT_SAVED_RANGE=null;
    return;
  }
  document.execCommand('fontName',false,family);
}

// Clears font-family styling (both legacy <font face> tags from
// execCommand('fontName',...) and inline style.fontFamily) from whatever
// intersects the given range, leaving bold/italic/color/size/highlight on
// the same text untouched. Clears the whole intersecting carrier rather
// than splitting at the exact selection boundary — same "whole-carrier"
// simplification removeHl already uses for highlights.
function _slClearFontFamilyInRange(range){
  const candidates=SL_FMT_ACTIVE_INNER.querySelectorAll('font[face], [style*="font-family" i]');
  candidates.forEach(node=>{
    if(!range.intersectsNode(node)) return;
    if(node.tagName==='FONT' && node.hasAttribute('face')) node.removeAttribute('face');
    if(node.style && node.style.fontFamily) node.style.removeProperty('font-family');
    const nowEmpty = node.tagName==='FONT'
      ? node.attributes.length===0
      : (!node.getAttribute('style') && node.attributes.length===0);
    if(nowEmpty) _unwrapHl(node); // generic unwrap — name is highlight-specific but body isn't
  });
}

function slFmtColor(hex){
  if(!SL_FMT_ACTIVE_INNER) return;
  slFmtRestoreRange();
  document.execCommand('foreColor',false,hex);
}

function slFmtHighlight(hex){
  if(!SL_FMT_ACTIVE_INNER) return;
  slFmtRestoreRange();
  // hiliteColor has a history of unreliable support in Safari/WebKit —
  // and per the zoom investigation earlier in this project, this app's
  // iPad testing runs on WebKit regardless of which "browser" app is
  // used. backColor is the more consistently-supported fallback.
  const ok=document.execCommand('hiliteColor',false,hex);
  if(!ok) document.execCommand('backColor',false,hex);
}
function slFmtHighlightClear(){
  if(!SL_FMT_ACTIVE_INNER) return;
  slFmtRestoreRange();
  const ok=document.execCommand('hiliteColor',false,'transparent');
  if(!ok) document.execCommand('backColor',false,'transparent');
}

// Browsers only expose execCommand fontSize as legacy HTML <font
// size="1"-"7"> indices, not pixel values — there's no direct "set
// pixel size on selection" command. Standard workaround: apply the
// otherwise-unused index 7 (guaranteed not to collide with any
// existing formatting), then immediately find and replace that
// specific <font size="7"> with a <span style="font-size:Npx">,
// giving real pixel control without hand-rolling range-wrapping logic.
function slFmtFontSizeAbs(px){
  if(!SL_FMT_ACTIVE_INNER) return;
  px=Math.max(6,Math.min(200,parseInt(px)||18));
  const input=document.getElementById('sl-fmt-size');
  if(input) input.value=px;

  if(document.activeElement!==SL_FMT_ACTIVE_INNER) SL_FMT_ACTIVE_INNER.focus();

  // fontSize is one of execCommand's oldest, most unusual features — a
  // value-based command that generates legacy <font size="N"> tags,
  // very different from the simple boolean toggles bold/italic/
  // underline use. Those are confirmed working; fontSize specifically
  // was not, on this device. Rather than keep guessing at why a
  // deprecated API behaves inconsistently on a browser this project
  // can't directly test against, this bypasses execCommand entirely and
  // manipulates the selection Range directly instead — standard,
  // dependency-free DOM APIs with no reliance on any particular
  // browser's own interpretation of a legacy command.
  const sel=window.getSelection();
  let range=null;
  if(sel && sel.rangeCount>0 && SL_FMT_ACTIVE_INNER.contains(sel.getRangeAt(0).commonAncestorContainer)){
    range=sel.getRangeAt(0);
  } else if(SL_FMT_SAVED_RANGE){
    range=SL_FMT_SAVED_RANGE;
  }
  if(!range) return;

  const span=document.createElement('span');
  span.style.fontSize=px+'px';

  if(range.collapsed){
    // Just a cursor, no selected text — nothing existing to wrap.
    // Insert an empty styled span at the cursor and place the cursor
    // inside it; browsers continue typing inside whatever element the
    // cursor currently sits within, so subsequently-typed characters
    // inherit the size. A zero-width space keeps the span from being
    // an empty, easy-to-lose insertion point.
    span.appendChild(document.createTextNode('\u200B'));
    range.insertNode(span);
    const newRange=document.createRange();
    newRange.setStart(span.firstChild,1);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
    SL_FMT_SAVED_RANGE=null;
  } else {
    try{
      range.surroundContents(span);
    }catch(_){
      // surroundContents throws if the range's boundaries partially
      // overlap existing elements (a very common case for real-world
      // selections that already contain other formatting) — extract
      // and re-wrap works for any range shape.
      const contents=range.extractContents();
      span.appendChild(contents);
      range.insertNode(span);
    }
    const newRange=document.createRange();
    newRange.selectNodeContents(span);
    sel.removeAllRanges();
    sel.addRange(newRange);
    SL_FMT_SAVED_RANGE=newRange.cloneRange();
  }
}
function slFmtFontSize(delta){
  if(!SL_FMT_ACTIVE_INNER) return;
  const input=document.getElementById('sl-fmt-size');
  const cur=parseInt(input?.value)||18;
  slFmtFontSizeAbs(cur+delta);
}

function slUpdateFmtToolbarState(){
  const b=document.getElementById('sl-fmt-b'), i=document.getElementById('sl-fmt-i'), u=document.getElementById('sl-fmt-u');
  try{
    b?.classList.toggle('active', document.queryCommandState('bold'));
    i?.classList.toggle('active', document.queryCommandState('italic'));
    u?.classList.toggle('active', document.queryCommandState('underline'));
  }catch(_){}
}

function slAddTextBox(){
  const sl=SL_DECK.slides[SL_ACTIVE_IDX]; if(!sl) return;
  const el={id:'el-'+(++SL_EL_CTR),type:'textbox',x:10,y:65,w:80,h:18,html:'',fontSize:18,color:'#1F1E1E',align:'left'};
  sl.elements.push(el);
  _slPush({type:'sl-add-el',slideIdx:SL_ACTIVE_IDX,el:{...el}});
  SL_SEL_EL_ID=el.id; slRenderActive(); slRenderThumb(SL_ACTIVE_IDX); autoSave();
}

function slAddShape(shapeType){
  const sl=SL_DECK.slides[SL_ACTIVE_IDX]; if(!sl) return;
  const el={id:'el-'+(++SL_EL_CTR),type:'shape',shapeType:shapeType||'rect',x:30,y:35,w:40,h:30,fill:'transparent',stroke:'#000000',strokeWidth:2,strokeStyle:'solid'};
  sl.elements.push(el);
  _slPush({type:'sl-add-el',slideIdx:SL_ACTIVE_IDX,el:{...el}});
  SL_SEL_EL_ID=el.id; slRenderActive(); slRenderThumb(SL_ACTIVE_IDX); autoSave();
}

function slAddImage(){
  document.getElementById('sl-image-file')?.click();
}
function slImageFileSelected(ev){
  const file=ev.target.files && ev.target.files[0];
  ev.target.value=''; // allow re-selecting the same file later
  if(!file || !file.type.startsWith('image/')) return;
  const sl=SL_DECK.slides[SL_ACTIVE_IDX]; if(!sl) return;
  const reader=new FileReader();
  reader.onload=()=>{
    const dataUrl=reader.result;
    // Read the image's natural dimensions so the initial box preserves
    // aspect ratio instead of stretching into an arbitrary default shape.
    // Sized in PIXEL space (via SL_CANVAS_W/H) rather than directly against
    // percent, since the canvas is a fixed 960x540 (16:9, not square) — a
    // percent-space ratio doesn't equal the on-screen pixel ratio.
    const img=new Image();
    img.onload=()=>{
      const naturalRatio=img.naturalWidth/(img.naturalHeight||1);
      let wPx=0.5*SL_CANVAS_W, hPx=wPx/naturalRatio;
      if(hPx>0.6*SL_CANVAS_H){ hPx=0.6*SL_CANVAS_H; wPx=hPx*naturalRatio; } // cap height, keep ratio
      const w=wPx/SL_CANVAS_W*100, h=hPx/SL_CANVAS_H*100;
      const el={id:'el-'+(++SL_EL_CTR),type:'image',x:(100-w)/2,y:(100-h)/2,w,h,src:dataUrl,naturalRatio};
      sl.elements.push(el);
      _slPush({type:'sl-add-el',slideIdx:SL_ACTIVE_IDX,el:{...el}});
      SL_SEL_EL_ID=el.id; slRenderActive(); slRenderThumb(SL_ACTIVE_IDX); autoSave();
    };
    img.src=dataUrl;
  };
  reader.readAsDataURL(file);
}

/* ── View / visibility / notes change ── */
// Which visibility checkboxes are relevant to each internal slide view
// (sl.view — the Phrasing/Diagram toggle inside the Slides properties
// panel, not the app's main top-level tabs). Based on what
// slBuildPassageDOM/slSyncDerivedElements actually check, not the
// checkbox names — translation and comments are referenced in BOTH
// rendering branches (or have no view-gating at all, for comments), so
// they stay visible regardless of which view is selected; only
// indentation (phrasing-only) and connectors/brackets/labels
// (diagram-only) are actually exclusive to one branch.
function _slUpdateVisRowsForView(view){
  const phrasingOnly=['sl-vis-indent'];
  const diagramOnly=['sl-vis-connectors','sl-vis-brackets','sl-vis-labels'];
  phrasingOnly.forEach(id=>{
    const row=document.getElementById(id)?.closest('.sl-vis-row');
    if(row) row.style.display = view==='phrasing' ? '' : 'none';
  });
  diagramOnly.forEach(id=>{
    const row=document.getElementById(id)?.closest('.sl-vis-row');
    if(row) row.style.display = view==='diagram' ? '' : 'none';
  });
  // sl-vis-trans and sl-vis-comments are intentionally left alone — always visible.
}

function slSetView(view){
  const sl=SL_DECK.slides[SL_ACTIVE_IDX]; if(!sl) return;
  const old=sl.view; if(old===view) return;
  sl.view=view;
  _slPush({type:'sl-slide-prop',idx:SL_ACTIVE_IDX,prop:'view',oldVal:old,newVal:view});
  document.getElementById('sl-view-phrasing')?.classList.toggle('active',view==='phrasing');
  document.getElementById('sl-view-diagram')?.classList.toggle('active',view==='diagram');
  _slUpdateVisRowsForView(view);
  autoSave();
  // No live re-render — user clicks Refresh or selects slide to update
}
function slVisChange(key,val){
  const sl=SL_DECK.slides[SL_ACTIVE_IDX]; if(!sl) return;
  const old=sl.visibility[key];
  sl.visibility[key]=val;
  _slPush({type:'sl-slide-prop',idx:SL_ACTIVE_IDX,prop:'visibility',key,oldVal:old,newVal:val});
  autoSave();
  // No live re-render — user clicks Refresh to see result
}
function slNotesChange(val){
  const sl=SL_DECK.slides[SL_ACTIVE_IDX]; if(!sl) return;
  sl.notes=val; autoSave();
}
function slSelectAllRows(){
  const sl=SL_DECK.slides[SL_ACTIVE_IDX]; if(!sl) return;
  const old=[...sl.rowIds];
  sl.rowIds=Array.from(document.querySelectorAll('.xrow')).map(r=>r.dataset.rid).filter(Boolean);
  _slPush({type:'sl-slide-prop',idx:SL_ACTIVE_IDX,prop:'rowIds',oldVal:old,newVal:[...sl.rowIds]});
  slUpdateRowList(); autoSave();
}
function slClearAllRows(){
  const sl=SL_DECK.slides[SL_ACTIVE_IDX]; if(!sl) return;
  const old=[...sl.rowIds];
  sl.rowIds=[];
  _slPush({type:'sl-slide-prop',idx:SL_ACTIVE_IDX,prop:'rowIds',oldVal:old,newVal:[]});
  slUpdateRowList(); autoSave();
}

/* ── Update props panel from active slide ── */
function slUpdatePropsPanel(){
  const sl=SL_DECK.slides[SL_ACTIVE_IDX]; if(!sl) return;
  document.getElementById('sl-view-phrasing')?.classList.toggle('active',sl.view==='phrasing');
  document.getElementById('sl-view-diagram')?.classList.toggle('active',sl.view==='diagram');
  _slUpdateVisRowsForView(sl.view);
  document.getElementById('sl-vis-indent')   .checked=!!sl.visibility.indentation;
  document.getElementById('sl-vis-trans')    .checked=!!sl.visibility.translation;
  document.getElementById('sl-vis-comments') .checked=!!sl.visibility.comments;
  document.getElementById('sl-vis-connectors').checked=!!sl.visibility.connectors;
  document.getElementById('sl-vis-brackets') .checked=!!sl.visibility.brackets;
  document.getElementById('sl-vis-labels')   .checked=!!sl.visibility.labels;
  document.getElementById('sl-notes').value=sl.notes||'';
  slUpdateRowList();
}
function slUpdateRowList(){
  const sl=SL_DECK.slides[SL_ACTIVE_IDX]; if(!sl) return;
  const list=document.getElementById('sl-row-list'); if(!list) return;
  list.innerHTML='';
  document.querySelectorAll('.xrow').forEach(xrow=>{
    const rid=xrow.dataset.rid; if(!rid) return;
    const lid=xrow.querySelector('.lid')?.textContent||'—';
    const verse=xrow.querySelector('.vin')?.value||'';
    const checked=sl.rowIds.includes(rid);
    const label=document.createElement('label');
    label.className='sl-row-check';
    label.innerHTML=`<input type="checkbox" ${checked?'checked':''}><span class="sl-row-lbl">${lid!=='—'?lid:''}</span><span style="color:var(--muted);font-size:10px">${verse}</span>`;
    label.querySelector('input').addEventListener('change',function(){
      const old=[...sl.rowIds];
      if(this.checked){ if(!sl.rowIds.includes(rid)) sl.rowIds.push(rid); }
      else { sl.rowIds=sl.rowIds.filter(r=>r!==rid); }
      _slPush({type:'sl-slide-prop',idx:SL_ACTIVE_IDX,prop:'rowIds',oldVal:old,newVal:[...sl.rowIds]});
      slRenderActive(); slRenderThumb(SL_ACTIVE_IDX); autoSave();
    });
    list.appendChild(label);
  });
}

/* ── Canvas sizing: maintain 16:9, scale to fit outer container ── */
function slSizeCanvas(){
  const outer=document.getElementById('sl-canvas-outer'); if(!outer) return;
  const pad=48;
  const maxW=outer.clientWidth-pad;
  const maxH=outer.clientHeight-pad;
  let w=maxW, h=w/SL_RATIO;
  if(h>maxH){ h=maxH; w=h*SL_RATIO; }
  SL_CANVAS_W=Math.round(w); SL_CANVAS_H=Math.round(h);
  const cv=document.getElementById('sl-canvas');
  if(cv){ cv.style.width=SL_CANVAS_W+'px'; cv.style.height=SL_CANVAS_H+'px'; }
}

/* ── Build passage content DOM for a slide (used in both editor and projector) ── */
function slBuildPassageDOM(slide, targetW, targetH){
  const frag=document.createElement('div');
  frag.style.cssText='position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden;background:transparent;';
  if(!slide.rowIds.length){
    const msg=document.createElement('div');
    msg.style.cssText='position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:var(--ui);font-size:12px;color:rgba(0,0,0,.2);font-style:italic;pointer-events:none;';
    msg.textContent=t('slides.no-rows');
    frag.appendChild(msg);
    return frag;
  }

  // Clone just the selected rows from the live DOM
  const ca=document.createElement('div');
  ca.className='sl-passage-frame';
  ca.style.cssText='position:relative;width:10000px;'; // wide enough, we'll scale it down

  if(slide.view==='phrasing'){
    // Build a mini phrasing table clone
    const rb=document.createElement('div');
    rb.style.cssText='font-family:var(--serif);background:transparent;';
    slide.rowIds.forEach(rid=>{
      const xrow=document.querySelector(`.xrow[data-rid="${rid}"]`);
      if(!xrow) return;
      const clone=xrow.cloneNode(true);
      // Remove interactive elements
      clone.querySelectorAll('button,.cmtbtn,.drow-pip-cell,.xrow-brk-handle').forEach(el=>el.remove());
      rb.appendChild(clone);
    });
    ca.appendChild(rb);
    // Apply visibility classes
    const v=slide.visibility;
    if(!v.indentation) ca.classList.add('sl-hide-indent');
    if(!v.translation)  ca.classList.add('sl-hide-trans');
    if(!v.verseNums)    ca.classList.add('sl-hide-verse');
  } else {
    // Diagram view clone
    const dc=document.getElementById('dcanvas');
    if(dc){
      const clone=dc.cloneNode(true);
      // Hide rows not in selection
      clone.querySelectorAll('.drow').forEach(drow=>{
        if(!slide.rowIds.includes(drow.dataset.rid)) drow.style.display='none';
      });
      clone.querySelectorAll('.drow-pip-cell,.dbrk-pip').forEach(el=>el.remove());
      clone.style.cssText='position:relative;background:transparent;';
      ca.appendChild(clone);
      // Apply visibility
      const v=slide.visibility;
      if(!v.connectors) ca.classList.add('sl-hide-connectors');
      if(!v.brackets)   ca.classList.add('sl-hide-brackets');
      if(!v.labels)     ca.classList.add('sl-hide-labels');
      if(!v.translation) ca.classList.add('sl-hide-trans');
      if(!v.verseNums)   ca.classList.add('sl-hide-verse');
    }
  }

  // Scale-to-fit: measure natural size then compute scale
  frag.appendChild(ca);
  // We need to actually measure — do it after DOM insertion via a wrapper approach
  const ca_x=slide.contentArea.x, ca_y=slide.contentArea.y;
  const ca_w=slide.contentArea.w, ca_h=slide.contentArea.h;
  frag.style.left  =(ca_x/100*targetW)+'px';
  frag.style.top   =(ca_y/100*targetH)+'px';
  frag.style.width =(ca_w/100*targetW)+'px';
  frag.style.height=(ca_h/100*targetH)+'px';

  return frag;
}

/* ── Draw connectors fresh into a cloned dcanvas ──────────────────────────
   Uses offsetTop/offsetLeft relative to the clone so positions are correct
   even when some rows are hidden (their heights have collapsed). */
function slDrawConnectorsIntoClone(cloneCanvas, visibleRids){
  if(!DIAGRAM_DATA.connectors.length) return;

  // Helper: get block position relative to cloneCanvas using offset chain
  function blockRect(block, ancestor){
    let top=0,left=0,cur=block;
    while(cur&&cur!==ancestor){top+=cur.offsetTop;left+=cur.offsetLeft;cur=cur.offsetParent;}
    return {top,left,width:block.offsetWidth,height:block.offsetHeight};
  }

  // Helper: compute connector point using clone-relative offsets
  const CONN_INSET=6;
  function clonePoint(block, fracX, fracY){
    const r=blockRect(block,cloneCanvas);
    let y=r.top+r.height*fracY;
    if(fracY===0) y+=CONN_INSET;
    else if(fracY===1) y-=CONN_INSET;
    return {x:r.left+r.width*fracX, y};
  }

  // Build fresh SVG layers
  const ns='http://www.w3.org/2000/svg';
  const backSvg=document.createElementNS(ns,'svg');
  backSvg.id='dconns-back-sl';
  backSvg.setAttribute('preserveAspectRatio','none');
  backSvg.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:0;';
  cloneCanvas.insertBefore(backSvg, cloneCanvas.firstChild);

  const frontSvg=document.createElementNS(ns,'svg');
  frontSvg.id='dconns-sl';
  frontSvg.setAttribute('preserveAspectRatio','none');
  frontSvg.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:8;';
  cloneCanvas.appendChild(frontSvg);

  // Shared defs for markers (arrowheads etc.)
  const defs=document.createElementNS(ns,'defs');
  frontSvg.appendChild(defs);

  // Track which markers we've already added
  const addedMarkers=new Set();
  function ensureMarker(svg, kind, color){
    const mid=`${kind}-${color.replace('#','')}`;
    if(addedMarkers.has(mid)) return `url(#${mid})`;
    addedMarkers.add(mid);
    const marker=document.createElementNS(ns,'marker');
    marker.setAttribute('id',mid);
    marker.setAttribute('markerUnits','strokeWidth');
    if(kind==='arrow'){
      marker.setAttribute('viewBox','0 0 10 10');
      marker.setAttribute('refX','9'); marker.setAttribute('refY','5');
      marker.setAttribute('markerWidth','6'); marker.setAttribute('markerHeight','6');
      marker.setAttribute('orient','auto');
      const path=document.createElementNS(ns,'path');
      path.setAttribute('d','M0,0 L10,5 L0,10 Z');
      path.setAttribute('fill',color);
      marker.appendChild(path);
    } else if(kind==='dot'){
      marker.setAttribute('viewBox','0 0 10 10');
      marker.setAttribute('refX','5'); marker.setAttribute('refY','5');
      marker.setAttribute('markerWidth','5'); marker.setAttribute('markerHeight','5');
      const circle=document.createElementNS(ns,'circle');
      circle.setAttribute('cx','5');circle.setAttribute('cy','5');circle.setAttribute('r','4');
      circle.setAttribute('fill',color);
      marker.appendChild(circle);
    }
    defs.appendChild(marker);
    return `url(#${mid})`;
  }

  // Compute trunk X for right-angle connectors
  let trunkX=30;
  const allBlocks=Array.from(cloneCanvas.querySelectorAll('.dblock'));
  if(allBlocks.length){
    const lefts=allBlocks.filter(b=>b.offsetParent!==null||b.offsetWidth>0)
      .map(b=>blockRect(b,cloneCanvas).left);
    if(lefts.length) trunkX=Math.max(0,Math.min(...lefts)-20);
  }

  DIAGRAM_DATA.connectors.forEach(cnx=>{
    // Only draw if both endpoints are in the visible set
    if(!visibleRids.includes(cnx.fromRid)||!visibleRids.includes(cnx.toRid)) return;
    const fromBlock=cloneCanvas.querySelector(`.dblock[data-rid="${cnx.fromRid}"]`);
    const toBlock  =cloneCanvas.querySelector(`.dblock[data-rid="${cnx.toRid}"]`);
    if(!fromBlock||!toBlock) return;

    const p1=clonePoint(fromBlock, cnx.fromX??0.5, cnx.fromY??0.5);
    const p2=clonePoint(toBlock,   cnx.toX??0.5,   cnx.toY??0.5);

    let d;
    if(cnx.kind==='rightangle'){
      const rp1=clonePoint(fromBlock, cnx.fromX??0, cnx.fromY??0.5);
      const rp2=clonePoint(toBlock,   cnx.toX??0,   cnx.toY??0.5);
      d=`M${rp1.x},${rp1.y} H${trunkX} V${rp2.y} H${rp2.x}`;
    } else {
      // Delegate to the SAME shared path functions as the live diagram
      // (_connectorPathD / _connectorPathDTight) so slides/PDF output can
      // never drift out of sync with the on-screen arc shape again. Same
      // |dx| threshold as _makeCurveConnectorEl for the tight variant.
      const dx=p2.x-p1.x, dy=p2.y-p1.y;
      const fromY = (cnx.fromY===0||cnx.fromY===1) ? cnx.fromY : (dy>0 ? 1 : 0);
      const toY   = (cnx.toY  ===0||cnx.toY  ===1) ? cnx.toY   : (dy>0 ? 0 : 1);
      d = Math.abs(dx)<30 ? _connectorPathDTight(p1,p2,fromY,toY)
                          : _connectorPathD(p1,p2,fromY,toY);
    }

    const color=cnx.color||'#493548';
    const weight=cnx.weight||1.5;
    const dash=cnx.pattern==='dotted'?'4,4':'none';

    const path=document.createElementNS(ns,'path');
    path.setAttribute('d',d);
    path.setAttribute('fill','none');
    path.setAttribute('stroke',color);
    path.setAttribute('stroke-width',weight);
    path.setAttribute('stroke-dasharray',dash);
    path.setAttribute('stroke-linecap','round');

    const startCap=cnx.startCap||'none';
    const endCap  =cnx.endCap  ||'arrow';
    if(startCap==='arrow') path.setAttribute('marker-start', ensureMarker(frontSvg,startCap,color));
    if(startCap==='dot')   path.setAttribute('marker-start', ensureMarker(frontSvg,startCap,color));
    if(endCap==='arrow')   path.setAttribute('marker-end',   ensureMarker(frontSvg,endCap,color));
    if(endCap==='dot')     path.setAttribute('marker-end',   ensureMarker(frontSvg,endCap,color));

    const targetSvg=cnx.kind==='rightangle'?backSvg:frontSvg;
    targetSvg.appendChild(path);
  });
}

/* ── Draw brackets fresh into a cloned dcanvas ── */
function slDrawBracketsIntoClone(cloneCanvas, visibleRids){
  if(!BRACKETS.length) return;
  cloneCanvas.querySelector('#dbrk-svg')?.remove();

  const dsvg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  dsvg.id='dbrk-svg';
  dsvg.setAttribute('preserveAspectRatio','none');
  dsvg.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:7;';
  cloneCanvas.appendChild(dsvg);

  function offsetRelTo(el, anc){ let t=0,cur=el; while(cur&&cur!==anc){t+=cur.offsetTop;cur=cur.offsetParent;} return t; }

  const rows=Array.from(document.querySelectorAll('.xrow'));
  const rids=rows.map(r=>r.dataset.rid);

  // Compute laneXMap same as _brkRenderDiagram but using clone offsets
  const sorted=[...BRACKETS].sort((a,b)=>a.lane-b.lane);
  const laneXMap={};
  let prevLaneX=null, prevLabelW=0;
  sorted.forEach(brk=>{
    const si=rids.indexOf(String(brk.startRid)), ei=rids.indexOf(String(brk.endRid));
    if(si<0||ei<0) return;
    const lo=Math.min(si,ei),hi=Math.max(si,ei);
    let maxRight=0;
    rids.slice(lo,hi+1).forEach(rid=>{
      const block=cloneCanvas.querySelector(`.dblock[data-rid="${rid}"]`);
      if(!block) return;
      let left=0,cur=block; while(cur&&cur!==cloneCanvas){left+=cur.offsetLeft;cur=cur.offsetParent;}
      const right=left+block.offsetWidth;
      if(right>maxRight) maxRight=right;
    });
    const baseX=maxRight+BRK_PIP_OFFSET+BRK_LANE_W*0.5;
    let laneX=prevLaneX===null?baseX:Math.max(baseX,prevLaneX+(prevLabelW>0?prevLabelW+BRK_LABEL_GAP+20:BRK_LANE_W));
    laneXMap[brk.lane]=laneX;
    prevLaneX=laneX; prevLabelW=_brkMeasureLabelWidth(brk.label);
  });

  BRACKETS.forEach(brk=>{
    if(!visibleRids.includes(brk.startRid)&&!visibleRids.includes(brk.endRid)) return;
    const si=rids.indexOf(String(brk.startRid)),ei=rids.indexOf(String(brk.endRid));
    if(si<0||ei<0) return;
    const lo=Math.min(si,ei),hi=Math.max(si,ei);
    const startDrow=cloneCanvas.querySelector(`.drow[data-rid="${rids[lo]}"]`);
    const endDrow  =cloneCanvas.querySelector(`.drow[data-rid="${rids[hi]}"]`);
    if(!startDrow||!endDrow) return;
    const yStart=offsetRelTo(startDrow,cloneCanvas);
    const yEnd  =offsetRelTo(endDrow,cloneCanvas)+endDrow.offsetHeight;
    const laneX =laneXMap[brk.lane]??(100+(brk.lane-1)*BRK_LANE_W);
    _brkDrawSVG(dsvg, brk, laneX, yStart, yEnd);
  });
}

/* ── Render a slide into a target container ── */
function slRenderSlideInto(slide, container, w, h, isExport){
  container.innerHTML='';
  container.style.width=w+'px';
  container.style.height=h+'px';
  container.style.position='relative';
  container.style.background='#fff';
  container.style.overflow='hidden';

  // Passage content area — treated as a draggable/resizable element
  if(slide.rowIds.length>0 || EDITOR_VIEW==='slides'){
    const passageEl=document.createElement('div');
    passageEl.className='sl-el sl-el-passage';
    passageEl.dataset.elType='passage';
    const ca=slide.contentArea;
    passageEl.style.cssText=`left:${ca.x/100*w}px;top:${ca.y/100*h}px;width:${ca.w/100*w}px;height:${ca.h/100*h}px;overflow:visible;background:transparent;position:absolute;`;

    if(slide.rowIds.length>0){
      // Build content inner frame
      const inner=document.createElement('div');
      inner.style.cssText='position:absolute;top:0;left:0;transform-origin:top left;';
      let _slDiagWrap=null; // holds diagWrap ref for use in the rAF below

      if(slide.view==='phrasing'){
        const rb=document.createElement('div');
        rb.style.cssText='background:transparent;';
        slide.rowIds.forEach(rid=>{
          const xrow=document.querySelector(`.xrow[data-rid="${rid}"]`);
          if(!xrow) return;
          const clone=xrow.cloneNode(true);
          clone.querySelectorAll('button,.cmtbtn,.drow-pip-cell').forEach(el=>el.remove());
          rb.appendChild(clone);
        });
        const v=slide.visibility;
        if(!v.indentation) rb.querySelectorAll('.cedit').forEach(c=>{c.style.paddingLeft='0';c.style.paddingRight='0';});
        if(!v.translation)  rb.querySelectorAll('.xcell.grow + .vdiv, .xcell.grow ~ .xcell.grow').forEach(e=>e.style.display='none');
        // Comments as footnotes — read from in-memory cache (DOM may be hidden)
        if(v.comments){
          const fns=[];
          slide.rowIds.forEach(rid=>{
            const xrow=document.querySelector(`.xrow[data-rid="${rid}"]`);
            const cid=xrow?.dataset.cid; if(!cid) return;
            // Read from in-memory comment cache, fallback to DOM
            const cached=SL_CMT_CACHE[cid];
            const raw=cached!==undefined ? cached
              : (document.querySelector(`.ccard[data-cid="${cid}"] .cedit-c`)?.innerHTML||'');
            const txt=raw.replace(/<br\s*\/?>/gi,' ').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').trim();
            if(!txt) return;
            const lid=xrow.querySelector('.lid')?.textContent||'';
            fns.push({lid:lid!=='—'?lid:'',txt});
          });
          if(fns.length){
            const fnDiv=document.createElement('div');
            fnDiv.style.cssText='margin-top:8px;padding-top:6px;border-top:1px solid rgba(73,53,72,.2);font-family:var(--ui,sans-serif);font-size:10px;color:#555;';
            fns.forEach(fn=>{
              const row=document.createElement('div');
              row.style.cssText='margin-bottom:3px;';
              row.innerHTML=`<b style="color:#C8A84B;margin-right:4px">${fn.lid}</b>${fn.txt}`;
              fnDiv.appendChild(row);
            });
            rb.appendChild(fnDiv);
          }
        }
        inner.appendChild(rb);
        // Render discourse unit dividers between cloned rows
        slDrawDividersIntoClone(rb.querySelectorAll('.xrow'), slide);
      } else {
        // Build diagram content by cloning actual .dblock elements from the live
        // diagram rows — this preserves exact block dimensions (padding, font-size,
        // border) so connector Y positions match the live diagram precisely.
        // We must first ensure #dcanvas is populated with current rows.
        const dc=document.getElementById('dcanvas');
        const hasBlocks=dc&&dc.querySelectorAll('.dblock').length>0;
        if(!hasBlocks) renderDiagram();

        const diagWrap=document.createElement('div');
        _slDiagWrap=diagWrap; // store for rAF access
        // Use a fixed natural width matching typical diagram canvas width.
        // dc.scrollWidth returns 0 when #dzone is display:none (Slides View hides it),
        // which makes all block offsets 0 and breaks connector path calculations.
        diagWrap.style.cssText='position:relative;background:transparent;width:900px;';
        const v=slide.visibility;

        slide.rowIds.forEach(rid=>{
          const xrow=document.querySelector(`.xrow[data-rid="${rid}"]`);
          if(!xrow) return;

          // Clone the live .drow from #dcanvas so block dimensions match exactly
          const liveDrow=dc.querySelector(`.drow[data-rid="${rid}"]`);

          const dRow=document.createElement('div');
          dRow.className='drow'+(IS_RTL?' rtl':'');
          dRow.dataset.rid=rid;
          dRow.style.cssText='display:flex;align-items:flex-start;margin-bottom:10px;';

          // Verse cell
          const verse=xrow.querySelector('.vin')?.value||'';
          const vCell=document.createElement('div');
          vCell.className='dcell dv';
          vCell.style.cssText='width:60px;min-width:60px;font-family:var(--ui,sans-serif);font-size:11px;color:#A89F90;padding-top:6px;flex-shrink:0;';
          vCell.textContent=verse;

          // Line ID cell
          const lidEl=xrow.querySelector('.lid');
          const lCell=document.createElement('div');
          lCell.className='dcell dl';
          lCell.style.cssText='width:52px;min-width:52px;font-family:var(--ui,sans-serif);font-size:11px;color:#C8A84B;font-weight:700;padding-top:6px;flex-shrink:0;';
          lCell.textContent=lidEl?lidEl.textContent:'';

          const lane=document.createElement('div');
          lane.className='dlane';
          lane.style.cssText='flex:1;min-width:0;display:flex;flex-direction:column;align-items:'+(IS_RTL?'flex-end':'flex-start')+';';

          if(liveDrow){
            // Use the actual .dblock clone from live diagram — preserves exact metrics
            const liveBlock=liveDrow.querySelector('.dblock');
            if(liveBlock){
              const block=liveBlock.cloneNode(true);
              // Remove interactive elements (pip cells handled separately)
              block.querySelectorAll('.drow-pip-cell,.dbrk-pip,button').forEach(el=>el.remove());
              // Remove any zoom transform that might have been applied
              block.style.zoom='';
              lane.appendChild(block);
            }
            // Translation line
            if(v.translation){
              const liveTrans=liveDrow.querySelector('.dblock-trans');
              if(liveTrans){
                const trans=liveTrans.cloneNode(true);
                lane.appendChild(trans);
              }
            }
          } else {
            // Fallback if live drow not found: build from xrow data
            const origCedit=xrow.querySelector('#oc-'+rid+' .cedit');
            const indent=parseInt(origCedit?.dataset.indent||'0');
            const block=document.createElement('div');
            block.className='dblock';
            block.dataset.rid=rid;
            block.style.cssText='display:inline-block;border:1.5px solid rgba(73,53,72,.22);border-radius:6px;padding:5px 10px;font-family:var(--serif,serif);font-size:13px;max-width:520px;'+(IS_RTL?'margin-right:'+(indent*32)+'px;direction:rtl;text-align:right;':'margin-left:'+(indent*32)+'px;');
            block.innerHTML=origCedit?origCedit.innerHTML:'';
            lane.appendChild(block);
          }

          dRow.appendChild(vCell);
          dRow.appendChild(lCell);
          dRow.appendChild(lane);
          diagWrap.appendChild(dRow);
        });

        inner.appendChild(diagWrap);
      }

      passageEl.appendChild(inner);
      container.appendChild(passageEl);

      // rAF: draw connectors/brackets, then scale passage content to fit the bounding box.
      //
      // The passage bounding box (passageEl) is the user-defined content area.
      // Content that is naturally larger than the box is scaled DOWN to fit inside it
      // uniformly (scale ≤ 1, transform-origin: top left).
      // This applies in ALL render contexts — editor, projector, presenter, PDF —
      // so the bounding box always contains the content regardless of how much text
      // there is.
      //
      // Overlay elements (comment cards, text boxes) are positioned at % of the FULL
      // canvas (w×h) and are siblings of passageEl in container — they are NOT children
      // of inner, so they are not affected by the inner scale. This is intentional:
      // overlays are canvas-level elements that the user places freely, independent of
      // the passage content area. They remain at their declared canvas positions.
      requestAnimationFrame(()=>{
        if(!container.contains(passageEl)) return; // stale render

        // Draw connectors and brackets at natural block dimensions (diagram view only)
        if(slide.view==='diagram' && _slDiagWrap){
          const v=slide.visibility;
          if(v.connectors) slDrawConnectorsIntoClone(_slDiagWrap, slide.rowIds);
          if(v.brackets)   slDrawBracketsIntoClone(_slDiagWrap, slide.rowIds);
          // Render free arrows (and future arc/span clones) into diagram slide
          slDrawAnnotationsIntoClone(_slDiagWrap, slide.rowIds);
        }

        // Measure natural content size (before any scale)
        let naturalW=inner.scrollWidth||inner.offsetWidth||400;
        let naturalH=inner.scrollHeight||inner.offsetHeight||200;

        // For diagram view: bracket SVG labels are position:absolute inside the SVG
        // and therefore excluded from scrollWidth. Extend naturalW/H via getBBox().
        if(slide.view==='diagram' && _slDiagWrap){
          const dsvg=_slDiagWrap.querySelector('#dbrk-svg');
          if(dsvg){
            try{
              const bb=dsvg.getBBox();
              if(bb&&bb.width>0){
                naturalW=Math.max(naturalW, bb.x+bb.width);
                naturalH=Math.max(naturalH, bb.y+bb.height);
              }
            }catch(e){ /* getBBox() unavailable — fall back to scrollWidth */ }
          }
        }

        // Scale to fit the bounding box (passageEl declared size), never scale up.
        const areaW=parseFloat(passageEl.style.width)  || w;
        const areaH=parseFloat(passageEl.style.height) || h;
        const s=Math.min(areaW/Math.max(naturalW,1), areaH/Math.max(naturalH,1), 1);

        inner.style.transform=`scale(${s})`;
        inner.style.transformOrigin='top left';
        inner.style.width=naturalW+'px';
        inner.style.height=naturalH+'px';

        // In export renders, scale the FONT SIZE of overlay elements (comment boxes,
        // float labels, text boxes) by s so their text stays proportional to the
        // shrunken passage content.
        // Positions and dimensions are NOT changed — the box stays exactly where the
        // user placed it on the canvas. Moving them caused boxes to overlap the passage
        // blocks; resizing them made them narrower than intended.
        // The overall CSS transform applied by _slInjectScaled already scales the
        // entire 960×540 canvas uniformly for the presenter/projector/PDF, so the
        // declared px positions produce the correct visual layout.
        if(isExport && s < 1){
          container.querySelectorAll('.sl-el[data-el-id]').forEach(div=>{
            const elId=div.getAttribute('data-el-id');
            const el=slide.elements.find(e=>e.id===elId);
            if(!el) return;
            if(el.type==='textbox'){
              const txInner=div.querySelector('.sl-el-textbox-inner');
              if(txInner) txInner.style.fontSize=((el.fontSize||18)*s)+'px';
            } else {
              div.style.fontSize=(11*s)+'px';
            }
          });
        }
      });
    } else if(EDITOR_VIEW==='slides'){
      const msg=document.createElement('div');
      msg.style.cssText='position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:var(--ui);font-size:11px;color:rgba(0,0,0,.2);font-style:italic;pointer-events:none;text-align:center;padding:20px;';
      msg.textContent=t('slides.no-rows');
      passageEl.appendChild(msg);
    }

    // Drag in editor — passage area is draggable
    if(EDITOR_VIEW==='slides'){
      passageEl.style.cursor='move';
      passageEl.style.touchAction='none';
      passageEl.addEventListener('pointerdown',ev=>{
        if(ev.target.closest('.sl-resize-handle')) return;
        ev.stopPropagation();
        // Select without re-rendering — slSelectEl handles visual state
        if(SL_SEL_EL_ID!=='__passage__') slSelectEl('__passage__');
        const ca=slide.contentArea;
        const startX=ev.clientX,startY=ev.clientY;
        const startCax=ca.x,startCay=ca.y;
        const oldCA={...ca};
        const othersForCA=slide.elements||[];
        const onMove=mv=>{
          const dx=(mv.clientX-startX)/w*100;
          const dy=(mv.clientY-startY)/h*100;
          let x=Math.max(0,Math.min(100-ca.w,startCax+dx));
          let y=Math.max(0,Math.min(100-ca.h,startCay+dy));
          const snap=_slCheckSnap(x,y,ca.w,ca.h,w,h,othersForCA);
          x=snap.x; y=snap.y;
          _slUpdateSnapGuides(
            snap.snappedH ? (snap.guideXPct/100*w) : null,
            snap.snappedV ? (snap.guideYPct/100*h) : null
          );
          ca.x=x; ca.y=y;
          passageEl.style.left=(ca.x/100*w)+'px';
          passageEl.style.top=(ca.y/100*h)+'px';
        };
        const onUp=()=>{
          document.removeEventListener('pointermove',onMove);
          document.removeEventListener('pointerup',onUp);
          _slHideSnapGuides();
          if(ca.x!==oldCA.x||ca.y!==oldCA.y){
            _slPush({type:'sl-slide-prop',idx:SL_ACTIVE_IDX,prop:'contentArea',oldVal:oldCA,newVal:{...ca}});
            autoSave();
          }
          slRenderThumb(SL_ACTIVE_IDX);
        };
        document.addEventListener('pointermove',onMove);
        document.addEventListener('pointerup',onUp);
      });
      passageEl.addEventListener('click',ev=>{ev.stopPropagation(); slSelectEl('__passage__');});
      // Apply selection state without re-render
      if(SL_SEL_EL_ID==='__passage__') passageEl.classList.add('selected');
    }

    container.appendChild(passageEl);
  }

  // All overlay elements: textbox, floatlabel, commentbox, shape, image
  slide.elements.forEach(el=>{
    const isTextbox  = el.type==="textbox";
    const isFloatLbl = el.type==="floatlabel";
    const isCmtBox   = el.type==="commentbox";
    const isShape    = el.type==="shape";
    const isImage    = el.type==="image";
    if(!isTextbox && !isFloatLbl && !isCmtBox && !isShape && !isImage) return;
    if(isFloatLbl && !slide.visibility.labels) return;
    if(isCmtBox  && !slide.visibility.comments) return;
    const div=document.createElement("div");
    div.className="sl-el "+(isTextbox?"sl-el-textbox":"sl-el-overlay");
    div.setAttribute("data-el-id", el.id);
    div.style.cssText="left:"+(el.x/100*w)+"px;top:"+(el.y/100*h)+"px;width:"+(el.w/100*w)+"px;height:"+(el.h/100*h)+"px;position:absolute;box-sizing:border-box;";
    if(isTextbox){
      const inner=document.createElement("div");
      inner.className="sl-el-textbox-inner";
      inner.contentEditable="false"; inner.spellcheck=false;
      inner.dataset.ph=t("slides.textbox.ph");
      inner.style.fontSize=(el.fontSize||18)+"px";
      inner.style.color=el.color||"#1F1E1E";
      inner.style.textAlign=el.align||"left";
      inner.style.cursor="default";
      inner.innerHTML=el.html||"";
      // force=true skips the "still interacting with the formatting panel"
      // check — used when slSelectEl switches the selection to a DIFFERENT
      // element while this textbox is still mid-edit. That path can't wait
      // for the async blur below (whose timing relative to the new
      // selection isn't guaranteed — see slSelectEl), so it calls this
      // directly and synchronously instead.
      const commitTextNow=(force)=>{
        if(!force){
          const active=document.activeElement;
          const stillFormatting = active===inner ||
            (active && active.closest && active.closest('#sl-textfmt-section'));
          if(stillFormatting) return;
        }
        inner.contentEditable="false"; inner.style.cursor="default";
        const old=el.html; const newHtml=inner.innerHTML;
        if(newHtml!==old){ el.html=newHtml; _slPush({type:"sl-el-prop",slideIdx:SL_ACTIVE_IDX,elId:el.id,prop:"html",oldVal:old,newVal:newHtml}); autoSave(); }
        slRenderThumb(SL_ACTIVE_IDX);
        if(SL_FMT_ACTIVE_INNER===inner){
          SL_FMT_ACTIVE_INNER=null; SL_FMT_COMMIT_FN=null;
          document.getElementById('sl-textfmt-section').style.display='none';
          _slPositionFloatToolbar(SL_SEL_EL_ID);
        }
      };
      const commitText=()=>{
        // Blur fires whenever focus leaves the textbox — including when
        // the user clicks a formatting control that can't use
        // preventDefault (the font <select>, native color pickers,
        // which must actually receive focus to work at all). Checking
        // one tick later, after the browser has settled the new focus
        // target, distinguishes "genuinely done editing" from "just
        // interacting with the formatting panel" — the standard pattern
        // for a contentEditable with an external toolbar.
        setTimeout(()=>commitTextNow(false),0);
      };
      inner.addEventListener("blur", commitText);
      inner.addEventListener("keydown",ev=>{ if(ev.key==="Escape"){ev.preventDefault();inner.blur();} ev.stopPropagation(); });
      inner.addEventListener("keyup",()=>{ if(SL_FMT_ACTIVE_INNER===inner) slUpdateFmtToolbarState(); });
      inner.addEventListener("pointerup",()=>{ if(SL_FMT_ACTIVE_INNER===inner) slUpdateFmtToolbarState(); });
      div.appendChild(inner);
      if(EDITOR_VIEW==="slides"){
        div.style.touchAction="none";
        const enterEditMode=(clientX,clientY)=>{
          slSelectEl(el.id);
          inner.contentEditable="true"; inner.style.cursor="text"; inner.focus();
          const range=document.caretRangeFromPoint?.(clientX,clientY);
          if(range){const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);}
          SL_FMT_ACTIVE_INNER=inner; SL_FMT_COMMIT_FN=commitTextNow;
          const sizeInput=document.getElementById('sl-fmt-size');
          if(sizeInput) sizeInput.value=el.fontSize||18;
          document.getElementById('sl-textfmt-section').style.display='';
          _slPositionFloatToolbar(el.id);
          slUpdateFmtToolbarState();
        };
        div.addEventListener("pointerdown",ev=>{
          if(inner.contentEditable==="true") return;
          ev.stopPropagation();
          // dblclick (below) handles mouse/trackpad entry into edit mode,
          // but touch doesn't reliably generate dblclick the same way —
          // tapping an ALREADY-selected textbox enters edit mode instead,
          // a common mobile pattern that doesn't rely on double-tap
          // (which risks colliding with the browser's own double-tap-to-
          // zoom). Scoped to touch specifically so mouse's existing
          // "click a selected textbox to re-drag it" behavior is
          // completely unchanged.
          if(ev.pointerType==="touch" && SL_SEL_EL_ID===el.id){
            enterEditMode(ev.clientX, ev.clientY);
            return;
          }
          slSelectEl(el.id); slStartElDrag(ev,el,div,w,h);
        });
        div.addEventListener("dblclick",ev=>{
          ev.stopPropagation();
          enterEditMode(ev.clientX, ev.clientY);
        });
        div.addEventListener("contextmenu",ev=>{ev.preventDefault();ev.stopPropagation();SL_CTX_EL_ID=el.id;slShowCtxMenu(ev.clientX,ev.clientY);});
        if(SL_SEL_EL_ID===el.id) div.classList.add("selected");
      }
    } else if(isShape){
      const sw=el.strokeWidth??2;
      div.style.background = el.fill||"transparent";
      div.style.border = sw<=0 ? "none" : sw+"px "+(el.strokeStyle||"solid")+" "+(el.stroke||"#000000");
      div.style.borderRadius = el.shapeType==="ellipse" ? "50%" : "2px";
      div.style.boxSizing="border-box";
      if(EDITOR_VIEW==="slides"){
        div.style.cursor="move";
        div.style.touchAction="none";
        div.addEventListener("pointerdown",ev=>{ ev.stopPropagation(); slSelectEl(el.id); slStartElDrag(ev,el,div,w,h); });
        div.addEventListener("contextmenu",ev=>{ev.preventDefault();ev.stopPropagation();SL_CTX_EL_ID=el.id;slShowCtxMenu(ev.clientX,ev.clientY);});
        if(SL_SEL_EL_ID===el.id) div.classList.add("selected");
      }
    } else if(isImage){
      const img=document.createElement("img");
      img.src=el.src||"";
      img.draggable=false;
      // contain (not fill) — the image keeps its own proportions and
      // letterboxes inside its box rather than stretching/squishing to
      // match whatever shape the box currently is.
      img.style.cssText="width:100%;height:100%;object-fit:contain;display:block;pointer-events:none;";
      // Backfill naturalRatio for images saved before this field existed —
      // quiet data-only mutation, no undo entry / autoSave, matching other
      // passive derived-metadata fills elsewhere in this file.
      if(!el.naturalRatio){
        img.addEventListener("load",()=>{
          if(!el.naturalRatio && img.naturalWidth && img.naturalHeight){
            el.naturalRatio=img.naturalWidth/img.naturalHeight;
          }
        });
      }
      div.appendChild(img);
      if(EDITOR_VIEW==="slides"){
        div.style.cursor="move";
        div.style.touchAction="none";
        div.addEventListener("pointerdown",ev=>{ ev.stopPropagation(); slSelectEl(el.id); slStartElDrag(ev,el,div,w,h); });
        div.addEventListener("contextmenu",ev=>{ev.preventDefault();ev.stopPropagation();SL_CTX_EL_ID=el.id;slShowCtxMenu(ev.clientX,ev.clientY);});
        if(SL_SEL_EL_ID===el.id) div.classList.add("selected");
      }
    } else {
      div.style.background = isCmtBox ? "rgba(247,243,233,.95)" : "rgba(73,53,72,.06)";
      div.style.border      = isCmtBox ? "1px solid rgba(73,53,72,.2)" : "1px solid rgba(73,53,72,.15)";
      div.style.borderRadius="6px"; div.style.padding="4px 7px";
      // Resolve the --ui CSS variable to its actual font stack so html2canvas
      // (used for PDF export) gets a concrete font name rather than the literal
      // string "var(--ui,sans-serif)", which it cannot resolve and falls back to
      // the browser default — causing text to appear stretched or mis-sized in the PDF.
      const resolvedUiFont=getComputedStyle(document.documentElement).getPropertyValue('--ui').trim()||'sans-serif';
      div.style.fontFamily=resolvedUiFont; div.style.fontSize="11px";
      div.style.color="#333";
      // Do NOT set overflow:hidden here. Resize handles are positioned at -4px
      // outside the div boundary — overflow:hidden would clip and hide them.
      // The slide canvas (container) has overflow:hidden to clip at slide edges.
      div.innerHTML=el.html||"";
      if(EDITOR_VIEW==="slides"){
        div.style.cursor="move";
        div.style.touchAction="none";
        div.addEventListener("pointerdown",ev=>{ ev.stopPropagation(); slSelectEl(el.id); slStartElDrag(ev,el,div,w,h); });
        div.addEventListener("contextmenu",ev=>{ev.preventDefault();ev.stopPropagation();SL_CTX_EL_ID=el.id;slShowCtxMenu(ev.clientX,ev.clientY);});
        if(SL_SEL_EL_ID===el.id) div.classList.add("selected");
      }
    }
    container.appendChild(div);
  });

  // Deselect on canvas click
  if(EDITOR_VIEW==='slides'){
    container.addEventListener('pointerdown',ev=>{
      if(ev.target===container){ slSelectEl(null); }
    });
  }
}

/* ── Element selection — no re-render, just toggle visual state ── */
function slShapeSetFill(hex){
  const sl=SL_DECK.slides[SL_ACTIVE_IDX]; if(!sl) return;
  const el=sl.elements.find(e=>e.id===SL_SEL_EL_ID); if(!el || el.type!=='shape') return;
  const old=el.fill; el.fill=hex;
  _slPush({type:'sl-el-prop',slideIdx:SL_ACTIVE_IDX,elId:el.id,prop:'fill',oldVal:old,newVal:hex});
  autoSave(); slRenderActive(); slRenderThumb(SL_ACTIVE_IDX);
}
function slShapeSetStroke(hex){
  const sl=SL_DECK.slides[SL_ACTIVE_IDX]; if(!sl) return;
  const el=sl.elements.find(e=>e.id===SL_SEL_EL_ID); if(!el || el.type!=='shape') return;
  const old=el.stroke; el.stroke=hex;
  _slPush({type:'sl-el-prop',slideIdx:SL_ACTIVE_IDX,elId:el.id,prop:'stroke',oldVal:old,newVal:hex});
  autoSave(); slRenderActive(); slRenderThumb(SL_ACTIVE_IDX);
}
function slShapeClearFill(){
  const sl=SL_DECK.slides[SL_ACTIVE_IDX]; if(!sl) return;
  const el=sl.elements.find(e=>e.id===SL_SEL_EL_ID); if(!el || el.type!=='shape') return;
  const old=el.fill; el.fill='transparent';
  _slPush({type:'sl-el-prop',slideIdx:SL_ACTIVE_IDX,elId:el.id,prop:'fill',oldVal:old,newVal:'transparent'});
  autoSave(); slRenderActive(); slRenderThumb(SL_ACTIVE_IDX);
}
// "No border" — width 0 already renders as border:none (see the shape
// render branch), so clearing the border just zeroes the weight rather
// than needing a separate "hasBorder" flag.
function slShapeClearStroke(){
  const sl=SL_DECK.slides[SL_ACTIVE_IDX]; if(!sl) return;
  const el=sl.elements.find(e=>e.id===SL_SEL_EL_ID); if(!el || el.type!=='shape') return;
  const old=el.strokeWidth; el.strokeWidth=0;
  _slPush({type:'sl-el-prop',slideIdx:SL_ACTIVE_IDX,elId:el.id,prop:'strokeWidth',oldVal:old,newVal:0});
  autoSave(); slRenderActive(); slRenderThumb(SL_ACTIVE_IDX);
}
// Current fill/stroke color for the selected shape, coerced to a strict
// #rrggbb hex — used to seed both the swatch button preview and the
// palette popover's "Custom" native input when opened.
function _slShapeColorFor(prop){
  const sl=SL_DECK.slides[SL_ACTIVE_IDX];
  const el=sl && sl.elements.find(e=>e.id===SL_SEL_EL_ID);
  const v=el && el[prop];
  if(/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  return prop==='stroke' ? '#000000' : '#c8a84b';
}
function slShapeSetStrokeWidth(px){
  const sl=SL_DECK.slides[SL_ACTIVE_IDX]; if(!sl) return;
  const el=sl.elements.find(e=>e.id===SL_SEL_EL_ID); if(!el || el.type!=='shape') return;
  px=Math.max(0,Math.min(20,parseInt(px)||0));
  const old=el.strokeWidth; el.strokeWidth=px;
  _slPush({type:'sl-el-prop',slideIdx:SL_ACTIVE_IDX,elId:el.id,prop:'strokeWidth',oldVal:old,newVal:px});
  autoSave(); slRenderActive(); slRenderThumb(SL_ACTIVE_IDX);
}
function slShapeSetStrokeStyle(style){
  const sl=SL_DECK.slides[SL_ACTIVE_IDX]; if(!sl) return;
  const el=sl.elements.find(e=>e.id===SL_SEL_EL_ID); if(!el || el.type!=='shape') return;
  const old=el.strokeStyle; el.strokeStyle=style;
  _slPush({type:'sl-el-prop',slideIdx:SL_ACTIVE_IDX,elId:el.id,prop:'strokeStyle',oldVal:old,newVal:style});
  autoSave(); slRenderActive(); slRenderThumb(SL_ACTIVE_IDX);
}
function _slUpdateShapePropsVisibility(id){
  const section=document.getElementById('sl-shapeprops-section');
  if(!section) return;
  const sl=SL_DECK.slides[SL_ACTIVE_IDX];
  const el=sl && id ? sl.elements.find(e=>e.id===id) : null;
  if(el && el.type==='shape'){
    section.style.display='';
    const fillBtn=document.getElementById('sl-shape-fill-btn');
    const strokeBtn=document.getElementById('sl-shape-stroke-btn');
    const widthInput=document.getElementById('sl-shape-strokewidth');
    const styleInput=document.getElementById('sl-shape-strokestyle');
    const fillIsNone=!/^#[0-9a-fA-F]{6}$/.test(el.fill);
    if(fillBtn){
      fillBtn.style.background=fillIsNone?'':el.fill;
      fillBtn.classList.toggle('sl-swatch-none', fillIsNone);
    }
    if(strokeBtn){
      strokeBtn.style.background=/^#[0-9a-fA-F]{6}$/.test(el.stroke) ? el.stroke : '#000000';
      strokeBtn.classList.remove('sl-swatch-none');
    }
    if(widthInput) widthInput.value=el.strokeWidth??2;
    if(styleInput) styleInput.value=el.strokeStyle||'solid';
  } else {
    section.style.display='none';
  }
  _slPositionFloatToolbar(id);
}

/* ── Floating toolbar positioning (Slides view) ──
   Shows the shape/text formatting controls in a small floating bar directly
   above whichever element is selected, instead of the always-visible right
   panel. Flips to below the element when there isn't enough room above. */
function _slPositionFloatToolbar(id){
  const toolbar=document.getElementById('sl-float-toolbar');
  const wrap=document.getElementById('sl-canvas-wrap');
  const cv=document.getElementById('sl-canvas');
  if(!toolbar || !wrap || !cv) return;
  const shapeSection=document.getElementById('sl-shapeprops-section');
  const textSection=document.getElementById('sl-textfmt-section');
  const shapeVisible = shapeSection && shapeSection.style.display!=='none';
  const textVisible  = textSection && textSection.style.display!=='none';
  if(!id || id==='__passage__' || (!shapeVisible && !textVisible)){
    toolbar.style.display='none';
    return;
  }
  const target=cv.querySelector(`.sl-el[data-el-id="${id}"]`);
  if(!target){ toolbar.style.display='none'; return; }
  toolbar.style.display='block';
  const tRect=target.getBoundingClientRect();
  const wRect=wrap.getBoundingClientRect();
  const GAP=8;
  const tbH=toolbar.offsetHeight, tbW=toolbar.offsetWidth;
  let top = tRect.top - wRect.top - tbH - GAP;
  if(top < 4) top = tRect.bottom - wRect.top + GAP; // flip below if no room above
  let left = tRect.left - wRect.left;
  left = Math.max(4, Math.min(left, wRect.width - tbW - 4));
  toolbar.style.top = top+'px';
  toolbar.style.left = left+'px';
}

function slSelectEl(id){
  // If a different element is being selected while a text box is still
  // mid-edit, commit + exit edit mode synchronously right now rather than
  // waiting for the textbox's async blur handler. That handler's timing
  // relative to THIS selection change isn't guaranteed — the new
  // element's own pointerdown handler (which called us) runs before the
  // browser's default focus-change action fires the blur — so without
  // this, the text-formatting toolbar could still read as "visible" by
  // the time _slUpdateShapePropsVisibility below checks it, leaving both
  // the shape and text sections showing at once.
  if(SL_FMT_ACTIVE_INNER && id!==SL_SEL_EL_ID && typeof SL_FMT_COMMIT_FN==='function'){
    SL_FMT_COMMIT_FN(true);
  }
  // NOTE: Do NOT early-return when id===SL_SEL_EL_ID. After any canvas rebuild
  // (slRenderActive), the overlay DOM is recreated without resize handles even
  // though SL_SEL_EL_ID still holds the same id. We must always re-apply the
  // full selection (class + handles) to whichever DOM element is currently live.
  SL_SEL_EL_ID=id;
  _slUpdateShapePropsVisibility(id);
  const cv=document.getElementById('sl-canvas'); if(!cv) return;

  // Remove selection from all elements
  cv.querySelectorAll('.sl-el.selected').forEach(el=>{
    el.classList.remove('selected');
    el.querySelectorAll('.sl-resize-handle').forEach(rh=>rh.remove());
  });

  if(!id) return; // deselect only

  // Find the target element div
  const target = id==='__passage__'
    ? cv.querySelector('.sl-el-passage')
    : cv.querySelector(`.sl-el[data-el-id="${id}"]`);
  if(!target) return;

  target.classList.add('selected');

  // Add resize handles
  const slide=SL_DECK.slides[SL_ACTIVE_IDX]; if(!slide) return;
  const cw=SL_CANVAS_W, ch=SL_CANVAS_H;

  if(id==='__passage__'){
    const ca=slide.contentArea;
    ['nw','ne','sw','se','n','s','w','e'].forEach(dir=>{
      const rh=document.createElement('div');
      rh.className=`sl-resize-handle sl-rh-${dir}`;
      rh.style.touchAction='none';
      rh.addEventListener('pointerdown',ev=>{
        ev.stopPropagation();
        const startX=ev.clientX,startY=ev.clientY;
        const oldCA={...ca};
        const startEl={x:ca.x,y:ca.y,w:ca.w,h:ca.h};
        const onMove=mv=>{
          const dx=(mv.clientX-startX)/cw*100;
          const dy=(mv.clientY-startY)/ch*100;
          let{x,y,w:ew,h:eh}=startEl;
          if(dir.includes('e'))  ew=Math.max(10,ew+dx);
          if(dir.includes('s'))  eh=Math.max(10,eh+dy);
          if(dir.includes('w')){ x=Math.min(x+ew-10,x+dx); ew=Math.max(10,ew-dx); }
          if(dir.includes('n')){ y=Math.min(y+eh-10,y+dy); eh=Math.max(10,eh-dy); }
          ca.x=x;ca.y=y;ca.w=ew;ca.h=eh;
          target.style.left=(ca.x/100*cw)+'px'; target.style.top=(ca.y/100*ch)+'px';
          target.style.width=(ca.w/100*cw)+'px'; target.style.height=(ca.h/100*ch)+'px';
        };
        const onUp=()=>{
          document.removeEventListener('pointermove',onMove);
          document.removeEventListener('pointerup',onUp);
          _slPush({type:'sl-slide-prop',idx:SL_ACTIVE_IDX,prop:'contentArea',oldVal:oldCA,newVal:{...ca}});
          autoSave(); slRenderThumb(SL_ACTIVE_IDX);
        };
        document.addEventListener('pointermove',onMove);
        document.addEventListener('pointerup',onUp);
      });
      target.appendChild(rh);
    });
  } else {
    const el=slide.elements.find(e=>e.id===id); if(!el) return;
    ['nw','ne','sw','se','n','s','w','e'].forEach(dir=>{
      const rh=document.createElement('div');
      rh.className=`sl-resize-handle sl-rh-${dir}`;
      rh.style.touchAction='none';
      rh.addEventListener('pointerdown',ev=>{ ev.stopPropagation(); slStartElResize(ev,el,target,dir,cw,ch); });
      target.appendChild(rh);
    });
  }
}

/* ── Element drag ── */
/* ── Snap guides ──
   Scoped to drag-positioning only, not resize — matches the request as
   phrased ("boxes are close to the middle/center" describes position,
   not size). Snaps against the slide's own horizontal center and vertical
   middle, AND against every other element on the slide (left/right/top/
   bottom edges plus centers) — whichever candidate is closest within
   SL_SNAP_THRESHOLD_PX wins. A single shared v-line/h-line pair is reused
   for both kinds of snap (slide-center or element-edge) since only one of
   each axis can be showing at a time regardless of source. */
const SL_SNAP_THRESHOLD_PX=8;

function _slCheckSnap(x,y,w,h,cw,ch,others){
  const threshX=(SL_SNAP_THRESHOLD_PX/cw)*100;
  const threshY=(SL_SNAP_THRESHOLD_PX/ch)*100;
  const centerX=x+w/2, centerY=y+h/2, right=x+w, bottom=y+h;

  // Candidate positions (in canvas %) to snap the dragged element's edges/
  // center against: the slide's own center/middle, plus every other
  // element's left/right/centerX and top/bottom/centerY.
  const vTargets=[50], hTargets=[50];
  (others||[]).forEach(o=>{
    vTargets.push(o.x, o.x+o.w, o.x+o.w/2);
    hTargets.push(o.y, o.y+o.h, o.y+o.h/2);
  });

  let snappedH=false, guideXPct=null, bestXDelta=threshX;
  vTargets.forEach(t=>{
    [[x,t],[right,t-w],[centerX,t-w/2]].forEach(([edge,newX])=>{
      const d=Math.abs(edge-t);
      if(d<=bestXDelta){ bestXDelta=d; x=newX; snappedH=true; guideXPct=t; }
    });
  });
  let snappedV=false, guideYPct=null, bestYDelta=threshY;
  hTargets.forEach(t=>{
    [[y,t],[bottom,t-h],[centerY,t-h/2]].forEach(([edge,newY])=>{
      const d=Math.abs(edge-t);
      if(d<=bestYDelta){ bestYDelta=d; y=newY; snappedV=true; guideYPct=t; }
    });
  });
  return {x,y,snappedH,snappedV,guideXPct,guideYPct};
}

function _slUpdateSnapGuides(guideXPx,guideYPx){
  const canvas=document.getElementById('sl-canvas');
  if(!canvas) return;
  let vLine=document.getElementById('sl-snap-v');
  let hLine=document.getElementById('sl-snap-h');
  if(!vLine){
    vLine=document.createElement('div');
    vLine.id='sl-snap-v'; vLine.className='sl-snap-guide sl-snap-guide-v';
    canvas.appendChild(vLine);
  }
  if(!hLine){
    hLine=document.createElement('div');
    hLine.id='sl-snap-h'; hLine.className='sl-snap-guide sl-snap-guide-h';
    canvas.appendChild(hLine);
  }
  if(guideXPx!=null){ vLine.style.left=guideXPx+'px'; vLine.style.display=''; }
  else vLine.style.display='none';
  if(guideYPx!=null){ hLine.style.top=guideYPx+'px'; hLine.style.display=''; }
  else hLine.style.display='none';
}

function _slHideSnapGuides(){
  document.getElementById('sl-snap-v')?.style.setProperty('display','none');
  document.getElementById('sl-snap-h')?.style.setProperty('display','none');
}

function slStartElDrag(ev, el, div, cw, ch){
  const startX=ev.clientX, startY=ev.clientY;
  const startElX=el.x, startElY=el.y;
  const oldPos={x:el.x,y:el.y,w:el.w,h:el.h};
  // Snapshot the rest of the slide's elements once — their geometry
  // doesn't change while this element is being dragged.
  const slideNow=SL_DECK.slides[SL_ACTIVE_IDX];
  const others=(slideNow?.elements||[]).filter(o=>o!==el);
  if(slideNow?.contentArea) others.push(slideNow.contentArea);
  const onMove=mv=>{
    const dx=(mv.clientX-startX)/cw*100;
    const dy=(mv.clientY-startY)/ch*100;
    let x=Math.max(0,Math.min(100-el.w, startElX+dx));
    let y=Math.max(0,Math.min(100-el.h, startElY+dy));
    const snap=_slCheckSnap(x,y,el.w,el.h,cw,ch,others);
    x=snap.x; y=snap.y;
    _slUpdateSnapGuides(
      snap.snappedH ? (snap.guideXPct/100*cw) : null,
      snap.snappedV ? (snap.guideYPct/100*ch) : null
    );
    el.x=x; el.y=y;
    div.style.left=(el.x/100*cw)+'px';
    div.style.top =(el.y/100*ch)+'px';
    if(SL_SEL_EL_ID===el.id) _slPositionFloatToolbar(el.id);
  };
  const onUp=()=>{
    document.removeEventListener('pointermove',onMove);
    document.removeEventListener('pointerup',onUp);
    _slHideSnapGuides();
    if(el.x!==oldPos.x||el.y!==oldPos.y){
      _slPush({type:'sl-el-prop',slideIdx:SL_ACTIVE_IDX,elId:el.id,prop:'pos',oldVal:oldPos,newVal:{x:el.x,y:el.y,w:el.w,h:el.h}});
      autoSave();
    }
    slRenderThumb(SL_ACTIVE_IDX);
  };
  document.addEventListener('pointermove',onMove);
  document.addEventListener('pointerup',onUp);
}

/* ── Element resize ── */
/* Shift-lock proportional resize (corner handles only — the standard
   convention in PowerPoint/Figma/Illustrator/Google Slides; single-edge
   handles have no unambiguous "other axis" to derive, so they stay plain
   free-resize even with Shift held).
   `ratio` is a PIXEL-space width/height ratio, not a percent ratio — the
   canvas is a fixed 960x540 (16:9), not square, so comparing/locking raw
   percentages would render a "circle" as an ellipse. Whichever axis moved
   more in actual on-screen pixels drives; the other is derived from ratio. */
function _slResizeWithRatio(dir, startEl, dx, dy, cw, ch, ratio){
  const hasE=dir.includes('e'), hasW=dir.includes('w');
  const hasS=dir.includes('s'), hasN=dir.includes('n');
  let w=startEl.w, h=startEl.h;
  if(hasE) w=Math.max(5, startEl.w+dx);
  if(hasW) w=Math.max(5, startEl.w-dx);
  if(hasS) h=Math.max(5, startEl.h+dy);
  if(hasN) h=Math.max(5, startEl.h-dy);
  const widthDriven=Math.abs(dx*cw)>=Math.abs(dy*ch);
  if(widthDriven) h=Math.max(5, (w*cw/ratio)/ch);
  else            w=Math.max(5, (h*ch*ratio)/cw);
  const x=hasW ? startEl.x+startEl.w-w : startEl.x;
  const y=hasN ? startEl.y+startEl.h-h : startEl.y;
  return {x,y,w,h};
}

function slStartElResize(ev, el, div, dir, cw, ch){
  ev.stopPropagation();
  const startX=ev.clientX, startY=ev.clientY;
  const startEl={x:el.x,y:el.y,w:el.w,h:el.h};
  const oldPos={...startEl};
  const isCorner=(dir.includes('e')||dir.includes('w'))&&(dir.includes('n')||dir.includes('s'));
  const onMove=mv=>{
    const dx=(mv.clientX-startX)/cw*100;
    const dy=(mv.clientY-startY)/ch*100;
    let x,y,w,h;
    if(isCorner && mv.shiftKey && (el.type==='shape' || el.type==='image')){
      const ratio = (el.type==='shape' && el.shapeType==='ellipse') ? 1
                  : (el.type==='image' && el.naturalRatio) ? el.naturalRatio
                  : (startEl.w*cw)/(Math.max(startEl.h,0.0001)*ch); // rect: ratio at drag start
      ({x,y,w,h}=_slResizeWithRatio(dir,startEl,dx,dy,cw,ch,ratio));
    } else {
      ({x,y,w,h}=startEl);
      if(dir.includes('e'))  w=Math.max(5,w+dx);
      if(dir.includes('s'))  h=Math.max(5,h+dy);
      if(dir.includes('w')){ x=Math.min(x+w-5,x+dx); w=Math.max(5,w-dx); }
      if(dir.includes('n')){ y=Math.min(y+h-5,y+dy); h=Math.max(5,h-dy); }
    }
    el.x=x;el.y=y;el.w=w;el.h=h;
    div.style.left=(el.x/100*cw)+'px'; div.style.top=(el.y/100*ch)+'px';
    div.style.width=(el.w/100*cw)+'px'; div.style.height=(el.h/100*ch)+'px';
    if(SL_SEL_EL_ID===el.id) _slPositionFloatToolbar(el.id);
  };
  const onUp=()=>{
    document.removeEventListener('pointermove',onMove);
    document.removeEventListener('pointerup',onUp);
    _slPush({type:'sl-el-prop',slideIdx:SL_ACTIVE_IDX,elId:el.id,prop:'pos',oldVal:oldPos,newVal:{x:el.x,y:el.y,w:el.w,h:el.h}});
    // Do NOT call slRenderActive() here — the overlay div is already at the correct
    // size/position (updated live in onMove), and a full canvas rebuild would destroy
    // the resize handles and require the user to click again to restore them.
    autoSave();
    slRenderThumb(SL_ACTIVE_IDX);
  };
  document.addEventListener('pointermove',onMove);
  document.addEventListener('pointerup',onUp);
}

/* ── Context menu ── */
function slShowCtxMenu(cx,cy){
  const menu=document.getElementById('sl-ctx-menu'); if(!menu) return;
  menu.style.display='block';
  const mw=170,mh=100;
  let x=cx,y=cy;
  if(x+mw>window.innerWidth-8) x=cx-mw;
  if(y+mh>window.innerHeight-8) y=cy-mh;
  menu.style.left=x+'px'; menu.style.top=y+'px';
  applyLang();
}
function slHideCtxMenu(){ document.getElementById('sl-ctx-menu').style.display='none'; }
function slCtxAction(action){
  slHideCtxMenu();
  const sl=SL_DECK.slides[SL_ACTIVE_IDX]; if(!sl) return;
  const id=SL_CTX_EL_ID||SL_SEL_EL_ID; if(!id) return;
  if(action==='front'||action==='back'){
    const oldOrder=sl.elements.map(e=>e.id);
    const idx=sl.elements.findIndex(e=>e.id===id);
    if(idx<0) return;
    const [el]=sl.elements.splice(idx,1);
    if(action==='front') sl.elements.push(el); else sl.elements.unshift(el);
    const newOrder=sl.elements.map(e=>e.id);
    _slPush({type:'sl-zorder',slideIdx:SL_ACTIVE_IDX,oldOrder,newOrder});
    slRenderActive(); slRenderThumb(SL_ACTIVE_IDX); autoSave();
  }
  if(action==='delete'){
    const elIdx=sl.elements.findIndex(e=>e.id===id); if(elIdx<0) return;
    const el={...sl.elements[elIdx]};
    sl.elements.splice(elIdx,1);
    _slPush({type:'sl-remove-el',slideIdx:SL_ACTIVE_IDX,elIdx,el});
    if(SL_SEL_EL_ID===id){ SL_SEL_EL_ID=null; _slUpdateShapePropsVisibility(null); }
    slRenderActive(); slRenderThumb(SL_ACTIVE_IDX); autoSave();
  }
}
document.addEventListener('pointerdown',ev=>{ if(!ev.target.closest('#sl-ctx-menu')) slHideCtxMenu(); });
document.addEventListener('keydown',ev=>{
  if(ev.key==='Delete'||ev.key==='Backspace'){
    if(EDITOR_VIEW==='slides'){
      const tag=ev.target.tagName?.toLowerCase();
      const ce=ev.target.contentEditable==='true';
      // If typing in an input, textarea, or contenteditable — don't intercept
      if(ce||tag==='input'||tag==='textarea') return;
      if(SL_SEL_EL_ID){
        // Delete selected element on the slide canvas
        slCtxAction('delete'); ev.preventDefault();
      } else {
        // No element selected — delete the active slide itself
        ev.preventDefault();
        slDeleteSlide(SL_ACTIVE_IDX);
      }
    }
  }
});

/* ── Thumbnail list render ── */
function slRenderThumbList(){
  const list=document.getElementById('sl-list'); if(!list) return;
  list.innerHTML='';
  SL_DECK.slides.forEach((slide,i)=>{
    const thumb=document.createElement('div');
    thumb.className='sl-thumb'+(i===SL_ACTIVE_IDX?' active':'');
    thumb.dataset.slIdx=i;
    thumb.onclick=()=>slSelectSlide(i);
    const inner=document.createElement('div');
    inner.className='sl-thumb-inner';
    const num=document.createElement('div');
    num.className='sl-thumb-num';
    num.textContent=i+1;
    // Dots button
    const dots=document.createElement('button');
    dots.className='sl-thumb-dots';
    dots.title='More options';
    dots.innerHTML='⋯';
    dots.onclick=ev=>{
      ev.stopPropagation();
      SL_CTX_EL_ID=null;
      const menu=document.getElementById('sl-ctx-menu');
      if(menu){
        menu.innerHTML=`
          <button class="sl-ctx-item" onclick="slDuplicateSlide(${i});slHideCtxMenu()">${t('slides.duplicate')}</button>
          <div class="sl-ctx-sep"></div>
          <button class="sl-ctx-item sl-ctx-del" onclick="slDeleteSlide(${i});slHideCtxMenu()">${t('slides.delete')}</button>`;
        slShowCtxMenu(ev.clientX,ev.clientY);
      }
    };
    // Drag-to-reorder handle on the thumbnail itself
    thumb.style.touchAction='none';
    thumb.addEventListener('pointerdown', ev=>{
      if(ev.target===dots||dots.contains(ev.target)) return; // let dots handle itself
      if(ev.button!==0) return;
      slStartThumbDrag(ev, i, thumb);
    });
    thumb.appendChild(inner);
    thumb.appendChild(num);
    thumb.appendChild(dots);
    list.appendChild(thumb);
    slRenderThumbContent(i, inner);
  });
}

/* ── Drag-to-reorder slide thumbnails ── */
function slStartThumbDrag(ev, fromIdx, thumbEl){
  const list=document.getElementById('sl-list'); if(!list) return;
  let dragStarted=false;
  const startY=ev.clientY;

  // Ghost: a semi-transparent clone that follows the mouse
  let ghost=null;

  const onMove=mv=>{
    if(!dragStarted&&Math.abs(mv.clientY-startY)<4) return;
    if(!dragStarted){
      dragStarted=true;
      // Create ghost
      ghost=thumbEl.cloneNode(true);
      ghost.style.cssText=`position:fixed;z-index:9999;width:${thumbEl.offsetWidth}px;opacity:.75;pointer-events:none;box-shadow:0 8px 24px rgba(0,0,0,.25);border-radius:6px;`;
      document.body.appendChild(ghost);
      thumbEl.style.opacity='0.3';
    }
    if(ghost){
      const r=thumbEl.getBoundingClientRect();
      ghost.style.left=r.left+'px';
      ghost.style.top=(mv.clientY-thumbEl.offsetHeight/2)+'px';
    }
    // Highlight drop target
    list.querySelectorAll('.sl-thumb').forEach(th=>{
      th.classList.remove('sl-drag-over');
      const r=th.getBoundingClientRect();
      if(mv.clientY>=r.top&&mv.clientY<r.bottom&&parseInt(th.dataset.slIdx)!==fromIdx){
        th.classList.add('sl-drag-over');
      }
    });
  };

  const onUp=mv=>{
    document.removeEventListener('pointermove',onMove);
    document.removeEventListener('pointerup',onUp);
    if(ghost){ ghost.remove(); ghost=null; }
    thumbEl.style.opacity='';
    if(!dragStarted){ return; } // was just a click — handled by onclick

    // Find drop target
    let toIdx=fromIdx;
    list.querySelectorAll('.sl-thumb').forEach(th=>{
      th.classList.remove('sl-drag-over');
      const r=th.getBoundingClientRect();
      if(mv.clientY>=r.top&&mv.clientY<r.bottom){
        toIdx=parseInt(th.dataset.slIdx);
      }
    });

    if(toIdx!==fromIdx){
      // Move slide in deck
      const oldOrder=SL_DECK.slides.map((_,i)=>i);
      const [moved]=SL_DECK.slides.splice(fromIdx,1);
      SL_DECK.slides.splice(toIdx,0,moved);
      // Update active index to follow the moved slide
      SL_ACTIVE_IDX=toIdx;
      _slPush({type:'sl-move-slide',fromIdx,toIdx});
      autoSave();
      slRenderAll();
    }
  };

  document.addEventListener('pointermove',onMove);
  document.addEventListener('pointerup',onUp);
}

function slRenderThumbContent(idx, container){
  const slide=SL_DECK.slides[idx]; if(!slide) return;
  const THUMB_W=152, THUMB_H=85; // thumbnail dimensions
  slRenderSlideInto(slide, container, THUMB_W, THUMB_H, true);
}
function slRenderThumb(idx){
  const thumbs=document.querySelectorAll('.sl-thumb');
  const th=thumbs[idx]; if(!th) return;
  const inner=th.querySelector('.sl-thumb-inner'); if(!inner) return;
  slRenderThumbContent(idx, inner);
}

/* ── Active slide canvas render — hard-debounced to prevent triple-render
   in diagram mode where renderDiagram() + rAF timing can stack calls ── */
let _slRenderPending = false;
let _slRenderTimer   = null;
function slRenderActive(){
  // Clear any queued render and re-queue — ensures only the latest fires
  clearTimeout(_slRenderTimer);
  _slRenderTimer = setTimeout(_slDoRender, 0);
}
function _slDoRender(){
  _slRenderTimer = null;
  slSizeCanvas();
  const cv=document.getElementById('sl-canvas'); if(!cv) return;
  const slide=SL_DECK.slides[SL_ACTIVE_IDX];
  if(!slide){ cv.innerHTML=''; return; }
  cv.innerHTML=''; // clear before each render
  slRenderSlideInto(slide, cv, SL_CANVAS_W, SL_CANVAS_H);
  // After a full canvas rebuild the overlay divs are new DOM nodes.
  // SL_SEL_EL_ID still holds the previously selected id, so slRenderSlideInto
  // adds the 'selected' class to the new div but does NOT add resize handles
  // (that requires slSelectEl). Re-apply the full selection here so handles
  // are always present on the live element without requiring another click.
  if(SL_SEL_EL_ID){
    const savedId=SL_SEL_EL_ID;
    SL_SEL_EL_ID=null; // let slSelectEl run without the same-id guard
    // Restore resize handles after the rAF (inner scale) fires.
    // Only run if SL_SEL_EL_ID is still null — i.e. the user hasn't clicked a
    // different element between the render and this timeout. If they have, their
    // click already called slSelectEl with the correct id; overriding it here
    // would move the handles to the wrong element.
    setTimeout(()=>{ if(SL_SEL_EL_ID===null) slSelectEl(savedId); }, 0);
  }
}

/* ── Full re-render (thumbnails + panel + active canvas) ── */
function slRenderAll(){
  if(SL_DECK.slides.length===0){
    const slide=slMakeBlank();
    SL_DECK.slides.push(slide);
    SL_ACTIVE_IDX=0;
  }
  slRenderThumbList();
  slUpdatePropsPanel();
  slRefreshSlide(); // always refresh from live data
}

/* ── Window resize → re-size canvas ── */
window.addEventListener('resize',()=>{
  if(EDITOR_VIEW==='slides'){ slSizeCanvas(); slRenderActive(); }
});

/* ════════════════════════════════
   PHASE B: PRESENTER MODE
════════════════════════════════ */

function slStartPresent(){
  if(!SL_DECK.slides.length){ toast('No slides to present.'); return; }
  SL_PRES_IDX=SL_ACTIVE_IDX;

  // Open projector window
  SL_PROJ_WIN=window.open('','_blank','width=1280,height=720,menubar=no,toolbar=no,location=no,status=no');
  if(!SL_PROJ_WIN){ toast('Pop-up blocked. Please allow pop-ups for this site.'); return; }

  // Inline the critical CSS variables so slide content renders even before
  // app.css finishes loading in the projector window.
  const rootStyles=getComputedStyle(document.documentElement);
  const cssVars=['--sig','--ink','--bg','--ui','--serif','--accent','--active','--muted','--label','--alt','--rs','--r']
    .map(v=>`${v}:${rootStyles.getPropertyValue(v).trim()}`).join(';');
  const cssHref=new URL('app.css', window.location.href).href;
  // Mirror the Google Fonts link from the main document so Gentium Plus is
  // available in the projector window. Without this, text falls back to Times
  // New Roman, which has different glyph metrics — making emoji and Unicode
  // symbols (👤 ‹+› ↔) look disproportionately large relative to the text.
  const gFontsHref=Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .find(l=>l.href.includes('fonts.googleapis.com'))?.href||'';

  SL_PROJ_WIN.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Projector</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
${gFontsHref?`<link rel="stylesheet" href="${gFontsHref}"/>`:''}
<link rel="stylesheet" href="${cssHref}">
<style>
:root{${cssVars}}
*{margin:0;padding:0;box-sizing:border-box;}
html,body{background:#fff;overflow:hidden;width:100vw;height:100vh;}
#sl-proj-wrap{
  position:absolute;top:0;left:0;
  transform-origin:top left;
  /* transform set by JS based on pw/ph vs viewport */
}
#sl-proj{position:relative;overflow:visible;background:#fff;}
</style>
</head><body>
<div id="sl-proj-wrap"><div id="sl-proj"></div></div>
<script>
  var _lastPw=960, _lastPh=540;

  function _applyScale(pw, ph){
    var scaleX=window.innerWidth/pw, scaleY=window.innerHeight/ph;
    var scale=Math.min(scaleX,scaleY);
    var wrap=document.getElementById('sl-proj-wrap');
    wrap.style.width=pw+'px';
    wrap.style.height=ph+'px';
    wrap.style.transform='scale('+scale+')';
    wrap.style.left=Math.round((window.innerWidth-pw*scale)/2)+'px';
    wrap.style.top=Math.round((window.innerHeight-ph*scale)/2)+'px';
  }

  window.addEventListener('message',function(ev){
    if(!ev.data) return;
    if(ev.data.type==='sl-slide'){
      document.getElementById('sl-proj').innerHTML=ev.data.html;
      _lastPw=ev.data.pw||960; _lastPh=ev.data.ph||540;
      _applyScale(_lastPw, _lastPh);
    }
  });

  // Rescale on resize (e.g. F11 fullscreen, window resize)
  window.addEventListener('resize', function(){
    _applyScale(_lastPw, _lastPh);
  });

  // Wait for fonts to finish loading before signalling ready, so the main
  // window doesn't inject slide HTML before Gentium Plus is available.
  document.fonts.ready.then(function(){
    if(window.opener) window.opener.postMessage({type:'sl-ready'},'*');
  });
<\/script></body></html>`);
  SL_PROJ_WIN.document.close();

  // Switch main window to presenter dashboard
  document.getElementById('szone').style.display='none';
  document.getElementById('sl-presenter').style.display='flex';

  // Instruct user to fullscreen the projector window
  setTimeout(()=>{
    toast('Projector window opened. Click it and press F11 to go fullscreen.');
  }, 600);

  // Listen for the projector's ready signal, then send first slide.
  // Also set a 2s fallback in case postMessage is blocked by browser policy.
  let _projReady=false;
  const _onProjReady=(ev)=>{
    if(ev.source!==SL_PROJ_WIN||ev.data?.type!=='sl-ready') return;
    if(_projReady) return;
    _projReady=true;
    window.removeEventListener('message',_onProjReady);
    slPresUpdate();
  };
  window.addEventListener('message',_onProjReady);
  setTimeout(()=>{
    if(!_projReady){ _projReady=true; window.removeEventListener('message',_onProjReady); slPresUpdate(); }
  }, 3000);

  // Arrow key nav
  document.addEventListener('keydown',slPresKeydown);
}

function slEndPresent(){
  if(SL_PROJ_WIN&&!SL_PROJ_WIN.closed) SL_PROJ_WIN.close();
  SL_PROJ_WIN=null;
  document.getElementById('sl-presenter').style.display='none';
  document.getElementById('szone').style.display='flex';
  document.removeEventListener('keydown',slPresKeydown);
}

function slPresNav(delta){
  const newIdx=SL_PRES_IDX+delta;
  if(newIdx<0||newIdx>=SL_DECK.slides.length) return;
  SL_PRES_IDX=newIdx;
  slPresUpdate();
}

function slPresKeydown(ev){
  if(ev.key==='ArrowRight'||ev.key==='ArrowDown'||ev.key===' ') slPresNav(1);
  if(ev.key==='ArrowLeft'||ev.key==='ArrowUp') slPresNav(-1);
  if(ev.key==='Escape') slEndPresent();
}

function slPresUpdate(){
  const slide=SL_DECK.slides[SL_PRES_IDX]; if(!slide) return;
  const counter=document.getElementById('sl-pres-counter');
  if(counter) counter.innerHTML=`${SL_PRES_IDX+1} <span>${t('slides.slide-of')}</span> ${SL_DECK.slides.length}`;
  const notes=document.getElementById('sl-pres-notes');
  if(notes) notes.textContent=slide.notes||'';

  _slRenderToHTML(slide, (html, rW, rH)=>{
    // Measure presenter preview dimensions inside the callback (layout is done by now)
    const preview=document.getElementById('sl-pres-preview');
    if(preview){
      const left=document.getElementById('sl-pres-left');
      const BAR_H=72, PAD=16;
      // Use offsetWidth if available; fall back to right-panel-subtracted viewport
      const right=document.getElementById('sl-pres-right');
      const rightW=(right?.offsetWidth||280)+5; // +5 for divider
      let colW=left?.offsetWidth||0;
      if(colW<=0) colW=Math.max(400, window.innerWidth-rightW-32);
      let colH=left?.offsetHeight||0;
      if(colH<=0) colH=Math.max(300, window.innerHeight-BAR_H-PAD*2);
      else colH=colH-BAR_H-PAD*2;

      let previewW=colW-PAD*2, previewH=Math.round(previewW/SL_RATIO);
      if(previewH>colH){ previewH=colH; previewW=Math.round(colH*SL_RATIO); }

      preview.style.width =previewW+'px';
      preview.style.height=previewH+'px';
      _slInjectScaled(preview, html, previewW, previewH, rW, rH);
    }
    if(SL_PROJ_WIN&&!SL_PROJ_WIN.closed){
      SL_PROJ_WIN.postMessage({type:'sl-slide',html,pw:rW,ph:rH},'*');
    }
  });
}

/* ── Shared slide render at canonical 960×540 ─────────────────────────────
   All presentation surfaces (slide editor, presenter preview, projector)
   render at this fixed size so block layout, connector paths, and SVG
   coordinates are identical everywhere. Display containers CSS-scale the
   result up or down to fit their available space. */

/* ── Render slide to HTML string at canonical 960×540 ───────────────────────
   Renders at fixed 960×540 so block layout, connector paths, and SVG
   coordinates are identical in every surface (presenter preview, projector).
   The slide's real contentArea is preserved so the projector honours the
   position and size the user set in the Slides editor. */
function _slRenderToHTML(slide, cb){
  const W=960, H=540;
  const tmp=document.createElement('div');
  tmp.style.cssText=`position:absolute;left:-99999px;top:0;width:${W}px;height:${H}px;overflow:visible;background:#fff;`;
  document.body.appendChild(tmp);
  // isExport=true: the rAF in slRenderSlideInto will rescale overlay elements
  // by the same inner-scale factor s that shrinks passage content, keeping
  // comment boxes and labels proportional to the text in the presenter/projector/PDF.
  slRenderSlideInto(slide, tmp, W, H, true);
  requestAnimationFrame(()=>{
    requestAnimationFrame(()=>{
      const html=tmp.innerHTML;
      document.body.removeChild(tmp);
      cb(html, W, H);
    });
  });
}
let _slLastRenderW=960, _slLastRenderH=540;

/* ── Inject rendered HTML into a display container with CSS scale-to-fit ── */
function _slInjectScaled(container, html, containerW, containerH, rW, rH){
  const renderW=rW||960, renderH=rH||540;
  container.innerHTML='';
  container.style.position='relative';
  container.style.overflow='hidden';
  const wrap=document.createElement('div');
  wrap.style.cssText=`position:absolute;top:0;left:0;width:${renderW}px;height:${renderH}px;transform-origin:top left;background:#fff;overflow:visible;`;
  wrap.innerHTML=html;
  container.appendChild(wrap);
  const scale=Math.min(containerW/renderW, containerH/renderH);
  wrap.style.transform=`scale(${scale})`;
  wrap.style.left=Math.round((containerW-renderW*scale)/2)+'px';
  wrap.style.top =Math.round((containerH-renderH*scale)/2)+'px';
}

/* ── Presenter divider resize ── */
function slPresStartResize(ev){
  const startX=ev.clientX;
  const right=document.getElementById('sl-pres-right');
  const startW=right.offsetWidth;
  const onMove=mv=>{
    const dx=mv.clientX-startX;
    const newW=Math.max(150,Math.min(600,startW-dx));
    right.style.width=newW+'px';
    // Re-size preview
    const preview=document.getElementById('sl-pres-preview');
    if(preview){ const pw=preview.offsetWidth; preview.style.height=(pw/SL_RATIO)+'px'; }
  };
  const onUp=()=>{ document.removeEventListener('pointermove',onMove); document.removeEventListener('pointerup',onUp); };
  document.addEventListener('pointermove',onMove);
  document.addEventListener('pointerup',onUp);
}

/* ════════════════════════════════
   PHASE C: PDF EXPORT
════════════════════════════════ */
async function slExportPDF(){
  if(!SL_DECK.slides.length){ toast('No slides to export.'); return; }
  const {jsPDF}=window.jspdf;
  if(!jsPDF){ toast('PDF library not loaded.'); return; }

  /* Canonical slide render size — same as _slRenderToHTML uses for the
     projector and presenter, so the PDF is pixel-identical to what you see
     on screen. We capture at 2× device pixel ratio for crisp output. */
  const RW=960, RH=540;
  const SCALE=2; // html2canvas device pixel ratio → 1920×1080 pixel canvas

  /* PDF page: A4 landscape (matches 16:9 aspect closely) */
  const doc=new jsPDF({orientation:'landscape',unit:'pt',format:'a4'});
  const pW=841.89, pH=595.28; // A4 landscape in pt

  /* Off-screen host div — sized at the render dimensions so html2canvas
     measures the content at exactly the right scale */
  const host=document.createElement('div');
  host.style.cssText=`position:fixed;left:-99999px;top:0;width:${RW}px;height:${RH}px;overflow:hidden;background:#fff;pointer-events:none;`;
  document.body.appendChild(host);

  showProgress(0,typeof t==='function'?t('export.pdf.generating'):'Generating PDF…');

  for(let i=0;i<SL_DECK.slides.length;i++){
    showProgress(
      Math.round((i/SL_DECK.slides.length)*90),
      (typeof t==='function'?t('slides.slide'):'Slide')+' '+(i+1)+' of '+SL_DECK.slides.length+'…'
    );
    const slide=SL_DECK.slides[i];

    /* Use the same render-to-HTML pipeline as the projector/presenter.
       This guarantees the PDF matches what the slide canvas shows exactly:
       correct contentArea position, inner passage scale, connectors, brackets. */
    const html=await new Promise(resolve=>{
      _slRenderToHTML(slide,(h)=>resolve(h));
    });

    /* Inject the HTML string into the host div via _slInjectScaled so the
       960×540 content is placed at 1:1 — no CSS scaling — for the capture. */
    host.innerHTML='';
    const wrap=document.createElement('div');
    wrap.style.cssText=`position:absolute;top:0;left:0;width:${RW}px;height:${RH}px;background:#fff;overflow:hidden;`;
    wrap.innerHTML=html;
    host.appendChild(wrap);

    /* Wait one rAF after DOM injection so the browser has laid out the content */
    await new Promise(r=>requestAnimationFrame(r));

    let cap=null;
    try{
      cap=await html2canvas(host,{
        scale:          SCALE,
        useCORS:        true,
        allowTaint:     false,
        backgroundColor:'#ffffff',
        logging:        false,
        width:          RW,
        height:         RH,
        windowWidth:    RW,
        windowHeight:   RH,
      });
    }catch(e){ console.warn('[slExportPDF] Capture error slide '+(i+1),e); }

    if(cap){
      if(i>0) doc.addPage();
      // Fit the 16:9 slide canvas into the PDF page without distortion.
      // A4 landscape is ~1.41:1, not 16:9 — forcing the image to fill the whole
      // page would stretch everything horizontally. Instead, scale to fit inside
      // the page and centre with white margins (letterbox/pillarbox).
      const ratio=Math.min(pW/RW, pH/RH);
      const imgW=RW*ratio, imgH=RH*ratio;
      const xOff=(pW-imgW)/2, yOff=(pH-imgH)/2;
      doc.addImage(cap.toDataURL('image/jpeg',0.93),'JPEG',xOff,yOff,imgW,imgH);
    }
  }

  document.body.removeChild(host);
  showProgress(96,typeof t==='function'?t('export.saving'):'Saving…');
  const ref=(document.getElementById('refin')?.value||'Slides').trim();
  doc.save(ref+' Slides.pdf');
  hideProgress();
  toast(typeof t==='function'?t('export.slides.done'):'Slides exported.');
}

/* ── Hook slide ops into undo/redo ── */
// Patched at the top of applyRowUndo / applyRowRedo

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
   cream cells. Font colors, weights, and styles still come through. */
const _PASTE_SAFE_STYLES = new Set(['color','font-weight','font-style','text-decoration','font-size','vertical-align']);

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

document.addEventListener('DOMContentLoaded',()=>{
  // Restore saved colors
  try{
    const saved=JSON.parse(localStorage.getItem('exeg-colors')||'{}');
    const R=document.documentElement;
    Object.entries(saved).forEach(([k,v])=>{if(v){
      R.style.setProperty('--'+k,v);
      const el=document.getElementById('sc-'+k);if(el)el.value=v;
    }});
  }catch(_){}
  document.getElementById('rows-scroll').addEventListener('scroll', drawConns);
  document.getElementById('dcanvas-scroll')?.addEventListener('scroll', drawConns);
  document.getElementById('cmargin')?.addEventListener('scroll', drawConns);
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
  const vEl=document.getElementById('s1-version-num');
  if(vEl){
    const v=document.querySelector('meta[name="app-version"]')?.content||'';
    if(v) vEl.textContent=v;
  }
  // Show "Updated" toast if page just reloaded after a SW update
  if(sessionStorage.getItem('sw-just-updated')){
    sessionStorage.removeItem('sw-just-updated');
    setTimeout(()=>toast(t('sw.updated-toast')), 800);
  }
});

/* ── Modules hamburger menu ── */
function toggleModulesMenu(e){
  e.stopPropagation();
  const menu=document.getElementById('modules-menu');
  if(!menu)return;
  const isOpen=menu.style.display!=='none';
  menu.style.display=isOpen?'none':'block';
  if(!isOpen){
    setTimeout(()=>document.addEventListener('click',closeModulesMenu,{once:true}),10);
  }
}
function closeModulesMenu(){
  const menu=document.getElementById('modules-menu');
  if(menu)menu.style.display='none';
}

/* ── Ctrl+Space — toggle UI language ── */
document.addEventListener('keydown',function(ev){
  if(!(ev.ctrlKey||ev.metaKey)||ev.shiftKey||ev.altKey)return;
  if(ev.key!==' '&&ev.key!=='Spacebar')return;
  ev.preventDefault();
  if(typeof toggleLang==='function')toggleLang();
});

/* ── Alt+1/2/3/T/L/P/D/A/B/S/J/K/H hotkeys ── */
document.addEventListener('keydown',function(ev){
  if(!ev.altKey||ev.shiftKey||ev.ctrlKey||ev.metaKey)return;
  if(!'123tTlLpPdDaAbBcCeEsSjJkKhH'.includes(ev.key))return;
  const tag=(ev.target.tagName||'').toLowerCase();
  if(tag==='input'||tag==='textarea')return;
  const s2Visible=!document.getElementById('s2')?.classList.contains('hidden');
  if(s2Visible)return;
  const s1Visible=!document.getElementById('s1')?.classList.contains('hidden');
  if(s1Visible&&ev.key!=='1')return;
  if(!s1Visible&&typeof _isModalOpen==='function'&&_isModalOpen())return;
  ev.preventDefault();
  if(ev.key==='1'&&typeof openProjects==='function')openProjects();
  if(ev.key==='2'&&typeof window.openBible==='function')window.openBible();
  if(ev.key==='3'&&!s1Visible) toggleCmtPane();
  if((ev.key==='t'||ev.key==='T')&&!s1Visible){
    setEditorView(EDITOR_VIEW==='diagram'?'phrasing':'diagram');
  }
  if((ev.key==='l'||ev.key==='L')&&!s1Visible&&EDITOR_VIEW==='diagram'){
    addDiagramLabel();
  }
  if((ev.key==='p'||ev.key==='P')&&!s1Visible){
    setEditorView('slides');
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
   always-visible top row (Undo/Redo, Phrasing/Diagram/Slides, this
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
