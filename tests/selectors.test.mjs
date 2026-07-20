import test from 'node:test';
import assert from 'node:assert/strict';
import { eventInterestCounts, eventInterestKey } from '../js/selectors.js';

test('interest counts combine matching events across UIDs and tiers', () => {
  const firstCopy = { uid: 'matt-copy', title: '  Shared   Panel ', start: 100, end: 200 };
  const secondCopy = { uid: 'sam-copy', title: 'shared panel', start: 100, end: 200 };
  const state = {
    people: [{ id: 'matt' }, { id: 'sam' }, { id: 'riley' }],
    events: { a: firstCopy, b: secondCopy },
    picks: {
      matt: { a: 1 },       // MUST
      sam: { b: 3 },        // MAYBE
      riley: { a: 0, b: 2 }, // duplicate copies still count this person once
    },
  };

  const counts = eventInterestCounts(state);
  assert.equal(eventInterestKey(firstCopy), eventInterestKey(secondCopy));
  assert.equal(counts.get(eventInterestKey(firstCopy)), 3);
});

test('interest counts keep simultaneous events with different titles separate', () => {
  const state = {
    people: [{ id: 'matt' }, { id: 'sam' }],
    events: {
      a: { title: 'Panel A', start: 100, end: 200 },
      b: { title: 'Panel B', start: 100, end: 200 },
    },
    picks: { matt: { a: 1 }, sam: { b: 1 } },
  };

  const counts = eventInterestCounts(state);
  assert.equal(counts.get(eventInterestKey(state.events.a)), 1);
  assert.equal(counts.get(eventInterestKey(state.events.b)), 1);
});
