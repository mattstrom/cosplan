// Automated refetching of Sched schedules — no server needed.
//
// Anyone imported from a URL keeps that URL in person.source, so whatever
// tab happens to be open can re-derive the iCal feed and pull fresh data
// periodically (and again when the tab regains focus). Refetches that
// change nothing are dropped before they touch state — see
// scheduleUnchanged in logic.js — so idle polls don't bump revisions or
// churn live sync; real changes flow through the normal import path and
// propagate to the group like any edit.

import { CONFIG } from './config.js';
import { fetchScheduleIcs } from './ingest.js';

export const DEFAULT_REFETCH_MS = 15 * 60 * 1000;

export function isAutoRefreshable(person) {
  return typeof person.source === 'string' && /^https?:\/\//i.test(person.source);
}

/**
 * getState()                        -> current local state
 * applyImport(personId, text, url) -> run the (auto) import path
 * onChange()                        -> repaint hook after each attempt
 */
export function createRefetchManager({ getState, applyImport, onChange = () => {} }) {
  const intervalMs = CONFIG.REFETCH_MS || DEFAULT_REFETCH_MS;
  const lastChecked = {}; // personId -> ms of last fetch attempt
  let running = false;

  async function refreshDue({ force = false } = {}) {
    if (running) return;
    running = true;
    try {
      const due = getState().people.filter((p) => isAutoRefreshable(p)
        && (force || Date.now() - (lastChecked[p.id] || 0) >= intervalMs));
      for (const person of due) {
        lastChecked[person.id] = Date.now();
        try {
          const { text, icsUrl } = await fetchScheduleIcs(person.source);
          applyImport(person.id, text, icsUrl);
        } catch {
          // Background refresh — stay quiet and retry next cycle; the
          // manual Fetch button still surfaces errors.
        }
        onChange();
      }
    } finally {
      running = false;
    }
  }

  // Tick every minute but throttle per person, so newly-imported people and
  // wake-from-sleep tabs are picked up promptly without hammering Sched.
  setInterval(refreshDue, 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshDue();
  });
  refreshDue(); // and once on load, so the app opens with current data

  return {
    info: () => ({ intervalMs, lastChecked: { ...lastChecked } }),
    refreshNow: () => refreshDue({ force: true }),
  };
}
