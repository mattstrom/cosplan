// Live sync via Supabase — optional, enabled by filling in js/config.js.
//
// Model: one row per group, keyed by a long random group code. The code is
// the capability — whoever has it is in the group (same trust model as the
// copy-paste share codes, just stored server-side). The client talks to two
// SECURITY DEFINER Postgres functions over PostgREST (see
// supabase/schema.sql); direct table access is denied so strangers can't
// enumerate groups.
//
// Sync algorithm: read-merge-write. Every sync fetches the server copy,
// merges it with local state via mergeStates (per-person revisions decide
// winners), applies the result locally, and writes it back if the server
// copy was behind. Combined with polling + refetch-on-focus this converges
// even when two people race — a lost write is re-asserted on the loser's
// next poll.

import { CONFIG } from './config.js';
import { mergeStates } from './logic.js';

const CODE_KEY = 'sched-lane:groupCode';
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0/O/1/l/i

export function syncEnabled() {
  return Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
}

export function newGroupCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

async function rpc(name, args, { keepalive = false } = {}) {
  const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: CONFIG.SUPABASE_ANON_KEY,
      authorization: `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(args),
    // keepalive lets a save started on pagehide outlive the page. Bodies
    // are capped (~64 KB) in that mode; if the blob is bigger the request
    // fails and the change goes out on the next regular sync instead.
    keepalive,
  });
  if (!res.ok) {
    throw new Error(`sync request failed (${res.status})`);
  }
  const text = await res.text();
  return text && text !== 'null' ? JSON.parse(text) : null;
}

const getGroup = (code) => rpc('get_group', { p_code: code });
const saveGroup = (code, state, opts) => rpc('save_group', { p_code: code, p_state: state }, opts);

// JSON with sorted keys, so "did anything change?" comparisons don't get
// fooled by key order.
export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * getState()        -> current local state
 * setSyncedState(s) -> replace local state (persist + rerender, must NOT
 *                      schedule another push)
 * onChange()        -> rerender hook for status updates
 */
export function createSyncManager({ getState, setSyncedState, onChange = () => {} }) {
  let code = '';
  try { code = localStorage.getItem(CODE_KEY) || ''; } catch { /* private mode */ }
  let status = 'idle'; // idle | syncing | ok | error
  let statusDetail = '';
  let lastSync = null;
  let pushTimer = null;
  let pollTimer = null;
  let inFlight = false;
  let queued = false;

  function setStatus(s, detail = '') {
    status = s;
    statusDetail = detail;
    onChange();
  }

  async function syncNow() {
    if (!syncEnabled() || !code) return;
    if (inFlight) { queued = true; return; }
    inFlight = true;
    setStatus('syncing');
    try {
      const server = await getGroup(code);
      const local = getState();
      const merged = server ? mergeStates(local, server) : local;
      if (stableStringify(merged) !== stableStringify(local)) {
        setSyncedState(merged);
      }
      if (!server || stableStringify(merged) !== stableStringify(server)) {
        await saveGroup(code, merged, {
          keepalive: document.visibilityState === 'hidden',
        });
      }
      lastSync = Date.now();
      setStatus('ok');
    } catch (err) {
      setStatus('error', err.message);
    } finally {
      inFlight = false;
      if (queued) { queued = false; syncNow(); }
    }
  }

  function schedulePush() {
    if (!syncEnabled() || !code) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(syncNow, 600);
  }

  // A pending debounced push must not die with the page — flush it the
  // moment the tab is hidden or closing (locking a phone, switching apps).
  // There's no time for read-merge-write during teardown, so fire a blind
  // keepalive save; if it overwrites a peer's newer edit, per-person
  // revisions restore it on that peer's next regular sync.
  function flushPending() {
    if (!pushTimer || !code) return;
    clearTimeout(pushTimer);
    pushTimer = null;
    saveGroup(code, getState(), { keepalive: true }).catch(() => {});
  }

  function startPolling() {
    stopPolling();
    if (!syncEnabled() || !code) return;
    pollTimer = setInterval(syncNow, CONFIG.SYNC_POLL_MS || 20000);
  }

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  function setCode(next) {
    code = next;
    try {
      if (code) localStorage.setItem(CODE_KEY, code);
      else localStorage.removeItem(CODE_KEY);
    } catch { /* private mode */ }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncNow();
    else flushPending();
  });
  window.addEventListener('pagehide', flushPending);

  startPolling();
  if (code) syncNow();

  return {
    info: () => ({ enabled: syncEnabled(), code, status, statusDetail, lastSync }),
    schedulePush,
    syncNow,
    createGroup() {
      setCode(newGroupCode());
      startPolling();
      syncNow();
      return code;
    },
    joinGroup(newCode) {
      const clean = newCode.trim().replace(/^.*#g=/, '');
      if (!/^[a-z0-9]{16,}$/i.test(clean)) {
        setStatus('error', 'That doesn’t look like a group code.');
        return false;
      }
      setCode(clean.toLowerCase());
      startPolling();
      syncNow();
      return true;
    },
    leaveGroup() {
      setCode('');
      stopPolling();
      setStatus('idle');
    },
  };
}
