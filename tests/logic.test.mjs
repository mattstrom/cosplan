import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOOKMARK, assignLanes, buildClusters, eventKey, groupSplits, mergeStates,
  overlaps, personalConflicts, scheduleUnchanged, tierInfo, TIERS,
} from '../js/logic.js';
import { toIcsUrl, unwrapGoogleCalendarLink } from '../js/ingest.js';

const ev = (id, start, end, title = id) => ({ uid: id, key: `uid:${id}`, title, start, end });
const H = 60 * 60 * 1000;

test('eventKey prefers UID, falls back to normalized title+start', () => {
  assert.equal(eventKey({ uid: 'a@sched.com', title: 'X', start: 1 }), 'uid:a@sched.com');
  assert.equal(eventKey({ uid: '', title: '  Hall  H  Panel ', start: 5 }), 'ts:5|hall h panel');
});

test('overlaps is exclusive at boundaries', () => {
  assert.ok(overlaps({ start: 0, end: 10 }, { start: 5, end: 15 }));
  assert.ok(!overlaps({ start: 0, end: 10 }, { start: 10, end: 20 }));
});

test('buildClusters groups transitively overlapping intervals', () => {
  const clusters = buildClusters([
    { start: 0, end: 10 }, { start: 5, end: 20 }, { start: 15, end: 25 },
    { start: 30, end: 40 },
  ]);
  assert.equal(clusters.length, 2);
  assert.equal(clusters[0].length, 3);
  assert.equal(clusters[1].length, 1);
});

test('assignLanes spreads overlapping events across lanes', () => {
  const events = [ev('a', 0, 2 * H), ev('b', H, 3 * H), ev('c', 4 * H, 5 * H)];
  const lanes = assignLanes(events);
  const byId = Object.fromEntries(lanes.map((l) => [l.event.uid, l]));
  assert.notEqual(byId.a.lane, byId.b.lane);
  assert.equal(byId.a.laneCount, 2);
  assert.equal(byId.c.lane, 0);
  assert.equal(byId.c.laneCount, 1);
});

test('personalConflicts suggests keeping the higher tier', () => {
  const picks = [
    { event: ev('a', 0, 2 * H), tier: 2 },
    { event: ev('b', H, 3 * H), tier: 1 },
    { event: ev('c', 5 * H, 6 * H), tier: 1 },
  ];
  const pairs = personalConflicts(picks);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].a.event.uid, 'b'); // must-see wins
  assert.equal(pairs[0].b.event.uid, 'a');
});

test('personalConflicts ignores bookmarked picks', () => {
  const picks = [
    { event: ev('a', 0, 2 * H), tier: BOOKMARK },
    { event: ev('b', H, 3 * H), tier: 1 },
  ];
  assert.equal(personalConflicts(picks).length, 0);
});

test('tierInfo covers bookmarks as well as ranking tiers', () => {
  assert.equal(tierInfo(1), TIERS[1]);
  assert.equal(tierInfo(BOOKMARK).weight, 0);
  assert.equal(tierInfo(BOOKMARK).label, 'Bookmarked');
});

test('groupSplits scores options by tier weight and skips agreement', () => {
  const matt = { id: 'm', name: 'Matt' };
  const sam = { id: 's', name: 'Sam' };
  const riley = { id: 'r', name: 'Riley' };
  const hallH = ev('hallh', 0, 2 * H);
  const cosplay = ev('cosplay', H, 3 * H);
  const later = ev('later', 10 * H, 11 * H);

  const splits = groupSplits([
    { event: hallH, attendees: [{ person: matt, tier: 1 }, { person: sam, tier: 2 }] },
    { event: cosplay, attendees: [{ person: riley, tier: 1 }] },
    { event: later, attendees: [{ person: matt, tier: 2 }, { person: sam, tier: 2 }, { person: riley, tier: 2 }] },
  ]);
  assert.equal(splits.length, 1); // `later` is agreement, not a split
  const [split] = splits;
  assert.equal(split.options.length, 2);
  assert.equal(split.options[0].event.uid, 'hallh'); // 3+2 beats 3
  assert.equal(split.options[0].score, 5);
  assert.equal(split.options[1].score, 3);
});

test('groupSplits ignores bookmarked attendees', () => {
  const matt = { id: 'm', name: 'Matt' };
  const sam = { id: 's', name: 'Sam' };
  const hallH = ev('hallh', 0, 2 * H);
  const cosplay = ev('cosplay', H, 3 * H);

  // Sam only *bookmarked* the overlapping alternative — no split to resolve.
  assert.equal(groupSplits([
    { event: hallH, attendees: [{ person: matt, tier: 1 }] },
    { event: cosplay, attendees: [{ person: sam, tier: BOOKMARK }] },
  ]).length, 0);

  // With a real split, a bookmark neither adds attendees nor score.
  const splits = groupSplits([
    { event: hallH, attendees: [{ person: matt, tier: 1 }, { person: sam, tier: BOOKMARK }] },
    { event: cosplay, attendees: [{ person: sam, tier: 2 }] },
  ]);
  assert.equal(splits.length, 1);
  assert.equal(splits[0].options[0].event.uid, 'hallh');
  assert.equal(splits[0].options[0].score, 3); // Sam's bookmark adds nothing
  assert.equal(splits[0].options[0].attendees.length, 1);
});

test('groupSplits ignores overlaps involving only one person', () => {
  const matt = { id: 'm', name: 'Matt' };
  const splits = groupSplits([
    { event: ev('a', 0, 2 * H), attendees: [{ person: matt, tier: 1 }] },
    { event: ev('b', H, 3 * H), attendees: [{ person: matt, tier: 2 }] },
  ]);
  assert.equal(splits.length, 0);
});

test('mergeStates unions events and matches people by name', () => {
  const base = {
    people: [{ id: 'p1', name: 'Matt', color: '#111' }],
    events: { e1: { key: 'e1' } },
    picks: { p1: { e1: 1 } },
  };
  const incoming = {
    people: [{ id: 'x9', name: 'matt' }, { id: 'x2', name: 'Sam', color: '#222' }],
    events: { e2: { key: 'e2' } },
    picks: { x9: { e2: 2 }, x2: { e1: 3 } },
  };
  const merged = mergeStates(base, incoming);
  assert.equal(merged.people.length, 2); // 'matt' matched existing Matt
  assert.deepEqual(merged.picks.p1, { e1: 1, e2: 2 });
  const samId = merged.people.find((p) => p.name === 'Sam').id;
  assert.deepEqual(merged.picks[samId], { e1: 3 });
  assert.ok(merged.events.e1 && merged.events.e2);
});

test('toIcsUrl derives the iCal feed from a profile URL', () => {
  assert.equal(toIcsUrl('https://comiccon2026.sched.com/mattstrom'),
    'https://comiccon2026.sched.com/mattstrom.ics');
  assert.equal(toIcsUrl('comiccon2026.sched.com/mattstrom/'),
    'https://comiccon2026.sched.com/mattstrom.ics');
  assert.equal(toIcsUrl('webcal://comiccon2026.sched.com/mattstrom.ics'),
    'https://comiccon2026.sched.com/mattstrom.ics');
  assert.equal(toIcsUrl('https://comiccon2026.sched.com/mattstrom?iframe=no#top'),
    'https://comiccon2026.sched.com/mattstrom.ics');
  assert.throws(() => toIcsUrl('https://comiccon2026.sched.com/'), /profile URL/);
});

test('toIcsUrl unwraps Google Calendar sync links and upgrades http', () => {
  assert.equal(
    toIcsUrl('https://www.google.com/calendar/render?cid=http://comiccon2026.sched.com/strom.matt.ics'),
    'https://comiccon2026.sched.com/strom.matt.ics');
  assert.equal(
    toIcsUrl('https://www.google.com/calendar/render?cid=webcal%3A%2F%2Fcomiccon2026.sched.com%2Fstrom.matt.ics'),
    'https://comiccon2026.sched.com/strom.matt.ics');
  assert.equal(toIcsUrl('http://comiccon2026.sched.com/mattstrom.ics'),
    'https://comiccon2026.sched.com/mattstrom.ics');
});

test('unwrapGoogleCalendarLink cleans Google Calendar links but leaves everything else alone', () => {
  assert.equal(
    unwrapGoogleCalendarLink('https://www.google.com/calendar/render?cid=http://comiccon2026.sched.com/strom.matt.ics'),
    'https://comiccon2026.sched.com/strom.matt.ics');
  // A plain profile URL is left as typed — toIcsUrl's .ics/normalization only happens at fetch time.
  assert.equal(
    unwrapGoogleCalendarLink('https://comiccon2026.sched.com/mattstrom'),
    'https://comiccon2026.sched.com/mattstrom');
  assert.equal(unwrapGoogleCalendarLink('https://comiccon2026.sched.com/ma'), 'https://comiccon2026.sched.com/ma');
  assert.equal(unwrapGoogleCalendarLink(''), '');
});

test('scheduleUnchanged spots no-op re-imports', () => {
  const feed = [
    { uid: 'a', title: 'Panel A', start: 1000, end: 2000, allDay: false, venue: 'Hall H', description: '', url: '' },
    { uid: 'b', title: 'Panel B', start: 3000, end: 4000, allDay: false, venue: '', description: '', url: '' },
  ];
  const events = Object.fromEntries(feed.map((e) => [eventKey(e), { key: eventKey(e), ...e }]));
  const picks = { 'uid:a': 1, 'uid:b': BOOKMARK };

  assert.equal(scheduleUnchanged(picks, events, feed), true);
  // Event details changed (rescheduled panel) → re-import.
  assert.equal(scheduleUnchanged(picks, events, [feed[0], { ...feed[1], start: 3500 }]), false);
  // Event added or removed → re-import.
  assert.equal(scheduleUnchanged(picks, events, [feed[0]]), false);
  assert.equal(scheduleUnchanged(picks, events,
    [...feed, { uid: 'c', title: 'Panel C', start: 5000, end: 6000, allDay: false, venue: '', description: '', url: '' }]), false);
  // Feed event we've never seen (pick exists but event record missing).
  assert.equal(scheduleUnchanged({ 'uid:a': 1, 'uid:c': 2 }, events, [feed[0], { ...feed[1], uid: 'c' }]), false);
  assert.equal(scheduleUnchanged(undefined, {}, feed), false);
});
