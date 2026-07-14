// Shared timeline grid: one column per person, day by day.

import { el, personDot } from './dom.js';
import { assignLanes, tierInfo } from '../logic.js';
import { eventAttendees, pickedDayKeys, picksForDay } from '../selectors.js';
import { dayKeyInTz, fmtDayLabel, fmtTimeRange, minutesIntoDay } from '../time.js';

const PX_PER_MIN = 1.6;

export function renderTimeline(ctx) {
  const { state, ui } = ctx;
  const days = pickedDayKeys(state);
  if (!days.length) {
    return el('div', { class: 'empty-state' },
      el('h2', {}, 'No schedules yet'),
      el('p', {}, 'Import schedules on the Group tab (or load the demo group) to see everyone side by side.'),
      el('button', { class: 'btn primary', onclick: () => ctx.setUi({ tab: 'group' }) }, 'Go to Group'),
    );
  }
  const day = days.includes(ui.day) ? ui.day : days[0];
  const attendees = eventAttendees(state);

  const dayPicks = state.people.map((person) => ({
    person,
    picks: picksForDay(state, person.id, day),
  }));

  // Time bounds for the day across everyone, padded to the hour.
  let minMin = Infinity;
  let maxMin = -Infinity;
  for (const { picks } of dayPicks) {
    for (const { event } of picks) {
      minMin = Math.min(minMin, minutesIntoDay(state.tz, event.start));
      const endsToday = dayKeyInTz(state.tz, event.end) === day;
      maxMin = Math.max(maxMin, endsToday ? minutesIntoDay(state.tz, event.end) : 24 * 60);
    }
  }
  if (!isFinite(minMin)) { minMin = 9 * 60; maxMin = 18 * 60; }
  minMin = Math.floor(minMin / 60) * 60;
  maxMin = Math.min(24 * 60, Math.ceil(maxMin / 60) * 60);
  const height = (maxMin - minMin) * PX_PER_MIN;

  const dayTabs = el('div', { class: 'chip-row' },
    days.map((d) => el('button', {
      class: `chip ${d === day ? 'active' : ''}`,
      onclick: () => ctx.setUi({ day: d }),
    }, fmtDayLabel(state.tz, d))),
  );

  const hourLines = [];
  const gutterLabels = [];
  for (let m = minMin; m <= maxMin; m += 60) {
    const top = (m - minMin) * PX_PER_MIN;
    hourLines.push(el('div', { class: 'hour-line', style: { top: `${top}px` } }));
    const h = Math.floor(m / 60);
    const label = h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : h === 24 ? '12 AM' : `${h - 12} PM`;
    gutterLabels.push(el('div', { class: 'hour-label', style: { top: `${top}px` } }, label));
  }

  const columns = dayPicks.map(({ person, picks }) => {
    const lanes = assignLanes(picks.map((p) => ({ ...p.event, tier: p.tier })));
    const blocks = lanes.map(({ event, lane, laneCount }) => {
      const startMin = Math.max(minMin, minutesIntoDay(state.tz, event.start));
      const endsToday = dayKeyInTz(state.tz, event.end) === day;
      const endMin = Math.min(maxMin, endsToday ? minutesIntoDay(state.tz, event.end) : 24 * 60);
      const others = (attendees.get(event.key) || []).length;
      const tier = tierInfo(event.tier);
      return el('div', {
        class: `tl-event tier-${event.tier}`,
        style: {
          top: `${(startMin - minMin) * PX_PER_MIN}px`,
          height: `${Math.max(26, (endMin - startMin) * PX_PER_MIN - 2)}px`,
          left: `calc(${(lane / laneCount) * 100}% + 2px)`,
          width: `calc(${(1 / laneCount) * 100}% - 4px)`,
          '--person-color': person.color,
        },
        title: `${event.title}\n${fmtTimeRange(state.tz, event.start, event.end)}${event.venue ? `\n${event.venue}` : ''}`,
      },
        el('div', { class: 'tl-event-meta' },
          el('span', { class: 'tier-chip' }, tier.short),
          others > 1 ? el('span', { class: 'together-chip', title: 'people going' }, `👥${others}`) : null,
        ),
        el('div', { class: 'tl-event-title' }, event.title),
        el('div', { class: 'tl-event-sub' }, fmtTimeRange(state.tz, event.start, event.end)),
        event.venue ? el('div', { class: 'tl-event-sub' }, event.venue) : null,
      );
    });
    return el('div', { class: 'tl-col' },
      el('div', { class: 'tl-col-body', style: { height: `${height}px` } }, hourLines.map((n) => n.cloneNode(false)), blocks),
    );
  });

  const header = el('div', { class: 'tl-header' },
    el('div', { class: 'tl-gutter-head' }),
    state.people.map((p) => el('div', { class: 'tl-col-head' }, personDot(p), p.name)),
  );

  const body = el('div', { class: 'tl-body' },
    el('div', { class: 'tl-gutter', style: { height: `${height}px` } }, gutterLabels),
    columns,
  );

  return el('div', {},
    dayTabs,
    state.people.length
      ? el('div', { class: 'timeline card' }, header, body)
      : el('p', {}, 'Add people on the Group tab first.'),
    el('p', { class: 'hint' }, '👥 = how many of you have that event picked. Side-by-side blocks in one column mean that person is double-booked. Dashed 🔖 blocks are bookmarks — saved to decide on later.'),
  );
}
