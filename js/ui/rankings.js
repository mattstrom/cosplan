// Rankings tab: tier each of your picks (must-see / want / if time), or
// bookmark them to decide on later.

import { el, personDot } from './dom.js';
import { BOOKMARK, TIERS } from '../logic.js';
import { personPicks } from '../selectors.js';
import { dayKeyInTz, fmtDayLabel, fmtTimeRange } from '../time.js';

export function renderRankings(ctx) {
  const { state, ui } = ctx;
  if (!state.people.length) {
    return el('div', { class: 'empty-state' },
      el('h2', {}, 'No people yet'),
      el('p', {}, 'Add people and import schedules on the Group tab first.'),
    );
  }
  const person = state.people.find((p) => p.id === ui.rankPerson) || state.people[0];
  const picks = personPicks(state, person.id);

  const personChips = el('div', { class: 'chip-row' },
    state.people.map((p) => el('button', {
      class: `chip ${p.id === person.id ? 'active' : ''}`,
      onclick: () => ctx.setUi({ rankPerson: p.id }),
    }, personDot(p), p.name)),
  );

  if (!picks.length) {
    return el('div', {}, personChips,
      el('p', { class: 'muted' }, `${person.name} has no imported events yet.`));
  }

  const byDay = new Map();
  for (const pick of picks) {
    const day = dayKeyInTz(state.tz, pick.event.start);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(pick);
  }

  const sections = [...byDay.entries()].map(([day, dayPicks]) =>
    el('section', {},
      el('h3', {}, fmtDayLabel(state.tz, day)),
      dayPicks.map(({ event, tier }) => el('div', { class: `card rank-row ${tier === BOOKMARK ? 'bookmarked' : ''}` },
        el('div', { class: 'rank-info' },
          el('div', { class: 'rank-title' }, event.title),
          el('div', { class: 'muted' },
            `${fmtTimeRange(state.tz, event.start, event.end)}${event.venue ? ` · ${event.venue}` : ''}`),
        ),
        el('div', { class: 'rank-actions' },
          el('button', {
            class: `bookmark-btn ${tier === BOOKMARK ? 'active' : ''}`,
            title: tier === BOOKMARK
              ? 'Bookmarked — pick a tier when you decide'
              : 'Bookmark: park it to decide later (sits out of the conflict math)',
            onclick: () => ctx.actions.setTier(person.id, event.key, BOOKMARK),
          }, '🔖'),
          el('div', { class: 'tier-picker' },
            Object.entries(TIERS).map(([t, info]) => el('button', {
              class: `tier-btn tier-${t} ${+t === tier ? 'active' : ''}`,
              title: info.label,
              onclick: () => ctx.actions.setTier(person.id, event.key, +t),
            }, info.short)),
          ),
          el('button', {
            class: 'btn ghost danger',
            title: 'Remove from schedule',
            onclick: () => ctx.actions.removePick(person.id, event.key),
          }, '✕'),
        ),
      )),
    ));

  return el('div', {}, personChips, sections,
    el('p', { class: 'hint' }, 'Tiers feed the conflict resolver: Must-see = 3 points, Want = 2, If time = 1. 🔖 bookmarks an event to decide on later — it stays on the timeline but doesn’t count in conflicts until you rank it.'));
}
