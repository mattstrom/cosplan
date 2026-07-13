// Minimal iCalendar (RFC 5545) parser, tuned for Sched personal-schedule
// exports (https://<event>.sched.com/<username>.ics) but tolerant of any
// well-formed calendar.

import { DEFAULT_TZ, wallToEpoch } from './time.js';

// RFC 5545 folds long lines; continuations start with a space or tab.
export function unfoldLines(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const out = [];
  for (const line of lines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

export function unescapeText(value) {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function parseProp(line) {
  // NAME;PARAM=VALUE;PARAM=VALUE:value — params may be quoted.
  const colon = findValueColon(line);
  if (colon === -1) return null;
  const left = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const segs = splitOutsideQuotes(left, ';');
  const name = segs[0].toUpperCase();
  const params = {};
  for (const seg of segs.slice(1)) {
    const eq = seg.indexOf('=');
    if (eq > -1) {
      params[seg.slice(0, eq).toUpperCase()] = seg.slice(eq + 1).replace(/^"|"$/g, '');
    }
  }
  return { name, params, value };
}

function findValueColon(line) {
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === ':' && !inQuotes) return i;
  }
  return -1;
}

function splitOutsideQuotes(s, sep) {
  const parts = [];
  let cur = '';
  let inQuotes = false;
  for (const c of s) {
    if (c === '"') { inQuotes = !inQuotes; cur += c; }
    else if (c === sep && !inQuotes) { parts.push(cur); cur = ''; }
    else cur += c;
  }
  parts.push(cur);
  return parts;
}

// Returns { epoch, allDay } or null.
export function parseIcsDate(value, params = {}, fallbackTz = DEFAULT_TZ) {
  const v = value.trim();
  if (params.VALUE === 'DATE' || /^\d{8}$/.test(v)) {
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
    if (!m) return null;
    return { epoch: wallToEpoch(fallbackTz, +m[1], +m[2], +m[3]), allDay: true };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (z === 'Z') {
    return { epoch: Date.UTC(+y, +mo - 1, +d, +h, +mi, +s), allDay: false };
  }
  const tz = params.TZID || fallbackTz;
  return { epoch: wallToEpoch(tz, +y, +mo, +d, +h, +mi, +s), allDay: false };
}

/**
 * Parse an iCalendar document into plain event objects.
 * Returns { calendarName, tz, events: [{ uid, title, start, end, allDay,
 * venue, description, url }] } with start/end as epoch ms.
 */
export function parseICS(text, { defaultTz = DEFAULT_TZ } = {}) {
  if (!/BEGIN:VCALENDAR/i.test(text)) {
    throw new Error('Not an iCalendar file (missing BEGIN:VCALENDAR)');
  }
  let calendarName = '';
  let calTz = '';
  const events = [];
  let cur = null;
  let depth = 0; // ignore nested components like VALARM

  for (const line of unfoldLines(text)) {
    const upper = line.toUpperCase();
    if (upper === 'BEGIN:VEVENT') { cur = { raw: {} }; depth = 0; continue; }
    if (cur && upper.startsWith('BEGIN:')) { depth++; continue; }
    if (cur && upper.startsWith('END:') && upper !== 'END:VEVENT') { if (depth > 0) depth--; continue; }
    if (upper === 'END:VEVENT') {
      if (cur) {
        const ev = finishEvent(cur, calTz || defaultTz);
        if (ev) events.push(ev);
      }
      cur = null;
      continue;
    }
    const prop = parseProp(line);
    if (!prop) continue;
    if (!cur) {
      if (prop.name === 'X-WR-CALNAME') calendarName = unescapeText(prop.value).trim();
      if (prop.name === 'X-WR-TIMEZONE') calTz = prop.value.trim();
      continue;
    }
    if (depth > 0) continue;
    cur.raw[prop.name] = prop;
  }

  events.sort((a, b) => a.start - b.start || a.title.localeCompare(b.title));
  return { calendarName, tz: calTz || defaultTz, events };
}

function finishEvent(cur, tz) {
  const r = cur.raw;
  const startProp = r.DTSTART;
  if (!startProp) return null;
  const start = parseIcsDate(startProp.value, startProp.params, tz);
  if (!start) return null;
  let end = r.DTEND ? parseIcsDate(r.DTEND.value, r.DTEND.params, tz) : null;
  if (!end) {
    // Sched always sets DTEND, but default to 1h (or 1 day for all-day).
    end = {
      epoch: start.epoch + (start.allDay ? 24 * 60 : 60) * 60 * 1000,
      allDay: start.allDay,
    };
  }
  const title = r.SUMMARY ? unescapeText(r.SUMMARY.value).trim() : '(untitled)';
  return {
    uid: r.UID ? r.UID.value.trim() : '',
    title,
    start: start.epoch,
    end: Math.max(end.epoch, start.epoch),
    allDay: start.allDay,
    venue: r.LOCATION ? unescapeText(r.LOCATION.value).trim() : '',
    description: r.DESCRIPTION ? unescapeText(r.DESCRIPTION.value).trim() : '',
    url: r.URL ? r.URL.value.trim() : '',
  };
}
