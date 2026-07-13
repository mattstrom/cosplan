import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeStates, nextRev } from '../js/logic.js';
import { stableStringify, newGroupCode } from '../js/sync.js';

const person = (id, name, rev = 0, extra = {}) => ({ id, name, color: '#111', rev, ...extra });

function baseState(overrides = {}) {
  return {
    version: 1,
    tz: 'America/Los_Angeles',
    people: [],
    events: {},
    picks: {},
    removed: {},
    ...overrides,
  };
}

test('higher person rev wins wholesale (tier changes AND removals propagate)', () => {
  const a = baseState({
    people: [person('p1', 'Matt', 100)],
    picks: { p1: { e1: 2, e2: 2 } },
  });
  const b = baseState({
    people: [person('p1', 'Matt', 200)],
    picks: { p1: { e1: 1 } }, // tier changed, e2 removed
  });
  const merged = mergeStates(a, b);
  assert.deepEqual(merged.picks.p1, { e1: 1 });
  assert.equal(merged.people[0].rev, 200);

  // Other direction: newer local copy is kept.
  const merged2 = mergeStates(b, a);
  assert.deepEqual(merged2.picks.p1, { e1: 1 });
});

test('merge converges: A⊕B equals B⊕A for rev-carrying states', () => {
  const a = baseState({
    people: [person('p1', 'Matt', 100), person('p2', 'Sam', 300)],
    picks: { p1: { e1: 1 }, p2: { e2: 2 } },
  });
  const b = baseState({
    people: [person('p1', 'Matt', 200), person('p2', 'Sam', 250)],
    picks: { p1: { e1: 3, e3: 1 }, p2: { e2: 1 } },
  });
  const ab = mergeStates(a, b);
  const ba = mergeStates(b, a);
  assert.equal(stableStringify(ab.picks), stableStringify(ba.picks));
  assert.equal(
    stableStringify([...ab.people].sort((x, y) => x.id.localeCompare(y.id))),
    stableStringify([...ba.people].sort((x, y) => x.id.localeCompare(y.id))),
  );
});

test('removal tombstones delete the person on other devices', () => {
  const server = baseState({
    people: [person('p1', 'Matt', 100), person('p2', 'Sam', 100)],
    picks: { p1: { e1: 1 }, p2: { e2: 2 } },
  });
  const local = baseState({
    people: [person('p1', 'Matt', 100)],
    picks: { p1: { e1: 1 } },
    removed: { sam: 500 },
  });
  const merged = mergeStates(local, server);
  assert.equal(merged.people.length, 1);
  assert.equal(merged.picks.p2, undefined);

  // And in the other direction (server state merged on the remover's device).
  const merged2 = mergeStates(server, local);
  assert.equal(merged2.people.length, 1);
});

test('re-adding with a newer rev beats an old tombstone', () => {
  const withTombstone = baseState({ removed: { sam: 500 } });
  const readded = baseState({
    people: [person('p9', 'Sam', 900)],
    picks: { p9: { e1: 1 } },
  });
  const merged = mergeStates(withTombstone, readded);
  assert.equal(merged.people.length, 1);
  assert.equal(merged.people[0].name, 'Sam');
});

test('same person on two devices matches by id even after rename', () => {
  const a = baseState({
    people: [person('p1', 'Matt', 100)],
    picks: { p1: { e1: 1 } },
  });
  const b = baseState({
    people: [person('p1', 'Matthew', 200)],
    picks: { p1: { e1: 1 } },
  });
  const merged = mergeStates(a, b);
  assert.equal(merged.people.length, 1);
  assert.equal(merged.people[0].name, 'Matthew');
});

test('stableStringify is key-order independent', () => {
  assert.equal(
    stableStringify({ b: 1, a: { d: [1, 2], c: 'x' } }),
    stableStringify({ a: { c: 'x', d: [1, 2] }, b: 1 }),
  );
  assert.notEqual(stableStringify({ a: 1 }), stableStringify({ a: 2 }));
});

test('nextRev never goes backward, even against a fast peer clock', () => {
  const now = Date.now();
  assert.ok(nextRev(0) >= now);
  const futureRev = now + 10 * 60 * 1000; // peer's clock 10 min ahead
  assert.ok(nextRev(futureRev) > futureRev);
});

test('group codes are long, lowercase, and unambiguous', () => {
  const code = newGroupCode();
  assert.match(code, /^[a-z2-9]{24}$/);
  assert.doesNotMatch(code, /[01oli]/);
  assert.notEqual(newGroupCode(), code);
});
