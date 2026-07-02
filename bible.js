/* ════════════════════════════════════════════════════════
   BIBLE MODULE  v3  —  bible.js
════════════════════════════════════════════════════════ */

/* ── Book data ───────────────────────────────────────── */
const OT_BOOKS=['Genesis','Exodus','Leviticus','Numbers','Deuteronomy',
  'Joshua','Judges','Ruth','1 Samuel','2 Samuel','1 Kings','2 Kings',
  '1 Chronicles','2 Chronicles','Ezra','Nehemiah','Esther','Job','Psalms',
  'Proverbs','Ecclesiastes','Song of Solomon','Isaiah','Jeremiah',
  'Lamentations','Ezekiel','Daniel','Hosea','Joel','Amos','Obadiah',
  'Jonah','Micah','Nahum','Habakkuk','Zephaniah','Haggai','Zechariah','Malachi'];
const NT_BOOKS=['Matthew','Mark','Luke','John','Acts','Romans',
  '1 Corinthians','2 Corinthians','Galatians','Ephesians',
  'Philippians','Colossians','1 Thessalonians','2 Thessalonians',
  '1 Timothy','2 Timothy','Titus','Philemon','Hebrews',
  'James','1 Peter','2 Peter','1 John','2 John','3 John','Jude','Revelation'];
const OT_ABBR=['Gn','Ex','Lv','Nm','Dt','Jo','Jgs','Ru','1 Sm','2 Sm',
  '1 Kgs','2 Kgs','1 Ch','2 Ch','Ezr','Neh','Est','Jb','Ps','Prv',
  'Ecc','Sg','Is','Jer','Lam','Ez','Dn','Hos','Jl','Am',
  'Ob','Jon','Mi','Na','Hb','Zep','Hg','Zec','Mal'];
const NT_ABBR=['Mt','Mk','Lk','Jn','Ac','Rm','1 Co','2 Co','Gal','Eph',
  'Phil','Col','1 Th','2 Th','1 Tm','2 Tm','Ti','Phm','Heb',
  'Jas','1 Pt','2 Pt','1 Jn','2 Jn','3 Jn','Jd','Rv'];

/* Chinese short-form book names (CUV standard abbreviations) */
const OT_ABBR_ZH=['创','出','利','民','申','书','士','得','撒上','撒下',
  '王上','王下','代上','代下','拉','尼','斯','伯','诗','箴',
  '传','歌','赛','耶','哀','结','但','何','珥','摩',
  '俄','拿','弥','鸿','哈','番','该','亚','玛'];
const NT_ABBR_ZH=['太','可','路','约','徒','罗','林前','林后','加','弗',
  '腓','西','帖前','帖后','提前','提后','多','门','来',
  '雅','彼前','彼后','约一','约二','约三','犹','启'];

/* Chinese full book names for passage picker label (CUV standard) */
const OT_BOOKS_ZH=['创世记','出埃及记','利未记','民数记','申命记',
  '约书亚记','士师记','路得记','撒母耳记上','撒母耳记下',
  '列王纪上','列王纪下','历代志上','历代志下','以斯拉记',
  '尼希米记','以斯帖记','约伯记','诗篇','箴言',
  '传道书','雅歌','以赛亚书','耶利米书','耶利米哀歌',
  '以西结书','但以理书','何西阿书','约珥书','阿摩司书',
  '俄巴底亚书','约拿书','弥迦书','那鸿书','哈巴谷书',
  '西番雅书','哈该书','撒迦利亚书','玛拉基书'];
const NT_BOOKS_ZH=['马太福音','马可福音','路加福音','约翰福音','使徒行传',
  '罗马书','哥林多前书','哥林多后书','加拉太书','以弗所书',
  '腓立比书','歌罗西书','帖撒罗尼迦前书','帖撒罗尼迦后书',
  '提摩太前书','提摩太后书','提多书','腓利门书','希伯来书',
  '雅各书','彼得前书','彼得后书','约翰一书','约翰二书',
  '约翰三书','犹大书','启示录'];

/* ── Version registry ───────────────────────────────── */
const BVERSIONS={
  sblgnt: {label:'SBLGNT',         corpus:'nt',  offline:true,  group:'Greek'},
  byz:    {label:'Byzantine',      corpus:'nt',  offline:true,  group:'Greek'},
  lxx:    {label:'LXX',            corpus:'ot',  offline:true,  group:'Greek'},
  wlc:    {label:'WLC',            corpus:'ot',  offline:true,  group:'Hebrew'},
  vulgate:{label:'Vulgate',        corpus:'all', offline:true,  group:'Latin'},
  cuv_s:  {label:'CUV Simplified', corpus:'all', offline:true,  group:'Chinese'},
  cuv_t:  {label:'CUV Traditional',corpus:'all', offline:true,  group:'Chinese'},
  net:    {label:'NET',            corpus:'all', offline:false, group:'English'},
};

const DATA_URL='./data/';
const NET_API      ='https://labs.bible.org/api/?type=json&formatting=plain&passage=';
const NET_API_FULL ='https://labs.bible.org/api/?type=json&passage=';
// Footnotes endpoint: plain text + footnotes array with position offsets
const NET_API_FN   ='https://labs.bible.org/api/?type=json&formatting=plain&include_footnotes=1&passage=';
const MAX_TABS=5;

/* ── State ──────────────────────────────────────────── */
let bibleIndex=null, bibleCache={}, idb=null;
let bPanelOpen=false, bLocked=false, bProjLocked=false;
let bOnline=navigator.onLine;
let bScrollLocked=false;
let bFontSize=12;
let bFocusedSection='top';
let bSplitOpen=false;
let bLastFocusedPanel=null;

// Per-section state: tabs + infinite scroll data
const bTabs={top:[], bottom:[]};
const bActiveTab={top:-1, bottom:-1};
// Loaded chapters per section (for infinite scroll)
const bLoadedChapters={top:[], bottom:[]};
// {corpus, bookIdx} currently loaded per section
const bLoadedBook={top:null, bottom:null};

let bDragState=null;
let bLockState=false, projLockState=false;
try{bLockState=JSON.parse(localStorage.getItem('bLockState')||'false');}catch(_){}
try{projLockState=JSON.parse(localStorage.getItem('projLockState')||'false');}catch(_){}

/* ── Picker UI state ─────────────────────────────────── */
const bPicker={
  open:false,
  openSection:null,  // which section's picker is open: 'top'|'bottom'|null
  state:'closed',    // 'closed'|'books'|'chapters'|'verses'
  corpus:'ot',
  bookIdx:0,
  chapter:1,
  verse:1,
  activeSection:'top',
  targetSection:'top'
};

/* ── Immediate globals (before DOMContentLoaded) ─────── */
/* Stubs for functions called before DOMContentLoaded — only needed for
   functions that use the _ suffix pattern or aren't declared at top level */
window.openBible    =function(){if(typeof openBible_==='function')openBible_();};
window.bToggleSplit =function(){if(typeof bToggleSplit_==='function')bToggleSplit_();};
window.bToggleFocusedPanelLock=function(){if(typeof bToggleFocusedPanelLock_==='function')bToggleFocusedPanelLock_();};
/* NOTE: bPickerOpen, bPickerClose, spOpen, spClose etc are plain function declarations
   and are already global — do NOT shadow them with window assignments here */

/* ── Online ─────────────────────────────────────────── */
window.addEventListener('online', ()=>{bOnline=true; bUpdateOfflineBar();});
window.addEventListener('offline',()=>{bOnline=false;bUpdateOfflineBar();});
function bUpdateOfflineBar(){
  const el=document.getElementById('bpanel-offline-bar');
  if(el)el.style.display=bOnline?'none':'block';
}

function escH(s){
  if(typeof s!=='string')s=String(s||'');
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ── IDB ─────────────────────────────────────────────── */
async function bOpenIDB(){
  return new Promise((res,rej)=>{
    const r=indexedDB.open('exeg-bible-v3',1);
    r.onupgradeneeded=e=>e.target.result.createObjectStore('texts');
    r.onsuccess=e=>res(e.target.result);r.onerror=rej;
  });
}
async function bIdbGet(key){
  if(!idb)idb=await bOpenIDB();
  return new Promise((res,rej)=>{
    const r=idb.transaction('texts','readonly').objectStore('texts').get(key);
    r.onsuccess=e=>res(e.target.result);r.onerror=rej;
  });
}
async function bIdbSet(key,val){
  if(!idb)idb=await bOpenIDB();
  return new Promise((res,rej)=>{
    const r=idb.transaction('texts','readwrite').objectStore('texts').put(val,key);
    r.onsuccess=()=>res();r.onerror=rej;
  });
}

/* ── Load index ─────────────────────────────────────── */
async function bLoadIndex(){
  if(bibleIndex)return bibleIndex;
  try{const c=await bIdbGet('__index__');if(c){bibleIndex=c;return c;}}catch(_){}
  const r=await fetch(DATA_URL+'index.json');
  if(!r.ok)throw new Error('Cannot load index');
  bibleIndex=await r.json();
  try{await bIdbSet('__index__',bibleIndex);}catch(_){}
  return bibleIndex;
}

/* ── Load version ───────────────────────────────────── */
async function bLoadVersion(version){
  if(bibleCache[version])return bibleCache[version];
  try{const c=await bIdbGet('text:'+version);if(c){bibleCache[version]=c;return c;}}catch(_){}
  const r=await fetch(DATA_URL+version+'.json');
  if(!r.ok)throw new Error('Cannot load '+version);
  const data=await r.json();
  bibleCache[version]=data;
  try{await bIdbSet('text:'+version,data);}catch(_){}
  return data;
}

/* ── Get all verses of a chapter ───────────────────── */
async function bGetChapter(version,corpus,bookIdx,chapter){
  if(version==='net')return bGetNetChapter(corpus,bookIdx,chapter);
  const data=await bLoadVersion(version);
  if(!data)return null;
  // For corpus='all' versions (Vulgate, CUV) the JSON stores all 66 books:
  // OT at index 0–38, NT at index 39–65. Apply offset for NT corpus.
  const idx=(corpus==='nt'&&data.length===66)?bookIdx+39:bookIdx;
  if(!data[idx])return null;
  return data[idx].c[chapter-1]||null;
}
async function bGetNetChapter(corpus,bookIdx,chapter){
  if(!bOnline)throw new Error('offline');
  const books=corpus==='nt'?NT_BOOKS:OT_BOOKS;
  const book=books[bookIdx];if(!book)return null;
  const q=encodeURIComponent(`${book} ${chapter}`);
  // Use plain text + footnotes array (include_footnotes=1 gives us positions+content)
  const r=await fetch(NET_API_FN+q);
  if(!r.ok)throw new Error('NET API error');
  const j=await r.json();
  if(!Array.isArray(j))return null;
  // DEBUG: log the first verse object so we can see the actual API response structure
  if(j.length>0) console.log('[NET API] First verse object:', JSON.stringify(j[0], null, 2));
  return j.map(v=>bBuildNetVerse(v));
}

/* Build a NET verse with inline footnote markers.
   Uses formatting=plain + include_footnotes=1 so:
   - text is always plain (no HTML to strip)
   - footnotes array has {note_type, manuscript_number, position, content}
   - position is the character offset in text where the marker goes
   We insert markers from the END so earlier positions stay valid. */
function bBuildNetVerse(v){
  const text=v.text||'';
  const footnotes=Array.isArray(v.footnotes)?v.footnotes:[];
  if(!footnotes.length)return text;

  // Sort descending by position so we insert from end to start
  const sorted=[...footnotes].sort((a,b)=>(b.position||0)-(a.position||0));
  // Use spread to handle multi-byte chars correctly
  const chars=[...text];
  for(const fn of sorted){
    const pos=Math.min(fn.position!=null?fn.position:chars.length, chars.length);
    const num=fn.manuscript_number;
    const content=(fn.content||'').trim();
    if(num==null&&!content)continue;
    const label=num!=null?String(num):'*';
    chars.splice(pos,0,`<sup class="bfn" data-fn-content="${escHAttr(content)}">${escH(label)}</sup>`);
  }
  return chars.join('');
}

/* Escape a string for use in an HTML attribute value */
function escHAttr(s){
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ── Get max chapters for a book ────────────────────── */
function bMaxChapters(corpus,bookIdx){
  if(!bibleIndex)return 50;
  const k=corpus==='nt'?'sblgnt':'wlc';
  const idx=bibleIndex[k];
  if(idx&&idx[bookIdx])return idx[bookIdx].cv.length;
  return 50;
}
function bMaxVerses(corpus,bookIdx,chapter){
  if(!bibleIndex)return 30;
  const k=corpus==='nt'?'sblgnt':'wlc';
  const idx=bibleIndex[k];
  if(idx&&idx[bookIdx]&&idx[bookIdx].cv[chapter-1])return idx[bookIdx].cv[chapter-1];
  return 30;
}

/* ── Font size ──────────────────────────────────────── */
function bSetFontSize(val){
  bFontSize=parseInt(val)||12;
  document.querySelectorAll('.bpane-content').forEach(el=>{
    el.style.fontSize=bFontSize+'px';
  });
}

/* ════════════════════════════════════════════════════════
   SINGLE-CHAPTER LOADER (replaces infinite scroll)
════════════════════════════════════════════════════════ */

/* Navigation helpers */
function bPrevRef(corpus,bookIdx,chapter){
  if(chapter>1)return{corpus,bookIdx,chapter:chapter-1};
  // Cross book boundary backwards
  if(bookIdx>0){
    const newBookIdx=bookIdx-1;
    const maxCh=bMaxChapters(corpus,newBookIdx);
    return{corpus,bookIdx:newBookIdx,chapter:maxCh};
  }
  // At Genesis 1 — try crossing OT→NT boundary (backwards means nothing)
  return null;
}
function bNextRef(version,corpus,bookIdx,chapter){
  const maxCh=bMaxChapters(corpus,bookIdx);
  const books=corpus==='nt'?NT_BOOKS:OT_BOOKS;
  if(chapter<maxCh)return{corpus,bookIdx,chapter:chapter+1};
  // Last chapter of book — try next book
  if(bookIdx<books.length-1)return{corpus,bookIdx:bookIdx+1,chapter:1};
  // Last book of corpus — try crossing boundary
  const vMeta=BVERSIONS[version];
  if(corpus==='ot'&&(vMeta?.corpus==='all'||vMeta?.corpus==='nt')){
    return{corpus:'nt',bookIdx:0,chapter:1};
  }
  if(corpus==='nt'&&(vMeta?.corpus==='all'||vMeta?.corpus==='ot')){
    return{corpus:'ot',bookIdx:OT_BOOKS.length-1,chapter:bMaxChapters('ot',OT_BOOKS.length-1)};
  }
  return null;
}
function bPrevRefCrossCorpus(version,corpus,bookIdx,chapter){
  if(chapter>1)return{corpus,bookIdx,chapter:chapter-1};
  if(bookIdx>0)return{corpus,bookIdx:bookIdx-1,chapter:bMaxChapters(corpus,bookIdx-1)};
  // First chapter of first book — cross corpus
  const vMeta=BVERSIONS[version];
  if(corpus==='nt'&&(vMeta?.corpus==='all'||vMeta?.corpus==='ot')){
    return{corpus:'ot',bookIdx:OT_BOOKS.length-1,chapter:bMaxChapters('ot',OT_BOOKS.length-1)};
  }
  if(corpus==='ot'&&(vMeta?.corpus==='all'||vMeta?.corpus==='nt')){
    return{corpus:'nt',bookIdx:NT_BOOKS.length-1,chapter:bMaxChapters('nt',NT_BOOKS.length-1)};
  }
  return null;
}

async function bLoadPassageInfinite(section, corpus, bookIdx, chapter, anchorVerse){
  // Name kept for compatibility — now loads single chapter only
  const pane=document.getElementById('bpane-'+section);
  if(!pane)return;
  const tab=bTabs[section][bActiveTab[section]];
  if(!tab){
    pane.innerHTML=(typeof t==="function"?'<div class="bpane-empty">'+t('bible.no-passage')+'</div>':'<div class="bpane-empty">No passage selected yet.<br>Click "Select passage\u2026" above to begin.</div>');
    return;
  }
  const version=tab.version;
  // Corpus compatibility check
  const vMeta=BVERSIONS[version];
  if(vMeta&&vMeta.corpus!=='all'){
    if(vMeta.corpus==='ot'&&corpus==='nt'){pane.innerHTML=`<div class="bpane-error">⚠ ${vMeta.label} does not cover the New Testament.</div>`;return;}
    if(vMeta.corpus==='nt'&&corpus==='ot'){pane.innerHTML=`<div class="bpane-error">⚠ ${vMeta.label} does not cover the Old Testament.</div>`;return;}
  }

  pane.innerHTML='<div class="bpane-loading">Loading…</div>';
  pane.onscroll=null;
  if(pane._syncListener){pane.removeEventListener('scroll',pane._syncListener);pane._syncListener=null;}
  bLoadedChapters[section]=[chapter];
  bLoadedBook[section]={corpus,bookIdx,version,chapter};

  try{
    const verses=await bGetChapter(version,corpus,bookIdx,chapter);
    if(!verses||!verses.length){pane.innerHTML='<div class="bpane-empty">No text found for this passage.</div>';return;}

    // Build pane
    pane.innerHTML='';
    pane.appendChild(bBuildVerseList(corpus,bookIdx,chapter,verses));

    // Update prev/next buttons
    bUpdateNavBtns(section,version,corpus,bookIdx,chapter);

    // Anchor to verse: scroll to top first, then to the target verse
    const anchor=Math.max(1,anchorVerse||1);
    pane.scrollTop=0;
    // Wait for panel slide-in transition to fully settle before computing positions
    await new Promise(r=>setTimeout(r,200));
    await new Promise(r=>requestAnimationFrame(r));
    await new Promise(r=>requestAnimationFrame(r)); // double rAF for reliable paint
    const vEl=pane.querySelector('[data-verse="'+anchor+'"]');
    if(vEl){
      // scrollIntoView is immune to stacking context issues
      vEl.scrollIntoView({block:'start',behavior:'instant'});
      // Highlight
      vEl.classList.add('bverse-highlight');
      setTimeout(()=>vEl.classList.add('bverse-highlight-fade'),50);
      setTimeout(()=>vEl.classList.remove('bverse-highlight','bverse-highlight-fade'),1400);
    }

    // Wire scroll sync
    bRewireScrollSync();

  }catch(err){
    pane.innerHTML=`<div class="bpane-error">${err.message==='offline'?'⚠ NET Bible requires internet.':escH(err.message)}</div>`;
  }
}

function bBuildVerseList(corpus, bookIdx, chapter, verses){
  const cnt=document.createElement('div');
  cnt.className='bpane-content';
  cnt.style.cssText=`font-size:${bFontSize}px;line-height:1.85;font-family:var(--serif)`;
  verses.forEach((v,i)=>{
    const row=document.createElement('div');
    row.className='bpane-verse';
    row.dataset.verse=i+1;
    row.dataset.chapter=chapter;
    // If verse contains any HTML tags (NET bold, footnotes etc.), use innerHTML directly
    const hasHTML=typeof v==='string'&&/<[a-zA-Z]/.test(v);
    const txt=hasHTML?v:escH(String(v));
    row.innerHTML=`<span class="bpvnum">${i+1}</span><span class="bpvtxt">${txt}</span>`;
    cnt.appendChild(row);
  });
  // Wire footnote interactions after building
  bWireFootnotes(cnt);
  return cnt;
}

/* ── Footnote interactions ── */
function bWireFootnotes(cnt){
  cnt.querySelectorAll('sup.bfn').forEach(sup=>{
    const content=sup.dataset.fnContent||'';
    if(!content)return;
    // Hover tooltip (always)
    sup.addEventListener('mouseenter',e=>bShowFnTooltip(e,content));
    sup.addEventListener('mouseleave',bHideFnTooltip);
    // Click: open box in the pane (only when NOT in split mode)
    sup.addEventListener('click',e=>{
      e.stopPropagation();
      if(bSplitOpen)return; // split mode: hover only
      const pane=sup.closest('.bpane');
      if(pane) bShowFnBox(pane, sup, content);
    });
  });
  // Click anywhere else in the content closes the fn box (non-split)
  cnt.addEventListener('click',e=>{
    if(!e.target.closest('sup.bfn')) bHideFnBox(cnt.closest('.bpane'));
  });
}

let _fnTooltipEl=null;
function bShowFnTooltip(e, content){
  bHideFnTooltip();
  const tip=document.createElement('div');
  tip.id='bfn-tooltip';
  tip.textContent=content;
  document.body.appendChild(tip);
  _fnTooltipEl=tip;
  // Position near the sup
  const r=e.target.getBoundingClientRect();
  tip.style.left=Math.min(r.left, window.innerWidth-tip.offsetWidth-8)+'px';
  tip.style.top=(r.bottom+4)+'px';
  // Reposition if off screen bottom
  requestAnimationFrame(()=>{
    const tipR=tip.getBoundingClientRect();
    if(tipR.bottom>window.innerHeight-8){
      tip.style.top=(r.top-tipR.height-4)+'px';
    }
    if(tipR.right>window.innerWidth-8){
      tip.style.left=(window.innerWidth-tipR.width-8)+'px';
    }
  });
}
function bHideFnTooltip(){
  if(_fnTooltipEl){_fnTooltipEl.remove();_fnTooltipEl=null;}
}

function bShowFnBox(pane, sup, content){
  if(!pane)return;
  // Remove any existing box in this pane
  pane.querySelector('.bfn-box')?.remove();
  const box=document.createElement('div');
  box.className='bfn-box';
  box.innerHTML=`<div class="bfn-box-content">${escH(content)}</div>`
    +`<button class="bfn-box-close" title="Close">✕</button>`;
  box.querySelector('.bfn-box-close').addEventListener('click',e=>{
    e.stopPropagation();
    bHideFnBox(pane);
  });
  pane.appendChild(box);
}
function bHideFnBox(pane){
  if(pane) pane.querySelector('.bfn-box')?.remove();
}

/* Update prev/next nav buttons for a pane */
function bUpdateNavBtns(section,version,corpus,bookIdx,chapter){
  const prevBtn=document.getElementById('bprev-'+section);
  const nextBtn=document.getElementById('bnext-'+section);
  if(!prevBtn||!nextBtn)return;
  const prevRef=bPrevRefCrossCorpus(version,corpus,bookIdx,chapter);
  const nextRef=bNextRef(version,corpus,bookIdx,chapter);
  prevBtn.disabled=!prevRef;
  prevBtn.style.opacity=prevRef?'1':'0.3';
  nextBtn.disabled=!nextRef;
  nextBtn.style.opacity=nextRef?'1':'0.3';
  prevBtn._ref=prevRef;
  nextBtn._ref=nextRef;
}

async function bNavChapter(section,dir){
  const tab=bTabs[section]?.[bActiveTab[section]];
  if(!tab||tab.cleared)return;
  const btn=document.getElementById((dir==='prev'?'bprev-':'bnext-')+section);
  if(!btn||btn.disabled)return;
  const ref=btn._ref;
  if(!ref)return;
  Object.assign(tab,{corpus:ref.corpus,bookIdx:ref.bookIdx,chapter:ref.chapter,verse:1,
    label:(BVERSIONS[tab.version]?.label||tab.version)+' · '+(ref.corpus==='nt'?NT_BOOKS:OT_BOOKS)[ref.bookIdx]+' '+ref.chapter,cleared:false});
  bRenderTabBar(section);
  bUpdatePickerBtn(section);
  await bLoadPassageInfinite(section,ref.corpus,ref.bookIdx,ref.chapter,1);
}

/* Placeholder to prevent errors from old preload calls */
function bBuildChapterBlock(c,b,ch,v){return bBuildVerseList(c,b,ch,v);}

/* Stub — no longer needed */
async function bInfiniteScroll(){return;}

// Keep for old ref:

/* ── Scroll sync ────────────────────────────────────── */
function bToggleScrollLock(){
  bScrollLocked=!bScrollLocked;
  const btn=document.getElementById('b-scroll-lock-btn');
  if(btn)btn.classList.toggle('on',bScrollLocked);
  bRewireScrollSync();
}

function bRewireScrollSync(){
  ['top','bottom'].forEach(s=>{
    const p=document.getElementById('bpane-'+s);
    if(!p)return;
    if(p._syncListener){p.removeEventListener('scroll',p._syncListener);p._syncListener=null;}
    if(bScrollLocked&&bSplitOpen){
      p._syncListener=(ev)=>bSyncScroll(s);
      p.addEventListener('scroll',p._syncListener,{passive:true});
    }
  });
}

let bSyncing=false;
let bSyncTimer=null;
function bSyncScroll(fromSection){
  // Debounce: only fire after 80ms of scroll stillness
  if(bSyncing)return;
  clearTimeout(bSyncTimer);
  bSyncTimer=setTimeout(()=>_bDoSync(fromSection),80);
}
/* Get the scrollTop needed to place el at the top of pane */
function bScrollTopFor(pane, el){
  if(!pane||!el)return 0;
  const paneRect=pane.getBoundingClientRect();
  const elRect=el.getBoundingClientRect();
  // Current scrollTop + how far el is from pane's visible top
  return pane.scrollTop + (elRect.top - paneRect.top);
}

async function _bDoSync(fromSection){
  if(bSyncing||!bScrollLocked||!bSplitOpen)return;
  const toSection=fromSection==='top'?'bottom':'top';
  const fromPane=document.getElementById('bpane-'+fromSection);
  const toPane=document.getElementById('bpane-'+toSection);
  if(!fromPane||!toPane)return;
  const fromTab=bTabs[fromSection]?.[bActiveTab[fromSection]];
  const toTab=bTabs[toSection]?.[bActiveTab[toSection]];
  if(!fromTab||fromTab.cleared||!toTab||toTab.cleared)return;
  const toMeta=BVERSIONS[toTab.version];
  const fromCorpus=fromTab.corpus;
  if(toMeta&&toMeta.corpus!=='all'&&toMeta.corpus!==fromCorpus)return;

  // Find topmost visible verse in fromPane using getBoundingClientRect
  const paneRect=fromPane.getBoundingClientRect();
  let visibleVerse=1, visibleCh=fromTab.chapter;
  for(const el of fromPane.querySelectorAll('.bpane-verse')){
    const r=el.getBoundingClientRect();
    if(r.top>=paneRect.top){
      visibleVerse=parseInt(el.dataset.verse)||1;
      visibleCh=parseInt(el.dataset.chapter)||fromTab.chapter;
      break;
    }
  }

  bSyncing=true;
  const fromBooks=fromCorpus==='nt'?NT_BOOKS:OT_BOOKS;
  const fromBookName=fromBooks[fromTab.bookIdx];
  const toBooks=toTab.corpus==='nt'?NT_BOOKS:OT_BOOKS;

  if(toBooks[toTab.bookIdx]!==fromBookName||toTab.chapter!==visibleCh){
    // Different book or chapter — navigate toPane
    Object.assign(toTab,{
      corpus:fromCorpus,bookIdx:fromTab.bookIdx,chapter:visibleCh,verse:visibleVerse,
      label:(BVERSIONS[toTab.version]?.label||toTab.version)+' · '+fromBookName+' '+visibleCh,
      cleared:false
    });
    bRenderTabBar(toSection);
    bUpdatePickerBtn(toSection);
    await bLoadPassageInfinite(toSection,fromCorpus,fromTab.bookIdx,visibleCh,visibleVerse);
    // After load, scroll to exact verse using rect-based calculation
    await new Promise(r=>setTimeout(r,120));
    const targetEl=toPane.querySelector('[data-verse="'+visibleVerse+'"]');
    if(targetEl)toPane.scrollTop=bScrollTopFor(toPane,targetEl);
  } else {
    // Same chapter — temporarily pause sync on toPane to avoid echo
    const listener=toPane._syncListener;
    if(listener)toPane.removeEventListener('scroll',listener);
    const targetEl=toPane.querySelector('[data-verse="'+visibleVerse+'"]');
    if(targetEl)toPane.scrollTop=bScrollTopFor(toPane,targetEl);
    if(listener)setTimeout(()=>toPane.addEventListener('scroll',listener,{passive:true}),120);
  }
  setTimeout(()=>{bSyncing=false;},160);
}


/* ════════════════════════════════════════════════════════
   TAB MANAGEMENT
════════════════════════════════════════════════════════ */

function bRenderTabBar(section){
  const tabsEl=document.getElementById('bpane-'+section+'-tabs');
  if(!tabsEl)return;
  const tabs=bTabs[section];
  const activeIdx=bActiveTab[section];
  tabsEl.innerHTML='';

  if(tabs.length===0){
    const hint=document.createElement('span');
    hint.className='btab-hint';hint.textContent='Click + to add a tab';
    tabsEl.appendChild(hint);
  }

  tabs.forEach((tab,i)=>{
    const btn=document.createElement('button');
    btn.className='btab'+(i===activeIdx?' active':'');
    btn.draggable=true;btn.title=(BVERSIONS[tab.version]?.label||tab.version.toUpperCase())+' — click to switch version';
    const vspan=document.createElement('span');
    vspan.className='btab-ver';
    vspan.textContent=BVERSIONS[tab.version]?.label||tab.version.toUpperCase();
    btn.appendChild(vspan);
    const x=document.createElement('button');
    x.className='btab-x';x.textContent='×';x.title='Close tab';
    x.addEventListener('click',e=>{e.stopPropagation();bCloseTab(section,i);});
    btn.appendChild(x);
    btn.addEventListener('click',e=>{
      if(i===activeIdx){
        // Active tab clicked → show version dropdown
        bShowTabVersionPopup(e, section, i);
      } else {
        bActivateTab(section,i);
      }
    });
    btn.addEventListener('dragstart',e=>{
      bDragState={section,tabIdx:i,label:vspan.textContent,version:tab.version,tab:{...tab}};
      e.dataTransfer.effectAllowed='move';
      const ghost=document.createElement('div');
      ghost.className='btab-drag-ghost';ghost.textContent=vspan.textContent;
      document.body.appendChild(ghost);e.dataTransfer.setDragImage(ghost,0,0);
      setTimeout(()=>ghost.remove(),0);
    });
    tabsEl.appendChild(btn);
  });
}

function bShowTabVersionPopup(e, section, tabIdx){
  e.stopPropagation();
  const tab=bTabs[section][tabIdx];
  if(!tab)return;
  let popup=document.getElementById('btab-ver-popup');
  if(!popup){popup=document.createElement('div');popup.id='btab-ver-popup';document.body.appendChild(popup);}
  // Toggle: if already showing for this tab, close it
  if(popup.classList.contains('show')&&popup.dataset.section===section&&popup.dataset.tabIdx===String(tabIdx)){
    popup.classList.remove('show');return;
  }
  popup.dataset.section=section;popup.dataset.tabIdx=String(tabIdx);

  const corpus=tab.corpus;
  const isCleared=tab.cleared; // new empty tab — show all versions
  const groups={Greek:[],Hebrew:[],Latin:[],English:[]};
  Object.entries(BVERSIONS).forEach(([k,v])=>{
    const compatible=isCleared||v.corpus==='all'||(v.corpus===corpus);
    const disabled=!compatible||(!bOnline&&!v.offline);
    (groups[v.group]=groups[v.group]||[]).push({k,v,disabled,current:tab.version===k});
  });
  popup.innerHTML='<div class="bver-group-title">'+(typeof t==="function"?t('bible.switch-ver'):"Switch version")+'</div>'+
    Object.entries(groups).filter(([,items])=>items.length).map(([g,items])=>
      `<div class="bver-group">${g}</div>`+
      items.map(({k,v,disabled,current})=>
        `<div class="bver-opt${disabled?' disabled':''}${current?' current':''}" data-ver="${k}" data-sec="${section}" data-idx="${tabIdx}">
          ${v.label}${current?' ✓':''}${!v.offline?' <span class="bver-online">●</span>':''}
          ${disabled&&!v.offline&&!bOnline?'<span class="bver-note">offline</span>':''}
          ${disabled&&v.corpus!=='all'&&v.corpus!==corpus?'<span class="bver-note">incompatible</span>':''}
        </div>`
      ).join('')
    ).join('');
  popup.querySelectorAll('.bver-opt:not(.disabled)').forEach(opt=>{
    opt.addEventListener('click',()=>{
      popup.classList.remove('show');
      const ver=opt.dataset.ver;
      const sec=opt.dataset.sec;
      const idx=parseInt(opt.dataset.idx);
      const t=bTabs[sec][idx];
      if(!t)return;
      t.version=ver;
      t.label=`${BVERSIONS[ver]?.label||ver} · ${t.label.split('·').slice(1).join('·').trim()||t.label}`;
      bRenderTabBar(sec);
      if(!t.cleared)bLoadPassageInfinite(sec,t.corpus,t.bookIdx,t.chapter,t.verse||1);
    });
  });
  const rect=e.target.getBoundingClientRect();
  popup.style.top=(rect.bottom+2)+'px';
  popup.style.left=Math.max(4,rect.left)+'px';
  popup.classList.add('show');
  setTimeout(()=>document.addEventListener('click',()=>popup.classList.remove('show'),{once:true}),10);
}

function bActivateTab(section,idx){
  bActiveTab[section]=idx;
  bFocusSection(section);
  bRenderTabBar(section);
  const tab=bTabs[section][idx];
  if(tab){
    // Always update targetSection so picker loads into correct section
    bPicker.targetSection=section;
    if(!tab.cleared){
      bUpdatePickerBtn(section);
      bUpdateNavBtns(section,tab.version,tab.corpus,tab.bookIdx,tab.chapter);
      bLoadPassageInfinite(section,tab.corpus,tab.bookIdx,tab.chapter,tab.verse||1);
    } else {
      bUpdatePickerBtn(section);
    }
  }
}

function bCloseTab(section,idx){
  const tabs=bTabs[section];
  tabs.splice(idx,1);
  if(bActiveTab[section]>=tabs.length)bActiveTab[section]=tabs.length-1;
  bRenderTabBar(section);
  if(bActiveTab[section]>=0){
    const tab=tabs[bActiveTab[section]];
    if(tab)bLoadPassageInfinite(section,tab.corpus,tab.bookIdx,tab.chapter,tab.verse||1);
  } else {
    bClearPane(section);
  }
}

function bAddTab(section){
  if(bTabs[section].length>=MAX_TABS){toast(typeof t==='function'?t('toast.max-tabs'):('Maximum '+MAX_TABS+' tabs per pane'));return;}
  bFocusSection(section);
  // Default version: CUV Simplified if UI is Chinese, NET if online, SBLGNT if offline
  const isChinese=(typeof LANG_UI!=='undefined'&&LANG_UI==='zh');
  const defVer=isChinese?'cuv_s':(bOnline?'net':'sblgnt');
  bTabs[section].push({version:defVer,corpus:'ot',bookIdx:0,chapter:1,verse:1,label:BVERSIONS[defVer]?.label||defVer.toUpperCase(),cleared:true});
  bActiveTab[section]=bTabs[section].length-1;
  bRenderTabBar(section);
  bClearPane(section);
  // Open picker
  bOpenPickerForSection(section);
}

/* ── Focus section ──────────────────────────────────── */
function bFocusSection(section){
  bFocusedSection=section;
  ['top','bottom'].forEach(s=>{
    const sec=document.getElementById('bpane-'+s+'-section');
    if(!sec)return;
    if(bSplitOpen){
      sec.style.outline=s===section?'2px solid var(--sig)':'2px solid transparent';
      sec.style.outlineOffset='-2px';
    } else {
      sec.style.outline='none';
    }
  });
}

/* ════════════════════════════════════════════════════════
   BOOK / CHAPTER / VERSE PICKER  (accordion row style)
════════════════════════════════════════════════════════ */

/* ── Per-pane picker functions ── */
function bPickerOpenFor(section){
  bFocusSection(section);
  bPicker.targetSection=section;
  const container=document.getElementById('bpicker-container-'+section);
  if(!container)return;
  const isVisible=container.style.display!=='none'&&container.children.length>0;
  // Close other pane's picker if open
  const other=section==='top'?'bottom':'top';
  const otherC=document.getElementById('bpicker-container-'+other);
  if(otherC&&otherC.style.display!=='none'){otherC.innerHTML='';otherC.style.display='none';if(bPicker.openSection===other)bPicker.open=false;}
  if(isVisible||bPicker.openSection===section){
    container.innerHTML='';container.style.display='none';
    bPicker.open=false;bPicker.openSection=null;
    bPicker.state='closed';
    return;
  }
  bPicker.open=true;bPicker.openSection=section;
  bPicker.state='books';
  bPickerRenderFor(section);
}
// Legacy alias — opens for currently focused section
function bPickerOpen(){bPickerOpenFor(bFocusedSection);}

function bPickerClose(){
  const section=bPicker.openSection||bFocusedSection;
  const c=document.getElementById('bpicker-container-'+section);
  if(c){c.innerHTML='';c.style.display='none';}
  bPicker.open=false;bPicker.openSection=null;
  bPicker.state='closed';
  bUpdatePickerBtn(section);
}
function bPickerCollapseToBooks(){
  bPicker.state='books';bPicker.chapter=1;bPicker.verse=1;
  bPickerRenderFor(bPicker.openSection||bFocusedSection);
}
function bUpdatePickerBtn(section){
  if(!section)section=bFocusedSection;
  const btn=document.getElementById('bpicker-btn-'+section);
  if(!btn)return;
  const tab=bTabs[section]?.[bActiveTab[section]];
  if(tab&&!tab.cleared){
    const isChinese=(typeof LANG_UI!=='undefined'&&LANG_UI==='zh');
    const books=tab.corpus==='nt'
      ?(isChinese?NT_BOOKS_ZH:NT_BOOKS)
      :(isChinese?OT_BOOKS_ZH:OT_BOOKS);
    btn.textContent=(books[tab.bookIdx]||'')+' '+tab.chapter+':'+(tab.verse||1);
  } else btn.textContent=typeof t==='function'?t('bible.select'):'Select passage…';
}
function bPickerRenderFor(section){
  const container=document.getElementById('bpicker-container-'+section);
  if(!container)return;
  container.innerHTML='';
  container.appendChild(bBuildAccordion());
  container.style.display='block';
}
function bPickerRender(){bPickerRenderFor(bPicker.openSection||bFocusedSection);}

/* ── Accordion: books in rows, expansion after selected row ── */
function bBuildAccordion(){
  const wrap=document.createElement('div');
  wrap.className='bpg-accordion';

  // Measure how many squares fit per row. Each sq is 36px + 3px gap;
  // container ~panel width - 32px padding. (Previously measured
  // '#sp-bible'/'#side-panel', neither of which exists in the DOM — that
  // always fell through to a hardcoded 288px fallback regardless of the
  // panel's actual width, which is why this always showed 7 books per
  // row no matter how the panel was sized. Now measures the real panel.)
  const spEl=document.getElementById('bible-panel');
  const panelW=(spEl?spEl.offsetWidth:320)-32||280;
  const sqW=36+3;
  const perRow=Math.max(4,Math.floor(panelW/sqW));

  function buildTestamentSection(label, books, abbrs, corpusKey){
    // Break books into rows
    const rows=[];
    for(let i=0;i<books.length;i+=perRow) rows.push(books.slice(i,i+perRow).map((_,j)=>({book:books[i+j],abbr:abbrs[i+j]||books[i+j].slice(0,3),idx:i+j})));

    const section=document.createElement('div');
    const testLabel=document.createElement('div');
    testLabel.className='bpg-testament-label';testLabel.textContent=label;
    section.appendChild(testLabel);

    rows.forEach((rowBooks,rowIdx)=>{
      // Book row
      const rowEl=document.createElement('div');
      rowEl.className='bpg-grid';rowEl.style.paddingBottom='0';rowEl.style.marginBottom='0';
      rowBooks.forEach(({book,abbr,idx})=>{
        const sq=document.createElement('button');
        const isActive=bPicker.corpus===corpusKey&&bPicker.bookIdx===idx;
        sq.className='bpg-sq'+(isActive?' active':'');
        sq.textContent=abbr;sq.title=book;
        sq.addEventListener('click',()=>{
          if(isActive&&(bPicker.state==='chapters'||bPicker.state==='verses')){
            // Same book → collapse
            bPicker.state='books';
          } else {
            bPicker.corpus=corpusKey;
            bPicker.bookIdx=idx;
            bPicker.chapter=1;bPicker.verse=1;
            bPicker.state='chapters';
          }
          bPickerRender();
        });
        rowEl.appendChild(sq);
      });
      section.appendChild(rowEl);

      // If selected book is in this row, insert expansion panel after
      const selectedInThisRow=bPicker.corpus===corpusKey&&
        rowBooks.some(r=>r.idx===bPicker.bookIdx)&&
        (bPicker.state==='chapters'||bPicker.state==='verses');
      if(selectedInThisRow){
        const expansion=bBuildExpansion(corpusKey);
        section.appendChild(expansion);
      }
    });
    return section;
  }

  const isChinese=(typeof LANG_UI!=='undefined'&&LANG_UI==='zh');
  wrap.appendChild(buildTestamentSection(typeof t==='function'?t('bible.ot'):'OLD TESTAMENT',OT_BOOKS,isChinese?OT_ABBR_ZH:OT_ABBR,'ot'));
  wrap.appendChild(buildTestamentSection(typeof t==='function'?t('bible.nt'):'NEW TESTAMENT',NT_BOOKS,isChinese?NT_ABBR_ZH:NT_ABBR,'nt'));
  return wrap;
}

/* ── Expansion panel: chapters left (4 col) | verses right (4 col) ── */
function bBuildExpansion(corpusKey){
  const corpus=bPicker.corpus;
  const bookIdx=bPicker.bookIdx;
  const chapter=bPicker.chapter;
  const books=corpus==='nt'?NT_BOOKS:OT_BOOKS;
  const maxCh=bMaxChapters(corpus,bookIdx);

  const panel=document.createElement('div');
  panel.className='bpg-expansion';

  // ── Header row: BOOK | (VERSE when open) | × ──
  const hdr=document.createElement('div');
  hdr.className='bpg-exp-hdr';

  const bookSpan=document.createElement('span');
  bookSpan.className='bpg-exp-book';
  bookSpan.textContent=(books[bookIdx]||'').toUpperCase();
  hdr.appendChild(bookSpan);

  if(bPicker.state==='verses'){
    const vLbl=document.createElement('span');
    vLbl.className='bpg-exp-verlabel';vLbl.textContent='VERSE';
    hdr.appendChild(vLbl);
  }

  const xBtn=document.createElement('button');
  xBtn.className='bpg-close-btn';xBtn.textContent='×';xBtn.title='Close';
  xBtn.addEventListener('click',e=>{e.stopPropagation();bPickerCollapseToBooks();});
  hdr.appendChild(xBtn);
  panel.appendChild(hdr);

  // ── Body: side-by-side columns ──
  const body=document.createElement('div');
  body.className='bpg-exp-body';
  // flex-direction:row (default) so chapters left, verses right

  // Left: Chapter grid (4 columns)
  const chCol=document.createElement('div');
  chCol.className='bpg-exp-col bpg-exp-chapters';
  const chGrid=document.createElement('div');
  chGrid.className='bpg-grid bpg-grid-4';
  for(let ch=1;ch<=maxCh;ch++){
    const sq=document.createElement('button');
    const isActive=bPicker.state==='verses'&&chapter===ch;
    sq.className='bpg-sq'+(isActive?' active':'');
    sq.textContent=ch;
    sq.addEventListener('click',()=>{
      if(bPicker.state==='verses'&&bPicker.chapter===ch){
        bPicker.state='chapters';bPicker.chapter=ch;bPickerRender();
      } else {
        bPicker.chapter=ch;bPicker.verse=1;bPicker.state='verses';bPickerRender();
      }
    });
    chGrid.appendChild(sq);
  }
  chCol.appendChild(chGrid);
  body.appendChild(chCol);

  // Right: Verse grid (4 columns) — only when state==='verses'
  if(bPicker.state==='verses'){
    let maxV=50;
    if(bibleIndex){
      const k=corpus==='nt'?'sblgnt':'wlc';
      const idx=bibleIndex[k];
      if(idx&&idx[bookIdx]&&idx[bookIdx].cv[chapter-1])maxV=idx[bookIdx].cv[chapter-1];
    }
    const vCol=document.createElement('div');
    vCol.className='bpg-exp-col bpg-exp-verses';
    const vGrid=document.createElement('div');
    vGrid.className='bpg-grid bpg-grid-4';
    for(let v=1;v<=maxV;v++){
      const sq=document.createElement('button');
      sq.className='bpg-sq'+(bPicker.verse===v?' active':'');
      sq.textContent=v;
      sq.addEventListener('click',()=>bPickerConfirm(v));
      vGrid.appendChild(sq);
    }
    vCol.appendChild(vGrid);
    body.appendChild(vCol);
  }

  panel.appendChild(body);
  return panel;
}

async function bPickerConfirm(verse){
  bPicker.verse=verse;
  const section=bPicker.targetSection||bFocusedSection;
  const {corpus,bookIdx,chapter}=bPicker;
  const books=corpus==='nt'?NT_BOOKS:OT_BOOKS;
  const bookName=books[bookIdx]||'';

  let tab=bTabs[section][bActiveTab[section]];
  let chosenVersion;

  if(!tab){
    // No tab at all — create one with default version
    if(bTabs[section].length>=MAX_TABS){toast(typeof t==='function'?t('toast.max-tabs'):('Maximum '+MAX_TABS+' tabs'));return;}
    const _isChinese=(typeof LANG_UI!=='undefined'&&LANG_UI==='zh');
    chosenVersion=_isChinese?'cuv_s':(bOnline?'net':(corpus==='nt'?'sblgnt':'wlc'));
    bTabs[section].push({version:chosenVersion,corpus,bookIdx,chapter,verse,
      label:bookName+' '+chapter+':'+verse,cleared:false});
    bActiveTab[section]=bTabs[section].length-1;
    tab=bTabs[section][bActiveTab[section]];
  } else if(tab.cleared){
    // Empty tab — keep the version the user chose in the dropdown, don't override
    chosenVersion=tab.version;
    // Validate version vs corpus
    const vMeta=BVERSIONS[chosenVersion];
    if(vMeta&&vMeta.corpus!=='all'){
      if((vMeta.corpus==='ot'&&corpus==='nt')||(vMeta.corpus==='nt'&&corpus==='ot')){
        const side=corpus==='nt'?'New Testament':'Old Testament';
        const other=corpus==='nt'?'Old Testament':'New Testament';
        // Show error in pane immediately, don't close picker
        const pane=document.getElementById('bpane-'+section);
        if(pane)pane.innerHTML=`<div class="bpane-error">⚠ ${vMeta.label} does not cover the ${side}. Please select a ${side} passage, or click the tab to switch to a compatible version.</div>`;
        bPickerClose();
        return;
      }
    }
    Object.assign(tab,{corpus,bookIdx,chapter,verse,
      label:bookName+' '+chapter+':'+verse,cleared:false});
  } else {
    // Existing tab with passage — update passage, keep version
    chosenVersion=tab.version;
    Object.assign(tab,{corpus,bookIdx,chapter,verse,
      label:bookName+' '+chapter+':'+verse});
  }

  bRenderTabBar(section);
  bPickerClose();
  await bLoadPassageInfinite(section,corpus,bookIdx,chapter,verse);
}

/* ════════════════════════════════════════════════════════
   INFINITE SCROLL ENGINE (fixed)
════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════════════
   SPLIT PANE
════════════════════════════════════════════════════════ */
function bToggleSplit_(){
  if(bSplitOpen){
    bSplitOpen=false;
    // Remove scroll sync listeners before closing split
    bRewireScrollSync();
    document.getElementById('bpane-divider').style.display='none';
    const bot=document.getElementById('bpane-bottom-section');
    if(bot){bot.style.display='none';}
    // Hard reset bottom pane DOM
    const bpaneBot=document.getElementById('bpane-bottom');
    if(bpaneBot){bpaneBot.innerHTML=(typeof t==="function"?'<div class="bpane-empty">'+t('bible.no-passage')+'</div>':'<div class="bpane-empty">No passage selected yet.<br>Click "Select passage\u2026" above to begin.</div>');bpaneBot.onscroll=null;}
    document.getElementById('bpanel-split-btn')?.classList.remove('on');
    bFocusSection('top');
  } else {
    bOpenSplit();
  }
}

function bOpenSplit(){
  if(bSplitOpen)return;
  bSplitOpen=true;
  // Reset bottom state
  bTabs.bottom=[];bActiveTab.bottom=-1;
  bLoadedChapters.bottom=[];bLoadedBook.bottom=null;
  document.getElementById('bpane-divider').style.display='block';
  const bot=document.getElementById('bpane-bottom-section');
  if(bot){bot.style.display='flex';bot.style.flex='1';bot.style.flexDirection='column';}
  const top=document.getElementById('bpane-top-section');
  if(top)top.style.flex='1';
  document.getElementById('bpanel-split-btn')?.classList.add('on');
  bRenderTabBar('bottom');
  bClearPane('bottom');
  // Focus: top has content → focus bottom; else focus top
  const topHasContent=bTabs.top.length>0&&bLoadedBook.top!=null;
  bFocusSection(topHasContent?'bottom':'top');
}

function bStartSplitDrag(e){
  e.preventDefault();
  const body=document.getElementById('bpanel-body');
  const topSec=document.getElementById('bpane-top-section');
  const botSec=document.getElementById('bpane-bottom-section');
  if(!body||!topSec||!botSec)return;
  const startY=e.clientY,startTopH=topSec.offsetHeight;
  const totalH=body.offsetHeight;
  const mm=ev=>{
    const delta=ev.clientY-startY;
    const newH=Math.max(80,Math.min(totalH-80-5,startTopH+delta));
    topSec.style.flex=`0 0 ${newH}px`;
    botSec.style.flex=`0 0 ${totalH-newH-5}px`;
  };
  const mu=()=>{document.removeEventListener('mousemove',mm);document.removeEventListener('mouseup',mu);};
  document.addEventListener('mousemove',mm);document.addEventListener('mouseup',mu);
}

function bDragOver(e,section){
  if(!bDragState||bDragState.section!=='top'||section!=='bottom')return;
  e.preventDefault();e.dataTransfer.dropEffect='move';
  document.getElementById('bpane-bottom-section')?.classList.add('drop-target');
}
function bDragLeave(e,section){
  document.getElementById('bpane-'+section+'-section')?.classList.remove('drop-target');
}
function bDrop(e,section){
  e.preventDefault();
  document.getElementById('bpane-'+section+'-section')?.classList.remove('drop-target');
  if(!bDragState||bDragState.section==='bottom')return;
  if(!bSplitOpen)bOpenSplit();
  const srcTabs=bTabs[bDragState.section];
  const tab=srcTabs.splice(bDragState.tabIdx,1)[0];
  if(bActiveTab.top>=srcTabs.length)bActiveTab.top=srcTabs.length-1;
  bTabs.bottom.push(tab);
  bActiveTab.bottom=bTabs.bottom.length-1;
  bRenderTabBar('top');bRenderTabBar('bottom');
  if(bActiveTab.top>=0){const t=bTabs.top[bActiveTab.top];if(t)bLoadPassageInfinite('top',t.corpus,t.bookIdx,t.chapter,t.verse||1);}
  bLoadPassageInfinite('bottom',tab.corpus,tab.bookIdx,tab.chapter,tab.verse||1);
  bFocusSection('bottom');bDragState=null;
}

/* ════════════════════════════════════════════════════════
   SEPARATE PANEL MANAGEMENT (Projects + Bible independent)
════════════════════════════════════════════════════════ */

/* bPanelOpen declared at top of file */
let bProjOpen=false;

function openBible_(){
  if(typeof _isModalOpen==='function'&&_isModalOpen())return;
  const panel=document.getElementById('bible-panel');
  if(!panel)return;
  // Toggle: clicking button when panel open closes it
  if(bPanelOpen&&!bPinned){closeBible();return;}
  if(!bPanelOpen){
    bPanelOpen=true;
    if(!bPinned)panel.classList.add('open');
    bUpdateOfflineBar();
    bLoadIndex().then(()=>{bRenderTabBar('top');bUpdatePickerBtn('top');}).catch(()=>{bRenderTabBar('top');});
  }
  // NOTE: Does NOT close Projects — both panels can be open simultaneously
}
function closeBible(){
  if(bPinned)return; // pinned — X just hides visually
  const panel=document.getElementById('bible-panel');
  if(panel)panel.classList.remove('open');
  bPanelOpen=false;
  bPickerClose();
}
/* ── Bible panel pin ── */
let bPinned=false;
try{bPinned=JSON.parse(localStorage.getItem('bPinned')||'false');}catch(_){}

function bTogglePin(){
  bPinned=!bPinned;
  localStorage.setItem('bPinned',JSON.stringify(bPinned));
  document.getElementById('bpanel-pin-btn')?.classList.toggle('on',bPinned);
  bApplyPin();
}
function bApplyPin(){
  const panel=document.getElementById('bible-panel');
  const divider=document.getElementById('bible-side-divider');
  const app=document.getElementById('app');
  if(!panel||!app)return;
  const ew=document.getElementById('editor-wrap');
  if(bPinned){
    panel.classList.remove('open');
    panel.classList.add('pinned');
    if(ew){ew.style.flex='1';ew.style.minWidth='0';ew.style.overflow='hidden';}
    if(divider){
      divider.style.display='block';
      // Guard: only remove from parent if it actually has one
      if(panel.parentNode) panel.parentNode.removeChild(panel);
      if(divider.parentNode) divider.parentNode.removeChild(divider);
      app.appendChild(divider);
      app.appendChild(panel);
    }
    bPanelOpen=true;
    bLoadIndex().then(()=>{bRenderTabBar('top');bUpdatePickerBtn('top');}).catch(()=>{});
    // Wire divider drag once
    if(divider&&!divider._wired){
      divider._wired=true;
      divider.addEventListener('mousedown',e=>{
        e.preventDefault();
        const startX=e.clientX,startW=panel.offsetWidth;
        const mm=ev=>{panel.style.width=Math.max(240,Math.min(700,startW-(ev.clientX-startX)))+'px';};
        const mu=()=>{document.removeEventListener('mousemove',mm);document.removeEventListener('mouseup',mu);};
        document.addEventListener('mousemove',mm);document.addEventListener('mouseup',mu);
      });
    }
  } else {
    panel.classList.remove('pinned');
    if(divider)divider.style.display='none';
    // Move panel back to body if it was moved into #app
    if(panel.parentNode && panel.parentNode!==document.body){
      document.body.appendChild(panel);
    }
    // Restore editor-wrap
    if(ew){ew.style.flex='';ew.style.minWidth='';ew.style.overflow='';}
    panel.classList.add('open');
    bPanelOpen=true;
  }
}

function openProjects(){
  const panel=document.getElementById('proj-panel');
  if(!panel)return;
  // Toggle: clicking button when panel open closes it
  if(bProjOpen){closeProjects();return;}
  bProjOpen=true;
  panel.classList.add('open');
  if(typeof renderProjPanel==='function')renderProjPanel();
  // NOTE: Does NOT close Bible Module — both panels can be open simultaneously
}
function closeProjects(){
  const panel=document.getElementById('proj-panel');
  if(panel)panel.classList.remove('open');
  bProjOpen=false;
}

/* Click outside to close panels */
document.addEventListener('mousedown',e=>{
  // Close Bible only when clicking truly outside — not on Projects panel/button
  if(bPanelOpen&&!bPinned){
    const p=document.getElementById('bible-panel');
    if(p&&!p.contains(e.target)&&
       !e.target.closest('#btn-bible')&&
       !e.target.closest('#btn-projects')&&
       !e.target.closest('#btn-projects-s1')&&
       !document.getElementById('proj-panel')?.contains(e.target)&&
       !document.getElementById('btab-ver-popup')?.contains(e.target)){
      closeBible();
    }
  }
  // Close Projects only when clicking truly outside — not on Bible panel/button
  if(bProjOpen){
    const p=document.getElementById('proj-panel');
    if(p&&p.classList.contains('open')&&
       !p.contains(e.target)&&
       !e.target.closest('#btn-projects')&&
       !e.target.closest('#btn-projects-s1')&&
       !e.target.closest('#btn-bible')&&
       !document.getElementById('bible-panel')?.contains(e.target)&&
       !e.target.closest('#bbar')){
      closeProjects();
    }
  }
});

/* Escape closes Bible panel */
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    if(bPicker.open){e.preventDefault();bPickerClose();return;}
    if(bPanelOpen){e.preventDefault();closeBible();return;}
    if(bProjOpen){e.preventDefault();closeProjects();return;}
  }
  // Projects/Bible hotkeys handled in app.js
});

/* Bible panel resize handle */
/* ── Full Bible Module reset (called on Ctrl+Shift+R) ──────── */
async function bFullReset(){
  // Close and unpin the Bible panel
  if(bPinned){bPinned=false;localStorage.setItem('bPinned','false');bApplyPin();}
  closeBible();
  // Reset all tab state
  bTabs.top=[];bTabs.bottom=[];
  bActiveTab.top=-1;bActiveTab.bottom=-1;
  bLoadedChapters.top=[];bLoadedChapters.bottom=[];
  bLoadedBook.top=null;bLoadedBook.bottom=null;
  bSplitOpen=false;bScrollLocked=false;bFocusedSection='top';
  bPicker.open=false;bPicker.state='closed';bPicker.openSection=null;
  // Reset split pane UI
  document.getElementById('bpane-divider').style.display='none';
  const bot=document.getElementById('bpane-bottom-section');
  if(bot)bot.style.display='none';
  document.getElementById('bpanel-split-btn')?.classList.remove('on');
  document.getElementById('b-scroll-lock-btn')?.classList.remove('on');
  // Clear pane content
  ['top','bottom'].forEach(s=>{
    const p=document.getElementById('bpane-'+s);
    if(p){p.innerHTML=(typeof t==="function"?'<div class="bpane-empty">'+t('bible.no-passage')+'</div>':'<div class="bpane-empty">No passage selected yet.<br>Click "Select passage\u2026" above to begin.</div>');p.onscroll=null;}
    const c=document.getElementById('bpicker-container-'+s);
    if(c){c.innerHTML='';c.style.display='none';}
    const btn=document.getElementById('bpicker-btn-'+s);
    if(btn)btn.textContent=typeof t==='function'?t('bible.select'):'Select passage…';
    bRenderTabBar(s);
  });
  // Clear IDB Bible text cache
  await bClearCache(true);
}

async function bClearCache(silent){
  try{
    if(!idb)idb=await bOpenIDB();
    const store=idb.transaction('texts','readwrite').objectStore('texts');
    // Delete all text: keys (not the index)
    await new Promise((res,rej)=>{
      const req=store.openCursor();
      req.onsuccess=e=>{
        const cursor=e.target.result;
        if(cursor){if(cursor.key.startsWith('text:'))cursor.delete();cursor.continue();}
        else res();
      };
      req.onerror=rej;
    });
    // Clear in-memory cache
    bibleCache={};
    if(!silent)toast(typeof t==='function'?t('toast.bible-cleared'):'Bible cache cleared');
  }catch(e){if(!silent)toast((typeof t==='function'?t('toast.cache-error'):'Could not clear cache: ')+e.message);}
}

/* ════════════════════════════════════════════════════════
   MISSING STUBS — functions referenced but not present in
   this build snapshot. Provide safe no-op / alias versions
   so the app doesn't throw on load.
════════════════════════════════════════════════════════ */
// Side-panel aliases (spOpen/spClose wrap Projects + Bible panels)
function spOpen(which){
  if(which==='projects') openProjects();
  else if(which==='bible') openBible_();
}
function spClose(){
  closeProjects();
  closeBible();
}
function spSwitch(which){ spOpen(which); }
function spTogglePin(){ bTogglePin(); }
function spUpdateUI(){ /* no-op in this build */ }
function spOpenFromS1(){ openProjects(); }
var spPinned=false; var spOpen_=false;

// Panel lock stubs (pinned-open feature)
function bToggleLock(){ bTogglePin(); }
function bToggleFocusedPanelLock_(){ bTogglePin(); }
function toggleProjLock(){ /* no-op */ }
function applyProjLock(){ /* no-op */ }

// bClearPane — clear a pane's content and reset its tab
function bClearPane(section){
  const p=document.getElementById('bpane-'+section);
  if(p){
    p.innerHTML=(typeof t==="function"?'<div class="bpane-empty">'+t('bible.no-passage')+'</div>':'<div class="bpane-empty">No passage selected yet.<br>Click "Select passage…" above to begin.</div>');
    p.onscroll=null;
  }
  const btn=document.getElementById('bpicker-btn-'+section);
  if(btn)btn.textContent=typeof t==='function'?t('bible.select'):'Select passage…';
  bUpdateNavBtns(section,'sblgnt','nt',0,1);
}

// bOpenPickerForSection — alias for bPickerOpenFor
function bOpenPickerForSection(section){ bPickerOpenFor(section); }

/* ── Ctrl+Shift+[ / Ctrl+Shift+] — prev/next chapter ── */
document.addEventListener('keydown',function(ev){
  if(!(ev.ctrlKey||ev.metaKey)||!ev.shiftKey)return;
  // [ = prev chapter, ] = next chapter
  if(ev.key!=='['&&ev.key!==']'&&ev.key!=='{'&&ev.key!=='}')return;
  // Only fire when Bible panel is open
  const panel=document.getElementById('bible-panel');
  if(!panel||!panel.classList.contains('open'))return;
  ev.preventDefault();
  const dir=(ev.key==='['||ev.key==='{')? 'prev':'next';
  const section=window.bFocusedSection||'top';
  if(typeof bNavChapter==='function') bNavChapter(section,dir);
});

document.addEventListener('DOMContentLoaded',()=>{
  // Bible panel resize handle
  const bpr=document.getElementById('bpanel-resize')||{addEventListener:()=>{}};

  bUpdateOfflineBar();
  bRenderTabBar('top');bRenderTabBar('bottom');
  bUpdatePickerBtn();
  spUpdateUI();

  // Restore pinned state after page refresh — deferred to openEditor
  // (don't call bApplyPin here; #app may be hidden on Screen 1)
  if(bPinned){
    document.getElementById('bpanel-pin-btn')?.classList.add('on');
    // bApplyPin will be called by openEditor() once the canvas is visible
  }

  // Expose globals
  // Expose all globals
  window.openBible=openBible_; window.closeBible=closeBible;
  window.bNavChapter=bNavChapter; window.bTogglePin=bTogglePin;
  window.bFullReset=bFullReset; window.bClearCache=bClearCache;
  window.bTogglePin=bTogglePin;
  window.openProjects=openProjects; window.closeProjects=closeProjects;
  window.spOpen=spOpen; window.spClose=spClose; window.spSwitch=spSwitch;
  window.spTogglePin=spTogglePin;
  window.bToggleLock=bToggleLock; window.bToggleSplit=bToggleSplit_;
  window.bAddSplitPane=bOpenSplit;
  window.bSetFontSize=bSetFontSize; window.bToggleScrollLock=bToggleScrollLock;
  window.bFocusSection=bFocusSection; window.bAddTab=bAddTab;
  window.bClearPane=bClearPane;
  window.bStartSplitDrag=bStartSplitDrag;
  window.bDragOver=bDragOver;window.bDragLeave=bDragLeave;window.bDrop=bDrop;
  window.bPickerOpen=bPickerOpen;window.bPickerClose=bPickerClose;
  window.bOpenPickerForSection=bOpenPickerForSection;
  window.bToggleFocusedPanelLock=bToggleFocusedPanelLock_;
  window.toggleProjLock=toggleProjLock;window.applyProjLock=applyProjLock;
  window.bChangeTabVersion=bChangeTabVersion;
  window.spOpenFromS1=spOpenFromS1;
  window.s2Init=s2Init;window.s2ShowTab=s2ShowTab;window.s2Confirm=s2Confirm;
  window.s2UpdateBooks=s2UpdateBooks;window.s2UpdateChapters=s2UpdateChapters;
  window.s2UpdateVerses=s2UpdateVerses;window.s2PreviewPassage=s2PreviewPassage;
});

/* ── Escape ─────────────────────────────────────────── */
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    if(bPicker.open){e.preventDefault();bPickerClose();return;}
    if(typeof spPinned!=='undefined'&&!spPinned&&typeof spOpen_!=='undefined'&&spOpen_){
      e.preventDefault();spClose();return;
    }
  }
});

/* ════════════════════════════════════════════════════════
   SCREEN 2 — BIBLE PICKER
════════════════════════════════════════════════════════ */
let s2Mode='paste',sessionVersionLabel='',s2PickerInited=false;

function s2Init(){
  s2PickerInited=false;s2ShowTab('paste');
  const vi=document.getElementById('s2-version-input');if(vi)vi.value='';
  sessionVersionLabel='';
}
function s2ShowTab(tab){
  s2Mode=tab;
  document.getElementById('s2-tab-paste').classList.toggle('active',tab==='paste');
  document.getElementById('s2-tab-bible').classList.toggle('active',tab==='bible');
  document.getElementById('s2-paste-panel').style.display=tab==='paste'?'block':'none';
  document.getElementById('s2-bible-panel').style.display=tab==='bible'?'flex':'none';
  if(tab==='bible'&&!s2PickerInited){s2PickerInited=true;s2BuildCorpus();bLoadIndex().then(()=>{s2UpdateChapters();s2UpdateVerses();}).catch(()=>{});}
}
function s2BuildCorpus(){
  const sel=document.getElementById('s2b-corpus');if(!sel)return;
  sel.innerHTML='';
  const sess=typeof SESS!=='undefined'?SESS:'greek';
  if(sess==='hebrew'){sel.innerHTML='<option value="ot">'+(typeof t==="function"?t('s2.ot'):'Old Testament')+'</option>';}
  else if(sess==='greek'){sel.innerHTML='<option value="ot">'+(typeof t==="function"?t('s2.ot'):'Old Testament')+'</option><option value="nt">'+(typeof t==="function"?t('s2.nt'):'New Testament')+'</option>';sel.value='ot';}
  else{sel.innerHTML='<option value="ot">'+(typeof t==="function"?t('s2.ot'):'Old Testament')+'</option><option value="nt">'+(typeof t==="function"?t('s2.nt'):'New Testament')+'</option>';sel.value='ot';}
  s2UpdateBooks();s2UpdateVersions();
}
function s2UpdateBooks(){
  const corpus=document.getElementById('s2b-corpus')?.value||'ot';
  const sel=document.getElementById('s2b-book');if(!sel)return;
  const books=corpus==='nt'?NT_BOOKS:OT_BOOKS;
  sel.innerHTML=books.map((b,i)=>`<option value="${i}">${b}</option>`).join('');
  s2UpdateChapters();s2UpdateVersions();
}
function s2UpdateVersions(){
  const corpus=document.getElementById('s2b-corpus')?.value||'ot';
  const sel=document.getElementById('s2b-version');if(!sel)return;
  const sess=typeof SESS!=='undefined'?SESS:'greek';
  sel.innerHTML='';
  if(sess==='greek'){
    if(corpus==='nt')sel.innerHTML='<optgroup label="Greek (offline)"><option value="sblgnt">SBLGNT</option><option value="byz">Byzantine Text</option></optgroup>';
    else sel.innerHTML='<optgroup label="Greek (offline)"><option value="lxx">LXX (Septuagint)</option></optgroup>';
  } else if(sess==='hebrew'){
    sel.innerHTML='<optgroup label="Hebrew (offline)"><option value="wlc">WLC (Hebrew OT)</option></optgroup>';
  } else {
    // 'other' (custom) — NET is first/default, then CUV, then Vulgate
    sel.innerHTML=
      '<optgroup label="English (online)"><option value="net">NET Bible</option></optgroup>'+
      '<optgroup label="Chinese (offline)"><option value="cuv_s">CUV Simplified (和合本简体)</option><option value="cuv_t">CUV Traditional (和合本繁體)</option></optgroup>'+
      '<optgroup label="Latin (offline)"><option value="vulgate">Vulgate</option></optgroup>';
    // Pre-select CUV if a CUV session was set
    const cuvV=window._cuvVersion;
    if(cuvV&&(cuvV==='cuv_s'||cuvV==='cuv_t')) sel.value=cuvV;
    else if(typeof LANG_UI!=='undefined'&&LANG_UI==='zh') sel.value='cuv_s'; // Chinese UI → default to CUV Simplified
    else sel.value='net'; // Default to NET for plain "Other Language"
  }
  s2PreviewPassage();
}
function s2UpdateChapters(){
  const corpus=document.getElementById('s2b-corpus')?.value||'ot';
  const bookIdx=parseInt(document.getElementById('s2b-book')?.value)||0;
  const sel=document.getElementById('s2b-chapter');if(!sel)return;
  let maxCh=50;
  if(bibleIndex){const k=corpus==='nt'?'sblgnt':'wlc';const idx=bibleIndex[k];if(idx&&idx[bookIdx])maxCh=idx[bookIdx].cv.length;}
  sel.innerHTML=Array.from({length:maxCh},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('');
  s2UpdateVerses();
}
function s2UpdateVerses(){
  const corpus=document.getElementById('s2b-corpus')?.value||'ot';
  const bookIdx=parseInt(document.getElementById('s2b-book')?.value)||0;
  const chapter=parseInt(document.getElementById('s2b-chapter')?.value)||1;
  let maxV=30;
  if(bibleIndex){const k=corpus==='nt'?'sblgnt':'wlc';const idx=bibleIndex[k];if(idx&&idx[bookIdx]&&idx[bookIdx].cv[chapter-1])maxV=idx[bookIdx].cv[chapter-1];}
  const opts=Array.from({length:maxV},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('');
  const vs=document.getElementById('s2b-vs'),ve=document.getElementById('s2b-ve');
  if(vs)vs.innerHTML=opts;if(ve){ve.innerHTML=opts;ve.value=maxV;}
  s2PreviewPassage();
}
let s2PrevTimer=null;
function s2PreviewPassage(){
  clearTimeout(s2PrevTimer);
  s2PrevTimer=setTimeout(async()=>{
    const prev=document.getElementById('s2-bible-preview');if(!prev)return;
    const corpus=document.getElementById('s2b-corpus')?.value||'ot';
    const bookIdx=parseInt(document.getElementById('s2b-book')?.value)||0;
    const chapter=parseInt(document.getElementById('s2b-chapter')?.value)||1;
    const vs=parseInt(document.getElementById('s2b-vs')?.value)||1;
    const ve=parseInt(document.getElementById('s2b-ve')?.value)||vs;
    const version=document.getElementById('s2b-version')?.value||'wlc';
    prev.style.display='block';prev.textContent='Loading…';
    try{
      // Route through bGetChapter so NET uses the API, others use local JSON
      const verses=await bGetChapter(version,corpus,bookIdx,chapter);
      if(!verses||!verses.length){prev.textContent='No text found.';return;}
      const slice=verses.slice(vs-1,ve);
      prev.innerHTML=`<div style="font-family:var(--serif);font-size:12px;line-height:1.85">`+
        slice.map((v,i)=>`<span style="color:var(--active);font-size:9px;font-weight:700;font-family:var(--ui)">${vs+i} </span>${escH(String(v))} `).join('')+
      '</div>';
    }catch(e){prev.textContent=e.message==='offline'?'NET requires internet.':'Preview unavailable.';}
  },400);
}
async function s2Confirm(){
  if(s2Mode==='paste'){
    const vi=document.getElementById('s2-version-input');
    if(vi&&vi.value.trim()){
      sessionVersionLabel=vi.value.trim();
      document.getElementById('version-sub').textContent=sessionVersionLabel;
      document.getElementById('version-sub-input').value=sessionVersionLabel;
      const h=document.getElementById('ch-t-lbl');if(h)h.textContent=sessionVersionLabel;
    }
    confirmPaste();
  } else {await s2ConfirmBible();}
}
async function s2ConfirmBible(){
  const corpus=document.getElementById('s2b-corpus')?.value||'ot';
  const bookIdx=parseInt(document.getElementById('s2b-book')?.value)||0;
  const chapter=parseInt(document.getElementById('s2b-chapter')?.value)||1;
  const vs=parseInt(document.getElementById('s2b-vs')?.value)||1;
  const ve=parseInt(document.getElementById('s2b-ve')?.value)||vs;
  const version=document.getElementById('s2b-version')?.value||'wlc';
  const books=corpus==='nt'?NT_BOOKS:OT_BOOKS;
  const bookName=books[bookIdx]||'';
  const refStr=`${bookName} ${chapter}:${vs}${ve!==vs?'–'+ve:''}`;
  const vLabel=BVERSIONS[version]?.label||version.toUpperCase();
  sessionVersionLabel=vLabel;
  document.getElementById('version-sub').textContent=vLabel;
  document.getElementById('version-sub-input').value=vLabel;
  const refEl=document.getElementById('refin');if(refEl)refEl.value=refStr;
  openEditor();
  let verses=[];
  try{
    // Route through bGetChapter so NET uses the API, others use local JSON
    const allVerses=await bGetChapter(version,corpus,bookIdx,chapter);
    if(allVerses&&allVerses.length) verses=allVerses.slice(vs-1,ve);
  }catch(e){toast('Error: '+e.message);addEmptyRow();return;}
  if(!verses.length){addEmptyRow();return;}
  const isOrig=['sblgnt','byz','lxx','wlc','cuv_s','cuv_t'].includes(version);
  // For single-column sessions (IS_SINGLE=true), always put text in the orig column
  // so it's visible — the translation column is hidden in single-column mode.
  const useOrig=isOrig||(typeof IS_SINGLE!=='undefined'&&IS_SINGLE);
  for(let i=0;i<verses.length;i++){addRow(String(vs+i),useOrig?verses[i]:'',useOrig?'':verses[i],null,null);}
  recomputeIds();
  if(!useOrig){const h=document.getElementById('ch-t-lbl');if(h)h.textContent=vLabel;}
  toast(`Loaded ${refStr} (${vLabel})`);
}

/* ── Change version for the active tab in a pane ─────── */
function bChangeTabVersion(section, version){
  const tab=bTabs[section][bActiveTab[section]];
  if(!tab)return;
  tab.version=version;
  tab.label=`${BVERSIONS[version]?.label||version} · ${tab.label.split('·')[1]||''}`.trim();
  bRenderTabBar(section);
  if(!tab.cleared){
    bLoadPassageInfinite(section,tab.corpus,tab.bookIdx,tab.chapter,tab.verse||1);
  }
}
