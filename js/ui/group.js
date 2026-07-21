// Group tab: manage people, import schedules, and share the group.

import { el, personDot } from './dom.js';
import { personPicks } from '../selectors.js';
import { isAutoRefreshable } from '../refetch.js';
import { unwrapGoogleCalendarLink } from '../ingest.js';

export function renderGroup(ctx) {
  const { state, ui, actions } = ctx;

  const intro = state.people.length ? null : el('div', { class: 'card hero' },
    el('h2', {}, 'Compare your Comic-Con schedules'),
    el('p', {},
      'Add each person in your group, then import their Sched schedule. ',
      'Fastest path: everyone opens their Comic-Con Sched profile ',
      el('span', { class: 'mono' }, '(comiccon2026.sched.com/yourusername)'),
      ' and pastes that URL here. You can also upload the .ics file from Sched’s ',
      'iCal export, or paste the raw calendar text.',
    ),
    el('button', { class: 'btn primary', onclick: actions.loadDemo }, 'Load demo group'),
  );

  const addForm = el('form', {
    class: 'card add-person',
    onsubmit: (e) => {
      e.preventDefault();
      const input = e.target.querySelector('input');
      if (input.value.trim()) {
        actions.addPerson(input.value.trim());
        input.value = '';
      }
    },
  },
    el('input', { type: 'text', placeholder: 'Add a person (e.g. Matt)', 'aria-label': 'Person name' }),
    el('button', { class: 'btn primary', type: 'submit' }, 'Add person'),
  );

  const personCards = state.people.map((person) => {
    const count = personPicks(state, person.id).length;
    const status = ui.importStatus?.[person.id];
    return el('div', { class: 'card person-card' },
      el('div', { class: 'person-head' },
        personDot(person),
        el('input', {
          class: 'person-name',
          value: person.name,
          'aria-label': 'Name',
          onchange: (e) => actions.renamePerson(person.id, e.target.value),
        }),
        el('span', { class: 'muted' }, `${count} event${count === 1 ? '' : 's'}`),
        el('button', {
          class: 'btn ghost danger',
          title: 'Remove person',
          onclick: () => actions.removePerson(person.id),
        }, '✕'),
      ),
      el('details', { class: 'import-box', open: count === 0 },
        el('summary', {}, 'Import schedule'),
        el('div', { class: 'import-option' },
          el('label', {}, 'Sched profile URL'),
          el('div', { class: 'row' },
            el('input', {
              type: 'url',
              placeholder: 'https://comiccon2026.sched.com/username',
              value: person.source && person.source.startsWith('http') ? person.source : '',
              onpaste: (e) => {
                const pasted = e.clipboardData?.getData('text');
                if (!pasted) return;
                const cleaned = unwrapGoogleCalendarLink(pasted);
                if (cleaned !== pasted) {
                  e.preventDefault();
                  e.target.value = cleaned;
                }
              },
            }),
            el('button', {
              class: 'btn',
              onclick: (e) => {
                const url = e.target.previousElementSibling?.value
                  || e.target.closest('.row').querySelector('input').value;
                if (url.trim()) actions.importFromUrl(person.id, url.trim());
              },
            }, 'Fetch'),
          ),
          el('p', { class: 'hint' },
            'Also accepts the ',
            el('a', { href: 'https://comiccon2026.sched.com/mobile-site', target: '_blank', rel: 'noopener' }, 'Google Calendar sync link'),
            ' Sched gives you (the one starting with ',
            el('span', { class: 'mono' }, 'google.com/calendar/render?cid=…'),
            ') — paste it in and it auto-cleans to the feed URL. Any URL import auto-refreshes every 15 minutes.',
          ),
        ),
        el('div', { class: 'import-option' },
          el('label', {}, 'Upload .ics file (Sched → your schedule → Mobile App + iCal / Export)'),
          el('input', {
            type: 'file',
            accept: '.ics,text/calendar',
            onchange: (e) => {
              const file = e.target.files[0];
              if (file) actions.importFromFile(person.id, file);
            },
          }),
        ),
        el('div', { class: 'import-option' },
          el('label', {}, 'Or paste raw iCal text'),
          el('textarea', { rows: 3, placeholder: 'BEGIN:VCALENDAR…' }),
          el('button', {
            class: 'btn',
            onclick: (e) => {
              const text = e.target.previousElementSibling.value;
              if (text.trim()) actions.importFromText(person.id, text, 'pasted text');
            },
          }, 'Import pasted text'),
        ),
      ),
      isAutoRefreshable(person)
        ? el('div', { id: `refetch-note-${person.id}`, class: 'refetch-note' },
            refetchNote(person, ctx.refetch))
        : null,
      status ? el('div', { class: `import-status ${status.kind}` }, status.message) : null,
    );
  });

  const syncCard = buildSyncCard(ctx);

  const shareCard = el('div', { class: 'card' },
    el('h3', {}, 'Share with your group'),
    el('p', { class: 'muted' },
      'No accounts, no server: copy a share code and send it over text/Discord. ',
      'Friends paste it here to merge your picks into their view (people are matched by name).'),
    el('div', { class: 'row wrap' },
      el('button', { class: 'btn', onclick: actions.copyShareCode }, 'Copy share code'),
      el('button', { class: 'btn', onclick: actions.downloadJson }, 'Download JSON'),
    ),
    el('div', { class: 'import-option' },
      el('textarea', { rows: 2, placeholder: 'Paste a share code (SL1:…) or exported JSON' }),
      el('button', {
        class: 'btn',
        onclick: (e) => {
          const text = e.target.previousElementSibling.value;
          if (text.trim()) actions.mergeShareCode(text.trim());
        },
      }, 'Merge into group'),
    ),
    ui.shareStatus ? el('div', { class: `import-status ${ui.shareStatus.kind}` }, ui.shareStatus.message) : null,
  );

  const dangerCard = state.people.length ? el('div', { class: 'card' },
    el('div', { class: 'row wrap' },
      el('button', { class: 'btn', onclick: actions.loadDemo }, 'Load demo group'),
      el('button', { class: 'btn ghost danger', onclick: actions.clearAll }, 'Clear everything'),
    ),
  ) : null;

  return el('div', {}, intro, addForm, personCards, syncCard, shareCard, dangerCard);
}

function buildSyncCard(ctx) {
  const { sync, actions } = ctx;
  if (!sync.enabled) return null; // not configured — the app is local-only

  if (!sync.code) {
    return el('div', { class: 'card' },
      el('h3', {}, 'Live sync'),
      el('p', { class: 'muted' },
        'Put this group on the shared server so everyone sees the same picks ',
        'automatically — no more passing codes around.'),
      el('div', { class: 'row wrap' },
        el('button', { class: 'btn primary', onclick: actions.createSyncGroup }, 'Create sync group'),
        el('input', { type: 'text', placeholder: '…or paste a group code / join link' }),
        el('button', {
          class: 'btn',
          onclick: (e) => {
            const code = e.target.previousElementSibling.value;
            if (code.trim()) actions.joinSyncGroup(code);
          },
        }, 'Join'),
      ),
      sync.status === 'error'
        ? el('div', { class: 'import-status error' }, sync.statusDetail || 'Sync error')
        : null,
    );
  }

  const { text, kind } = syncStatusView(sync);
  return el('div', { class: 'card' },
    el('h3', {}, 'Live sync'),
    el('p', { class: 'muted' },
      'This group syncs automatically. Group code: ',
      el('span', { class: 'mono' }, sync.code)),
    el('div', { class: 'row wrap' },
      el('button', { class: 'btn primary', onclick: actions.copySyncLink }, 'Copy join link'),
      el('button', {
        class: 'btn',
        onclick: () => navigator.clipboard.writeText(sync.code),
      }, 'Copy code'),
      el('button', { class: 'btn ghost danger', onclick: actions.leaveSyncGroup }, 'Leave group'),
    ),
    el('div', { id: 'sync-status', class: `import-status ${kind}` }, text),
  );
}

// Shared with app.js, which repaints these notes after each background
// refetch instead of rerendering the whole app.
export function refetchNote(person, refetch) {
  const mins = Math.round((refetch?.intervalMs || 0) / 60000) || 15;
  const last = refetch?.lastChecked?.[person.id];
  return `⟳ Auto-refreshes from Sched every ${mins} min`
    + (last ? ` · checked ${new Date(last).toLocaleTimeString()}` : '');
}

// Shared with app.js, which repaints just this line on sync status changes
// instead of rerendering the whole app (a full rerender would steal input
// focus and detach elements mid-click on every poll).
export function syncStatusView(sync) {
  const text = {
    syncing: '⟳ Syncing…',
    ok: `✓ Synced${sync.lastSync ? ` · ${new Date(sync.lastSync).toLocaleTimeString()}` : ''}`,
    error: `⚠ ${sync.statusDetail || 'Sync error — will retry'}`,
    idle: 'Waiting to sync…',
  }[sync.status] || '';
  const kind = sync.status === 'error' ? 'error' : sync.status === 'ok' ? 'ok' : 'busy';
  return { text, kind };
}
