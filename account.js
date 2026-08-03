/* ════════════════════════════════════════
   ACCOUNT / CLOUD SYNC — integration layer
   ───────────────────────────────────────
   Bridges the framework-free sync module (sync/phrasing-supabase-sync.js,
   loaded as an ES module and exposed here as window.PhrasingSync — see the
   module bridge script in index.html) into this app's existing classic-
   script world and its localStorage-first project system (PROJ_INDEX_KEY /
   PROJ_DATA_KEY / projIndex() / CURRENT_PROJECT_ID, all defined in app.js).

   Google sign-in only — no email/password, no confirmation emails, no
   password reset, and so no SMTP to configure. The sync module's cloud
   functions all internally require a public.user_profiles row to exist
   (see ensureCloudAccount() in the module) before they'll do anything —
   that requirement isn't something this integration can skip without
   editing the shared module, so instead a meaningless random username is
   generated and saved silently right after Google sign-in (see
   acctAutoCompleteProfile). The user never sees or picks it.

   Hard rule throughout this file: cloud sync is strictly additive. Every
   function here degrades to a silent no-op (never an uncaught rejection,
   never a blocked UI) when the module isn't configured, the browser is
   offline, or the user hasn't completed sign-in — localStorage is always
   the source of truth for the editor itself. This file also never reads,
   writes, enumerates, or references the Bible Module's IndexedDB cache
   (exeg-bible-v3) — only the phrasing project session JSON that
   collectData()/loadData() already use.
════════════════════════════════════════ */

const ACCT_OAUTH_PENDING_KEY = 'exeg-acct-oauth-pending';
const ACCT_SEEN_SIGNIN_KEY   = 'exeg-acct-seen-signin';
const ACCT_DELETE_QUEUE_KEY  = 'exeg-cloud-delete-queue';
const ACCT_LAST_SYNCED_KEY   = 'exeg-acct-last-synced';
const ACCT_FLUSH_INTERVAL_MS = 30000;

/* states: unknown | unavailable | offline | signed_out | profile_incomplete | ready
   profile_incomplete is transient — acctAfterState resolves it automatically
   via acctAutoCompleteProfile, it's never shown to the user. */
const ACCT = {
  state: 'unknown',
  user: null,
  profile: null,
  busy: false,
  dirty: new Set(),
  pushCache: {},
  flushing: false,
  lastSyncedAt: null, // ms epoch, persisted across reloads — see acctReadLastSynced/acctWriteLastSynced
  _unsub: null,
  _flushTimer: null,
  _pulledOnce: false
};
ACCT.lastSyncedAt = acctReadLastSynced();

function acctReadLastSynced(){ const v=parseInt(localStorage.getItem(ACCT_LAST_SYNCED_KEY)||'',10); return Number.isFinite(v)?v:null; }
function acctWriteLastSynced(ms){ try{ localStorage.setItem(ACCT_LAST_SYNCED_KEY, String(ms)); }catch(_e){} }
function acctStampLastSynced(){
  const now=Date.now();
  ACCT.lastSyncedAt=now;
  acctWriteLastSynced(now);
  const modal=document.getElementById('acct-modal');
  if(modal && !modal.classList.contains('hidden')) acctRender();
}

function _sync(){ return (window.PhrasingSync && window.PhrasingSync.__ready) ? window.PhrasingSync : null; }

/* ── Boot ── */
function acctUrlHasAuthParams(){
  const q=location.search, h=location.hash;
  return /[?&](code|token_hash|error|error_description)=/.test(q)
      || /[#&](access_token|refresh_token|type|error)=/.test(h);
}

function acctBoot(){
  const S=_sync();
  if(!S){ ACCT.state='unavailable'; acctRenderBadges(); return; }

  const pending=localStorage.getItem(ACCT_OAUTH_PENDING_KEY);
  const seen=localStorage.getItem(ACCT_SEEN_SIGNIN_KEY);
  const fromUrl=acctUrlHasAuthParams();

  // Never signed in before, nothing pending, nothing in the URL — do
  // ZERO network work. This is what keeps a cold, signed-out load
  // completely silent (no Supabase requests at all).
  if(!pending && !seen && !fromUrl){ ACCT.state='signed_out'; acctRenderBadges(); return; }
  if(navigator.onLine===false){ ACCT.state='offline'; acctRenderBadges(); return; }

  if(fromUrl && /[?&]error=/.test(location.search+location.hash)){
    toast(typeof t==='function'?t('account.toast.oauth-cancelled'):'Sign-in was cancelled.');
  }

  // getCurrentUser() is what lazily builds the Supabase client (see
  // ensureConfigured() in the sync module) — it must run BEFORE
  // onAuthStateChange is registered, or that listener silently no-ops
  // against a not-yet-built client, and it must run before we strip the
  // URL, or detectSessionInUrl never gets to consume the OAuth fragment.
  S.getCurrentUser().then(user=>{
    if(!ACCT._unsub) ACCT._unsub=S.onAuthStateChange(()=>{ acctRefreshState(); });
    if(fromUrl) history.replaceState(null,'',location.pathname);
    localStorage.removeItem(ACCT_OAUTH_PENDING_KEY);
    if(user) localStorage.setItem(ACCT_SEEN_SIGNIN_KEY,'1');
    return acctRefreshState();
  }).catch(()=>{ ACCT.state='unavailable'; acctRenderBadges(); });
}

async function acctRefreshState(){
  const S=_sync(); if(!S) return;
  let user=null;
  try{ user=await S.getCurrentUser(); }catch(_e){}
  if(!user){ ACCT.state='signed_out'; ACCT.user=null; ACCT.profile=null; return acctAfterState(); }
  ACCT.user=user;
  // Google accounts are verified the moment OAuth completes — there's no
  // separate email-confirmation step to gate on with Google-only sign-in.
  let profile=null;
  try{ profile=await S.getCurrentProfile(); }catch(_e){}
  ACCT.profile=profile;
  ACCT.state=profile?'ready':'profile_incomplete';
  return acctAfterState();
}

function acctAfterState(){
  acctRenderBadges();
  const modal=document.getElementById('acct-modal');
  if(modal && !modal.classList.contains('hidden')) acctRender();

  if(ACCT.state==='profile_incomplete'){
    acctAutoCompleteProfile(); // silent — no UI, no user action needed
    return;
  }
  if(ACCT.state==='ready'){
    acctStartFlusher();
    // onAuthStateChange (wired in acctBoot) fires acctRefreshState -> here on
    // EVERY auth event Supabase emits post-boot — token refreshes, tab-focus
    // session re-checks, etc. — not just the initial sign-in. Without this
    // guard, each one re-ran the full migrate+flush+pull cycle and re-fired
    // acctPull()'s "newer cloud version" toast, which is why it could repeat
    // every few seconds with nothing actually new on the cloud side. Explicit
    // user-initiated pulls (Sync Now / reconnect) call acctPull() directly,
    // bypassing this guard, so they're unaffected.
    if(!ACCT._pulledOnce){
      ACCT._pulledOnce=true;
      acctMigrateThenPull();
    }
  }
}

/* Generates a random, meaningless username and saves it — purely to
   satisfy the sync module's public.user_profiles requirement. Always
   matches USERNAME_PATTERN (^[a-z0-9][a-z0-9_]{1,22}[a-z0-9]$) by
   construction, so there's nothing to validate or retry for format
   reasons; the only real failure mode is an (astronomically unlikely)
   collision, handled by just generating a fresh one and trying again. */
function _acctGenUsername(){
  const chars='abcdefghijklmnopqrstuvwxyz0123456789';
  let s='u';
  for(let i=0;i<15;i++) s+=chars[Math.floor(Math.random()*chars.length)];
  return s;
}
async function acctAutoCompleteProfile(){
  const S=_sync(); if(!S || ACCT.state!=='profile_incomplete') return;
  for(let i=0;i<5;i++){
    let res;
    try{ res=await S.setUsername(_acctGenUsername()); }catch(_e){ res={ok:false}; }
    if(res.ok){ await acctRefreshState(); return; }
    if(res.reason!=='username_unavailable') return; // some other failure — don't loop pointlessly, next boot/refresh retries
  }
  // Exhausted retries (essentially impossible) — sync just stays inert
  // until a later refresh tries again; editing is completely unaffected.
}

/* ── Adapter: collectData()'s shape -> what saveProjectToCloud expects ── */
function acctCloudPayload(data, entry){
  const langLower=(data && data.lang)||'';
  const mode = langLower==='greek' ? 'Greek' : langLower==='hebrew' ? 'Hebrew' : 'Other';
  const name = (entry && entry.name) || (data && data.verseRef) || 'Untitled';
  return Object.assign({}, data, {
    name: name,
    verseReference: (data && data.verseRef) || '',
    languageMode: mode
  });
}
const ACCT_MAX_PAYLOAD_BYTES = 4*1024*1024;

/* ── Sign-in / sign-out ── */
async function acctGoogleSignIn(){
  const S=_sync(); if(!S) return;
  try{
    if(typeof SESS!=='undefined' && SESS && typeof storeKey==='function' && typeof collectData==='function'){
      localStorage.setItem(storeKey(), JSON.stringify(collectData()));
    }
  }catch(_e){}
  localStorage.setItem(ACCT_OAUTH_PENDING_KEY,'1');
  acctSetBusy(true);
  let res;
  try{ res=await S.signInWithGoogle(); }catch(_e){ res={ok:false}; }
  acctSetBusy(false);
  if(!res.ok){
    localStorage.removeItem(ACCT_OAUTH_PENDING_KEY);
    acctShowMsg(acctMessageFor(res.reason), true);
  }
  // On success the page navigates away — nothing else to do here.
}

async function acctSignOut(){
  const S=_sync();
  if(S){ try{ await S.signOut(); }catch(_e){} }
  if(ACCT._unsub){ try{ ACCT._unsub(); }catch(_e){} ACCT._unsub=null; }
  acctStopFlusher();
  ACCT.state='signed_out'; ACCT.user=null; ACCT.profile=null;
  ACCT.dirty.clear(); ACCT.pushCache={}; ACCT._pulledOnce=false;
  acctRenderBadges();
  acctRender();
  toast(typeof t==='function'?t('account.toast.signed-out'):'Signed out. Your projects stay on this device.');
}

async function acctSyncNow(){
  if(ACCT.state!=='ready') return;
  acctSetBusy(true);
  try{ await acctFlushDirty(); await acctFlushDeleteQueue(); await acctPull(); }
  catch(_e){}
  acctSetBusy(false);
  acctStampLastSynced();
  toast(typeof t==='function'?t('account.toast.synced'):'Synced');
}

/* ── Migration + pull ── */
function acctListLocalProjects(){
  if(typeof projIndex!=='function') return [];
  return projIndex().map(e=>{
    let data=null;
    try{ data=JSON.parse(localStorage.getItem(PROJ_DATA_KEY(e.id))||'null'); }catch(_e){}
    if(!data) return null;
    const payload=acctCloudPayload(data, e);
    if(JSON.stringify(payload).length>ACCT_MAX_PAYLOAD_BYTES) return null; // skip oversize, don't fail the whole batch
    return { projectId: e.id, projectData: payload };
  }).filter(Boolean);
}

async function acctMigrateThenPull(){
  const S=_sync(); if(!S || ACCT.state!=='ready') return;
  try{
    const m=await S.migrateLocalProjectsOnce({ listLocalProjects: acctListLocalProjects });
    if(m.ok && m.uploaded>0){
      toast(typeof t==='function'?t('account.toast.migrated'):'Local projects uploaded to your account');
    }
  }catch(_e){}
  try{ await acctFlushDeleteQueue(); }catch(_e){}
  // Flush any locally-dirty projects BEFORE pulling — otherwise a project
  // edited in a prior session but never pushed (e.g. tab closed before the
  // 30s flush timer fired) is vulnerable to being silently outraced by a
  // cloud row on this very first pull, before acctPull()'s own dirty-check
  // ever gets a chance to protect it (mirrors acctSyncNow's ordering).
  try{ await acctFlushDirty(); }catch(_e){}
  try{ await acctPull(); }catch(_e){}
  acctStampLastSynced();
}

async function acctPull(){
  const S=_sync(); if(!S || ACCT.state!=='ready') return;
  if(typeof projIndex!=='function') return;
  const deleteQueue=acctReadDeleteQueue();
  let rows=[];
  try{ rows=await S.loadAllProjectsFromCloud(); }catch(_e){ rows=[]; }
  if(!rows.length) return;

  const idx=projIndex();
  let changed=false, skippedOpen=false;
  // Names of projects whose LOCAL copy existed and either (a) has unpushed
  // edits so we deliberately skip overwriting it, or (b) got genuinely
  // overwritten by a newer cloud version — both are cases where a user
  // could lose track of a change without being told. A brand-new row from
  // another device (no prior local entry) is normal multi-device use, not
  // a conflict, so it's tracked separately and stays silent.
  const conflictNames=[], overwrittenNames=[], newFromCloud=[];
  for(const row of rows){
    const id=String(row.id);
    if(deleteQueue.includes(id)) continue; // pending delete — don't resurrect
    const entry=idx.find(e=>e.id===id);
    if(typeof CURRENT_PROJECT_ID!=='undefined' && id===CURRENT_PROJECT_ID){
      // Only warn if the cloud row is actually AHEAD of what we last saved —
      // matches the same-or-newer check below. Without this, any project
      // that has ever synced once trips this toast on every subsequent pull
      // (app load, Sync now, reconnect) forever, even with nothing new on
      // the cloud side — a false "conflict" with no other device involved.
      const openCloudTime=row.updated_at?Date.parse(row.updated_at):0;
      if(!entry || openCloudTime>(entry.savedAt||0)) skippedOpen=true;
      continue;
    }
    if(ACCT.dirty.has(id)){
      // Unpushed local edits exist for this project — never let an
      // incoming cloud row silently clobber them, regardless of timestamp
      // (the local save that made it dirty may be newer than what the
      // cloud row's updated_at reflects, e.g. while offline or mid-flush).
      conflictNames.push((entry&&entry.name)||row.name||id);
      continue;
    }
    const cloudTime=row.updated_at?Date.parse(row.updated_at):0;
    if(entry && cloudTime<=(entry.savedAt||0)) continue; // local is same-or-newer

    try{ localStorage.setItem(PROJ_DATA_KEY(id), JSON.stringify(row.payload)); }
    catch(_e){ toast(typeof t==='function'?t('toast.storage-full'):'Storage full — please export and clear some projects'); break; }

    const lang=(row.payload && row.payload.langLabel) || row.language_mode || 'Other';
    if(entry){
      overwrittenNames.push(row.name||entry.name||id);
      entry.name=row.name||entry.name; entry.lang=lang;
      entry.verseRef=row.verse_reference||entry.verseRef;
      entry.savedAt=cloudTime||Date.now(); entry.cloudAt=cloudTime||Date.now();
    } else {
      newFromCloud.push(row.name||'Untitled');
      idx.unshift({id, name:row.name||'Untitled', lang, verseRef:row.verse_reference||'', savedAt:cloudTime||Date.now(), cloudAt:cloudTime||Date.now()});
    }
    changed=true;
  }
  if(changed){
    try{ localStorage.setItem(PROJ_INDEX_KEY, JSON.stringify(idx)); }catch(_e){}
    if(typeof renderProjPanel==='function') renderProjPanel();
    if(typeof renderS1Recent==='function') renderS1Recent();
  }
  // Two DIFFERENT situations, two different messages — do not conflate them:
  // skippedOpen/conflictNames = local edits were PROTECTED (nothing changed,
  // but a newer cloud version is waiting); overwrittenNames = local data was
  // ACTUALLY replaced. newFromCloud is intentionally excluded from both — a
  // brand-new project pulled from another device isn't a conflict.
  if(skippedOpen || conflictNames.length){
    toast(typeof t==='function'?t('account.toast.remote-newer'):'A newer cloud version exists — save here to keep your current edits');
  }
  const affected=overwrittenNames;
  if(affected.length){
    const msg=typeof t==='function'
      ? t('account.toast.remote-overwrote').replace('{n}', affected.length)
      : affected.length+' project(s) were updated from another device';
    toast(msg);
  }
}

/* ── Push (fire-and-forget) + dirty flusher ── */
function acctMarkDirty(id){ if(id) ACCT.dirty.add(String(id)); }

function acctQueuePush(id, data, name, immediate){
  if(!id) return;
  id=String(id);
  ACCT.dirty.add(id);
  ACCT.pushCache[id]={data, name};
  if(immediate) acctFlushDirty();
}

function acctQueueDelete(id){
  if(!id) return;
  id=String(id);
  ACCT.dirty.delete(id); delete ACCT.pushCache[id];
  const q=acctReadDeleteQueue();
  if(q.indexOf(id)===-1){ q.push(id); acctWriteDeleteQueue(q); }
  acctFlushDeleteQueue();
}

async function acctFlushDirty(){
  const S=_sync(); if(!S || ACCT.state!=='ready' || ACCT.flushing) return;
  const ids=Array.from(ACCT.dirty);
  if(!ids.length) return;
  ACCT.flushing=true;
  for(const id of ids){
    try{
      let cached=ACCT.pushCache[id]||{};
      let data=cached.data, name=cached.name;
      if(!data){
        const raw=localStorage.getItem(PROJ_DATA_KEY(id));
        if(!raw){ ACCT.dirty.delete(id); continue; } // deleted locally in the meantime
        data=JSON.parse(raw);
      }
      const entry=(typeof projIndex==='function'?projIndex():[]).find(e=>e.id===id);
      name=name||(entry&&entry.name);
      const payload=acctCloudPayload(data, {name});
      if(JSON.stringify(payload).length>ACCT_MAX_PAYLOAD_BYTES){
        ACCT.dirty.delete(id); delete ACCT.pushCache[id];
        toast(typeof t==='function'?t('account.toast.oversize'):'This project is too large to sync to the cloud');
        continue;
      }
      const res=await S.saveProjectToCloud(id, payload);
      if(res.ok){
        ACCT.dirty.delete(id); delete ACCT.pushCache[id];
        acctStampCloudAt(id, res.row && res.row.updated_at);
      }
      // on failure: stays in ACCT.dirty, retried on the next flush
    }catch(_e){ /* leave dirty, retry later */ }
  }
  ACCT.flushing=false;
  acctRenderBadges();
}

async function acctFlushDeleteQueue(){
  const S=_sync(); if(!S || ACCT.state!=='ready') return;
  const q=acctReadDeleteQueue();
  if(!q.length) return;
  const remaining=[];
  for(const id of q){
    try{
      const res=await S.deleteProjectFromCloud(id);
      if(!res.ok) remaining.push(id);
    }catch(_e){ remaining.push(id); }
  }
  acctWriteDeleteQueue(remaining);
}

function acctStampCloudAt(id, iso){
  if(typeof projIndex!=='function') return;
  const idx=projIndex();
  const e=idx.find(x=>x.id===id);
  if(!e) return;
  e.cloudAt=iso?Date.parse(iso):Date.now();
  try{ localStorage.setItem(PROJ_INDEX_KEY, JSON.stringify(idx)); }catch(_e){}
  if(typeof renderProjPanel==='function') renderProjPanel();
  if(typeof renderS1Recent==='function') renderS1Recent();
}

function acctReadDeleteQueue(){ try{ return JSON.parse(localStorage.getItem(ACCT_DELETE_QUEUE_KEY)||'[]'); }catch(_e){ return []; } }
function acctWriteDeleteQueue(q){ try{ localStorage.setItem(ACCT_DELETE_QUEUE_KEY, JSON.stringify(q)); }catch(_e){} }

function acctStartFlusher(){
  if(ACCT._flushTimer) return;
  ACCT._flushTimer=setInterval(()=>{ acctFlushDirty(); acctFlushDeleteQueue(); }, ACCT_FLUSH_INTERVAL_MS);
  document.addEventListener('visibilitychange', acctOnVisibilityChange);
  window.addEventListener('online', acctOnOnline);
}
function acctStopFlusher(){
  if(ACCT._flushTimer){ clearInterval(ACCT._flushTimer); ACCT._flushTimer=null; }
  document.removeEventListener('visibilitychange', acctOnVisibilityChange);
  window.removeEventListener('online', acctOnOnline);
}
function acctOnVisibilityChange(){ if(document.visibilityState==='hidden'){ acctFlushDirty(); acctFlushDeleteQueue(); } }
async function acctOnOnline(){
  await acctFlushDirty(); await acctFlushDeleteQueue();
  if(ACCT.state!=='ready') return;
  await acctPull();
  acctStampLastSynced();
}

/* ── Cloud badge for project cards (called from app.js's renderers) ── */
function acctBadgeHTML(entry){
  if(!entry || ACCT.state!=='ready') return '';
  if(typeof entry.cloudAt!=='number') return '<span class="proj-cloud-badge is-pending" title="Not yet synced"></span>';
  const pending=!entry.savedAt || entry.savedAt>entry.cloudAt;
  return '<span class="proj-cloud-badge '+(pending?'is-pending':'is-synced')+'" title="'+(pending?'Not yet synced':'Synced to cloud')+'"></span>';
}

/* ── Non-enumerating reason -> message map (gracefulError has no `reason`
   field at all — see the module's error helpers — so this always needs a
   default branch, not just a lookup that assumes one exists). ── */
function acctMessageFor(reason){
  const key='account.err.'+String(reason||'generic').replace(/_/g,'-');
  if(typeof t==='function'){
    const msg=t(key);
    if(msg && msg!==key) return msg;
  }
  const fallback={
    offline: "You're offline right now.",
    not_configured: 'Cloud sync is not set up for this build.',
    missing_supabase_config: 'Cloud sync is not set up for this build.',
    supabase_library_unavailable: 'Could not reach the cloud sync service. Try again later.',
    signed_out: 'Please sign in first.',
    invalid_project: 'This project could not be synced.',
  };
  return fallback[reason] !== undefined ? (fallback[reason]||'') : 'Something went wrong. Please try again.';
}

/* ── UI: modal open/close ── */
function openAccount(){
  const m=document.getElementById('acct-modal');
  if(!m) return;
  m.classList.remove('hidden');
  acctRender();
  setTimeout(()=>{
    const handler=e=>{
      const card=document.querySelector('#acct-modal .mcard');
      if(card && !card.contains(e.target)){ closeAccount(); document.removeEventListener('mousedown',handler); }
    };
    document.addEventListener('mousedown',handler);
    document._acctOutsideHandler=handler;
  },50);
}
function closeAccount(){
  const m=document.getElementById('acct-modal');
  if(m) m.classList.add('hidden');
  if(document._acctOutsideHandler){
    document.removeEventListener('mousedown', document._acctOutsideHandler);
    document._acctOutsideHandler=null;
  }
  acctShowMsg('');
}
function acctShowMsg(text, isError){
  const el=document.getElementById('acct-msg');
  if(!el) return;
  el.textContent=text||'';
  el.classList.toggle('error', !!isError);
}
function acctSetBusy(busy){
  ACCT.busy=busy;
  document.querySelectorAll('#acct-modal button').forEach(b=>{ b.disabled=busy; });
  const syncBtn=document.getElementById('acct-sync-btn');
  if(syncBtn){
    if(busy) syncBtn.textContent=typeof t==='function'?t('account.syncing'):'Syncing…';
    else syncBtn.textContent=typeof t==='function'?t('account.sync-now'):'Sync now';
  }
}

/* ── UI: badges outside the modal (toolbar dot, S1 button, panel dot) ──
   profile_incomplete is transient/silent now (see acctAutoCompleteProfile),
   so it no longer needs its own "action needed" badge state — only
   signed-in shows anything. */
function acctRenderBadges(){
  const signedIn = ACCT.state==='ready';
  [document.getElementById('acct-panel-dot'), document.getElementById('btn-account-dot'), document.getElementById('s1-account-dot')]
    .forEach(dot=>{
      if(!dot) return;
      dot.style.display = signedIn ? '' : 'none';
      dot.classList.toggle('acct-dot-ok', signedIn);
    });
}

/* ── UI: the modal's views ── */
function acctRender(){
  const modal=document.getElementById('acct-modal');
  if(!modal || modal.classList.contains('hidden')) return;
  const views=['loading','unavailable','offline','signedout','signedin'];
  const view = ACCT.state==='unavailable' ? 'unavailable'
             : ACCT.state==='offline' ? 'offline'
             : ACCT.state==='ready' ? 'signedin'
             : ACCT.state==='profile_incomplete' ? 'loading' // finishing up silently, see acctAutoCompleteProfile
             : 'signedout';
  views.forEach(v=>{
    const el=document.getElementById('acct-view-'+v);
    if(el) el.hidden = (v!==view);
  });
  if(view==='signedin'){
    const emailEl=document.getElementById('acct-signedin-email');
    if(emailEl) emailEl.textContent=(ACCT.user&&ACCT.user.email)||'';
    const syncedEl=document.getElementById('acct-last-synced');
    if(syncedEl){
      syncedEl.textContent = ACCT.lastSyncedAt
        ? (typeof t==='function'?t('account.last-synced'):'Last synced')+' '+new Date(ACCT.lastSyncedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})
        : (typeof t==='function'?t('account.last-synced.never'):'Not synced yet');
    }
  }
}

/* ── Wire up boot: run once the module bridge has configured
   window.PhrasingSync (deferred module scripts run after all classic
   scripts and before DOMContentLoaded, so this ordering is safe) — plus
   a belt-and-braces listener in case the bridge finishes even later. ── */
document.addEventListener('DOMContentLoaded', acctBoot);
window.addEventListener('phrasing-sync-ready', ()=>{ if(ACCT.state==='unknown') acctBoot(); });
