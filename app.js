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
let LBL=0; // floating label ID counter
let SELECTED_CNX_ID=null;
let DIAGRAM_ZOOM=100;
const DIAGRAM_ZOOM_MIN=50, DIAGRAM_ZOOM_MAX=200, DIAGRAM_ZOOM_STEP=10;

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
  if(tHdr) tHdr.textContent=isChinese?'译文':'Translation';
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
  // Initialise bracket handle column width (24px fixed handle zone)
  if(typeof _brkUpdateColWidth==='function') _brkUpdateColWidth();
  // Add bracket handles to any rows already in the DOM (e.g. from paste/skipPaste)
  setTimeout(()=>{ if(typeof _brkSyncHandles==='function') _brkSyncHandles(); }, 80);
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
    </div>
    <div class="xrow-brk-handle" data-rid="${rid}"><div class="xrow-brk-pip"></div></div>`;
  // Wire up the bracket handle Shift+click
  const brkH = el.querySelector('.xrow-brk-handle');
  if(brkH){
    brkH.addEventListener('mousedown', ev=>{
      if(!ev.shiftKey) return;
      ev.preventDefault(); ev.stopPropagation();
      if(typeof _brkHandleClick==='function') _brkHandleClick(String(rid), brkH);
    });
  }
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
  document.getElementById('tb-add-label')?.style.setProperty('display', isDiagram?'':'none');
  document.getElementById('dlabel-sep')?.style.setProperty('display', isDiagram?'':'none');
  const diagPdfBtn=document.getElementById('export-diag-pdf-btn');
  if(diagPdfBtn) diagPdfBtn.style.display=isDiagram?'':'none';
  const phrasePdfBtn=document.getElementById('export-pdf-btn');
  if(phrasePdfBtn) phrasePdfBtn.style.display=isDiagram?'none':'';
  document.getElementById('tb-add-cmt')?.style.setProperty('display', isDiagram?'':'none');
  if(!isDiagram){
    // Leaving Diagram View — a selected connector's edit popup makes no
    // sense while looking at Phrasing View, so clear it. Also cancel any
    // in-progress armed right-angle draw (click-then-click gesture).
    // Also clear any selected diagram block.
    SELECTED_DIAG_RID=null;
    document.querySelectorAll('#dcanvas .dblock.selected')
      .forEach(b=>b.classList.remove('selected'));
    const popup=document.getElementById('conn-edit-popup');
    if(popup) popup.style.display='none';
    cancelRightAngleArm();
  }
  // Reposition comment cards to match the new view's row positions so the
  // tracing lines land on the correct row in both Phrasing and Diagram views.
  _repositionCmtCards(isDiagram);
  if(isDiagram) renderDiagram();
  // Brackets need re-render after view switch since DOM geometry changes
  if(typeof refreshBrackets==='function') setTimeout(()=>refreshBrackets(), 80);
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
function setDiagramZoom(pct){
  DIAGRAM_ZOOM=Math.max(DIAGRAM_ZOOM_MIN, Math.min(DIAGRAM_ZOOM_MAX, pct));
  const dcanvas=document.getElementById('dcanvas');
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
  const label=document.getElementById('dzoom-pct');
  if(label) label.textContent=DIAGRAM_ZOOM+'%';
  refreshDiagramConnectors();
  // Re-derive all bracket top/height from fresh DOM rects at the new zoom
  // level so brackets stay locked to their anchor rows after zoom changes.
  refreshDiagramLabels();
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
  block.addEventListener('click', ev=>{
    // Select this block (gold outline). Shift+click is a connector gesture,
    // not a selection — ignore it. Also ignore if this was the end of a drag.
    if(ev.shiftKey) return;
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
  // In RTL sessions, reserve 25% of the canvas width on the right side so
  // labels always have room without the user needing to scroll immediately.
  // Labels are position:absolute on the canvas and are unaffected by padding;
  // blocks are pushed leftward by this padding, giving the label zone space.
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
  renderDiagramLabels();
  // Recompute bracket horizontal positions now that all block elements
  // are in the DOM and have real layout positions.
  refreshDiagramLabels();
  // Add bracket handles to diagram rows and render brackets
  if(typeof refreshBrackets==='function') setTimeout(()=>refreshBrackets(), 30);
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
  del.addEventListener('mousedown', ev=>ev.stopPropagation());
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
  txt.addEventListener('mousedown', ev=>ev.stopPropagation());
  el.appendChild(txt);

  // ── Width resize grip ────────────────────────────────────────────────
  const grip=document.createElement('div');
  grip.className='dlabel-grip';
  grip.addEventListener('mousedown', ev=>{
    ev.preventDefault();ev.stopPropagation();
    const startX=ev.clientX, startW=el.offsetWidth;
    function onMove(e){
      const dx=IS_RTL?(startX-e.clientX):(e.clientX-startX);
      const newW=Math.max(80, startW+dx);
      el.style.width=newW+'px';
      const found=DIAGRAM_DATA.labels.find(l=>l.id===lb.id);
      if(found) found.width=newW;
    }
    function onUp(){
      document.removeEventListener('mousemove',onMove);
      document.removeEventListener('mouseup',onUp);
      autoSave();
    }
    document.addEventListener('mousemove',onMove);
    document.addEventListener('mouseup',onUp);
  });
  el.appendChild(grip);

  // ── Label drag (via bar) ─────────────────────────────────────────────
  bar.addEventListener('mousedown', ev=>{
    if(ev.target===del) return;
    if(ev.shiftKey) return;
    ev.preventDefault();ev.stopPropagation();
    const startX=ev.clientX, startY=ev.clientY;
    const startPctX=lb.x, startPctY=lb.y;
    const beforeSnap={x:lb.x, y:lb.y};
    let didMove=false;
    function onMove(e){
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
      document.removeEventListener('mousemove',onMove);
      document.removeEventListener('mouseup',onUp);
      if(didMove){
        const afterSnap={x:lb.x, y:lb.y};
        if(JSON.stringify(beforeSnap)!==JSON.stringify(afterSnap)){
          rowPush({type:'lblsnap',id:lb.id,before:beforeSnap,after:afterSnap});
        }
        autoSave();
      }
    }
    document.addEventListener('mousemove',onMove);
    document.addEventListener('mouseup',onUp);
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
   The endpoint itself stays exactly at its inset position (6px inside
   the block — see CONN_EDGE_INSET — so the touch point still directly
   associates with the specific word it points to). Only the CURVE SHAPE
   needs to clear the block: hookDist (how far the control point sits
   from the endpoint, in the escaping direction) is large enough that the
   rendered curve visibly bulges outside the block's boundary before
   hooking back in to the inset touch point, at both ends.
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
  // Escape distance for the curl — large enough to clear a typical block
  // (min-height 30px, so a bottom-inset endpoint at block.bottom-6 needs
  // the control point at least ~30px further out to visibly clear the
  // block's top edge on a short connector, not just poke a few px past
  // its own bottom edge) while still scaling up for longer connectors.
  const hookDist=Math.max(30, Math.min(70, Math.abs(dy)*0.5));
  const MIN_HOOK_HORIZ_PULL=26;
  let horizPull=dx*0.3;
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
  marker.setAttribute('refX', kind==='dot'?'4':'6');
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
   #dconns is (re)moved to be the LAST child of #dcanvas every time this
   runs, so curve lines always paint IN FRONT of block content. #dconns-
   back is NOT re-appended — it stays wherever renderDiagram() originally
   placed it (as the FIRST child), so right-angle lines paint BEHIND block
   content, the opposite z-order, per spec (structural lines shouldn't
   obscure text) — made safe to click despite that z-order by routing
   every right-angle connector through the same shared trunk column (see
   _rightAngleTrunkX), computed once here and shared by every right-angle
   connector in this render pass. */
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
        pattern:'solid', startCap:'none', endCap:'arrow', weight:1, color:'#F0D08F'
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

function _renderPaletteRows(){
  const presetRow=document.getElementById('cpp-preset-row');
  const recentRow=document.getElementById('cpp-recent-row');
  if(!presetRow||!recentRow) return;
  presetRow.innerHTML='';
  const presets=(PALETTE_ACTIVE_TOOL==='textColor')?PALETTE_PRESETS_TEXT:PALETTE_PRESETS_HL;
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
  // Show remove-highlight button only for the highlight tool
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

// Clicking anywhere outside the color palette popover (and outside its
// own trigger buttons, whose onclick already called openColorPalette
// again — reopening is harmless) closes it.
document.addEventListener('click', e=>{
  const pop=document.getElementById('color-palette-popover');
  if(!pop || pop.style.display==='none') return;
  if(pop.contains(e.target)) return;
  // Also ignore clicks on either trigger button — their own onclick
  // handlers already manage opening/repositioning correctly.
  if(e.target.closest('#cep-color-swatch, #tb-hl, #tb-txt-color, #bep-color-swatch')) return;
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
  CNX=0;LBL=0;
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
    editorView:EDITOR_VIEW,CNX,LBL,
    diagramData:{connectors:[...DIAGRAM_DATA.connectors], labels:[...DIAGRAM_DATA.labels]},
    brackets: typeof collectBracketData==='function' ? collectBracketData() : []};
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
  const isSingle=data.isSingle||false,isRTL=data.isRTL||false;
  (data.rows||[]).forEach(rd=>{
    const rid=rd.rid||++RC;const rtl=isRTL?' rtl':'';
    const origPH=isRTL?'טקסט עברי…':isSingle?(data.langLabel||'Text')+'…':(data.langLabel||'Original')+' text…';
    const transCell=isSingle?'':`<div class="vdiv"></div><div class="xcell grow" id="tc-${rid}"><div class="cedit" contenteditable="true" spellcheck="false" data-ph="Translation…" onfocus="trackFocus(this,${rid})" onblur="autoSave()" oninput="cleanEmptyCell(this)" onkeydown="onKey(event,'t',${rid})"></div></div>`;
    const row=document.createElement('div');
    row.className='xrow'+(rd.cid?' has-cmt':'');row.dataset.rid=rid;if(rd.cid)row.dataset.cid=rd.cid;
    row.innerHTML=`<div class="xcell mid" style="width:60px;min-width:60px"><input class="vin" type="text" maxlength="8" placeholder="v" spellcheck="false" value="${escH(rd.verse||'')}" oninput="recomputeIds();autoSave()" onkeydown="onVerseKey(event,${rid})"/></div><div class="xcell mid" style="width:52px;min-width:52px"><div class="lid">—</div></div><div class="vdiv"></div><div class="xcell grow" id="oc-${rid}"><div class="cedit${rtl}" contenteditable="true" spellcheck="false" data-ph="${origPH}" onfocus="trackFocus(this,${rid})" onblur="autoSave()" oninput="cleanEmptyCell(this)" onkeydown="onKey(event,'o',${rid})"></div></div>${transCell}<div class="xcell mid" style="width:40px;min-width:40px"><button class="cmtbtn${rd.cid?' on':''}" title="Comment" onclick="toggleCmt(this,${rid})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button></div><div class="xrow-brk-handle" data-rid="${rid}"><div class="xrow-brk-pip"></div></div>`;
    const brkH=row.querySelector('.xrow-brk-handle');
    if(brkH){brkH.addEventListener('mousedown',ev=>{if(!ev.shiftKey)return;ev.preventDefault();ev.stopPropagation();if(typeof _brkHandleClick==='function')_brkHandleClick(String(rid),brkH);});}
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
        // ch-t-lbl always reads "Translation"; version shown in version-sub.
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
  // Uses the live exportDiagramPDF() capture engine — loads each project,
  // renders the diagram canvas, captures via html2canvas (includes labels,
  // brackets, connectors, comments), then restores the original session.
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
      // Load project and switch to diagram view for capture
      SESS=data.lang||SESS; LANG=data.langLabel||LANG;
      IS_RTL=data.isRTL||false; IS_SINGLE=data.isSingle||false;
      loadData(data);
      recomputeIds();
      setEditorView('diagram');
      // Wait for diagram to render
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const pdfBlob=await _captureDiagramPDFBlob('a4','landscape');
      if(pdfBlob){
        const fname=buildDiagramFilename(data.verseRef||entry.name||'Untitled');
        zip.file(fname+'.pdf',pdfBlob);
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

// Shared diagram PDF capture — same logic as exportDiagramPDF but returns a Blob.
async function _captureDiagramPDFBlob(format,orientation){
  const canvas=document.getElementById('dcanvas');
  if(!canvas) return null;
  const {jsPDF}=window.jspdf;
  if(!jsPDF) return null;
  const PAGE_SIZES={
    a4:{portrait:[595.28,841.89],landscape:[841.89,595.28]},
    letter:{portrait:[612,792],landscape:[792,612]}
  };
  const [pW,pH]=PAGE_SIZES[format][orientation];
  const MAR=28,usableW=pW-MAR*2;
  const ref=(document.getElementById('refin')?.value||'').trim()||'Diagram';
  const langSrc=LANG||'';

  const host=document.createElement('div');
  host.style.cssText='position:fixed;left:-9999px;top:0;overflow:visible;pointer-events:none;';
  document.body.appendChild(host);
  const clone=canvas.cloneNode(true);
  clone.style.zoom='1';clone.style.position='static';clone.style.width=canvas.scrollWidth+'px';
  host.appendChild(clone);
  clone.querySelectorAll('.dcell.dv').forEach(el=>el.style.color='#A89F90');
  clone.querySelectorAll('.dcell.dl').forEach(el=>el.style.color='#C8A84B');
  clone.querySelectorAll('.dcell').forEach(el=>{if(!el.style.color)el.style.color='#C8A84B';});
  clone.style.background='#ffffff';
  await new Promise(r=>requestAnimationFrame(r));

  let capturedCanvas=null;
  try{
    capturedCanvas=await html2canvas(clone,{scale:2,useCORS:true,backgroundColor:'#ffffff',logging:false,scrollX:0,scrollY:0,width:clone.scrollWidth||canvas.scrollWidth,height:clone.scrollHeight||canvas.scrollHeight,windowWidth:clone.scrollWidth||canvas.scrollWidth,windowHeight:clone.scrollHeight||canvas.scrollHeight});
  }catch(err){console.error('html2canvas error:',err);}
  finally{document.body.removeChild(host);}
  if(!capturedCanvas) return null;

  const doc=new jsPDF({orientation,unit:'pt',format:format});
  const HEADER_H=34,imgW=usableW;
  const imgH=(capturedCanvas.height/capturedCanvas.width)*imgW;
  const usableH1=pH-MAR*2-HEADER_H,usableHN=pH-MAR*2;

  function drawDiagHeader2(){
    doc.setFont('helvetica','bold');doc.setFontSize(13);doc.setTextColor(31,30,30);doc.text(ref,MAR,MAR+10);
    doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(168,159,144);
    doc.text((langSrc?langSrc+' \u00B7 ':'')+'Exegetical Phrasing \u00B7 Diagram',MAR,MAR+22);
    return MAR+HEADER_H;
  }

  // ── Footnote map (same logic as exportDiagramPDF) ─────────────────────
  const FN_LINE_H2=13,FN_GAP2=5,FN_SEP_H2=10,FN_SPACE_ABOVE2=14;
  const zoomRatio3=DIAGRAM_ZOOM/100;
  const fn2RowMap=[];
  const canvasEl2=document.getElementById('dcanvas');
  const cR2=canvasEl2?canvasEl2.getBoundingClientRect():{top:0};
  function stripHtmlFn2(html){
    return html.replace(/<br\s*\/?>/gi,' ').replace(/<\/[^>]+>/g,' ')
      .replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&')
      .replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
  }
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
    const logTop=(dR.top-cR2.top)/zoomRatio3;
    const logBot=(dR.bottom-cR2.top)/zoomRatio3;
    fn2RowMap.push({rowTopPx:Math.round(logTop*2),rowBotPx:Math.round(logBot*2),fn:{lineId:lid&&lid!=='—'?lid:'',text:txt}});
  });
  function fn2TextLines(fn){
    const cpl=Math.floor(usableW/5.5);const words=fn.text.split(' ');
    const lines=[];let line='';
    words.forEach(w=>{const test=line?line+' '+w:w;if(test.length>cpl&&line){lines.push(line);line=w;}else line=test;});
    if(line)lines.push(line);return lines;
  }
  function fn2HeightPt(fn){return Math.max(1,fn2TextLines(fn).length)*FN_LINE_H2+FN_GAP2;}
  function fn2ZonePt(fns){return fns.length?(FN_SEP_H2+fns.reduce((s,fn)=>s+fn2HeightPt(fn),0)):0;}
  function drawFns2(fns){
    if(!fns.length)return;
    const zone=fn2ZonePt(fns);
    let fy=pH-MAR-zone;
    doc.setDrawColor(73,53,72);doc.setLineWidth(0.4);doc.line(MAR,fy,MAR+usableW*0.3,fy);fy+=8;
    fns.forEach(fn=>{
      const labelW=fn.lineId?(fn.lineId.length*4.5+4):0;
      doc.setFontSize(9);doc.setFont('helvetica','bold');doc.setTextColor(73,53,72);
      if(fn.lineId)doc.text(fn.lineId,MAR,fy+FN_LINE_H2-3);
      doc.setFontSize(10);doc.setFont('helvetica','normal');doc.setTextColor(31,30,30);
      const lines=fn2TextLines(fn);
      lines.forEach((l,i)=>doc.text(l,MAR+labelW,fy+FN_LINE_H2+i*FN_LINE_H2-3));
      fy+=Math.max(1,lines.length)*FN_LINE_H2+FN_GAP2;
    });
  }

  let srcY=0,pageIdx=0;
  while(srcY<capturedCanvas.height){
    const baseUsableH=pageIdx===0?usableH1:usableHN;
    let tentativeSlicePx=Math.min(capturedCanvas.height-srcY,Math.round((baseUsableH/imgH)*capturedCanvas.height));
    const tentativeEndY=srcY+tentativeSlicePx;
    const rowsStraddling=fn2RowMap.filter(r=>r.rowTopPx>=srcY&&r.rowTopPx<tentativeEndY&&r.rowBotPx>tentativeEndY);
    const rowsOnPage=fn2RowMap.filter(r=>r.rowTopPx>=srcY&&r.rowBotPx<=tentativeEndY);
    if(rowsStraddling.length&&rowsOnPage.length>0){tentativeSlicePx=rowsStraddling[0].rowTopPx-srcY;}
    const pageEndY=srcY+tentativeSlicePx;
    const thisFns=fn2RowMap.filter(r=>r.rowTopPx>=srcY&&r.rowTopPx<pageEndY).map(r=>r.fn);
    const fnZone=thisFns.length?(fn2ZonePt(thisFns)+FN_SPACE_ABOVE2):0;
    const adjustedUsableH=baseUsableH-fnZone;
    const slicePxH=Math.min(capturedCanvas.height-srcY,Math.max(1,Math.round((adjustedUsableH/imgH)*capturedCanvas.height)));
    const sliceC=document.createElement('canvas');
    sliceC.width=capturedCanvas.width;sliceC.height=slicePxH;
    sliceC.getContext('2d').drawImage(capturedCanvas,0,srcY,capturedCanvas.width,slicePxH,0,0,capturedCanvas.width,slicePxH);
    const sliceImgH=(slicePxH/capturedCanvas.width)*imgW;
    if(pageIdx>0)doc.addPage();
    const pageContentY=drawDiagHeader2();
    doc.addImage(sliceC.toDataURL('image/png'),'PNG',MAR,pageContentY,imgW,sliceImgH);
    if(thisFns.length)drawFns2(thisFns);
    srcY+=slicePxH;pageIdx++;
  }
  return doc.output('blob');
}


async function _renderProjectDiagramPDF(data,name){
  const {jsPDF}=window.jspdf;
  if(!jsPDF) return null;
  const ref=data.verseRef||name;
  const isRTL=data.isRTL||false;
  const langLabel=data.langLabel||'';
  const INDENT_PX_OFF=32;
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
  const host=document.createElement('div');
  host.style.cssText='position:fixed;left:-9999px;top:0;width:900px;background:#ffffff;padding:12px 0;';
  document.body.appendChild(host);
  (data.rows||[]).forEach((rd,i)=>{
    const indent=rd.indent||0;
    const row=document.createElement('div');
    row.style.cssText='display:flex;align-items:flex-start;margin-bottom:10px;'+(isRTL?'direction:rtl;':'');
    const vEl=document.createElement('div');
    vEl.style.cssText='width:60px;flex-shrink:0;font-size:11px;color:#A89F90;';
    vEl.textContent=rd.verse||'';
    const lid=_lineIds[i];
    const lEl=document.createElement('div');
    lEl.style.cssText='width:52px;flex-shrink:0;font-size:11px;font-weight:600;color:#C8A84B;';
    lEl.textContent=(lid&&lid!=='—')?lid:'';
    const blk=document.createElement('div');
    blk.style.cssText='display:inline-block;border:1.5px solid rgba(73,53,72,.22);border-radius:8px;'
      +'padding:4px 10px;font-size:13px;line-height:1.5;max-width:500px;'
      +(isRTL?`margin-right:${indent*INDENT_PX_OFF}px;direction:rtl;text-align:right;`
             :`margin-left:${indent*INDENT_PX_OFF}px;`);
    blk.innerHTML=rd.origHTML||'';
    if(isRTL){row.appendChild(blk);row.appendChild(lEl);row.appendChild(vEl);}
    else{row.appendChild(vEl);row.appendChild(lEl);row.appendChild(blk);}
    host.appendChild(row);
  });
  // Render saved labels as absolutely-positioned text boxes over the host
  // so they appear in the exported PDF at their stored positions.
  const savedLabels=(data.diagramData&&data.diagramData.labels)||[];
  if(savedLabels.length){
    // host needs relative positioning for absolute children
    host.style.position='relative';
    savedLabels.forEach(lb=>{
      if(!lb.text&&lb.text!==0) return; // skip empty labels
      const lbEl=document.createElement('div');
      lbEl.style.cssText=
        `position:absolute;left:${lb.x||0}%;top:${lb.y||0}%;`
        +`width:${lb.width||140}px;`
        +'background:#ffffff;border:1.5px solid rgba(73,53,72,.22);border-radius:8px;'
        +'padding:4px 8px;font-size:12px;line-height:1.4;color:#1F1E1E;'
        +'white-space:pre-wrap;word-break:break-word;';
      lbEl.textContent=lb.text||'';
      host.appendChild(lbEl);
    });
  }
  let pdfBlob=null;
  try{
    const canvas=await html2canvas(host,{scale:2,useCORS:true,backgroundColor:'#ffffff',logging:false});
    document.body.removeChild(host);
    const doc=new jsPDF({orientation:'landscape',unit:'pt',format:'a4'});
    const pW=doc.internal.pageSize.getWidth(),pH=doc.internal.pageSize.getHeight();
    const MAR=28,usableW=pW-MAR*2,HEADER_H=34;
    doc.setFont('helvetica','bold');doc.setFontSize(13);doc.setTextColor(31,30,30);doc.text(ref,MAR,MAR+10);
    doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(168,159,144);
    doc.text((langLabel?langLabel+' \u00B7 ':'')+'Exegetical Phrasing \u00B7 Diagram',MAR,MAR+22);
    const imgW=usableW,imgH=(canvas.height/canvas.width)*imgW;
    const usableH1=pH-MAR*2-HEADER_H,usableHN=pH-MAR*2;
    let srcY=0,pageIdx=0;
    while(srcY<canvas.height){
      const usableH=pageIdx===0?usableH1:usableHN;
      const slicePxH=Math.min(canvas.height-srcY,Math.round((usableH/imgH)*canvas.height));
      const sliceC=document.createElement('canvas');
      sliceC.width=canvas.width;sliceC.height=slicePxH;
      sliceC.getContext('2d').drawImage(canvas,0,srcY,canvas.width,slicePxH,0,0,canvas.width,slicePxH);
      const sliceImgH=(slicePxH/canvas.width)*imgW;
      const pageY=MAR+(pageIdx===0?HEADER_H:0);
      if(pageIdx>0)doc.addPage();
      doc.addImage(sliceC.toDataURL('image/png'),'PNG',MAR,pageY,imgW,sliceImgH);
      srcY+=slicePxH;pageIdx++;
    }
    pdfBlob=doc.output('blob');
  }catch(e){
    if(document.body.contains(host))document.body.removeChild(host);
    console.warn('Diagram PDF render error:',e);
  }
  return pdfBlob;
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

/* ── Diagram PDF export ──────────────────────────────────────────────── */
function openDiagPdfModal(){
  document.getElementById('diag-pdf-modal').classList.remove('hidden');
  applyLang(); // ensure i18n strings are fresh
}
function closeDiagPdfModal(){
  document.getElementById('diag-pdf-modal').classList.add('hidden');
}

async function exportDiagramPDF(format, orientation){
  closeDiagPdfModal();

  const canvas=document.getElementById('dcanvas');
  if(!canvas){ toast('No diagram canvas found.'); return; }

  const {jsPDF}=window.jspdf;
  if(!jsPDF){ toast('PDF library not loaded.'); return; }

  toast(typeof t==='function'?t('export.pdf.generating'):'Generating PDF\u2026');

  const PAGE_SIZES={
    a4:     {portrait:[595.28,841.89], landscape:[841.89,595.28]},
    letter: {portrait:[612,792],       landscape:[792,612]}
  };
  const [pW,pH]=PAGE_SIZES[format][orientation];
  const MAR=28;
  const usableW=pW-MAR*2;

  // Clone #dcanvas into an off-screen container so we can:
  //   • Set zoom:1 on the clone (not the live canvas — that breaks bracket rects)
  //   • Inline all CSS-variable colours so html2canvas resolves them correctly
  //   • Capture the full logical canvas without scroll-offset cropping
  const host=document.createElement('div');
  host.style.cssText='position:fixed;left:-9999px;top:0;overflow:visible;pointer-events:none;';
  document.body.appendChild(host);

  const clone=canvas.cloneNode(true);
  // Remove zoom so html2canvas sees logical pixels at 1:1
  clone.style.zoom='1';
  clone.style.position='static';
  clone.style.width=canvas.scrollWidth+'px';
  host.appendChild(clone);

  // Inline CSS-variable colours — html2canvas doesn't always resolve var(--x)
  // from :root when operating on a detached/off-screen subtree.
  clone.querySelectorAll('.dcell.dv').forEach(el=>el.style.color='#A89F90');
  clone.querySelectorAll('.dcell.dl').forEach(el=>el.style.color='#C8A84B');
  // Base .dcell colour (line IDs use this via inheritance when .dl has no explicit colour)
  clone.querySelectorAll('.dcell').forEach(el=>{
    if(!el.style.color) el.style.color='#C8A84B';
  });
  // White background — no ink wasted on parchment colour
  clone.style.background='#ffffff';

  // Wait one frame for the clone to paint before measuring
  await new Promise(r=>requestAnimationFrame(r));

  let capturedCanvas;
  try{
    capturedCanvas=await html2canvas(clone,{
      scale:2,
      useCORS:true,
      backgroundColor:'#ffffff',
      logging:false,
      scrollX:0, scrollY:0,
      width:  clone.scrollWidth  || canvas.scrollWidth,
      height: clone.scrollHeight || canvas.scrollHeight,
      windowWidth:  clone.scrollWidth  || canvas.scrollWidth,
      windowHeight: clone.scrollHeight || canvas.scrollHeight,
    });
  }catch(err){
    console.error('html2canvas error:',err);
    toast('PDF export failed. See console for details.');
  }finally{
    document.body.removeChild(host);
  }

  if(!capturedCanvas) return;

  const doc=new jsPDF({orientation,unit:'pt',format:format});

  // Header
  const ref=(document.getElementById('refin')?.value||'').trim()||'Diagram';
  const langSrc=LANG||'';
  doc.setFont('helvetica','bold'); doc.setFontSize(13);
  doc.setTextColor(31,30,30);
  doc.text(ref, MAR, MAR+10);
  doc.setFont('helvetica','normal'); doc.setFontSize(8);
  doc.setTextColor(168,159,144);
  doc.text((langSrc?langSrc+' \u00B7 ':'')+'Exegetical Phrasing \u00B7 Diagram', MAR, MAR+22);

  // Slice into pages
  const HEADER_H=34;
  const imgW=usableW;
  const imgH=(capturedCanvas.height/capturedCanvas.width)*imgW;
  const usableH1=pH-MAR*2-HEADER_H;
  const usableHN=pH-MAR*2;

  // ── Build per-row footnote map ────────────────────────────────────────
  const FN_LINE_H=13, FN_GAP=5, FN_SEP_H=10;
  function stripHtmlFn(html){
    return html.replace(/<br\s*\/?>/gi,' ').replace(/<\/[^>]+>/g,' ')
      .replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&')
      .replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
  }
  // Map: canvasPxY (top of row in capturedCanvas pixels) → footnote object
  // We measure each drow's position relative to the cloned canvas.
  // The clone was captured at scale:2 / zoomRatio, same as CAPTURE_SCALE/zoomRatio.
  const zoomRatio2=DIAGRAM_ZOOM/100;
  const cloneRect=clone? {top:0} : {top:0}; // clone already removed; use stored offset
  // Instead, compute row Y positions from the original canvas scroll heights
  // by measuring each drow before the clone was removed.
  // Since clone is gone, use the live dcanvas drows (same logical layout).
  const rowFnMap=[]; // [{rowTopPx, rowBotPx, fn}] in capturedCanvas pixels
  const captureScale=2; // scale used for html2canvas
  document.querySelectorAll('#dcanvas .drow').forEach(drow=>{
    const rid=drow.dataset.rid;
    const pRow=document.querySelector(`.xrow[data-rid="${rid}"]`);
    const cid=pRow?pRow.dataset.cid:null;
    if(!cid) return;
    const cmtEl=document.querySelector(`.ccard[data-cid="${cid}"] .cedit-c`);
    if(!cmtEl||!cmtEl.innerText.trim()) return;
    const txt=stripHtmlFn(cmtEl.innerHTML);
    if(!txt) return;
    const lid=pRow?pRow.querySelector('.lid')?.textContent||'':'';
    // Row top/bottom in logical canvas px (unzoomed), then scaled to capturedCanvas px
    const canvasEl=document.getElementById('dcanvas');
    const cR=canvasEl?canvasEl.getBoundingClientRect():{top:0};
    const dR=drow.getBoundingClientRect();
    const logTop=(dR.top-cR.top)/zoomRatio2;
    const logBot=(dR.bottom-cR.top)/zoomRatio2;
    rowFnMap.push({
      rowTopPx: Math.round(logTop*captureScale),
      rowBotPx: Math.round(logBot*captureScale),
      fn:{lineId:lid&&lid!=='—'?lid:'', text:txt}
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
  // Smaller footnote fonts to match _captureDiagramPDFBlob
  const FN_LINE_H_S=10, FN_LBL_PT=7, FN_TXT_PT=8;
  function fnHeightPt(fn){ return Math.max(1,fnTextLines(fn).length)*FN_LINE_H_S+FN_GAP; }
  function fnZonePt(fns){ return fns.length?(FN_SEP_H+fns.reduce((s,fn)=>s+fnHeightPt(fn),0)):0; }
  function drawFnsDiag(fns){
    if(!fns.length) return;
    const zone=fnZonePt(fns);
    let fy=pH-MAR-zone;
    doc.setDrawColor(73,53,72);doc.setLineWidth(0.4);
    doc.line(MAR,fy,MAR+usableW*0.3,fy);
    fy+=8;
    fns.forEach(fn=>{
      const labelW=fn.lineId?(fn.lineId.length*3.5+3):0;
      doc.setFontSize(FN_LBL_PT);doc.setFont('helvetica','bold');doc.setTextColor(73,53,72);
      if(fn.lineId) doc.text(fn.lineId,MAR,fy+FN_LINE_H_S-3);
      doc.setFontSize(FN_TXT_PT);doc.setFont('helvetica','normal');doc.setTextColor(31,30,30);
      const cpl=Math.floor(usableW/4.8);
      const words=fn.text.split(' ');const lines=[];let line='';
      words.forEach(w=>{const test=line?line+' '+w:w;if(test.length>cpl&&line){lines.push(line);line=w;}else line=test;});
      if(line)lines.push(line);
      lines.forEach((l,i)=>doc.text(l,MAR+labelW,fy+FN_LINE_H_S+i*FN_LINE_H_S-3));
      fy+=Math.max(1,lines.length)*FN_LINE_H_S+FN_GAP;
    });
  }

  // Helper: draw the page header and return the Y after it
  function drawDiagHeader(){
    doc.setFont('helvetica','bold'); doc.setFontSize(13);
    doc.setTextColor(31,30,30);
    doc.text(ref, MAR, MAR+10);
    doc.setFont('helvetica','normal'); doc.setFontSize(8);
    doc.setTextColor(168,159,144);
    doc.text((langSrc?langSrc+' \u00B7 ':'')+'Exegetical Phrasing \u00B7 Diagram', MAR, MAR+22);
    return MAR+HEADER_H;
  }
  const FN_SPACE_ABOVE=14;

  // ── Correct slice loop order ────────────────────────────────────────────
  // Step 1: estimate footnotes using full baseUsableH to get fnZone.
  // Step 2: compute adjustedUsableH = baseUsableH - fnZone.
  // Step 3: compute slicePxH within adjustedUsableH.
  // Step 4: snap back to avoid mid-block cuts inside adjustedUsableH.
  // This guarantees the image NEVER bleeds into the footnote or margin area.
  let srcY=0, pageIdx=0;
  while(srcY<capturedCanvas.height){
    const baseUsableH=pageIdx===0?usableH1:usableHN;

    // Step 1: pre-estimate which footnotes land on this page using full height
    const preEndY=srcY+Math.round((baseUsableH/imgH)*capturedCanvas.height);
    const preFns=rowFnMap.filter(r=>r.rowTopPx>=srcY&&r.rowTopPx<preEndY).map(r=>r.fn);
    const fnZone=preFns.length?(fnZonePt(preFns)+FN_SPACE_ABOVE):0;

    // Step 2: adjusted usable height leaving room for footnotes
    const adjustedUsableH=Math.max(baseUsableH*0.4, baseUsableH-fnZone);

    // Step 3: max image slice in adjusted space
    let slicePxH=Math.min(
      capturedCanvas.height-srcY,
      Math.max(1,Math.round((adjustedUsableH/imgH)*capturedCanvas.height))
    );

    // Step 4: snap back so we don't cut a block mid-row (within adjusted space)
    const snapEndY=srcY+slicePxH;
    const rowsOnPage=rowFnMap.filter(r=>r.rowTopPx>=srcY&&r.rowBotPx<=snapEndY);
    const rowsStraddling=rowFnMap.filter(r=>r.rowTopPx>=srcY&&r.rowTopPx<snapEndY&&r.rowBotPx>snapEndY);
    if(rowsStraddling.length&&rowsOnPage.length>0){
      slicePxH=Math.max(1,rowsStraddling[0].rowTopPx-srcY);
    }

    // Final footnotes within actual slice
    const pageEndY=srcY+slicePxH;
    const thisFns=rowFnMap.filter(r=>r.rowTopPx>=srcY&&r.rowTopPx<pageEndY).map(r=>r.fn);

    const sliceC=document.createElement('canvas');
    sliceC.width=capturedCanvas.width;
    sliceC.height=slicePxH;
    sliceC.getContext('2d').drawImage(
      capturedCanvas,0,srcY,capturedCanvas.width,slicePxH,
      0,0,capturedCanvas.width,slicePxH
    );
    // Image height in pts — capped to adjustedUsableH so image never bleeds into margins
    const sliceImgH=Math.min(adjustedUsableH,(slicePxH/capturedCanvas.width)*imgW);

    if(pageIdx>0) doc.addPage();
    const pageContentY=drawDiagHeader();
    doc.addImage(sliceC.toDataURL('image/png'),'PNG',MAR,pageContentY,imgW,sliceImgH);
    if(thisFns.length) drawFnsDiag(thisFns);
    srcY+=slicePxH;
    pageIdx++;
  }

  const slug=buildDiagramFilename(ref);
  doc.save(slug+'.pdf');
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
  CNX=0;LBL=0;
  SELECTED_CNX_ID=null;
  document.getElementById('conn-edit-popup')?.style.setProperty('display','none');
  cancelRightAngleArm();
  // Clear brackets
  if(typeof BRACKETS!=='undefined'){ BRACKETS=[]; BRK_CTR=0; SELECTED_BRK_ID=null; }
  if(typeof _brkCancelPending==='function') _brkCancelPending();
  if(typeof _brkCloseEditPopup==='function') _brkCloseEditPopup();
  if(typeof _brkUpdateColWidth==='function') _brkUpdateColWidth();
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

    // ── Bracket PDF injection ─────────────────
    // We render brackets as jsPDF vector lines directly (not via html2canvas)
    // so they appear crisply regardless of scale. We draw them after the rows.
    // Collect bracket geometry in PDF points before the row loop.
    const brkPdfData=[];
    if(typeof BRACKETS!=='undefined' && BRACKETS.length){
      const PT_PX_B=72/96;
      const body_B=document.getElementById('rows-body');
      const bodyRect_B=body_B?body_B.getBoundingClientRect():null;
      if(bodyRect_B){
        const overlayEl=document.getElementById('brk-overlay');
        const colW_B=overlayEl?overlayEl.offsetWidth:0;
        // We'll map row screen positions to PDF Y positions during the row loop.
        // Pre-compute all bracket info now (positions locked to screen layout).
        BRACKETS.forEach(brk=>{
          const sRow=document.querySelector(`.xrow[data-rid="${brk.startRid}"]`);
          const eRow=document.querySelector(`.xrow[data-rid="${brk.endRid}"]`);
          if(!sRow||!eRow) return;
          const sRect=sRow.getBoundingClientRect();
          const eRect=eRow.getBoundingClientRect();
          // Store screen top/bottom so we can interpolate PDF Y later
          brkPdfData.push({brk,
            screenTop:   Math.min(sRect.top+sRect.height*0.5, eRect.bottom-eRect.height*0.5),
            screenBot:   Math.max(sRect.bottom-eRect.height*0.5, eRect.top+sRect.height*0.5),
            screenTopRaw:sRect.top+sRect.height*0.5,
            screenBotRaw:eRect.bottom-eRect.height*0.5,
          });
        });
      }
    }

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

    // ── Draw brackets as PDF vectors ──────────────────────────────────────
    // Strategy: map each bracket's screen-Y range to PDF-Y by tracking
    // cumulative row heights during the layout pass above. Since rows render
    // top-to-bottom in PDF order, we build a screen-Y → pdf-Y lookup here
    // by re-measuring all rows vs the PDF final curY bookmark.
    if(brkPdfData.length){
      // Re-read PDF page count and page sizes — iterate pages 1..N
      // For simplicity we draw brackets only on page 1 when the full passage
      // fits; for multi-page we do a best-effort based on row top PDF positions.
      // Build a rowPdfY map: rid → {pdfY, pdfH} (approximate from DOM order)
      const rowEls2=Array.from(document.querySelectorAll('.xrow'));
      const firstRowRect=rowEls2[0]?.getBoundingClientRect();
      const lastRowRect=rowEls2[rowEls2.length-1]?.getBoundingClientRect();
      if(firstRowRect && lastRowRect){
        // Simple linear mapping: screenY → pdfY
        // First row maps to just below column headers (curY start) ≈ 58pt
        // We captured curY as it progressed — approximate using proportional mapping.
        const screenRange=lastRowRect.bottom - firstRowRect.top;
        const pdfHeaderH=38; // approx header+colhdr height in pt
        const pdfContentStart=MAR+pdfHeaderH;
        // We use the usableW for bracket column position
        const brkLaneW_pt=BRK_LANE_W*PT_PX;
        const brkSerifW_pt=BRK_SERIF_W*PT_PX;

        brkPdfData.forEach(({brk, screenTopRaw, screenBotRaw})=>{
          if(!screenRange) return;
          // Map screen Y to PDF Y (approximate — single-page best effort)
          const fracTop=(screenTopRaw - firstRowRect.top)/screenRange;
          const fracBot=(screenBotRaw - firstRowRect.top)/screenRange;
          // PDF content area height estimate: pH - 2*MAR - pdfHeaderH - footnote zone
          const pdfContentH = pH - 2*MAR - pdfHeaderH - 20;
          const yTop_pt = pdfContentStart + fracTop * pdfContentH;
          const yBot_pt = pdfContentStart + fracBot * pdfContentH;

          if(yTop_pt > pH - MAR || yBot_pt < pdfContentStart) return; // off-page

          const laneX_pt = pW - MAR - (brk.lane - 1)*brkLaneW_pt - brkLaneW_pt*0.5;
          const midY_pt  = (yTop_pt + yBot_pt) / 2;

          // Parse color
          let r=73,g2=53,b2=72;
          const c=brk.color||'#493548';
          if(c.startsWith('#') && c.length===7){
            r=parseInt(c.slice(1,3),16); g2=parseInt(c.slice(3,5),16); b2=parseInt(c.slice(5,7),16);
          }
          const sw=Math.max(0.5, (brk.thickness||2)*0.5);
          doc.setDrawColor(r,g2,b2); doc.setLineWidth(sw);
          doc.setLineCap('round');
          // Vertical line
          doc.line(laneX_pt, yTop_pt, laneX_pt, yBot_pt);
          // Top serif
          doc.line(laneX_pt - brkSerifW_pt, yTop_pt, laneX_pt, yTop_pt);
          // Bottom serif
          doc.line(laneX_pt - brkSerifW_pt, yBot_pt, laneX_pt, yBot_pt);
          // Mid tick
          doc.line(laneX_pt, midY_pt, laneX_pt+4, midY_pt);
          // Label
          if(brk.label){
            doc.setFont('helvetica','bold'); doc.setFontSize(8);
            doc.setTextColor(r,g2,b2);
            doc.text(brk.label, laneX_pt+5, midY_pt+2.5);
          }
        });
      }
    }

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
   BRACKETING SYSTEM
   Right-side bracket handles on every row.
   Shift+click first → Shift+click second → bracket created.
   SVG overlay renders brackets in both Phrasing and Diagram View.
   Brackets saved in project JSON.
════════════════════════════════════════ */

/* ── State ── */
let BRACKETS = [];           // array of bracket objects
let BRACKET_PENDING = null;  // {rid, handleEl} | null — after first Shift+click
let SELECTED_BRK_ID = null;  // id of currently selected bracket
let BRK_CTR = 0;             // ever-incrementing bracket ID seed

const BRK_LANE_W  = 20;  // px per bracket lane
const BRK_SERIF_W = 6;   // px width of top/bottom serifs
const BRK_LABEL_GAP = 6; // px between bracket line right edge and label

/* ── How many lanes are active → drives --brk-col-w ── */
function _brkMaxLane(){
  if(!BRACKETS.length) return 0;
  return Math.max(...BRACKETS.map(b=>b.lane));
}

function _brkUpdateColWidth(){
  const lanes = _brkMaxLane();
  // Lane drawing area: grows with brackets. Label text needs ~60px per lane.
  const laneW = lanes > 0 ? lanes * BRK_LANE_W + 60 : 0;
  document.documentElement.style.setProperty('--brk-lane-w', laneW+'px');
  // --brk-col-w kept for legacy references, equals handle + lane
  const totalW = 24 + laneW; // 24 = handle zone (--brk-handle-w)
  document.documentElement.style.setProperty('--brk-col-w', totalW+'px');
  // Resize the phrasing overlay to cover handle + lane area
  const overlay = document.getElementById('brk-overlay');
  if(overlay) overlay.style.width = totalW+'px';
  // Also size the column header placeholder
  const chBrk = document.getElementById('ch-brk');
  if(chBrk){ chBrk.style.width = totalW+'px'; chBrk.style.minWidth = totalW+'px'; }
}

/* ── Lane assignment: find lowest lane with no vertical overlap ── */
function _brkAssignLane(startRid, endRid){
  const rows = Array.from(document.querySelectorAll('.xrow'));
  const rids = rows.map(r=>r.dataset.rid);
  const si = rids.indexOf(String(startRid));
  const ei = rids.indexOf(String(endRid));
  if(si < 0 || ei < 0) return 1;
  const lo = Math.min(si, ei);
  const hi = Math.max(si, ei);

  for(let lane = 1; lane <= 20; lane++){
    const conflict = BRACKETS.some(b=>{
      if(b.lane !== lane) return false;
      const bi = rids.indexOf(String(b.startRid));
      const bj = rids.indexOf(String(b.endRid));
      if(bi < 0 || bj < 0) return false;
      const blo = Math.min(bi, bj);
      const bhi = Math.max(bi, bj);
      return !(hi < blo || lo > bhi);
    });
    if(!conflict) return lane;
  }
  return 1;
}

/* ── Add a bracket handle column to a row element ── */
function _brkAddHandle(rowEl){
  if(!rowEl || rowEl.querySelector('.xrow-brk-handle')) return;
  const h = document.createElement('div');
  h.className = 'xrow-brk-handle';
  h.setAttribute('data-rid', rowEl.dataset.rid);
  h.innerHTML = '<div class="xrow-brk-pip"></div>';
  h.addEventListener('mousedown', ev => {
    if(!ev.shiftKey) return; // only act on Shift+click
    ev.preventDefault();
    ev.stopPropagation();
    _brkHandleClick(rowEl.dataset.rid, h);
  });
  rowEl.appendChild(h);
}

/* ── Add diagram row bracket handle ── */
function _brkAddDiagHandle(drowEl){
  if(!drowEl || drowEl.querySelector('.drow-brk-handle')) return;
  const rid = drowEl.dataset.rid;
  const h = document.createElement('div');
  h.className = 'drow-brk-handle';
  h.setAttribute('data-rid', rid);
  h.innerHTML = '<div class="drow-brk-pip"></div>';
  drowEl.style.position = 'relative';
  h.addEventListener('mousedown', ev => {
    if(!ev.shiftKey) return;
    ev.preventDefault();
    ev.stopPropagation();
    _brkHandleClick(rid, h);
  });
  drowEl.appendChild(h);
}

/* ── Ensure all current rows have bracket handles ── */
function _brkSyncHandles(){
  document.querySelectorAll('.xrow').forEach(r => _brkAddHandle(r));
  // Diagram rows
  document.querySelectorAll('#dcanvas .drow').forEach(r => _brkAddDiagHandle(r));
}

/* ── Handle a Shift+click on a row's bracket pip ── */
function _brkHandleClick(rid, handleEl){
  if(!BRACKET_PENDING){
    // First click — start bracket
    BRACKET_PENDING = {rid, handleEl};
    handleEl.classList.add('brk-pending');
    document.body.classList.add('brk-active');
    const stbar = document.getElementById('stbar');
    if(stbar){ stbar.textContent = t('bracket.start-hint'); stbar.classList.add('stbar-brk'); }
  } else {
    // Second click
    const startRid = BRACKET_PENDING.rid;
    const endRid   = rid;
    _brkCancelPending();
    if(startRid === endRid){
      // Same row — cancel
      toast(t('bracket.cancel'));
      return;
    }
    _brkCreate(startRid, endRid);
  }
}

/* ── Cancel a pending bracket (Escape) ── */
function _brkCancelPending(){
  if(!BRACKET_PENDING) return;
  BRACKET_PENDING.handleEl.classList.remove('brk-pending');
  // Also clear any diagram handle with same rid
  document.querySelectorAll('.drow-brk-handle.brk-pending').forEach(h=>h.classList.remove('brk-pending'));
  BRACKET_PENDING = null;
  document.body.classList.remove('brk-active');
  const stbar = document.getElementById('stbar');
  if(stbar){ stbar.textContent = t('stbar.ready'); stbar.classList.remove('stbar-brk'); }
}

/* ── Create and store a bracket ── */
function _brkCreate(startRid, endRid){
  const lane = _brkAssignLane(startRid, endRid);
  const id   = 'brk-'+(++BRK_CTR);
  const brk  = {id, startRid, endRid, label:'', color:'#493548', thickness:2, lane};
  BRACKETS.push(brk);
  _brkUpdateColWidth();
  refreshBrackets();
  // Open inline label input immediately after render
  setTimeout(()=>_brkOpenInlineEdit(id), 50);
  autoSave();
}

/* ── Refresh (re-render) all brackets for the active view ── */
function refreshBrackets(){
  _brkSyncHandles();
  _brkUpdateColWidth();
  if(EDITOR_VIEW === 'diagram'){
    _brkRenderDiagram();
  } else {
    _brkRenderPhrasing();
  }
}

/* ── Render brackets in Phrasing View ── */
function _brkRenderPhrasing(){
  const svg = document.getElementById('brk-svg');
  if(!svg) return;
  svg.innerHTML = '';
  if(!BRACKETS.length) return;

  // The SVG lives inside #brk-overlay which is inside #tzone (position:relative).
  // We measure everything relative to #tzone's top-left so scroll is accounted for.
  const tzone = document.getElementById('tzone');
  if(!tzone) return;
  const tzoneRect = tzone.getBoundingClientRect();

  // Total SVG width = handle zone + lane zone
  const lanes   = _brkMaxLane();
  const laneAreaW = lanes > 0 ? lanes * BRK_LANE_W + 60 : 60;
  const svgW    = 24 + laneAreaW;

  // Resize overlay and SVG to the full needed width
  const overlay = document.getElementById('brk-overlay');
  if(overlay){ overlay.style.width = svgW+'px'; }
  svg.style.width = svgW+'px';

  BRACKETS.forEach(brk => {
    const startRow = document.querySelector(`.xrow[data-rid="${brk.startRid}"]`);
    const endRow   = document.querySelector(`.xrow[data-rid="${brk.endRid}"]`);
    if(!startRow || !endRow) return;

    const sRect = startRow.getBoundingClientRect();
    const eRect = endRow.getBoundingClientRect();

    // Y relative to tzone top (which is the SVG's coordinate origin)
    const yTop    = sRect.top    - tzoneRect.top + sRect.height  * 0.5;
    const yBottom = eRect.top    - tzoneRect.top + eRect.height  * 0.5;
    const yStart  = Math.min(yTop, yBottom);
    const yEnd    = Math.max(yTop, yBottom);

    // X: lane 1 starts at x=4 (a few px from left edge of overlay), lanes step right
    const laneX = 4 + (brk.lane - 1) * BRK_LANE_W + BRK_LANE_W * 0.5;

    _brkDrawSVGBracket(svg, brk, laneX, yStart, yEnd, svgW);
  });
}

/* ── Render brackets in Diagram View ── */
function _brkRenderDiagram(){
  // Remove old diagram bracket SVG if present
  let dsvg = document.getElementById('dbrk-svg');
  if(dsvg) dsvg.remove();
  if(!BRACKETS.length) return;

  const canvas = document.getElementById('dcanvas');
  if(!canvas) return;

  dsvg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  dsvg.id = 'dbrk-svg';
  dsvg.setAttribute('preserveAspectRatio','none');
  canvas.appendChild(dsvg);

  const canvasRect = canvas.getBoundingClientRect();
  const zoom = DIAGRAM_ZOOM / 100;

  BRACKETS.forEach(brk => {
    // Use drow elements (not xrow) for diagram positions
    const startDrow = canvas.querySelector(`.drow[data-rid="${brk.startRid}"]`);
    const endDrow   = canvas.querySelector(`.drow[data-rid="${brk.endRid}"]`);
    if(!startDrow || !endDrow) return;

    const sRect = startDrow.getBoundingClientRect();
    const eRect = endDrow.getBoundingClientRect();

    const yTop    = (sRect.top    - canvasRect.top) / zoom + (sRect.height / zoom) * 0.5;
    const yBottom = (eRect.bottom - canvasRect.top) / zoom - (eRect.height / zoom) * 0.5;
    const yStart  = Math.min(yTop, yBottom);
    const yEnd    = Math.max(yTop, yBottom);

    // For diagram, laneX starts from right edge of canvas content
    const laneX = (brk.lane - 1) * BRK_LANE_W + BRK_LANE_W * 0.5;

    const svgW = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--brk-col-w'))||48;
    _brkDrawSVGBracket(dsvg, brk, laneX, yStart, yEnd, svgW);
  });
}

/* ── Draw a single bracket into an SVG element ── */
function _brkDrawSVGBracket(svg, brk, laneX, yStart, yEnd, svgW){
  const c        = brk.color || '#493548';
  const sw       = brk.thickness || 2;
  const isSelected = brk.id === SELECTED_BRK_ID;

  const g = document.createElementNS('http://www.w3.org/2000/svg','g');
  g.dataset.brkId = brk.id;

  // Vertical line
  const vLine = document.createElementNS('http://www.w3.org/2000/svg','line');
  vLine.setAttribute('x1', laneX); vLine.setAttribute('y1', yStart);
  vLine.setAttribute('x2', laneX); vLine.setAttribute('y2', yEnd);
  vLine.setAttribute('stroke', c); vLine.setAttribute('stroke-width', sw);
  vLine.setAttribute('stroke-linecap','round');
  vLine.className.baseVal = 'brk-line'+(isSelected?' brk-selected':'');
  g.appendChild(vLine);

  // Top serif (horizontal tick pointing left toward text)
  const topSerif = document.createElementNS('http://www.w3.org/2000/svg','line');
  topSerif.setAttribute('x1', laneX - BRK_SERIF_W); topSerif.setAttribute('y1', yStart);
  topSerif.setAttribute('x2', laneX);                topSerif.setAttribute('y2', yStart);
  topSerif.setAttribute('stroke', c); topSerif.setAttribute('stroke-width', sw);
  topSerif.setAttribute('stroke-linecap','round');
  topSerif.className.baseVal = 'brk-line'+(isSelected?' brk-selected':'');
  g.appendChild(topSerif);

  // Bottom serif
  const botSerif = document.createElementNS('http://www.w3.org/2000/svg','line');
  botSerif.setAttribute('x1', laneX - BRK_SERIF_W); botSerif.setAttribute('y1', yEnd);
  botSerif.setAttribute('x2', laneX);                botSerif.setAttribute('y2', yEnd);
  botSerif.setAttribute('stroke', c); botSerif.setAttribute('stroke-width', sw);
  botSerif.setAttribute('stroke-linecap','round');
  botSerif.className.baseVal = 'brk-line'+(isSelected?' brk-selected':'');
  g.appendChild(botSerif);

  // Midpoint tick
  const midY = (yStart + yEnd) / 2;
  const midTick = document.createElementNS('http://www.w3.org/2000/svg','line');
  midTick.setAttribute('x1', laneX); midTick.setAttribute('y1', midY);
  midTick.setAttribute('x2', laneX + BRK_LABEL_GAP); midTick.setAttribute('y2', midY);
  midTick.setAttribute('stroke', c); midTick.setAttribute('stroke-width', sw);
  midTick.setAttribute('stroke-linecap','round');
  midTick.className.baseVal = 'brk-line'+(isSelected?' brk-selected':'');
  g.appendChild(midTick);

  // Hit-test transparent wider line (for easier clicking)
  const hitLine = document.createElementNS('http://www.w3.org/2000/svg','line');
  hitLine.setAttribute('x1', laneX); hitLine.setAttribute('y1', yStart);
  hitLine.setAttribute('x2', laneX); hitLine.setAttribute('y2', yEnd);
  hitLine.setAttribute('stroke', 'transparent'); hitLine.setAttribute('stroke-width', 12);
  hitLine.style.cursor = 'pointer';
  hitLine.style.pointerEvents = 'stroke';
  hitLine.addEventListener('click', ev => { ev.stopPropagation(); _brkSelect(brk.id, ev); });
  g.appendChild(hitLine);

  // Label text (if any)
  if(brk.label){
    const labelX = laneX + BRK_LABEL_GAP + 4;
    const fo = document.createElementNS('http://www.w3.org/2000/svg','foreignObject');
    fo.setAttribute('x', labelX); fo.setAttribute('y', midY - 10);
    fo.setAttribute('width', svgW - labelX); fo.setAttribute('height', 20);
    fo.className.baseVal = 'brk-label-fo';
    const span = document.createElement('span');
    span.className = 'brk-label-text'+(isSelected?' brk-selected':'');
    span.style.cssText = `display:inline-block;font-family:var(--ui,sans-serif);font-size:11px;color:${isSelected?'var(--active,#C8A84B)':c};white-space:nowrap;cursor:pointer;line-height:20px;`;
    span.textContent = brk.label;
    span.addEventListener('click', ev => { ev.stopPropagation(); _brkSelect(brk.id, ev); });
    fo.appendChild(span);
    g.appendChild(fo);
  }

  svg.appendChild(g);
}

/* ── Select a bracket ── */
function _brkSelect(id, ev){
  SELECTED_BRK_ID = id;
  refreshBrackets();
  const brk = BRACKETS.find(b=>b.id===id);
  if(brk) _brkOpenEditPopup(ev.clientX, ev.clientY, brk);
}

/* ── Deselect all brackets ── */
function _brkDeselect(){
  if(!SELECTED_BRK_ID) return;
  SELECTED_BRK_ID = null;
  _brkCloseEditPopup();
  refreshBrackets();
}

/* ── Open bracket edit popup ── */
function _brkOpenEditPopup(clientX, clientY, brk){
  const popup = document.getElementById('brk-edit-popup');
  if(!popup) return;

  // Populate fields
  document.getElementById('brk-label-input').value = brk.label || '';
  document.getElementById('brk-color-input').value = brk.color || '#493548';

  // Highlight active weight button
  popup.querySelectorAll('.brk-wt-btn').forEach(btn=>{
    btn.classList.toggle('active', parseInt(btn.dataset.w) === brk.thickness);
  });

  // Position popup near click, keep within viewport
  popup.style.display = 'flex';
  const pw = 220, ph = 160;
  let x = clientX + 12, y = clientY - 20;
  if(x + pw > window.innerWidth - 10)  x = clientX - pw - 12;
  if(y + ph > window.innerHeight - 10) y = window.innerHeight - ph - 10;
  if(y < 10) y = 10;
  popup.style.left = x + 'px';
  popup.style.top  = y + 'px';

  // Apply i18n to popup
  applyLang();
}

function _brkCloseEditPopup(){
  const popup = document.getElementById('brk-edit-popup');
  if(popup) popup.style.display = 'none';
}

/* ── Popup field handlers ── */
function brkEditLabelChange(val){
  const brk = BRACKETS.find(b=>b.id===SELECTED_BRK_ID);
  if(!brk) return;
  brk.label = val;
  refreshBrackets();
  autoSave();
}

function brkEditWeight(w){
  const brk = BRACKETS.find(b=>b.id===SELECTED_BRK_ID);
  if(!brk) return;
  brk.thickness = w;
  document.querySelectorAll('.brk-wt-btn').forEach(btn=>{
    btn.classList.toggle('active', parseInt(btn.dataset.w) === w);
  });
  refreshBrackets();
  autoSave();
}

function brkEditColorChange(val){
  const brk = BRACKETS.find(b=>b.id===SELECTED_BRK_ID);
  if(!brk) return;
  brk.color = val;
  refreshBrackets();
  autoSave();
}

function brkDeleteCurrent(){
  if(!SELECTED_BRK_ID) return;
  BRACKETS = BRACKETS.filter(b=>b.id !== SELECTED_BRK_ID);
  SELECTED_BRK_ID = null;
  _brkCloseEditPopup();
  _brkUpdateColWidth();
  refreshBrackets();
  autoSave();
}

/* ── Open inline label input right after bracket creation ── */
function _brkOpenInlineEdit(id){
  const brk = BRACKETS.find(b=>b.id===id);
  if(!brk) return;

  // Find the midpoint tick's SVG group in the active SVG
  const svgEl = EDITOR_VIEW==='diagram'
    ? document.getElementById('dbrk-svg')
    : document.getElementById('brk-svg');
  if(!svgEl) return;

  const g = svgEl.querySelector(`g[data-brk-id="${id}"]`);
  if(!g) return;

  // Find position of midpoint tick
  const lines = Array.from(g.querySelectorAll('line.brk-line'));
  const vLine  = lines.find(l=>l.getAttribute('x1')===l.getAttribute('x2'));
  if(!vLine) return;

  const midY = (parseFloat(vLine.getAttribute('y1'))+parseFloat(vLine.getAttribute('y2')))/2;
  const laneX = parseFloat(vLine.getAttribute('x1'));
  const labelX = laneX + BRK_LABEL_GAP + 4;

  // Create a foreignObject with an input
  const fo = document.createElementNS('http://www.w3.org/2000/svg','foreignObject');
  fo.setAttribute('x', labelX); fo.setAttribute('y', midY - 10);
  fo.setAttribute('width', 100); fo.setAttribute('height', 22);
  fo.id = 'brk-inline-fo';

  const inp = document.createElement('input');
  inp.type = 'text';
  inp.spellcheck = false;
  inp.className = 'brk-label-input';
  inp.placeholder = t('bracket.label-ph');

  inp.addEventListener('keydown', ev=>{
    if(ev.key==='Enter'||ev.key==='Escape'){
      ev.preventDefault();
      brk.label = inp.value.trim();
      fo.remove();
      refreshBrackets();
      autoSave();
    }
  });
  inp.addEventListener('blur', ()=>{
    brk.label = inp.value.trim();
    fo.remove();
    refreshBrackets();
    autoSave();
  });

  fo.appendChild(inp);
  g.appendChild(fo);
  setTimeout(()=>inp.focus(), 10);
}

/* ── Serialize brackets for collectData() ── */
function collectBracketData(){
  return BRACKETS.map(b=>({...b}));
}

/* ── Restore brackets from loadData() ── */
function loadBracketData(arr){
  BRACKETS = Array.isArray(arr) ? arr.map(b=>({...b})) : [];
  // Bump BRK_CTR past highest saved id
  BRACKETS.forEach(b=>{
    const n = parseInt(String(b.id||'').replace(/^brk-/,''),10);
    if(!isNaN(n) && n >= BRK_CTR) BRK_CTR = n+1;
  });
  SELECTED_BRK_ID = null;
  _brkUpdateColWidth();
  // Defer render until DOM rows are fully built
  setTimeout(()=>refreshBrackets(), 100);
}

/* ── Hook into Escape to cancel pending bracket ── */
const _brkOrigEscHandler = window._escHandler;
document.addEventListener('keydown', ev=>{
  if(ev.key === 'Escape'){
    if(BRACKET_PENDING){
      _brkCancelPending();
      toast(t('bracket.cancel'));
    }
    _brkDeselect();
  }
}, true); // capture phase so it runs before other Escape handlers

/* ── Click outside popup to close it ── */
document.addEventListener('mousedown', ev=>{
  const popup = document.getElementById('brk-edit-popup');
  if(!popup || popup.style.display==='none') return;
  if(!popup.contains(ev.target)) _brkDeselect();
}, true);

/* ── Keep handles in sync when rows are added/deleted/merged ── */
const _brkOrigRecomputeIds = recomputeIds;
// Patch: after recomputeIds, sync bracket handles (new rows won't have handles yet)
const _brkRecomputePatch = function(){
  _brkOrigRecomputeIds.apply(this, arguments);
  // Use requestAnimationFrame so DOM is fully updated first
  requestAnimationFrame(()=>{
    _brkSyncHandles();
    refreshBrackets();
  });
};
// Override recomputeIds
window.recomputeIds = _brkRecomputePatch;

/* ── Refresh brackets on scroll (keep alignment) ── */
function _brkOnScroll(){
  if(EDITOR_VIEW!=='diagram') _brkRenderPhrasing();
}

/* ── PDF export integration: render bracket SVG into the clone ── */
/* Called by exportPDF() before html2canvas capture — we prepend a copy of
   brk-svg directly into the rendered area so html2canvas sees it. */
function _brkInjectForPDFPhrasing(container){
  // container = the element being html2canvas'd (editor-area or rows-body)
  const svg = document.getElementById('brk-svg');
  if(!svg || !BRACKETS.length) return null;
  const clone = svg.cloneNode(true);
  clone.id = 'brk-svg-pdf-clone';
  clone.style.cssText = 'position:absolute;top:0;right:0;pointer-events:none;overflow:visible;';
  clone.style.width  = svg.parentElement.offsetWidth+'px';
  clone.style.height = svg.parentElement.offsetHeight+'px';
  container.style.position = 'relative';
  container.appendChild(clone);
  return clone;
}

function _brkRemovePDFClone(){
  document.getElementById('brk-svg-pdf-clone')?.remove();
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
  document.getElementById('rows-scroll').addEventListener('scroll',()=>{ drawConns(); _brkOnScroll(); });
  document.getElementById('dcanvas-scroll')?.addEventListener('scroll',drawConns);
  document.getElementById('cmargin')?.addEventListener('scroll',drawConns);
  window.addEventListener('resize',()=>{ drawConns(); refreshBrackets(); });
  renderS1Recent();
  // Populate version display on Screen 1
  const vEl=document.getElementById('s1-version-num');
  if(vEl){
    const v=document.querySelector('meta[name="app-version"]')?.content||'';
    if(v) vEl.textContent=v;
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

/* ── Alt+1 / Alt+2 / Alt+T / Alt+L hotkeys for Projects, Bible Module, Diagram View toggle, Add Label ── */
document.addEventListener('keydown',function(ev){
  if(!ev.altKey||ev.shiftKey||ev.ctrlKey||ev.metaKey)return;
  if(ev.key!=='1'&&ev.key!=='2'&&ev.key!=='3'&&ev.key!=='t'&&ev.key!=='T'&&ev.key!=='l'&&ev.key!=='L')return;
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
  if(ev.key==='3'&&!s1Visible) toggleCmtPane();
  if((ev.key==='t'||ev.key==='T')&&!s1Visible){
    setEditorView(EDITOR_VIEW==='diagram'?'phrasing':'diagram');
  }
  if((ev.key==='l'||ev.key==='L')&&!s1Visible&&EDITOR_VIEW==='diagram'){
    addDiagramLabel();
  }
});

