/**
 * Exegetical Phrasing Editor Supabase sync helper.
 *
 * Usage from a static page:
 *
 * <script type="module">
 *   import {
 *     configurePhrasingSync,
 *     signInWithGoogle,
 *     saveProjectToCloud
 *   } from './sync/phrasing-supabase-sync.js';
 *
 *   configurePhrasingSync({
 *     supabaseUrl: 'https://YOUR_PROJECT_REF.supabase.co',
 *     supabaseAnonKey: 'YOUR_SUPABASE_ANON_PUBLIC_KEY',
 *     redirectTo: window.location.href
 *   });
 * </script>
 *
 * This file never reads or writes the Bible Module IndexedDB cache. It only
 * talks to Supabase Auth and the public.phrasing_projects table.
 *
 * To protect offline-first loading, this module does not use a top-level CDN
 * import. It lazily uses window.supabase.createClient if you already loaded the
 * Supabase UMD bundle, otherwise it dynamically imports the Supabase ESM bundle
 * the first time a cloud operation runs.
 */

const DEFAULT_TABLE_NAME = 'phrasing_projects';
const DEFAULT_MIGRATION_FLAG_PREFIX = 'phrasing_editor_migrated_v1';
const DEFAULT_SUPABASE_MODULE_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const ALLOWED_LANGUAGE_MODES = new Set(['Hebrew', 'Greek', 'Other']);

let supabase = null;
let syncConfig = {
  supabaseUrl: null,
  supabaseAnonKey: null,
  supabaseModuleUrl: DEFAULT_SUPABASE_MODULE_URL,
  tableName: DEFAULT_TABLE_NAME,
  redirectTo: null,
  migrationFlagPrefix: DEFAULT_MIGRATION_FLAG_PREFIX
};

/**
 * Configure Supabase once during app startup.
 *
 * @param {object} options
 * @param {string} options.supabaseUrl - Example: https://abc123.supabase.co
 * @param {string} options.supabaseAnonKey - Supabase anon/public API key.
 * @param {string} [options.redirectTo] - Where users return after OAuth.
 * @param {string} [options.tableName='phrasing_projects'] - Override only if the SQL table is renamed.
 * @param {string} [options.migrationFlagPrefix='phrasing_editor_migrated_v1'] - localStorage prefix for one-time migration.
 * @param {string} [options.supabaseModuleUrl] - Optional CDN/module URL for Supabase JS.
 * @returns {{ ok: boolean, reason?: string }}
 */
export function configurePhrasingSync(options = {}) {
  const {
    supabaseUrl,
    supabaseAnonKey,
    redirectTo = getDefaultRedirectUrl(),
    tableName = DEFAULT_TABLE_NAME,
    migrationFlagPrefix = DEFAULT_MIGRATION_FLAG_PREFIX,
    supabaseModuleUrl = DEFAULT_SUPABASE_MODULE_URL
  } = options;

  if (!supabaseUrl || !supabaseAnonKey) {
    supabase = null;
    return { ok: false, reason: 'missing_supabase_config' };
  }

  syncConfig = {
    supabaseUrl,
    supabaseAnonKey,
    supabaseModuleUrl,
    tableName,
    redirectTo,
    migrationFlagPrefix
  };

  const globalCreateClient = getGlobalCreateClient();
  supabase = globalCreateClient ? createSupabaseClient(globalCreateClient) : null;

  return { ok: true };
}

/**
 * Start Google OAuth sign-in.
 *
 * This redirects the browser when successful. If the app is offline or not
 * configured, it returns a skipped result and leaves the app untouched.
 *
 * @param {object} [options]
 * @param {string} [options.redirectTo] - Optional per-call redirect URL.
 * @returns {Promise<{ ok: boolean, skipped?: boolean, reason?: string, error?: unknown }>}
 */
export async function signInWithGoogle(options = {}) {
  const ready = await ensureReady();
  if (!ready.ok) return ready;

  const redirectTo = options.redirectTo || syncConfig.redirectTo || getDefaultRedirectUrl();

  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo }
    });

    if (error) return gracefulError(error);
    return { ok: true };
  } catch (error) {
    return gracefulError(error);
  }
}

/**
 * Sign out of Supabase Auth.
 *
 * @returns {Promise<{ ok: boolean, skipped?: boolean, reason?: string, error?: unknown }>}
 */
export async function signOut() {
  const ready = await ensureConfigured();
  if (!ready.ok) return ready;

  try {
    const { error } = await supabase.auth.signOut();
    if (error) return gracefulError(error);
    return { ok: true };
  } catch (error) {
    return gracefulError(error);
  }
}

/**
 * Return the current signed-in Supabase user, or null.
 *
 * @returns {Promise<object | null>}
 */
export async function getCurrentUser() {
  const ready = await ensureConfigured();
  if (!ready.ok) return null;

  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data?.user || null;
  } catch (_error) {
    return null;
  }
}

/**
 * Upsert one project to the cloud.
 *
 * The projectData object is saved whole as payload. A few top-level metadata
 * fields are copied into columns so lists can load quickly without parsing the
 * entire JSON payload.
 *
 * @param {string} projectId - Stable local project id.
 * @param {object} projectData - Full editor session JSON.
 * @returns {Promise<{ ok: boolean, skipped?: boolean, reason?: string, row?: object, error?: unknown }>}
 */
export async function saveProjectToCloud(projectId, projectData) {
  const ready = await ensureReady();
  if (!ready.ok) return ready;

  const user = await getCurrentUser();
  if (!user) return skipped('signed_out');
  if (!projectId || !projectData || typeof projectData !== 'object') {
    return skipped('invalid_project');
  }

  const row = buildProjectRow(String(projectId), projectData, user.id);

  try {
    const { data, error } = await supabase
      .from(syncConfig.tableName)
      .upsert(row, { onConflict: 'user_id,id' })
      .select()
      .single();

    if (error) return gracefulError(error);
    return { ok: true, row: data };
  } catch (error) {
    return gracefulError(error);
  }
}

/**
 * Load all projects for the signed-in user.
 *
 * Returns [] when offline, signed out, or on any recoverable failure.
 *
 * @returns {Promise<Array<object>>}
 */
export async function loadAllProjectsFromCloud() {
  const ready = await ensureReady();
  if (!ready.ok) return [];

  const user = await getCurrentUser();
  if (!user) return [];

  try {
    const { data, error } = await supabase
      .from(syncConfig.tableName)
      .select('id,name,verse_reference,language_mode,payload,created_at,updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) return [];
    return data || [];
  } catch (_error) {
    return [];
  }
}

/**
 * Delete one project from the cloud.
 *
 * Local storage deletion remains the editor's responsibility.
 *
 * @param {string} projectId
 * @returns {Promise<{ ok: boolean, skipped?: boolean, reason?: string, error?: unknown }>}
 */
export async function deleteProjectFromCloud(projectId) {
  const ready = await ensureReady();
  if (!ready.ok) return ready;

  const user = await getCurrentUser();
  if (!user) return skipped('signed_out');
  if (!projectId) return skipped('invalid_project');

  try {
    const { error } = await supabase
      .from(syncConfig.tableName)
      .delete()
      .eq('user_id', user.id)
      .eq('id', String(projectId));

    if (error) return gracefulError(error);
    return { ok: true };
  } catch (error) {
    return gracefulError(error);
  }
}

/**
 * One-time upload of existing local phrasing projects after first sign-in.
 *
 * The caller supplies listLocalProjects because each static app may have a
 * different localStorage index/key format. This keeps the library independent
 * from the current editor UI and from any future dashboard app.
 *
 * Expected listLocalProjects return shape:
 * [
 *   { projectId: 'stable-id-1', projectData: { ...full session json... } },
 *   { id: 'stable-id-2', data: { ...full session json... } }
 * ]
 *
 * @param {object} options
 * @param {() => Array<object>|Promise<Array<object>>} options.listLocalProjects
 * @param {boolean} [options.force=false] - Re-run even if the migration flag exists.
 * @returns {Promise<{ ok: boolean, skipped?: boolean, reason?: string, uploaded: number, failed: number }>}
 */
export async function migrateLocalProjectsOnce(options = {}) {
  const ready = await ensureReady();
  if (!ready.ok) return { ...ready, uploaded: 0, failed: 0 };

  const { listLocalProjects, force = false } = options;
  if (typeof listLocalProjects !== 'function') {
    return { ...skipped('missing_local_project_reader'), uploaded: 0, failed: 0 };
  }

  const user = await getCurrentUser();
  if (!user) return { ...skipped('signed_out'), uploaded: 0, failed: 0 };

  const flagKey = getMigrationFlagKey(user.id);
  if (!force && readLocalStorage(flagKey)) {
    return { ...skipped('already_migrated'), uploaded: 0, failed: 0 };
  }

  let localProjects = [];
  try {
    localProjects = await listLocalProjects();
  } catch (error) {
    return { ...gracefulError(error), uploaded: 0, failed: 0 };
  }

  if (!Array.isArray(localProjects) || localProjects.length === 0) {
    writeLocalStorage(flagKey, JSON.stringify({
      userId: user.id,
      migratedAt: new Date().toISOString(),
      uploaded: 0
    }));
    return { ok: true, uploaded: 0, failed: 0 };
  }

  let uploaded = 0;
  let failed = 0;

  for (const item of localProjects) {
    const projectId = item.projectId || item.id;
    const projectData = item.projectData || item.data || item.payload;
    const result = await saveProjectToCloud(projectId, projectData);
    if (result.ok) uploaded += 1;
    else failed += 1;
  }

  if (failed === 0) {
    writeLocalStorage(flagKey, JSON.stringify({
      userId: user.id,
      migratedAt: new Date().toISOString(),
      uploaded
    }));
  }

  return { ok: failed === 0, uploaded, failed };
}

/**
 * Subscribe to Supabase auth changes, useful for kicking off migration after
 * SIGNED_IN. Returns an unsubscribe function.
 *
 * @param {(event: string, session: object | null) => void} callback
 * @returns {() => void}
 */
export function onAuthStateChange(callback) {
  if (!supabase || typeof callback !== 'function') return () => {};

  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });

  return () => data?.subscription?.unsubscribe?.();
}

function buildProjectRow(projectId, projectData, userId) {
  return {
    id: projectId,
    user_id: userId,
    name: getProjectName(projectData),
    verse_reference: getFirstString(projectData, [
      'verseReference',
      'verse_reference',
      'reference',
      'ref'
    ]),
    language_mode: normalizeLanguageMode(getFirstString(projectData, [
      'languageMode',
      'language_mode',
      'language'
    ])),
    payload: projectData
  };
}

function getProjectName(projectData) {
  return getFirstString(projectData, [
    'name',
    'projectName',
    'project_name',
    'title'
  ]) || 'Untitled project';
}

function normalizeLanguageMode(value) {
  if (!value) return 'Other';
  const normalized = String(value).trim();
  return ALLOWED_LANGUAGE_MODES.has(normalized) ? normalized : 'Other';
}

function getFirstString(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

async function ensureReady() {
  if (!isOnline()) return skipped('offline');
  return ensureConfigured();
}

async function ensureConfigured() {
  if (supabase) return { ok: true };
  if (!syncConfig.supabaseUrl || !syncConfig.supabaseAnonKey) {
    return skipped('not_configured');
  }

  const createClient = await loadCreateClient();
  if (!createClient) return skipped('supabase_library_unavailable');

  supabase = createSupabaseClient(createClient);
  return { ok: true };
}

function createSupabaseClient(createClient) {
  return createClient(syncConfig.supabaseUrl, syncConfig.supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true
    }
  });
}

async function loadCreateClient() {
  const globalCreateClient = getGlobalCreateClient();
  if (globalCreateClient) return globalCreateClient;

  try {
    const module = await import(syncConfig.supabaseModuleUrl);
    return module?.createClient || null;
  } catch (_error) {
    return null;
  }
}

function getGlobalCreateClient() {
  return globalThis?.supabase?.createClient || null;
}

function isOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

function getDefaultRedirectUrl() {
  if (typeof window === 'undefined') return undefined;
  return window.location.href;
}

function getMigrationFlagKey(userId) {
  return `${syncConfig.migrationFlagPrefix}:${userId}`;
}

function readLocalStorage(key) {
  try {
    return window?.localStorage?.getItem(key) || null;
  } catch (_error) {
    return null;
  }
}

function writeLocalStorage(key, value) {
  try {
    window?.localStorage?.setItem(key, value);
  } catch (_error) {
    // localStorage may be blocked; migration will remain idempotent because
    // cloud saves use upsert on the same project ids.
  }
}

function skipped(reason) {
  return { ok: false, skipped: true, reason };
}

function gracefulError(error) {
  return { ok: false, error };
}
