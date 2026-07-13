// Pure comparison logic: event identity, ranking tiers, overlap clustering,
// timeline lane assignment, and conflict detection. No DOM, no storage —
// everything here is unit-testable.

export const TIERS = {
  1: { label: 'Must-see', short: 'MUST', weight: 3 },
  2: { label: 'Want to go', short: 'WANT', weight: 2 },
  3: { label: 'If time', short: 'MAYBE', weight: 1 },
};
export const DEFAULT_TIER = 2;

// Stable identity for an event so the same panel imported by two people
// dedupes. Sched keeps UIDs stable per event; fall back to title+start.
export function eventKey(ev) {
  if (ev.uid) return `uid:${ev.uid}`;
  return `ts:${ev.start}|${ev.title.toLowerCase().replace(/\s+/g, ' ').trim()}`;
}

export function overlaps(a, b) {
  return a.start < b.end && b.start < a.end;
}

// Group items ({start, end, ...}) into transitively-overlapping clusters.
// Items must be pre-sorted by start. Returns arrays of items.
export function buildClusters(items) {
  const clusters = [];
  let cluster = null;
  let clusterEnd = -Infinity;
  for (const item of items) {
    if (!cluster || item.start >= clusterEnd) {
      cluster = [];
      clusters.push(cluster);
      clusterEnd = -Infinity;
    }
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  return clusters;
}

// Assign side-by-side lanes to one person's events for the timeline.
// Input: events sorted by start. Output: [{ event, lane, laneCount }].
export function assignLanes(events) {
  const results = [];
  for (const cluster of buildClusters(events)) {
    const laneEnds = []; // end time of the last event in each lane
    const placed = [];
    for (const ev of cluster) {
      let lane = laneEnds.findIndex((end) => end <= ev.start);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(0);
      }
      laneEnds[lane] = ev.end;
      placed.push({ event: ev, lane });
    }
    for (const p of placed) results.push({ ...p, laneCount: laneEnds.length });
  }
  return results;
}

// --- Conflict analysis --------------------------------------------------

// Events on one person's schedule that overlap each other.
// picks: [{ event, tier }] for one person. Returns [{ a, b }] pairs where
// `a` is the suggested keep (higher tier wins, then earlier start).
export function personalConflicts(picks) {
  const sorted = [...picks].sort((x, y) => x.event.start - y.event.start);
  const pairs = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j].event.start >= sorted[i].event.end) break;
      if (overlaps(sorted[i].event, sorted[j].event)) {
        const [a, b] = sorted[i].tier <= sorted[j].tier
          ? [sorted[i], sorted[j]]
          : [sorted[j], sorted[i]];
        pairs.push({ a, b });
      }
    }
  }
  return pairs;
}

/**
 * Find "group splits": time windows where members picked different,
 * overlapping events.
 *
 * entries: [{ event, attendees: [{ person, tier }] }] — one entry per
 * distinct event picked by at least one person.
 *
 * Returns clusters worth resolving: [{ start, end, options }] where each
 * option is { event, attendees, score } sorted best-first. Score is the
 * tier-weighted sum, so the "suggested" group pick is options[0].
 */
export function groupSplits(entries) {
  const items = entries
    .map((e) => ({ ...e, start: e.event.start, end: e.event.end }))
    .sort((a, b) => a.start - b.start);
  const splits = [];
  for (const cluster of buildClusters(items)) {
    if (cluster.length < 2) continue;
    // Only a split if two *different* people are at overlapping *different*
    // events — same-person overlaps are personal conflicts, handled above.
    const isSplit = cluster.some((a, i) =>
      cluster.some((b, j) => {
        if (j <= i || !overlaps(a, b)) return false;
        const aIds = a.attendees.map((x) => x.person.id);
        const bIds = b.attendees.map((x) => x.person.id);
        return aIds.some((id) => !bIds.includes(id)) || bIds.some((id) => !aIds.includes(id));
      }));
    if (!isSplit) continue;
    const options = cluster
      .map((c) => ({
        event: c.event,
        attendees: c.attendees,
        score: c.attendees.reduce((sum, a) => sum + TIERS[a.tier].weight, 0),
      }))
      .sort((a, b) => b.score - a.score || a.event.start - b.event.start);
    splits.push({
      start: Math.min(...cluster.map((c) => c.start)),
      end: Math.max(...cluster.map((c) => c.end)),
      options,
    });
  }
  return splits;
}

// --- State merging (share codes and live sync) ---------------------------

const nameKey = (p) => p.name.trim().toLowerCase();

/**
 * Merge another copy of the group into ours. Used both for pasted share
 * codes and for live sync (read-merge-write against the server copy), so it
 * must converge when run repeatedly in either direction:
 *
 * - Events are unioned (they're immutable facts about the con).
 * - People match by id first (same group synced across devices), then by
 *   name (independently-built groups merging via share code).
 * - Each person carries a revision `rev` (bumped on any local edit to them
 *   or their picks). Higher rev wins wholesale — that's what lets tier
 *   changes AND pick removals propagate. Equal revs (legacy data) union.
 * - `removed` maps nameKey -> tombstone timestamp; a person stays gone
 *   unless re-added with a newer rev.
 */
export function mergeStates(base, incoming) {
  const out = {
    ...base,
    people: base.people.map((p) => ({ ...p })),
    events: { ...base.events, ...(incoming.events || {}) },
    picks: Object.fromEntries(
      Object.entries(base.picks).map(([id, v]) => [id, { ...v }]),
    ),
    removed: { ...(base.removed || {}) },
  };
  for (const [k, ts] of Object.entries(incoming.removed || {})) {
    out.removed[k] = Math.max(out.removed[k] || 0, ts);
  }

  for (const person of incoming.people || []) {
    const inRev = person.rev || 0;
    const inPicks = (incoming.picks || {})[person.id] || {};
    const existing = out.people.find((p) => p.id === person.id)
      || out.people.find((p) => nameKey(p) === nameKey(person));
    if (!existing) {
      if ((out.removed[nameKey(person)] ?? -1) >= inRev) continue; // stays deleted
      const copy = { ...person };
      out.people.push(copy);
      out.picks[copy.id] = { ...inPicks };
    } else {
      const baseRev = existing.rev || 0;
      if (inRev > baseRev) {
        existing.name = person.name;
        existing.color = person.color || existing.color;
        existing.rev = inRev;
        out.picks[existing.id] = { ...inPicks };
      } else if (inRev === baseRev) {
        out.picks[existing.id] = { ...(out.picks[existing.id] || {}), ...inPicks };
      }
      // inRev < baseRev: our copy is newer, keep it untouched.
    }
  }

  // Apply tombstones to the merged result.
  out.people = out.people.filter((p) => {
    if ((out.removed[nameKey(p)] ?? -1) >= (p.rev || 0)) {
      delete out.picks[p.id];
      return false;
    }
    return true;
  });
  return out;
}
