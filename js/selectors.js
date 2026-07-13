// Derived-state helpers shared by the views.

import { dayKeyInTz } from './time.js';

// [{ event, tier }] for one person, sorted by start time.
export function personPicks(state, personId) {
  const picks = state.picks[personId] || {};
  return Object.entries(picks)
    .map(([key, tier]) => ({ event: state.events[key], tier }))
    .filter((p) => p.event)
    .sort((a, b) => a.event.start - b.event.start);
}

// Map eventKey -> [{ person, tier }] over every picked event.
export function eventAttendees(state) {
  const map = new Map();
  for (const person of state.people) {
    const picks = state.picks[person.id] || {};
    for (const [key, tier] of Object.entries(picks)) {
      if (!state.events[key]) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ person, tier });
    }
  }
  return map;
}

// Sorted 'YYYY-MM-DD' day keys that have at least one picked event.
export function pickedDayKeys(state) {
  const days = new Set();
  for (const key of eventAttendees(state).keys()) {
    days.add(dayKeyInTz(state.tz, state.events[key].start));
  }
  return [...days].sort();
}

export function picksForDay(state, personId, dayKey) {
  return personPicks(state, personId)
    .filter((p) => dayKeyInTz(state.tz, p.event.start) === dayKey);
}
