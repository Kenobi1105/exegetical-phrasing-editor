/* ════════════════════════════════════════
   STATE
════════════════════════════════════════ */
let SESS='', LANG='', IS_RTL=false, IS_SINGLE=false;
let hlColor='#F0D08F';
let activeEl=null, savedRange=null;
let RC=0, CC=0;
let asT=null;
let lastFocusedRowEl=null;
let FONT_B64=null; // pre-loaded Unicode font for PDF export
let CURRENT_FILENAME=null; // set when a JSON file is loaded — Ctrl+S updates it in-place

// Tracks user-adjusted column widths (null = use flex/default)
const COL_WIDTHS={v:null, o:null, t:null};

const DCOLORS={bg:'#F7F3E9',accent:'#F0D08F',ink:'#1F1E1E',sig:'#493548',label:'#F7F3E9',active:'#C8A84B'};

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
let DIAGRAM_DATA={connectors:[], labels:[]};
let CNX=0; // connector ID counter, same idiom as RC (row counter) / CC (comment counter)
let SELECTED_CNX_ID=null;
let DIAGRAM_ZOOM=100;
const DIAGRAM_ZOOM_MIN=50, DIAGRAM_ZOOM_MAX=200, DIAGRAM_ZOOM_STEP=10;

/* ── Shared two-layer color palette (Highlight + Line Color) ──
   Layer 1 is a fixed 4-color preset row; Layer 2 is a per-tool "recently
   used" row, persisted in localStorage, capped at RECENT_COLOR_CAP,
   independent between tools (Highlight's recent list is separate from
   Line Color's). Does NOT apply to Text Color, which keeps its existing
   plain native input for now. */
const PALETTE_PRESETS=['#F0D08F','#7BC67B','#7FB7E6','#B79AD9'];
const RECENT_COLOR_CAP=8;
let PALETTE_ACTIVE_TOOL=null; // 'highlight' | 'lineColor' | null

/* ════════════════════════════════════════
   UPDATE BANNER
════════════════════════════════════════ */
function showUpdateBanner(){
  const banner=document.getElementById('update-banner');
  if(banner){banner.classList.remove('pill');banner.classList.add('show');}
}
function dismissUpdate(){
  // Show warning first — don't dismiss directly
  const warn=document.getElementById('update-warn');
  if(warn) warn.classList.add('show');
}
function dismissUpdateConfirm(){
  // User clicked "Understood" — collapse banner to pill
  const banner=document.getElementById('update-banner');
  const warn=document.getElementById('update-warn');
  if(warn) warn.classList.remove('show');
  if(banner){banner.classList.add('pill');}
}
function expandUpdateBanner(){
  // Clicking the pill re-opens the full banner
  const banner=document.getElementById('update-banner');
  if(banner){banner.classList.remove('pill');}
}
function applyUpdate(){
  // Close warning if open, then tell SW to activate
  const warn=document.getElementById('update-warn');
  if(warn) warn.classList.remove('show');
  const waiting=window._swWaiting||(window._swReg&&window._swReg.waiting);
  if(waiting){
    waiting.postMessage({type:'SKIP_WAITING'});
  } else {
    window.location.reload();
  }
}

/* ════════════════════════════════════════
   SCREEN 1 — LANGUAGE
════════════════════════════════════════ */
function chooseLang(lang,customLabel,cuvVersion){
  if(cuvVersion) window._cuvVersion=cuvVersion; else window._cuvVersion=null;
  SESS=lang; IS_RTL=lang==='hebrew'; IS_SINGLE=lang==='custom';
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
  openEditor();
  if(hasContent) parsePasteIntoRows(div);
  else addEmptyRow();
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
function parsePasteIntoRows(div){
  // Collect line elements: browsers put each pasted line in a <div> or <p>.
  // If the content is flat (no block children), treat it as one line.
  let lineEls=Array.from(div.querySelectorAll(':scope > div, :scope > p'));
  if(!lineEls.length){
    // Flat paste — split on <br> manually
    // Clone, replace <br> with sentinel, split
    const clone=div.cloneNode(true);
    clone.querySelectorAll('br').forEach(br=>{
      br.replaceWith(document.createTextNode('\n__BR__\n'));
    });
    const parts=clone.innerHTML.split('\n__BR__\n');
    lineEls=parts.map(html=>{const d=document.createElement('div');d.innerHTML=html;return d;});
  }

  let currentVerse='';
  const parsed=[];

  for(const el of lineEls){
    const plainText=el.innerText||el.textContent||'';
    const trimmedText=plainText.trimStart();
    if(!trimmedText) continue; // skip blank lines

    // Get the inner HTML, but strip leading whitespace text nodes
    let html=el.innerHTML.trim();
    // Detect verse number at the very start of plain text
    const m=trimmedText.match(/^(\d+)\s+/);
    if(m){
      currentVerse=m[1];
      // Strip the verse number prefix from the HTML
      // We do it on the plain text level: remove leading "N " from text
      html=stripLeadingVerseFromHTML(el, m[0]);
    }
    parsed.push({verse:currentVerse, html});
  }

  if(!parsed.length){addEmptyRow();return;}
  parsed.forEach(p=>{
    const row=addRow(p.verse,'','',null,null);
    const oc=row.querySelector(`#oc-${row.dataset.rid} .cedit`);
    if(oc) oc.innerHTML=p.html;
  });
  recomputeIds();
  toast(parsed.length+' line'+(parsed.length!==1?'s':'')+' imported');
}

/* Remove the leading verse-number text (e.g. "1 ") from an element's HTML
   while preserving all inline formatting on the rest of the content. */
function stripLeadingVerseFromHTML(el, prefixText){
  // Walk text nodes until we've consumed prefixText.length characters
  const clone=el.cloneNode(true);
  let toStrip=prefixText.length;
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
  if(tHdr){
    if(typeof sessionVersionLabel!=='undefined'&&sessionVersionLabel){
      tHdr.textContent=sessionVersionLabel;
    } else {
      tHdr.textContent=isChinese?'译文':'Translation';
    }
  }
}

function openEditor(){
  document.getElementById('s2').classList.add('hidden');
  document.getElementById('app').style.display='flex';
  _applySessionLabels();
  document.getElementById('ch-t').style.display=IS_SINGLE?'none':'';
  // Always open on Phrasing View — loadData()/restartSess() handle their own
  // resets too, but this guards the paste/skip entry paths which don't call loadData().
  EDITOR_VIEW='phrasing';
  document.getElementById('tzone').style.display='';
  document.getElementById('dzone').style.display='none';
  document.getElementById('view-btn-phrasing')?.classList.add('active');
  document.getElementById('view-btn-diagram')?.classList.remove('active');
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
  // Apply current global font size to new cells
  const globalSize=getComputedStyle(document.documentElement).getPropertyValue('--cedit-size').trim();
  if(globalSize){
    el.querySelectorAll('.cedit').forEach(c=>{ c.style.fontSize=globalSize; });
  }
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
  if(view!==EDITOR_VIEW){
    EDITOR_VIEW=view;
    autoSave();
  }
  const isDiagram=EDITOR_VIEW==='diagram';
  document.getElementById('tzone').style.display=isDiagram?'none':'';
  document.getElementById('dzone').style.display=isDiagram?'':'none';
  document.getElementById('view-btn-phrasing')?.classList.toggle('active',!isDiagram);
  document.getElementById('view-btn-diagram')?.classList.toggle('active',isDiagram);
  document.getElementById('dzoom-grp')?.style.setProperty('display', isDiagram?'':'none');
  document.getElementById('dzoom-sep')?.style.setProperty('display', isDiagram?'':'none');
  if(!isDiagram){
    // Leaving Diagram View — a selected connector's edit popup makes no
    // sense while looking at Phrasing View, so clear it. Also cancel any
    // in-progress armed right-angle draw (click-then-click gesture).
    SELECTED_CNX_ID=null;
    const popup=document.getElementById('conn-edit-popup');
    if(popup) popup.style.display='none';
    cancelRightAngleArm();
  }
  if(isDiagram) renderDiagram();
}

/* Diagram View zoom — applies CSS `zoom` (not `transform`) to #dcanvas so
   every existing rect-based connector/drag calculation keeps working
   unmodified at any zoom level (see the DIAGRAM_ZOOM state comment for
   why `transform:scale` specifically would double-scale connectors). */
function setDiagramZoom(pct){
  DIAGRAM_ZOOM=Math.max(DIAGRAM_ZOOM_MIN, Math.min(DIAGRAM_ZOOM_MAX, pct));
  const dcanvas=document.getElementById('dcanvas');
  if(dcanvas) dcanvas.style.zoom=String(DIAGRAM_ZOOM/100);
  const label=document.getElementById('dzoom-pct');
  if(label) label.textContent=DIAGRAM_ZOOM+'%';
  // Reroute connectors after a zoom change — their endpoints are computed
  // fresh from getBoundingClientRect() each time, so this just needs a
  // re-render, not a data change.
  refreshDiagramConnectors();
}
function diagramZoomIn(){ setDiagramZoom(DIAGRAM_ZOOM+DIAGRAM_ZOOM_STEP); }
function diagramZoomOut(){ setDiagramZoom(DIAGRAM_ZOOM-DIAGRAM_ZOOM_STEP); }

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
  raHandle.addEventListener('mousedown', ev=>{ startRightAngleDraw(ev, rid); });
  block.appendChild(raHandle);

  lane.appendChild(block);
  block.addEventListener('mousedown', ev=>startBlockDrag(ev, rid));

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
    transEl.addEventListener('mousedown', ev=>ev.stopPropagation());
    lane.appendChild(transEl);
  }

  if(IS_RTL){
    dRow.appendChild(lane);
    dRow.appendChild(lCell);
    dRow.appendChild(vCell);
  } else {
    dRow.appendChild(vCell);
    dRow.appendChild(lCell);
    dRow.appendChild(lane);
  }

  return dRow;
}

/* Render the full Diagram View canvas from current row DOM state.
   Blocks render in sequential order (Stage 1), draggable horizontally for
   indent (Stage 2), with connectors drawn block-to-block by row ID
   (Stage 3+). Two SVG overlay layers sandwich the blocks: #dconns-back is
   created FIRST (so it paints BEHIND every block — right-angle connectors
   live here) and #dconns is created LAST (so it paints IN FRONT of every
   block — curve connectors live here). */
function renderDiagram(){
  const canvas=document.getElementById('dcanvas');
  if(!canvas) return;
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

  const rows=Array.from(document.querySelectorAll('.xrow'));
  rows.forEach(row=>{
    canvas.appendChild(makeDiagramRowEl(row));
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
  renderDiagramConnectors();
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
  if(ev.shiftKey){ startConnectorDraw(ev, rid); return; }
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
  };

  const onUp=()=>{
    document.removeEventListener('mousemove',onMove);
    document.removeEventListener('mouseup',onUp);
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

  document.addEventListener('mousemove',onMove);
  document.addEventListener('mouseup',onUp);
}

/* Converts a connector's stored fractional offset into actual #dcanvas-
   relative coordinates for the block's CURRENT size/position. Top/bottom-
   snapped points land a few px INSIDE the block rather than exactly on
   its border, so the line visually overlaps the block slightly instead
   of just touching its edge. (Right-angle connectors use fracX 0 or 1 —
   left/right edge — which gets no horizontal inset; only fracY 0/1 get
   the vertical inset, per the curve connector's original spec.) */
const CONN_EDGE_INSET=6;
function _connectorPoint(el, fracX, fracY, canvasRect){
  const r=el.getBoundingClientRect();
  let y=r.top-canvasRect.top + r.height*fracY;
  if(fracY===0) y+=CONN_EDGE_INSET;      // top edge — nudge down, into the block
  else if(fracY===1) y-=CONN_EDGE_INSET; // bottom edge — nudge up, into the block
  return {
    x: r.left-canvasRect.left + r.width*fracX,
    y
  };
}

const PATTERN_DASH={solid:'none', dotted:'4,4'};

/* Cubic-Bézier curve between two connector endpoints, with a "hooked"
   approach at each end that's snapped to a block's top or bottom edge:
   the curve launches (or arrives) moving mostly VERTICALLY at that point —
   away from a top edge, or away from a bottom edge — before bending
   toward the other point, which produces the curling/hook look of the
   reference design (a line that swoops down, hooks back, and rejoins a
   block's bottom edge from underneath) rather than one that simply aims
   straight at the other point from an oblique angle.
   fromY/toY are the snapped fractions for each end (0 = top edge,
   1 = bottom edge, per _snapFracY). Pass null/undefined for an end that
   isn't snapped yet (e.g. the live cursor end of an in-progress
   rubber-band drag, before it has landed on a target block) to fall back
   to a plain horizontal-blend control point for that end only.
   When both endpoints share (or nearly share) the same X — e.g. a
   connector running straight down to the bottom of a block directly
   below — the proportional horizontal pull (dx*0.22) would be at or near
   zero, making the hook curl invisible (indistinguishable from a plain
   straight line). A minimum pull magnitude keeps the hook visually
   apparent in that case; when dx itself has no direction (essentially
   zero), the pull defaults to a consistent direction — right in LTR,
   left in RTL, mirroring the rest of Diagram View's RTL conventions. */
function _connectorPathD(p1,p2,fromY,toY){
  const dx=p2.x-p1.x, dy=p2.y-p1.y;
  const hookDist=Math.max(14, Math.min(44, Math.abs(dy)*0.35));
  const MIN_HOOK_HORIZ_PULL=16;
  let horizPull=dx*0.22;
  if(Math.abs(horizPull)<MIN_HOOK_HORIZ_PULL){
    const sign = dx!==0 ? Math.sign(dx) : (IS_RTL ? -1 : 1);
    horizPull = sign*MIN_HOOK_HORIZ_PULL;
  }

  let c1x,c1y;
  if(fromY===0){        c1x=p1.x+horizPull; c1y=p1.y-hookDist; }
  else if(fromY===1){   c1x=p1.x+horizPull; c1y=p1.y+hookDist; }
  else {                c1x=p1.x+dx*.55;    c1y=p1.y;          }

  let c2x,c2y;
  if(toY===0){           c2x=p2.x-horizPull; c2y=p2.y-hookDist; }
  else if(toY===1){       c2x=p2.x-horizPull; c2y=p2.y+hookDist; }
  else {                  c2x=p2.x-dx*.25;    c2y=p2.y;          }

  return `M${p1.x},${p1.y} C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
}

/* Single-bend orthogonal path for right-angle connectors: straight down
   (or up) from the source's left/right-edge midpoint FIRST, then ONE 90°
   turn to reach the target's matching edge midpoint horizontally. Used
   for tracing clause/subordination logic — deliberately NOT a curve, and
   deliberately always exactly one bend regardless of relative position
   (the vertical leg goes directly toward p2.y, whichever direction that
   requires, THEN the horizontal leg reaches p2.x).
   EXCEPTION — same-level jut: when the two blocks' X positions are close
   enough that the single-bend path would be visually flush/degenerate
   (a straight vertical line indistinguishable from "no connector drawn
   at all"), a small detour is inserted instead: out to the side, down,
   then back — left in LTR sessions, mirrored right in RTL — so the
   connector always reads as a distinct line even when source and target
   share an indent level. */
const RIGHTANGLE_SAMELEVEL_TOLERANCE=8; // px — below this |dx|, treat as "same level"
const RIGHTANGLE_JUT=18; // px — how far the same-level detour juts out before turning
function _rightAnglePathD(p1,p2){
  if(Math.abs(p2.x-p1.x) < RIGHTANGLE_SAMELEVEL_TOLERANCE){
    const jutX = IS_RTL ? (p1.x+RIGHTANGLE_JUT) : (p1.x-RIGHTANGLE_JUT);
    return `M${p1.x},${p1.y} H${jutX} V${p2.y} H${p2.x}`;
  }
  return `M${p1.x},${p1.y} V${p2.y} H${p2.x}`;
}

/* SVG marker IDs can't contain '#', so colors are mapped to a safe id. */
function _cssId(color){ return String(color).replace('#',''); }

/* Ensures an arrowhead <marker> for the given color exists in <defs>,
   creating it on first use. Markers must be color-specific since SVG
   markers don't inherit stroke color from the path that references them.
   The same marker shape is reused for both marker-start and marker-end —
   'single' vs 'double' arrow mode is just a matter of which attributes
   get set on the path (see _applyLineVisuals), not a different marker. */
function _ensureArrowMarker(svg, color){
  const id='dconn-arrow-'+_cssId(color);
  if(svg.querySelector(`#${id}`)) return;
  let defs=svg.querySelector('defs');
  if(!defs){ defs=document.createElementNS('http://www.w3.org/2000/svg','defs'); svg.insertBefore(defs, svg.firstChild); }
  const marker=document.createElementNS('http://www.w3.org/2000/svg','marker');
  marker.setAttribute('id',id);
  marker.setAttribute('markerWidth','8'); marker.setAttribute('markerHeight','8');
  marker.setAttribute('refX','6'); marker.setAttribute('refY','3');
  marker.setAttribute('orient','auto-start-reverse');
  marker.setAttribute('markerUnits','userSpaceOnUse');
  const arrowPath=document.createElementNS('http://www.w3.org/2000/svg','path');
  arrowPath.setAttribute('d','M0,0 L6,3 L0,6 Z');
  arrowPath.setAttribute('fill',color);
  marker.appendChild(arrowPath);
  defs.appendChild(marker);
}

/* Applies pattern (solid/dotted), arrow mode (none/single/double), weight,
   color, and (via the .selected class the caller adds to the parent <g>,
   which triggers the CSS glow) selected-state styling to a connector's
   visible <path> — shared by both curve and right-angle builders so the
   style system behaves identically regardless of shape. Ensures the
   color's arrow marker exists in the given svg's <defs> first, if needed.
   Stroke width is ALWAYS the connector's own chosen weight — selection no
   longer force-overrides it to a different width; the soft glow alone
   indicates selection now that weight is a real, user-controlled
   property. */
function _applyLineVisuals(path, cnx, svg){
  const color=cnx.color||'#000000';
  const pattern=cnx.pattern||'solid';
  const arrowMode=cnx.arrowMode||'none';
  const weight=cnx.weight||1;
  path.setAttribute('stroke',color);
  path.setAttribute('stroke-width', String(weight));
  path.setAttribute('stroke-dasharray', PATTERN_DASH[pattern]||PATTERN_DASH.solid);
  path.removeAttribute('marker-start');
  path.removeAttribute('marker-end');
  if(arrowMode==='single'||arrowMode==='double'){
    _ensureArrowMarker(svg, color);
    path.setAttribute('marker-end',`url(#dconn-arrow-${_cssId(color)})`);
    if(arrowMode==='double') path.setAttribute('marker-start',`url(#dconn-arrow-${_cssId(color)})`);
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
  hitPath.addEventListener('mousedown', ev=>{ ev.stopPropagation(); });
  hitPath.addEventListener('click', ev=>{ ev.stopPropagation(); selectConnector(cnxId, ev); });
  return hitPath;
}

/* Build one CURVE connector (the original freeform Shift+drag connector)
   as a <g> containing a wide invisible hit path plus the real visible
   (hooked S-curve) path. Rendered into the FRONT svg layer. */
function _makeCurveConnectorEl(cnx, fromEl, toEl, canvasRect, svg){
  const p1=_connectorPoint(fromEl, cnx.fromX??0.5, cnx.fromY??0.5, canvasRect);
  const p2=_connectorPoint(toEl, cnx.toX??0.5, cnx.toY??0.5, canvasRect);
  const d=_connectorPathD(p1,p2,cnx.fromY,cnx.toY);
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

/* Build one RIGHT-ANGLE connector — single 90° bend, left/right-edge
   midpoint to left/right-edge midpoint. Rendered into the BACK svg layer
   (behind block content), otherwise structurally identical to a curve
   connector (same hit path, same style system). */
function _makeRightAngleConnectorEl(cnx, fromEl, toEl, canvasRect, svg){
  const p1=_connectorPoint(fromEl, cnx.fromX??0, cnx.fromY??0.5, canvasRect);
  const p2=_connectorPoint(toEl, cnx.toX??0, cnx.toY??0.5, canvasRect);
  const d=_rightAnglePathD(p1,p2);
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
   #dconns is (re)moved to be the LAST child of #dcanvas every time this
   runs, so curve lines always paint IN FRONT of block content. #dconns-
   back is NOT re-appended — it stays wherever renderDiagram() originally
   placed it (as the FIRST child), so right-angle lines paint BEHIND block
   content, the opposite z-order, per spec (structural lines shouldn't
   obscure text). */
function renderDiagramConnectors(){
  const svg=document.getElementById('dconns');
  const backSvg=document.getElementById('dconns-back');
  const canvas=document.getElementById('dcanvas');
  if(!svg||!backSvg||!canvas) return;
  canvas.appendChild(svg); // re-append: moves it to be the last child (front-most)
  const canvasRect=canvas.getBoundingClientRect();
  svg.setAttribute('width', canvas.scrollWidth);
  svg.setAttribute('height', canvas.scrollHeight);
  svg.innerHTML='';
  backSvg.setAttribute('width', canvas.scrollWidth);
  backSvg.setAttribute('height', canvas.scrollHeight);
  backSvg.innerHTML='';

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
      backSvg.appendChild(_makeRightAngleConnectorEl(cnx, fromEl, toEl, canvasRect, backSvg));
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
  if(EDITOR_VIEW!=='diagram') return;
  renderDiagramConnectors();
}

/* Snaps a vertical fraction to either the very top (0) or very bottom (1)
   of the block — whichever half the point falls in. Horizontal position
   stays free/unsnapped so the line still lines up with whatever word the
   user clicked near. This means connectors never land on the left/right
   edges or mid-block vertically, only the top or bottom edge. */
function _snapFracY(fracY){ return fracY<0.5 ? 0 : 1; }

/* Shift+drag from a block starts drawing a connector instead of moving the
   block. A rubber-band curve follows the cursor FROM THE EXACT POINT the
   drag started, with its vertical position snapped to the top or bottom
   edge of the block (see _snapFracY); horizontal position stays free.
   Releasing over a DIFFERENT block commits a new connector, anchored the
   same way at the release point (solid, black, by default per spec), and
   the creation is pushed onto ROW_STACK so Ctrl+Z/Ctrl+Y can undo/redo it
   like any other row-level edit. Releasing anywhere else (empty canvas,
   the same block, outside any block) cancels with no change. */
function startConnectorDraw(ev, fromRid){
  ev.preventDefault();
  ev.stopPropagation();

  const canvas=document.getElementById('dcanvas');
  const svg=document.getElementById('dconns');
  const fromEl=document.querySelector(`.dblock[data-rid="${fromRid}"]`);
  if(!canvas||!svg||!fromEl) return;

  // Capture the exact start point as a fraction of the source block's
  // current size (horizontal free, vertical snapped top/bottom) — the
  // same representation committed connectors use.
  const fr0=fromEl.getBoundingClientRect();
  const fromFracX=Math.min(1,Math.max(0,(ev.clientX-fr0.left)/fr0.width));
  const fromFracY=_snapFracY(Math.min(1,Math.max(0,(ev.clientY-fr0.top)/fr0.height)));

  const rubberPath=document.createElementNS('http://www.w3.org/2000/svg','path');
  rubberPath.setAttribute('class','dconn-rubberband');
  rubberPath.setAttribute('fill','none');
  rubberPath.setAttribute('stroke','#000000');
  rubberPath.setAttribute('stroke-width','1');
  rubberPath.setAttribute('stroke-dasharray','4,4');
  canvas.appendChild(svg); // ensure front-most before drawing the rubber-band too
  svg.appendChild(rubberPath);

  fromEl.classList.add('dconn-source');

  const updateRubberband=(mx,my)=>{
    const canvasRect=canvas.getBoundingClientRect();
    const p1=_connectorPoint(fromEl, fromFracX, fromFracY, canvasRect);
    const p2={x:mx-canvasRect.left, y:my-canvasRect.top};
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

  const onUp=mv=>{
    document.removeEventListener('mousemove',onMove);
    document.removeEventListener('mouseup',onUp);
    rubberPath.remove();
    fromEl.classList.remove('dconn-source');
    if(hoverTarget) hoverTarget.classList.remove('dconn-target');

    const el=document.elementFromPoint?document.elementFromPoint(mv.clientX, mv.clientY):null;
    const toBlock=el?el.closest('.dblock'):null;
    if(toBlock && toBlock!==fromEl){
      const toRid=toBlock.dataset.rid;
      const tr=toBlock.getBoundingClientRect();
      const toFracX=Math.min(1,Math.max(0,(mv.clientX-tr.left)/tr.width));
      const toFracY=_snapFracY(Math.min(1,Math.max(0,(mv.clientY-tr.top)/tr.height)));
      CNX++;
      const newConnector={
        id:'cnx'+CNX, fromRid:String(fromRid), toRid:String(toRid),
        kind:'curve',
        fromX:fromFracX, fromY:fromFracY, toX:toFracX, toY:toFracY,
        pattern:'solid', arrowMode:'single', weight:1, color:'#000000'
      };
      DIAGRAM_DATA.connectors.push(newConnector);
      // Push to ROW_STACK so Ctrl+Z/Ctrl+Y can undo/redo connector creation,
      // the same way Tab/Shift+Tab indent changes and drag-to-indent do.
      rowPush({type:'connector-add', connector:newConnector});
      autoSave();
      renderDiagramConnectors();
    }
    // Released over empty canvas, the source block itself, or outside any
    // block entirely — cancel silently, nothing was committed.
  };

  document.addEventListener('mousemove',onMove);
  document.addEventListener('mouseup',onUp);
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
    pattern:'solid', arrowMode:'single', weight:1, color:'#000000'
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
    rubberPath.setAttribute('d', _rightAnglePathD(p1,p2));
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
    document.removeEventListener('mousemove',onDragMove);
    document.removeEventListener('mouseup',onMouseUp);
    document.removeEventListener('mousemove',onArmedMove);
    document.removeEventListener('click',onArmedClick);
    document.removeEventListener('keydown',onArmedEscape);
    rubberPath.remove();
    fromEl.classList.remove('dconn-source');
    if(hoverTarget){ hoverTarget.classList.remove('dconn-target'); hoverTarget=null; }
  };

  const onDragMove=mv=>{
    if(Math.abs(mv.clientX-startX)>3||Math.abs(mv.clientY-startY)>3) dragged=true;
    updateRubberband(mv.clientX, mv.clientY);
    updateHover(mv.clientX, mv.clientY);
  };

  const onMouseUp=mv=>{
    document.removeEventListener('mousemove',onDragMove);
    document.removeEventListener('mouseup',onMouseUp);

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

  document.addEventListener('mousemove',onDragMove);
  document.addEventListener('mouseup',onMouseUp);
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

function openConnEditPopup(clientX, clientY){
  const cnx=_selectedConnector();
  const popup=document.getElementById('conn-edit-popup');
  if(!cnx || !popup) return;

  // Reflect the connector's current pattern/arrow mode/weight/color in the popup.
  const pattern=cnx.pattern||'solid';
  const arrowMode=cnx.arrowMode||'none';
  const weight=cnx.weight||1;
  popup.querySelectorAll('.cep-style-btn[data-pattern]').forEach(b=>{
    b.classList.toggle('on', b.dataset.pattern===pattern);
  });
  popup.querySelectorAll('.cep-style-btn[data-arrow]').forEach(b=>{
    b.classList.toggle('on', b.dataset.arrow===arrowMode);
  });
  popup.querySelectorAll('.cep-style-btn[data-weight]').forEach(b=>{
    b.classList.toggle('on', Number(b.dataset.weight)===weight);
  });
  const swatch=document.getElementById('cep-color-swatch');
  const color=cnx.color||'#000000';
  if(swatch) swatch.style.background=color;

  // Position near the click, clamped so it never renders off-screen.
  popup.style.display='flex';
  const pw=popup.offsetWidth||220, ph=popup.offsetHeight||40;
  let left=clientX-pw/2, top=clientY-ph-14;
  left=Math.max(8, Math.min(window.innerWidth-pw-8, left));
  top=Math.max(8, top);
  popup.style.left=left+'px';
  popup.style.top=top+'px';
}

function closeConnEditPopup(){
  const popup=document.getElementById('conn-edit-popup');
  if(popup) popup.style.display='none';
  closeColorPalette(); // a nested color palette shouldn't outlive its parent popup
  if(SELECTED_CNX_ID!==null){
    SELECTED_CNX_ID=null;
    renderDiagramConnectors(); // clear the selected-line highlight
  }
}

/* Sets the connector's line pattern — solid/dotted are mutually exclusive,
   independent of arrow mode (a connector can be dotted with an arrow, or
   solid with no arrow, any combination). */
function setConnectorPattern(pattern){
  const cnx=_selectedConnector();
  if(!cnx) return;
  cnx.pattern=pattern;
  autoSave();
  renderDiagramConnectors();
  document.querySelectorAll('.cep-style-btn[data-pattern]').forEach(b=>{
    b.classList.toggle('on', b.dataset.pattern===pattern);
  });
}

/* Toggles Arrow/Double-Arrow — clicking the currently-active mode turns
   arrows off entirely (arrowMode:'none'); clicking the OTHER mode switches
   to it, which automatically also turns off whichever was active before
   (since arrowMode is a single value, not two independent booleans) —
   satisfying "turning Double Arrow on turns Arrow off" symmetrically in
   both directions. */
function toggleConnectorArrow(mode){
  const cnx=_selectedConnector();
  if(!cnx) return;
  cnx.arrowMode = (cnx.arrowMode===mode) ? 'none' : mode;
  autoSave();
  renderDiagramConnectors();
  const popup=document.getElementById('conn-edit-popup');
  if(popup) popup.querySelectorAll('.cep-style-btn[data-arrow]').forEach(b=>{
    b.classList.toggle('on', b.dataset.arrow===cnx.arrowMode);
  });
}

/* Sets the connector's line weight — one of four fixed values, mutually
   exclusive (radio-style), independent of pattern and arrow mode. */
function setConnectorWeight(weight){
  const cnx=_selectedConnector();
  if(!cnx) return;
  cnx.weight=weight;
  autoSave();
  renderDiagramConnectors();
  const popup=document.getElementById('conn-edit-popup');
  if(popup) popup.querySelectorAll('.cep-style-btn[data-weight]').forEach(b=>{
    b.classList.toggle('on', Number(b.dataset.weight)===weight);
  });
}

function setConnectorColor(color){
  const cnx=_selectedConnector();
  if(!cnx) return;
  cnx.color=color;
  autoSave();
  renderDiagramConnectors();
  const swatch=document.getElementById('cep-color-swatch');
  if(swatch) swatch.style.background=color;
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

function _renderPaletteRows(){
  const presetRow=document.getElementById('cpp-preset-row');
  const recentRow=document.getElementById('cpp-recent-row');
  if(!presetRow||!recentRow) return;
  presetRow.innerHTML='';
  PALETTE_PRESETS.forEach(c=>presetRow.appendChild(_makePaletteSwatchBtn(c)));
  recentRow.innerHTML='';
  if(PALETTE_ACTIVE_TOOL){
    getRecentColors(PALETTE_ACTIVE_TOOL).forEach(c=>recentRow.appendChild(_makePaletteSwatchBtn(c)));
  }
}

function openColorPalette(toolKey, triggerEl, currentColor){
  PALETTE_ACTIVE_TOOL=toolKey;
  const pop=document.getElementById('color-palette-popover');
  if(!pop||!triggerEl) return;
  const nativeInput=document.getElementById('cpp-native');
  if(nativeInput) nativeInput.value=currentColor||'#000000';
  _renderPaletteRows();

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
  } else if(PALETTE_ACTIVE_TOOL==='lineColor'){
    setConnectorColor(color);
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

// Clicking anywhere outside the color palette popover (and outside its
// own trigger buttons, whose onclick already called openColorPalette
// again — reopening is harmless) closes it.
document.addEventListener('click', e=>{
  const pop=document.getElementById('color-palette-popover');
  if(!pop || pop.style.display==='none') return;
  if(pop.contains(e.target)) return;
  // Also ignore clicks on either trigger button — their own onclick
  // handlers already manage opening/repositioning correctly.
  if(e.target.closest('#cep-color-swatch, .hlw button')) return;
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
function recomputeIds(){
  const counts={};
  let lastVerse='';
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
  if(e.key==='Enter'){e.preventDefault();splitRow(col,rid);return;}
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
    if(caretAtStart()){
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
  setTimeout(()=>{saveRange();updateTb();},0);
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
    return;
  }
  // Otherwise native text undo
  ensureFocus();
  document.execCommand('undo',false,null);
  updateTb();
}

function redo(){
  if(ROW_REDO.length){
    const op=ROW_REDO.pop();
    ROW_STACK.push(op);
    applyRowRedo(op);
    recomputeIds(); drawConns(); autoSave();
    return;
  }
  ensureFocus();
  document.execCommand('redo',false,null);
  updateTb();
}

function applyRowUndo(op){
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
    }
    const restored=makeRowEl(op.removedRid, op.removedVerse, op.removedHTML,'',null);
    restored.dataset.rid=op.removedRid;
    if(prevRow) prevRow.insertAdjacentElement('afterend',restored);
    else document.getElementById('rows-body').appendChild(restored);
    const oc2=restored.querySelector(`#oc-${op.removedRid} .cedit`);
    if(oc2){ oc2.focus(); placeCaret(oc2,'start'); }
  }
}

function applyRowRedo(op){
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
}
function applySize(size){
  if(size){const sel=document.getElementById('tb-sz');if(sel)sel.value=size;}
  if(!size) return;
  const px=parseInt(size);
  if(isNaN(px)) return;

  // 1. Apply to active selection (rich formatting on selected text)
  if(activeEl && window.getSelection && !window.getSelection().isCollapsed){
    ensureFocus();
    document.execCommand('fontSize',false,'7');
    const cont=activeEl||document.body;
    cont.querySelectorAll('font[size="7"]').forEach(f=>{
      const s=document.createElement('span');s.style.fontSize=px+'px';
      while(f.firstChild)s.appendChild(f.firstChild);
      f.parentNode.replaceChild(s,f);
    });
  }

  // 2. Universal: update the base CSS variable so ALL canvas cells resize.
  //    Col 1 (vin) and Col 2 (lid) are NOT cedit — they are unaffected.
  document.querySelectorAll('.cedit').forEach(el=>{
    el.style.fontSize=px+'px';
  });
  // Also persist so new rows pick it up
  document.documentElement.style.setProperty('--cedit-size', px+'px');

  autoSave();
}
function applyHl(){
  ensureFocus();
  const sel=window.getSelection();if(!sel||sel.isCollapsed)return;
  const range=sel.getRangeAt(0);
  const span=document.createElement('span');span.className='hl';span.style.backgroundColor=hlColor;
  try{range.surroundContents(span);}catch(e){const f=range.extractContents();span.appendChild(f);range.insertNode(span);}
  autoSave();
}
function updateTb(){
  document.getElementById('tb-b').classList.toggle('on',document.queryCommandState('bold'));
  document.getElementById('tb-i').classList.toggle('on',document.queryCommandState('italic'));
  document.getElementById('tb-s').classList.toggle('on',document.queryCommandState('strikeThrough'));
  document.getElementById('tb-sup').classList.toggle('on',document.queryCommandState('superscript'));
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
  const card=document.createElement('div');
  card.className='ccard';card.dataset.cid=cid;card.dataset.rid=rid;
  card.style.cssText=`top:${Math.max(4,top-6)}px;left:18px;width:226px;`;
  card.innerHTML=`
    <div class="chdr" onmousedown="startDrag(event,this.closest('.ccard'))">
      <span class="chdr-l">Comment</span><span class="chdr-i">${lid!=='—'?lid:''}</span>
      <button class="ccl" onclick="closeCmt('${cid}')">✕</button>
    </div>
    <div class="cbody">
      <div class="cedit-c" contenteditable="true" spellcheck="false"
        onfocus="activeEl=this" onblur="autoSave()"
        onkeydown="if(event.key==='Tab'){event.preventDefault();document.execCommand(event.shiftKey?'outdent':'indent',false,null);}setTimeout(()=>{saveRange();updateTb();},0)"></div>
    </div>
    <div class="crh" onmousedown="startCR2(event,this.closest('.ccard'))">
      <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="2" y1="10" x2="10" y2="2"/><line x1="6" y1="10" x2="10" y2="6"/></svg>
    </div>`;
  mg.appendChild(card);
  new ResizeObserver(drawConns).observe(card);
  setTimeout(()=>{card.querySelector('.cedit-c').focus();drawConns();},40);
  autoSave();
}
function closeCmt(cid){
  const card=document.querySelector(`.ccard[data-cid="${cid}"]`);if(!card)return;
  const rid=card.dataset.rid;
  const row=document.querySelector(`.xrow[data-rid="${rid}"]`);
  if(row){row.classList.remove('has-cmt');delete row.dataset.cid;const btn=row.querySelector('.cmtbtn');if(btn)btn.classList.remove('on');}
  card.remove();drawConns();autoSave();
}
function drawConns(){
  const svg=document.getElementById('svgl');
  const mr=document.getElementById('cmargin').getBoundingClientRect();
  svg.innerHTML='';
  svg.setAttribute('width',mr.width);
  svg.setAttribute('height',Math.max(mr.height,document.getElementById('cmargin').scrollHeight));
  document.querySelectorAll('.ccard').forEach(card=>{
    if(card.style.display==='none')return;
    const rid=card.dataset.rid;
    const row=document.querySelector(`.xrow[data-rid="${rid}"]`);if(!row)return;
    const rr=row.getBoundingClientRect(),cr=card.getBoundingClientRect();
    const x1=2,y1=rr.top+rr.height/2-mr.top,x2=cr.left-mr.left,y2=cr.top+20-mr.top;
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
  const mm=ev=>{card.style.left=Math.max(0,sl+ev.clientX-sx)+'px';card.style.top=Math.max(0,st+ev.clientY-sy)+'px';drawConns();};
  const mu=()=>{document.removeEventListener('mousemove',mm);document.removeEventListener('mouseup',mu);autoSave();};
  document.addEventListener('mousemove',mm);document.addEventListener('mouseup',mu);
}
function startCR2(e,card){
  e.preventDefault();e.stopPropagation();
  const sx=e.clientX,sy=e.clientY,sw=card.offsetWidth,sh=card.offsetHeight;
  const mm=ev=>{card.style.width=Math.max(180,sw+ev.clientX-sx)+'px';card.style.height=Math.max(100,sh+ev.clientY-sy)+'px';drawConns();};
  const mu=()=>{document.removeEventListener('mousemove',mm);document.removeEventListener('mouseup',mu);autoSave();};
  document.addEventListener('mousemove',mm);document.addEventListener('mouseup',mu);
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
function startMR(e){
  e.preventDefault();const mg=document.getElementById('cmargin');const sx=e.clientX,sw=mg.offsetWidth;
  const mm=ev=>{mg.style.width=Math.max(160,Math.min(520,sw-(ev.clientX-sx)))+'px';drawConns();};
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
    if(e.key==='R'||e.key==='r'){e.preventDefault();restartSess();return;}
    if(e.key==='L'||e.key==='l'){e.preventDefault();clearAll();return;}
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
  if(e.key==='h'){e.preventDefault();openHelp();}
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
  RC=CC=0;ROW_STACK.length=0;ROW_REDO.length=0;SESS='';
  COL_WIDTHS.v=null;COL_WIDTHS.o=null;COL_WIDTHS.t=null;
  CURRENT_FILENAME=null;CURRENT_PROJECT_ID=null;
  DIAGRAM_DATA={connectors:[], labels:[]};
  CNX=0;
  SELECTED_CNX_ID=null;
  document.getElementById('conn-edit-popup')?.style.setProperty('display','none');
  cancelRightAngleArm();
  setDiagramZoom(100);
  EDITOR_VIEW='phrasing';
  document.getElementById('tzone').style.display='';
  document.getElementById('dzone').style.display='none';
  document.getElementById('view-btn-phrasing')?.classList.add('active');
  document.getElementById('view-btn-diagram')?.classList.remove('active');
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
  return ['bg','accent','ink','sig','label','active'].some(k=>{
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
      ['bg','accent','ink','sig','label','active'].forEach(k=>{
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
  const map={bg:'--bg',accent:'--accent',ink:'--ink',sig:'--sig',label:'--label',active:'--active'};
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
  const colors={};['bg','accent','ink','sig','label','active'].forEach(k=>{colors[k]=R.getPropertyValue('--'+k).trim();});
  return{lang:SESS,langLabel:LANG,isRTL:IS_RTL,isSingle:IS_SINGLE,
    verseRef:document.getElementById('refin').value,rows,cmts,RC,CC,colors,
    colWidths:{...COL_WIDTHS},
    editorView:EDITOR_VIEW,CNX,
    diagramData:{connectors:[...DIAGRAM_DATA.connectors], labels:[...DIAGRAM_DATA.labels]}};
}

function loadData(data){
  document.getElementById('rows-body').innerHTML='';
  document.querySelectorAll('.ccard').forEach(c=>c.remove());
  RC=data.RC||0;CC=data.CC||0;CNX=data.CNX||0;
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
  const isSingle=data.isSingle||false,isRTL=data.isRTL||false;
  (data.rows||[]).forEach(rd=>{
    const rid=rd.rid||++RC;const rtl=isRTL?' rtl':'';
    const origPH=isRTL?'טקסט עברי…':isSingle?(data.langLabel||'Text')+'…':(data.langLabel||'Original')+' text…';
    const transCell=isSingle?'':`<div class="vdiv"></div><div class="xcell grow" id="tc-${rid}"><div class="cedit" contenteditable="true" spellcheck="false" data-ph="Translation…" onfocus="trackFocus(this,${rid})" onblur="autoSave()" onkeydown="onKey(event,'t',${rid})"></div></div>`;
    const row=document.createElement('div');
    row.className='xrow'+(rd.cid?' has-cmt':'');row.dataset.rid=rid;if(rd.cid)row.dataset.cid=rd.cid;
    row.innerHTML=`<div class="xcell mid" style="width:60px;min-width:60px"><input class="vin" type="text" maxlength="8" placeholder="v" spellcheck="false" value="${escH(rd.verse||'')}" oninput="recomputeIds();autoSave()" onkeydown="onVerseKey(event,${rid})"/></div><div class="xcell mid" style="width:52px;min-width:52px"><div class="lid">—</div></div><div class="vdiv"></div><div class="xcell grow" id="oc-${rid}"><div class="cedit${rtl}" contenteditable="true" spellcheck="false" data-ph="${origPH}" onfocus="trackFocus(this,${rid})" onblur="autoSave()" onkeydown="onKey(event,'o',${rid})"></div></div>${transCell}<div class="xcell mid" style="width:40px;min-width:40px"><button class="cmtbtn${rd.cid?' on':''}" title="Comment" onclick="toggleCmt(this,${rid})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button></div>`;
    const oc=row.querySelector(`#oc-${rid} .cedit`);
    if(oc&&rd.origHTML)oc.innerHTML=rd.origHTML;
    if(oc&&rd.origIndent){oc.dataset.indent=rd.origIndent;}
    const tc=row.querySelector(`#tc-${rid} .cedit`);
    if(tc&&rd.transHTML)tc.innerHTML=rd.transHTML;
    if(tc&&rd.transIndent){tc.dataset.indent=rd.transIndent;}
    document.getElementById('rows-body').appendChild(row);
  });
  recomputeIds();
  restoreAllIndents();
  const margin=document.getElementById('cmargin');
  (data.cmts||[]).forEach(c=>{
    const row=document.querySelector(`.xrow[data-rid="${c.rid}"]`);
    const lid=row?(row.querySelector('.lid')?.textContent||''):'';
    const card=document.createElement('div');card.className='ccard';card.dataset.cid=c.cid;card.dataset.rid=c.rid;
    card.style.cssText=`top:${c.top||'8px'};left:${c.left||'18px'};width:${c.width||'226px'};${c.height?'height:'+c.height+';':''}${c.hidden?'display:none;':''}`;
    card.innerHTML=`<div class="chdr" onmousedown="startDrag(event,this.closest('.ccard'))"><span class="chdr-l">Comment</span><span class="chdr-i">${lid!=='—'?lid:''}</span><button class="ccl" onclick="closeCmt('${c.cid}')">✕</button></div><div class="cbody"><div class="cedit-c" contenteditable="true" spellcheck="false" onfocus="activeEl=this" onblur="autoSave()" onkeydown="if(event.key==='Tab'){event.preventDefault();document.execCommand(event.shiftKey?'outdent':'indent',false,null);}setTimeout(()=>{saveRange();updateTb();},0)"></div></div><div class="crh" onmousedown="startCR2(event,this.closest('.ccard'))"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="2" y1="10" x2="10" y2="2"/><line x1="6" y1="10" x2="10" y2="6"/></svg></div>`;
    const ed=card.querySelector('.cedit-c');if(ed&&c.html)ed.innerHTML=c.html;
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
  // Migrate legacy connectors saved before the pattern/arrowMode split:
  // old `style` was one of 'solid'/'dotted'/'arrow' (where 'arrow' meant
  // double-headed, arrows on BOTH ends). Map each onto the new
  // kind/pattern/arrowMode shape, preserving how they currently look
  // rather than silently changing already-drawn diagrams — only NEW
  // connectors get the new single-arrow-by-default look.
  DIAGRAM_DATA.connectors.forEach(c=>{
    if(!c.kind) c.kind='curve'; // every pre-existing connector was a freeform curve
    if(c.pattern===undefined || c.arrowMode===undefined){
      if(c.style==='dotted'){ c.pattern='dotted'; c.arrowMode='none'; }
      else if(c.style==='arrow'){ c.pattern='solid'; c.arrowMode='double'; }
      else { c.pattern='solid'; c.arrowMode='none'; }
      delete c.style;
    }
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
      if(data.versionLabel){
        sessionVersionLabel=data.versionLabel;
        const vsub=document.getElementById('version-sub');
        if(vsub)vsub.textContent=sessionVersionLabel||'Version (e.g., ESV, BHS, NA28)';
        const vsubI=document.getElementById('version-sub-input');
        if(vsubI)vsubI.value=sessionVersionLabel||'';
        const tHdr=document.getElementById('ch-t-lbl');
        if(tHdr&&sessionVersionLabel)tHdr.textContent=sessionVersionLabel;
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
  if(typeof JSZip==='undefined'){
    toast(typeof t==='function'?t('toast.loading'):'Loading…');
    await _loadJSZip();
  }
  const zip=new JSZip();
  const total=idx.length;
  let count=0;

  for(let i=0;i<idx.length;i++){
    const entry=idx[i];
    showProgress(Math.round((i/total)*88),'PDF '+(i+1)+' of '+total+': '+(entry.name||'Untitled'));
    try{
      const raw=localStorage.getItem('exeg-proj-'+entry.id);
      if(!raw) continue;
      const data=JSON.parse(raw);
      const pdfBlob=await _renderProjectPDF(data, entry.name||'Untitled');
      if(pdfBlob){
        zip.file(_safeName(entry.name||'Untitled')+'.pdf', pdfBlob);
        count++;
      }
    }catch(e){ console.warn('PDF export failed for',entry.name,e); }
  }

  if(!count){ hideProgress(); toast(typeof t==='function'?t('toast.no-projects-export'):'No projects saved.'); return; }
  showProgress(94,'Zipping…');
  const blob=await zip.generateAsync({type:'blob'});
  hideProgress();
  _downloadBlob(blob,'ExegProjects_'+_dateStamp()+'.zip');
  toast((typeof t==='function'?t('toast.export-all-done'):'Exported ')+count+' project'+(count!==1?'s':'')+' as PDF.');
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
    oEl.innerHTML=rd.origHTML||'';
    row.appendChild(vEl);
    row.appendChild(lEl);
    row.appendChild(oEl);
    if(!isSingle&&rd.transHTML){
      const tEl=document.createElement('div');
      tEl.style.cssText='flex:1;font-size:13px;line-height:1.7;';
      tEl.innerHTML=rd.transHTML||'';
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
  if(!m) return s.replace(/[^\w ]/g,'_')+' Phrasing';
  const book=m[1].trim(),chap=m[2],vS=m[3],vE=m[4];
  if(vS&&vE) return `${book} ${chap}_${vS}-${vE} Phrasing`;
  if(vS)     return `${book} ${chap}_${vS} Phrasing`;
  return `${book} ${chap} Phrasing`;
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
  // Restore translation column label if custom version was set
  if(typeof sessionVersionLabel !== 'undefined' && sessionVersionLabel){
    const tHdr=document.getElementById('ch-t-lbl');
    if(tHdr) tHdr.textContent=sessionVersionLabel;
  }
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
  RC=CC=0;
  DIAGRAM_DATA={connectors:[], labels:[]};
  CNX=0;
  SELECTED_CNX_ID=null;
  document.getElementById('conn-edit-popup')?.style.setProperty('display','none');
  cancelRightAngleArm();
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
        curY=drawColHeaders(MAR);
        pageFns=[];
      }
      if(thisFn)pageFns.push(thisFn);

      // Draw row
      doc.setFillColor(...(rowIdx%2===0?[253,250,244]:[238,232,220]));
      doc.rect(MAR,curY,usableW,rowH,'F');
      doc.setDrawColor(220,213,202);doc.setLineWidth(0.3);
      doc.line(MAR,curY+rowH,MAR+usableW,curY+rowH);

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
  document.getElementById('rows-scroll').addEventListener('scroll',drawConns);
  window.addEventListener('resize',drawConns);
  renderS1Recent();
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

/* ── Alt+1 / Alt+2 / Alt+T hotkeys for Projects, Bible Module, and Diagram View toggle ── */
document.addEventListener('keydown',function(ev){
  if(!ev.altKey||ev.shiftKey||ev.ctrlKey||ev.metaKey)return;
  if(ev.key!=='1'&&ev.key!=='2'&&ev.key!=='t'&&ev.key!=='T')return;
  // Block only on native input fields (not contenteditable editor cells)
  const tag=(ev.target.tagName||'').toLowerCase();
  if(tag==='input'||tag==='textarea')return;
  // Block if Screen 2 is visible
  const s2Visible=!document.getElementById('s2')?.classList.contains('hidden');
  if(s2Visible)return;
  const s1Visible=!document.getElementById('s1')?.classList.contains('hidden');
  // On Screen 1: only Alt+1 (Projects) is allowed
  if(s1Visible&&ev.key!=='1')return;
  // Block if Help or Settings modal is open (Screen 3 only — modals can't open on S1)
  if(!s1Visible&&typeof _isModalOpen==='function'&&_isModalOpen())return;
  ev.preventDefault();
  if(ev.key==='1'&&typeof openProjects==='function')openProjects();
  if(ev.key==='2'&&typeof window.openBible==='function')window.openBible();
  if((ev.key==='t'||ev.key==='T')&&!s1Visible){
    setEditorView(EDITOR_VIEW==='diagram'?'phrasing':'diagram');
  }
});
