// Timezone helpers built on Intl — no dependencies.
// All event times are stored as epoch milliseconds and rendered in the
// event's timezone (America/Los_Angeles for SDCC).

export const DEFAULT_TZ = 'America/Los_Angeles';

const dtfCache = new Map();

function dtf(tz) {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    dtfCache.set(tz, f);
  }
  return f;
}

// Offset of `tz` from UTC at the given instant, in ms (positive east of UTC).
export function tzOffsetMs(tz, date) {
  const parts = {};
  for (const p of dtf(tz).formatToParts(date)) parts[p.type] = p.value;
  const asUTC = Date.UTC(
    +parts.year, +parts.month - 1, +parts.day,
    +parts.hour % 24, +parts.minute, +parts.second,
  );
  return asUTC - date.getTime();
}

// Convert wall-clock time in `tz` to an epoch ms instant.
export function wallToEpoch(tz, y, mo, d, h = 0, mi = 0, s = 0) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let epoch = guess - tzOffsetMs(tz, new Date(guess));
  const off2 = tzOffsetMs(tz, new Date(epoch));
  if (guess - off2 !== epoch) epoch = guess - off2;
  return epoch;
}

export function partsInTz(tz, epochMs) {
  const parts = {};
  for (const p of dtf(tz).formatToParts(new Date(epochMs))) parts[p.type] = p.value;
  return {
    year: +parts.year, month: +parts.month, day: +parts.day,
    hour: +parts.hour % 24, minute: +parts.minute, second: +parts.second,
  };
}

// 'YYYY-MM-DD' of the instant as seen in tz — used to bucket events by day.
export function dayKeyInTz(tz, epochMs) {
  const p = partsInTz(tz, epochMs);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

// Minutes since midnight in tz for the instant.
export function minutesIntoDay(tz, epochMs) {
  const p = partsInTz(tz, epochMs);
  return p.hour * 60 + p.minute;
}

export function fmtTime(tz, epochMs) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: 'numeric', minute: '2-digit',
  }).format(new Date(epochMs));
}

export function fmtTimeRange(tz, start, end) {
  return `${fmtTime(tz, start)} – ${fmtTime(tz, end)}`;
}

// dayKey 'YYYY-MM-DD' -> 'Thu, Jul 23'
export function fmtDayLabel(tz, dayKey) {
  const [y, mo, d] = dayKey.split('-').map(Number);
  const epoch = wallToEpoch(tz, y, mo, d, 12); // noon avoids DST edges
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', month: 'short', day: 'numeric',
  }).format(new Date(epoch));
}
