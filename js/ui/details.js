// Event details dialog: opened by clicking an event anywhere it appears
// (timeline, conflicts, rankings). Shows the full description plus who's
// going, since imported blurbs get truncated everywhere else.

import { el, personDot } from './dom.js';
import { tierInfo } from '../logic.js';
import { eventAttendees } from '../selectors.js';
import { dayKeyInTz, fmtDayLabel, fmtTimeRange } from '../time.js';

export function openEventDetails(state, event) {
  const going = eventAttendees(state).get(event.key) || [];
  const dialog = el('dialog', { class: 'event-dialog', onclose: () => dialog.remove() },
    el('div', { class: 'event-dialog-body' },
      el('div', { class: 'event-dialog-head' },
        el('h2', {}, event.title),
        el('button', { class: 'btn ghost', title: 'Close', onclick: () => dialog.close() }, '✕'),
      ),
      el('p', { class: 'muted event-dialog-when' },
        `${fmtDayLabel(state.tz, dayKeyInTz(state.tz, event.start))} · ${fmtTimeRange(state.tz, event.start, event.end)}${event.venue ? ` · ${event.venue}` : ''}`,
      ),
      going.length
        ? el('div', { class: 'chip-row tight' },
          going.map(({ person, tier }) => el('span', { class: 'person-chip' },
            personDot(person), `${person.name} · ${tierInfo(tier).short}`,
          )))
        : null,
      event.description
        ? el('p', { class: 'event-description' }, event.description)
        : el('p', { class: 'muted event-description' }, 'No description in the imported schedule.'),
      event.url
        ? el('p', { class: 'event-dialog-link' },
          el('a', { href: event.url, target: '_blank', rel: 'noopener' }, 'Open on Sched ↗'))
        : null,
    ),
  );
  // The dialog itself has no padding, so a click landing on it (rather than
  // on .event-dialog-body) can only be the backdrop.
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  document.body.append(dialog);
  dialog.showModal();
}

// Renders an event title as a click-to-open-details control.
export function eventTitleButton(state, event, className = '') {
  return el('button', {
    class: `event-link ${className}`,
    title: 'Show details',
    onclick: () => openEventDetails(state, event),
  }, event.title);
}
