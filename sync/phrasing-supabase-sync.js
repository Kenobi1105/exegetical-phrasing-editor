/**
 * Exegetical Phrasing Editor Supabase sync helper.
 *
 * This dependency-free ES module supports Google OAuth plus email/password
 * accounts. It never reads or writes the Bible Module IndexedDB cache. It only
 * uses Supabase Auth, public.user_profiles, and public.phrasing_projects.
 *
 * Import it from a static page with <script type="module">. It lazily loads
 * Supabase JS only when a cloud operation is attempted, preserving offline
 * editor startup and its existing localStorage-first workflow.
 */

const DEFAULT_TABLE_NAME = 'phrasing_projects';
const DEFAULT_PROFILE_TABLE_NAME = 'user_profiles';
const DEFAULT_MIGRATION_FLAG_PREFIX = 'phrasing_editor_migrated_v1';
const DEFAULT_SUPABASE_MODULE_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const ALLOWED_LANGUAGE_MODES = new Set(['Hebrew', 'Greek', 'Other']);
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_]{1,22}[a-z0-9]$/;

let supabase = null;
let profileCache = null;
let syncConfig = {
  supabaseUrl: null,
  supabaseAnonKey: null,
  supabaseModuleUrl: DEFAULT_SUPABASE_MODULE_URL,
  tableName: DEFAULT_TABLE_NAME,
  profileTableName: DEFAULT_PROFILE_TABLE_NAME,
  redirectTo: null,
  migrationFlagPrefix: DEFAULT_MIGRATION_FLAG_PREFIX
};

/**
 * Configure the module once during app startup.
 *
 * @param {object} options
 * @param {string} options.supabaseUrl
 * @param {string} options.supabaseAnonKey
 * @param {string} [options.redirectTo]
 * @param {string} [options.tableName='phrasing_projects']
 * @param {string} [options.profileTableName='user_profiles']
 * @param {string} [options.migrationFlagPrefix='phrasing_editor_migrated_v1']
 * @param {string} [options.supabaseModuleUrl]
 * @returns {{ ok: boolean, reason?: string }}
 */
export function configurePhrasingSync(options = {}) {
  const {
    supabaseUrl,
    supabaseAnonKey,
    redirectTo = getDefaultRedirectUrl(),
    tableName = DEFAULT_TABLE_NAME,
    profileTableName = DEFAULT_PROFILE_TABLE_NAME,
    migrationFlagPrefix = DEFAULT_MIGRATION_FLAG_PREFIX,
    supabaseModuleUrl = DEFAULT_SUPABASE_MODULE_URL
  } = options;

  if (!supabaseUrl || !supabaseAnonKey) {
    supabase = null;
    profileCache = null;
    return { ok: false, reason: 'missing_supabase_config' };
  }

  syncConfig = {
    supabaseUrl,
    supabaseAnonKey,
    supabaseModuleUrl,
    tableName,
    profileTableName,
    redirectTo,
    migrationFlagPrefix
  };

  const globalCreateClient = getGlobalCreateClient();
  supabase = globalCreateClient ? createSupabaseClient(globalCreateClient) : null;
  profileCache = null;
  return { ok: true };
}

/**
 * Start Google OAuth sign-in. A first-time Google user selects a username
 * after returning to the editor, before cloud projects can be migrated.
 *
 * @param {object} [options]
 * @param {string} [options.redirectTo]
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
    return error ? gracefulError(error) : { ok: true };
  } catch (error) {
    return gracefulError(error);
  }
}

/**
 * Create an email/password account. This does not reserve a username. The
 * user chooses one only after email confirmation establishes a verified session.
 *
 * @param {object} credentials
 * @param {string} credentials.email
 * @param {string} credentials.password
 * @param {string} credentials.emailRedirectTo
 * @returns {Promise<{ ok: boolean, requiresEmailConfirmation?: boolean, user?: object|null, skipped?: boolean, reason?: string, error?: unknown }>}
 */
export async function signUpWithEmailPassword(credentials = {}) {
  const ready = await ensureReady();
  if (!ready.ok) return ready;

  const email = normalizeEmail(credentials.email);
  const password = typeof credentials.password === 'string' ? credentials.password : '';
  const emailRedirectTo = credentials.emailRedirectTo || syncConfig.redirectTo || getDefaultRedirectUrl();
  if (!email || !password) return skipped('invalid_credentials');

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo }
    });
    if (error) return authError(error, 'signup_failed');
    return {
      ok: true,
      requiresEmailConfirmation: !data?.session,
      user: data?.user || null
    };
  } catch (error) {
    return authError(error, 'signup_failed');
  }
}

/**
 * Sign in with email/password. Errors intentionally do not distinguish an
 * unknown email from an incorrect password or an OAuth-only account.
 *
 * @param {object} credentials
 * @param {string} credentials.email
 * @param {string} credentials.password
 * @returns {Promise<{ ok: boolean, user?: object, skipped?: boolean, reason?: string }>}
 */
export async function signInWithEmailPassword(credentials = {}) {
  const ready = await ensureReady();
  if (!ready.ok) return ready;

  const email = normalizeEmail(credentials.email);
  const password = typeof credentials.password === 'string' ? credentials.password : '';
  if (!email || !password) return skipped('invalid_credentials');

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data?.user) return { ok: false, reason: 'invalid_credentials' };
    profileCache = null;
    return { ok: true, user: data.user };
  } catch (_error) {
    return { ok: false, reason: 'invalid_credentials' };
  }
}

/**
 * Request a password reset. The result intentionally remains neutral so an
 * editor UI can always say "Check your email" without account enumeration.
 *
 * @param {object} options
 * @param {string} options.email
 * @param {string} options.redirectTo
 * @returns {Promise<{ ok: boolean, sent?: boolean, skipped?: boolean, reason?: string }>}
 */
export async function requestPasswordReset(options = {}) {
  const ready = await ensureReady();
  if (!ready.ok) return ready;

  const email = normalizeEmail(options.email);
  if (!email) return skipped('invalid_credentials');

  try {
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: options.redirectTo || syncConfig.redirectTo || getDefaultRedirectUrl()
    });
  } catch (_error) {
    // Keep a neutral response for all server-side recovery outcomes.
  }
  return { ok: true, sent: true };
}

/**
 * Add or replace a password for the current signed-in user. This is how a
 * Google account adds email/password access without becoming a second user.
 *
 * @param {object} options
 * @param {string} options.password
 * @returns {Promise<{ ok: boolean, skipped?: boolean, reason?: string, error?: unknown }>}
 */
export async function setPassword(options = {}) {
  const ready = await ensureReady();
  if (!ready.ok) return ready;

  const password = typeof options.password === 'string' ? options.password : '';
  if (!password) return skipped('invalid_password');
  if (!(await getCurrentUser())) return skipped('signed_out');

  try {
    const { error } = await supabase.auth.updateUser({ password });
    return error ? authError(error, 'password_update_failed') : { ok: true };
  } catch (error) {
    return authError(error, 'password_update_failed');
  }
}

/**
 * Sign out of Supabase Auth. Local phrasing projects remain on this device.
 *
 * @returns {Promise<{ ok: boolean, skipped?: boolean, reason?: string, error?: unknown }>}
 */
export async function signOut() {
  const ready = await ensureConfigured();
  if (!ready.ok) return ready;

  try {
    const { error } = await supabase.auth.signOut();
    if (error) return gracefulError(error);
    profileCache = null;
    return { ok: true };
  } catch (error) {
    return gracefulError(error);
  }
}

/**
 * Return the signed-in Supabase user, or null on any recoverable failure.
 *
 * @returns {Promise<object|null>}
 */
export async function getCurrentUser() {
  const ready = await ensureConfigured();
  if (!ready.ok) return null;

  try {
    const { data, error } = await supabase.auth.getUser();
    return error ? null : data?.user || null;
  } catch (_error) {
    return null;
  }
}

/**
 * Return the current account's private profile, or null when no username has
 * been selected yet, the user is signed out, or the request cannot complete.
 *
 * @returns {Promise<object|null>}
 */
export async function getCurrentProfile() {
  const ready = await ensureReady();
  if (!ready.ok) return null;

  const user = await getCurrentUser();
  return user ? getProfileForUser(user.id) : null;
}

/**
 * Set the signed-in user's private username. It is normalized to lowercase
 * before the database performs its case-insensitive uniqueness check.
 *
 * @param {string} username
 * @returns {Promise<{ ok: boolean, profile?: object, skipped?: boolean, reason?: string, error?: unknown }>}
 */
export async function setUsername(username) {
  const ready = await ensureReady();
  if (!ready.ok) return ready;

  const user = await getCurrentUser();
  if (!user) return skipped('signed_out');

  const normalized = normalizeUsername(username);
  if (!normalized) return skipped('invalid_username');

  try {
    const { data, error } = await supabase
      .from(syncConfig.profileTableName)
      .upsert({ user_id: user.id, username: normalized }, { onConflict: 'user_id' })
      .select('user_id,username,created_at,updated_at')
      .single();

    if (error) return profileError(error);
    profileCache = data;
    return { ok: true, profile: data };
  } catch (error) {
    return profileError(error);
  }
}

/**
 * Alias for account settings UIs.
 *
 * @param {string} username
 * @returns {Promise<{ ok: boolean, profile?: object, skipped?: boolean, reason?: string, error?: unknown }>}
 */
export async function updateUsername(username) {
  return setUsername(username);
}

/**
 * Detect a Supabase password-recovery callback. The reset page must also wait
 * for a current user before permitting setPassword().
 *
 * @returns {boolean}
 */
export function isPasswordRecoveryCallback() {
  if (typeof window === 'undefined') return false;
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return query.get('type') === 'recovery' || hash.get('type') === 'recovery';
}

/**
 * Upsert one project to the cloud. The full editor session is stored as the
 * payload; list-friendly fields are copied into columns.
 *
 * @param {string} projectId
 * @param {object} projectData
 * @returns {Promise<{ ok: boolean, skipped?: boolean, reason?: string, row?: object, error?: unknown }>}
 */
export async function saveProjectToCloud(projectId, projectData) {
  const account = await ensureCloudAccount();
  if (!account.ok) return account;
  if (!projectId || !projectData || typeof projectData !== 'object') {
    return skipped('invalid_project');
  }

  const row = buildProjectRow(String(projectId), projectData, account.user.id);
  try {
    const { data, error } = await supabase
      .from(syncConfig.tableName)
      .upsert(row, { onConflict: 'user_id,id' })
      .select()
      .single();
    return error ? gracefulError(error) : { ok: true, row: data };
  } catch (error) {
    return gracefulError(error);
  }
}

/**
 * Load all cloud projects for the current complete account. Returns [] when
 * offline, signed out, email-unconfirmed, profile-incomplete, or on failure.
 *
 * @returns {Promise<Array<object>>}
 */
export async function loadAllProjectsFromCloud() {
  const account = await ensureCloudAccount();
  if (!account.ok) return [];

  try {
    const { data, error } = await supabase
      .from(syncConfig.tableName)
      .select('id,name,verse_reference,language_mode,payload,created_at,updated_at')
      .eq('user_id', account.user.id)
      .order('updated_at', { ascending: false });
    return error ? [] : data || [];
  } catch (_error) {
    return [];
  }
}

/**
 * Delete one cloud project. The editor owns its matching localStorage delete.
 *
 * @param {string} projectId
 * @returns {Promise<{ ok: boolean, skipped?: boolean, reason?: string, error?: unknown }>}
 */
export async function deleteProjectFromCloud(projectId) {
  const account = await ensureCloudAccount();
  if (!account.ok) return account;
  if (!projectId) return skipped('invalid_project');

  try {
    const { error } = await supabase
      .from(syncConfig.tableName)
      .delete()
      .eq('user_id', account.user.id)
      .eq('id', String(projectId));
    return error ? gracefulError(error) : { ok: true };
  } catch (error) {
    return gracefulError(error);
  }
}

/**
 * Upload existing local phrasing projects once after a complete account signs
 * in. The caller supplies the editor-specific localStorage reader.
 *
 * @param {object} options
 * @param {() => Array<object>|Promise<Array<object>>} options.listLocalProjects
 * @param {boolean} [options.force=false]
 * @returns {Promise<{ ok: boolean, skipped?: boolean, reason?: string, uploaded: number, failed: number }>}
 */
export async function migrateLocalProjectsOnce(options = {}) {
  const account = await ensureCloudAccount();
  if (!account.ok) return { ...account, uploaded: 0, failed: 0 };

  const { listLocalProjects, force = false } = options;
  if (typeof listLocalProjects !== 'function') {
    return { ...skipped('missing_local_project_reader'), uploaded: 0, failed: 0 };
  }

  const flagKey = getMigrationFlagKey(account.user.id);
  if (!force && readLocalStorage(flagKey)) {
    return { ...skipped('already_migrated'), uploaded: 0, failed: 0 };
  }

  let localProjects;
  try {
    localProjects = await listLocalProjects();
  } catch (error) {
    return { ...gracefulError(error), uploaded: 0, failed: 0 };
  }

  if (!Array.isArray(localProjects) || localProjects.length === 0) {
    writeMigrationFlag(flagKey, account.user.id, 0);
    return { ok: true, uploaded: 0, failed: 0 };
  }

  let uploaded = 0;
  let failed = 0;
  for (const item of localProjects) {
    const result = await saveProjectToCloud(item.projectId || item.id, item.projectData || item.data || item.payload);
    if (result.ok) uploaded += 1;
    else failed += 1;
  }

  if (failed === 0) writeMigrationFlag(flagKey, account.user.id, uploaded);
  return { ok: failed === 0, uploaded, failed };
}

/**
 * Subscribe to Supabase auth changes. Configure with the UMD bundle already
 * loaded when a callback page needs this listener during its first paint.
 *
 * @param {(event: string, session: object|null) => void} callback
 * @returns {() => void}
 */
export function onAuthStateChange(callback) {
  if (!supabase || typeof callback !== 'function') return () => {};
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || event === 'USER_UPDATED') profileCache = null;
    callback(event, session);
  });
  return () => data?.subscription?.unsubscribe?.();
}

function buildProjectRow(projectId, projectData, userId) {
  return {
    id: projectId,
    user_id: userId,
    name: getProjectName(projectData),
    verse_reference: getFirstString(projectData, ['verseReference', 'verse_reference', 'reference', 'ref']),
    language_mode: normalizeLanguageMode(getFirstString(projectData, ['languageMode', 'language_mode', 'language'])),
    payload: projectData
  };
}

function getProjectName(projectData) {
  return getFirstString(projectData, ['name', 'projectName', 'project_name', 'title']) || 'Untitled project';
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

async function ensureCloudAccount() {
  const ready = await ensureReady();
  if (!ready.ok) return ready;

  const user = await getCurrentUser();
  if (!user) return skipped('signed_out');
  if (!isVerifiedUser(user)) return skipped('email_unconfirmed');

  const profile = await getProfileForUser(user.id);
  if (!profile) return skipped('profile_incomplete');
  return { ok: true, user, profile };
}

async function ensureReady() {
  if (!isOnline()) return skipped('offline');
  return ensureConfigured();
}

async function ensureConfigured() {
  if (supabase) return { ok: true };
  if (!syncConfig.supabaseUrl || !syncConfig.supabaseAnonKey) return skipped('not_configured');

  const createClient = await loadCreateClient();
  if (!createClient) return skipped('supabase_library_unavailable');
  supabase = createSupabaseClient(createClient);
  return { ok: true };
}

function createSupabaseClient(createClient) {
  return createClient(syncConfig.supabaseUrl, syncConfig.supabaseAnonKey, {
    auth: { autoRefreshToken: true, detectSessionInUrl: true, persistSession: true }
  });
}

async function getProfileForUser(userId) {
  if (profileCache?.user_id === userId) return profileCache;
  try {
    const { data, error } = await supabase
      .from(syncConfig.profileTableName)
      .select('user_id,username,created_at,updated_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) return null;
    profileCache = data;
    return data;
  } catch (_error) {
    return null;
  }
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

function normalizeEmail(value) {
  const email = typeof value === 'string' ? value.trim() : '';
  return email && email.includes('@') ? email : '';
}

function normalizeUsername(value) {
  const username = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return USERNAME_PATTERN.test(username) ? username : '';
}

function isVerifiedUser(user) {
  return Boolean(user?.email_confirmed_at || user?.confirmed_at || user?.phone_confirmed_at);
}

function isOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

function getDefaultRedirectUrl() {
  return typeof window === 'undefined' ? undefined : window.location.href;
}

function getMigrationFlagKey(userId) {
  return `${syncConfig.migrationFlagPrefix}:${userId}`;
}

function writeMigrationFlag(flagKey, userId, uploaded) {
  writeLocalStorage(flagKey, JSON.stringify({ userId, migratedAt: new Date().toISOString(), uploaded }));
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
    // If storage is blocked, repeat uploads are still safe because they upsert.
  }
}

function skipped(reason) {
  return { ok: false, skipped: true, reason };
}

function gracefulError(error) {
  return { ok: false, error };
}

function authError(error, fallbackReason) {
  if (error?.status === 400 || error?.status === 422) return { ok: false, reason: fallbackReason };
  return gracefulError(error);
}

function profileError(error) {
  if (error?.code === '23505') return { ok: false, reason: 'username_unavailable' };
  if (error?.code === '23514') return { ok: false, reason: 'invalid_username' };
  return gracefulError(error);
}
