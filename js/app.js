// Sched Lane — compare Sched (sched.com) personal schedules across a group.
// Static app: all data lives in localStorage and moves between friends via
// share codes. No backend.

import { parseICS } from './ics.js';
import { eventKey, DEFAULT_TIER, mergeStates } from './logic.js';
import { loadState, saveState, clearState, emptyState, encodeShare, decodeShare } from './store.js';
import { fetchScheduleIcs } from './ingest.js';
import { demoState } from './demo.js';
import { el } from './ui/dom.js';
import { renderGroup } from './ui/group.js';
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

function setState(mutate) {
  mutate(state);
  saveState(state);
  render();
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
      s.people.push({
        id: `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        name,
        color: COLORS[s.people.length % COLORS.length],
        source: '',
      });
    });
  },

  renamePerson(id, name) {
    if (!name.trim()) return;
    setState((s) => {
      const p = s.people.find((x) => x.id === id);
      if (p) p.name = name.trim();
    });
  },

  removePerson(id) {
    const person = state.people.find((p) => p.id === id);
    if (person && !confirm(`Remove ${person.name} and their picks?`)) return;
    setState((s) => {
      s.people = s.people.filter((p) => p.id !== id);
      delete s.picks[id];
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
          next[key] = prev[key] || DEFAULT_TIER; // keep tiers across re-imports
        }
        s.picks[personId] = next;
        const p = s.people.find((x) => x.id === personId);
        if (p) p.source = sourceLabel;
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
    if (state.people.length && !confirm('Replace the current group with the demo group?')) return;
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

  downloadJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: 'sched-lane-group.json' });
    a.click();
    URL.revokeObjectURL(a.href);
  },

  clearAll() {
    if (!confirm('Delete all people, events, and picks?')) return;
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
  const ctx = { state, ui, setState, setUi, actions };

  const nav = document.getElementById('tabs');
  nav.replaceChildren(...TABS.map(([id, label]) => el('button', {
    class: `tab ${ui.tab === id ? 'active' : ''}`,
    onclick: () => setUi({ tab: id }),
  }, label)));

  const view = document.getElementById('view');
  view.replaceChildren((VIEWS[ui.tab] || renderGroup)(ctx));
}

render();
