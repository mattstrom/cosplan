import test from 'node:test';
import assert from 'node:assert/strict';
import { parseICS, parseIcsDate, unfoldLines, unescapeText } from '../js/ics.js';
import { wallToEpoch } from '../js/time.js';

const SAMPLE = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//SCHED//Comic-Con 2026//EN',
  'X-WR-CALNAME:Comic-Con 2026: mattstrom',
  'X-WR-TIMEZONE:America/Los_Angeles',
  'BEGIN:VEVENT',
  'UID:evt-abc123@sched.com',
  'DTSTART;TZID=America/Los_Angeles:20260723T100000',
  'DTEND;TZID=America/Los_Angeles:20260723T113000',
  'SUMMARY:Marvel Studios: The Next Saga\\, Revealed',
  'LOCATION:Hall H',
  'DESCRIPTION:A very long description that Sched folds across multiple li',
  ' nes because RFC 5545 says lines are 75 octets\\nSecond line.',
  'URL:https://comiccon2026.sched.com/event/abc123',
  'BEGIN:VALARM',
  'TRIGGER:-PT10M',
  'SUMMARY:ignore me',
  'END:VALARM',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:evt-def456@sched.com',
  'DTSTART:20260724T170000Z',
  'DTEND:20260724T180000Z',
  'SUMMARY:UTC-style event',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:evt-allday@sched.com',
  'DTSTART;VALUE=DATE:20260725',
  'DTEND;VALUE=DATE:20260726',
  'SUMMARY:All-day thing',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

test('unfoldLines joins continuation lines (dropping the fold whitespace)', () => {
  const lines = unfoldLines('A:one\r\n two\r\nB:three');
  assert.deepEqual(lines, ['A:onetwo', 'B:three']);
});

test('unescapeText handles RFC 5545 escapes', () => {
  assert.equal(unescapeText('a\\, b\\; c\\nd\\\\e'), 'a, b; c\nd\\e');
});

test('parses a Sched-style calendar', () => {
  const { calendarName, tz, events } = parseICS(SAMPLE);
  assert.equal(calendarName, 'Comic-Con 2026: mattstrom');
  assert.equal(tz, 'America/Los_Angeles');
  assert.equal(events.length, 3);

  const [marvel, utc, allday] = events;
  assert.equal(marvel.title, 'Marvel Studios: The Next Saga, Revealed');
  assert.equal(marvel.venue, 'Hall H');
  assert.equal(marvel.uid, 'evt-abc123@sched.com');
  assert.match(marvel.description, /multiple lines/);
  assert.match(marvel.description, /\nSecond line\./);
  // VALARM sub-component must not overwrite the event summary.
  assert.notEqual(marvel.title, 'ignore me');
  assert.equal(marvel.start, wallToEpoch('America/Los_Angeles', 2026, 7, 23, 10, 0));
  assert.equal(marvel.end, wallToEpoch('America/Los_Angeles', 2026, 7, 23, 11, 30));

  assert.equal(utc.start, Date.UTC(2026, 6, 24, 17, 0, 0));
  // 17:00 UTC in July = 10:00 PDT.
  assert.equal(utc.start, wallToEpoch('America/Los_Angeles', 2026, 7, 24, 10, 0));

  assert.equal(allday.allDay, true);
  assert.equal(allday.start, wallToEpoch('America/Los_Angeles', 2026, 7, 25));
});

test('missing DTEND defaults to one hour', () => {
  const { events } = parseICS([
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:x@y', 'DTSTART:20260723T200000Z', 'SUMMARY:No end',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\n'));
  assert.equal(events[0].end - events[0].start, 60 * 60 * 1000);
});

test('parseIcsDate handles TZID with quoted params', () => {
  const r = parseIcsDate('20260723T100000', { TZID: 'America/Los_Angeles' });
  assert.equal(r.epoch, wallToEpoch('America/Los_Angeles', 2026, 7, 23, 10));
  assert.equal(r.allDay, false);
});

test('rejects non-calendar text', () => {
  assert.throws(() => parseICS('<html>an error page</html>'), /VCALENDAR/);
});
