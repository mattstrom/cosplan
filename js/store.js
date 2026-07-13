// Persistence (localStorage) and share codes (gzip + base64) so a group can
// swap schedules without any backend.

import { DEFAULT_TZ } from './time.js';

const STORAGE_KEY = 'sched-lane:v1';
export const SHARE_PREFIX_GZIP = 'SL1:';
export const SHARE_PREFIX_PLAIN = 'SL0:';

export function emptyState() {
  return {
    version: 1,
    tz: DEFAULT_TZ,
    people: [],       // [{ id, name, color, source, rev }]
    events: {},       // { [eventKey]: { key, uid, title, start, end, allDay, venue, description, url } }
    picks: {},        // { [personId]: { [eventKey]: tier } }
    removed: {},      // { [lowercased name]: tombstone ms } — for sync merging
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    return { ...emptyState(), ...parsed };
  } catch {
    return emptyState();
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('Could not persist state', err);
  }
}

export function clearState() {
  localStorage.removeItem(STORAGE_KEY);
}

// --- Share codes ---------------------------------------------------------

function bytesToBase64(bytes) {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function pipeThrough(bytes, transform) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodeShare(state) {
  const json = JSON.stringify({
    version: state.version,
    tz: state.tz,
    people: state.people,
    events: state.events,
    picks: state.picks,
    removed: state.removed || {},
  });
  const bytes = new TextEncoder().encode(json);
  if (typeof CompressionStream !== 'undefined') {
    const gz = await pipeThrough(bytes, new CompressionStream('gzip'));
    return SHARE_PREFIX_GZIP + bytesToBase64(gz);
  }
  return SHARE_PREFIX_PLAIN + bytesToBase64(bytes);
}

export async function decodeShare(code) {
  const trimmed = code.trim();
  let bytes;
  if (trimmed.startsWith(SHARE_PREFIX_GZIP)) {
    const gz = base64ToBytes(trimmed.slice(SHARE_PREFIX_GZIP.length));
    bytes = await pipeThrough(gz, new DecompressionStream('gzip'));
  } else if (trimmed.startsWith(SHARE_PREFIX_PLAIN)) {
    bytes = base64ToBytes(trimmed.slice(SHARE_PREFIX_PLAIN.length));
  } else {
    // Maybe it's raw exported JSON.
    try {
      return normalizeShared(JSON.parse(trimmed));
    } catch {
      throw new Error('Unrecognized share code — it should start with "SL1:".');
    }
  }
  return normalizeShared(JSON.parse(new TextDecoder().decode(bytes)));
}

function normalizeShared(obj) {
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.people)) {
    throw new Error('Share code did not contain group data.');
  }
  return {
    version: obj.version || 1,
    tz: obj.tz || DEFAULT_TZ,
    people: obj.people,
    events: obj.events || {},
    picks: obj.picks || {},
    removed: obj.removed || {},
  };
}
