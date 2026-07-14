// Sched Lane — compare Sched (sched.com) personal schedules across a group.
// Static app: all data lives in localStorage and moves between friends via
// share codes. No backend.

import { parseICS } from './ics.js';
import { eventKey, DEFAULT_TIER, mergeStates, nextRev } from './logic.js';
import { loadState, saveState, clearState, emptyState, encodeShare, decodeShare } from './store.js';
import { fetchScheduleIcs } from './ingest.js';
import { createSyncManager, syncEnabled } from './sync.js';
import { demoState } from './demo.js';
import { el } from './ui/dom.js';
import { renderGroup, syncStatusView } from './ui/group.js';
import { stableStringify } from './sync.js';
import { renderTimeline } from './ui/timeline.js';
import { renderConflicts } from './ui/conflicts.js';
import { renderRankings } from './ui/rankings.js';

const COLORS = ['#3b82f6', '#e5484d', '#16a34a', '#d97706', '#8b5cf6', '#0891b2', '#db2777', '#65a30d'];

let state = loadState();
let ui = {
  tab: state.people.length ? 'timeline' : 'group',
  day: null,
  rankPerson: null,
  importStatus: {},
  shareStatus: null,
};

const sync = createSyncManager({
  getState: () => state,
  setSyncedState: (next) => {
    state = next;
    saveState(state);
    render();
  },
  // Repaint only the status line — a full render on every poll would yank
  // the DOM out from under the user (lost input focus, mid-click detaches).
  onChange: () => {
    const node = document.getElementById('sync-status');
    if (!node) return;
    const { text, kind } = syncStatusView(sync.info());
    node.className = `import-status ${kind}`;
    node.textContent = text;
  },
});

function setState(mutate) {
  mutate(state);
  saveState(state);
  sync.schedulePush();
  render();
}

// Bump a person's revision so live sync knows this copy of them is newest.
function touch(s, personId) {
  const p = s.people.find((x) => x.id === personId);
  if (p) p.rev = nextRev(p.rev);
}

function setUi(patch) {
  ui = { ...ui, ...patch };
  render();
}

function setImportStatus(personId, kind, message) {
  ui.importStatus = { ...ui.importStatus, [personId]: kind ? { kind, message } : undefined };
  render();
}

// --- Actions --------------------------------------------------------------

const actions = {
  addPerson(name) {
    setState((s) => {
      const now = Date.now();
      s.people.push({
        id: `p-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        name,
        color: COLORS[s.people.length % COLORS.length],
        source: '',
        rev: now,
      });
      // Re-adding someone must beat any old removal tombstone.
      if (s.removed) delete s.removed[name.trim().toLowerCase()];
    });
  },

  renamePerson(id, name) {
    if (!name.trim()) return;
    setState((s) => {
      const p = s.people.find((x) => x.id === id);
      if (p) p.name = name.trim();
      touch(s, id);
    });
  },

  removePerson(id) {
    const person = state.people.find((p) => p.id === id);
    if (person && !confirm(`Remove ${person.name} and their picks?`)) return;
    setState((s) => {
      s.people = s.people.filter((p) => p.id !== id);
      delete s.picks[id];
      if (person) {
        s.removed = s.removed || {};
        s.removed[person.name.trim().toLowerCase()] = Date.now();
      }
    });
  },

  setTier(personId, key, tier) {
    setState((s) => {
      (s.picks[personId] = s.picks[personId] || {})[key] = tier;
      touch(s, personId);
    });
  },

  removePick(personId, key) {
    setState((s) => {
      if (s.picks[personId]) delete s.picks[personId][key];
      touch(s, personId);
    });
  },

  importFromText(personId, text, sourceLabel) {
    try {
      const { events } = parseICS(text);
      if (!events.length) throw new Error('No events found in that calendar.');
      setState((s) => {
        const prev = s.picks[personId] || {};
        const next = {};
        for (const e of events) {
          const key = eventKey(e);
          s.events[key] = { key, ...e };
          next[key] = prev[key] ?? DEFAULT_TIER; // keep tiers/bookmarks across re-imports (bookmark is 0, so no ||)
        }
        s.picks[personId] = next;
        const p = s.people.find((x) => x.id === personId);
        if (p) p.source = sourceLabel;
        touch(s, personId);
      });
      setImportStatus(personId, 'ok', `Imported ${events.length} events ✓`);
    } catch (err) {
      setImportStatus(personId, 'error', err.message);
    }
  },

  async importFromUrl(personId, url) {
    setImportStatus(personId, 'busy', 'Fetching…');
    try {
      const { text, icsUrl } = await fetchScheduleIcs(url, {
        onStatus: (msg) => setImportStatus(personId, 'busy', msg),
      });
      actions.importFromText(personId, text, icsUrl);
    } catch (err) {
      setImportStatus(personId, 'error', err.message);
    }
  },

  async importFromFile(personId, file) {
    try {
      const text = await file.text();
      actions.importFromText(personId, text, file.name);
    } catch (err) {
      setImportStatus(personId, 'error', err.message);
    }
  },

  loadDemo() {
    const inGroup = Boolean(sync.info().code);
    const note = inGroup ? ' You will also leave your sync group so the demo doesn’t overwrite it.' : '';
    if (state.people.length && !confirm(`Replace the current group with the demo group?${note}`)) return;
    if (inGroup) sync.leaveGroup();
    state = demoState(emptyState());
    saveState(state);
    ui = { ...ui, tab: 'timeline', day: null, rankPerson: null, importStatus: {} };
    render();
  },

  async copyShareCode() {
    try {
      const code = await encodeShare(state);
      await navigator.clipboard.writeText(code);
      setUi({ shareStatus: { kind: 'ok', message: `Copied ${code.length.toLocaleString()}-character share code ✓` } });
    } catch (err) {
      setUi({ shareStatus: { kind: 'error', message: `Couldn't copy: ${err.message}` } });
    }
  },

  async mergeShareCode(code) {
    try {
      const incoming = await decodeShare(code);
      setState((s) => {
        const merged = mergeStates(s, incoming);
        Object.assign(s, merged);
      });
      setUi({ shareStatus: { kind: 'ok', message: `Merged ${incoming.people.length} people ✓` } });
    } catch (err) {
      setUi({ shareStatus: { kind: 'error', message: err.message } });
    }
  },

  createSyncGroup() {
    sync.createGroup();
    render();
  },

  joinSyncGroup(code) {
    sync.joinGroup(code);
    render();
  },

  leaveSyncGroup() {
    if (!confirm('Leave the sync group? Your local copy stays; you just stop syncing.')) return;
    sync.leaveGroup();
    render();
  },

  async copySyncLink() {
    const { code } = sync.info();
    const url = `${location.origin}${location.pathname}#g=${code}`;
    await navigator.clipboard.writeText(url);
    setUi({ shareStatus: { kind: 'ok', message: 'Join link copied ✓ — anyone who opens it joins your group.' } });
  },

  downloadJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: 'sched-lane-group.json' });
    a.click();
    URL.revokeObjectURL(a.href);
  },

  clearAll() {
    const inGroup = Boolean(sync.info().code);
    const note = inGroup ? ' You will also leave your sync group (the group’s shared copy is kept for the others).' : '';
    if (!confirm(`Delete all people, events, and picks?${note}`)) return;
    if (inGroup) sync.leaveGroup();
    clearState();
    state = emptyState();
    ui = { tab: 'group', day: null, rankPerson: null, importStatus: {}, shareStatus: null };
    render();
  },
};

// --- Rendering ------------------------------------------------------------

const TABS = [
  ['group', 'Group'],
  ['timeline', 'Timeline'],
  ['conflicts', 'Conflicts'],
  ['rankings', 'Rankings'],
];

const VIEWS = {
  group: renderGroup,
  timeline: renderTimeline,
  conflicts: renderConflicts,
  rankings: renderRankings,
};

function render() {
  const ctx = { state, ui, setState, setUi, actions, sync: sync.info() };

  const nav = document.getElementById('tabs');
  nav.replaceChildren(...TABS.map(([id, label]) => el('button', {
    class: `tab ${ui.tab === id ? 'active' : ''}`,
    onclick: () => setUi({ tab: id }),
  }, label)));

  const view = document.getElementById('view');
  view.replaceChildren((VIEWS[ui.tab] || renderGroup)(ctx));
}

// Cross-tab sync within the same browser: another tab saving to
// localStorage fires 'storage' here — merge its copy into ours so two open
// tabs stay live without a server round-trip (and even with sync off).
window.addEventListener('storage', (e) => {
  if (e.key !== 'sched-lane:v1' || !e.newValue) return;
  try {
    const incoming = JSON.parse(e.newValue);
    const merged = mergeStates(state, incoming);
    if (stableStringify(merged) !== stableStringify(state)) {
      state = merged;
      render();
    }
    // Only write back if we had something the other tab lacked — writing
    // identical data would just ping-pong storage events between tabs.
    if (stableStringify(merged) !== stableStringify(incoming)) {
      saveState(state);
      sync.schedulePush();
    }
  } catch { /* ignore malformed writes */ }
});

// Join links: opening …/#g=<code> puts you in that sync group.
const hashMatch = /#g=([a-z0-9]{16,})/i.exec(location.hash);
if (hashMatch && syncEnabled()) {
  const target = hashMatch[1].toLowerCase();
  const current = sync.info().code;
  if (current !== target
    && (!current || confirm('This link is for a different sync group. Switch to it?'))) {
    sync.joinGroup(target);
  }
  history.replaceState(null, '', location.pathname + location.search);
}

render();
