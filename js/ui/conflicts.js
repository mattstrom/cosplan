// Conflict resolver: group splits (different people at different overlapping
// events, ranked by tier-weighted score) and personal double-bookings.

import { el, personDot } from './dom.js';
import { groupSplits, personalConflicts, TIERS } from '../logic.js';
import { eventAttendees, personPicks } from '../selectors.js';
import { dayKeyInTz, fmtDayLabel, fmtTimeRange } from '../time.js';

export function renderConflicts(ctx) {
  const { state } = ctx;
  const attendees = eventAttendees(state);
  if (!attendees.size) {
    return el('div', { class: 'empty-state' },
      el('h2', {}, 'Nothing to resolve yet'),
      el('p', {}, 'Import a couple of schedules first, then this tab shows where your group splits up.'),
    );
  }

  const entries = [...attendees.entries()].map(([key, people]) => ({
    event: state.events[key],
    attendees: people,
  }));
  const splits = groupSplits(entries)
    .filter((s) => s.options.some((o) => o.attendees.length));

  const splitCards = splits.map((split) => {
    const day = dayKeyInTz(state.tz, split.start);
    const best = split.options[0];
    return el('div', { class: 'card conflict-card' },
      el('div', { class: 'conflict-when' },
        el('strong', {}, fmtDayLabel(state.tz, day)),
        ` · ${fmtTimeRange(state.tz, split.start, split.end)}`,
      ),
      split.options.map((opt, i) => {
        const missing = i > 0 ? opt.attendees.filter((a) => a.tier === 1) : [];
        return el('div', { class: `conflict-option ${i === 0 ? 'winner' : ''}` },
          el('div', { class: 'conflict-option-head' },
            i === 0 ? el('span', { class: 'suggest-chip' }, 'Group pick') : null,
            el('span', { class: 'conflict-title' }, opt.event.title),
            el('span', { class: 'conflict-score', title: 'tier-weighted votes (must=3, want=2, if-time=1)' }, `${opt.score} pts`),
          ),
          el('div', { class: 'conflict-sub' },
            `${fmtTimeRange(state.tz, opt.event.start, opt.event.end)}${opt.event.venue ? ` · ${opt.event.venue}` : ''}`,
          ),
          el('div', { class: 'chip-row tight' },
            opt.attendees.map((a) => el('span', { class: 'person-chip' },
              personDot(a.person), `${a.person.name} · ${TIERS[a.tier].short}`,
            )),
          ),
          missing.length
            ? el('div', { class: 'warn' },
              `⚠ ${missing.map((a) => a.person.name).join(', ')} marked this a must-see — switching means missing it.`)
            : null,
        );
      }),
    );
  });

  const personal = state.people.flatMap((person) => {
    const pairs = personalConflicts(personPicks(state, person.id));
    return pairs.map(({ a, b }) => el('div', { class: 'card personal-conflict' },
      el('div', { class: 'chip-row tight' },
        el('span', { class: 'person-chip' }, personDot(person), person.name),
        el('span', { class: 'muted' },
          fmtDayLabel(state.tz, dayKeyInTz(state.tz, a.event.start)),
        ),
      ),
      el('p', {},
        'Double-booked: keep ', el('strong', {}, a.event.title),
        ` (${TIERS[a.tier].label}, ${fmtTimeRange(state.tz, a.event.start, a.event.end)})`,
        ' over ', el('strong', {}, b.event.title),
        ` (${TIERS[b.tier].label}, ${fmtTimeRange(state.tz, b.event.start, b.event.end)})`,
      ),
    ));
  });

  return el('div', {},
    el('h2', {}, 'Where the group splits'),
    splitCards.length
      ? splitCards
      : el('p', { class: 'ok-note' }, '✅ No overlapping picks pull the group apart. Nice.'),
    el('h2', {}, 'Personal double-bookings'),
    personal.length
      ? personal
      : el('p', { class: 'ok-note' }, '✅ Nobody is double-booked.'),
    el('p', { class: 'hint' }, 'Suggestions weight everyone’s tiers: Must-see = 3, Want = 2, If time = 1. Bookmarked (🔖) events are undecided and sit out entirely. Adjust tiers on the Rankings tab to change the math.'),
  );
}
