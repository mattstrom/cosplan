// Fetching a personal schedule from Sched.
//
// Every public Sched attendee profile (https://<event>.sched.com/<username>)
// exposes an iCal feed at the same URL with `.ics` appended — that feed is
// what Sched's own "Mobile App + iCal" sync buttons point at. Sched doesn't
// send CORS headers, so a direct browser fetch usually fails; we fall back
// to public CORS proxies, and the UI offers file-upload/paste as the
// always-works path.

export function toIcsUrl(input) {
  let u = input.trim().replace(/^webcal:\/\//i, 'https://');
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  const url = new URL(u);
  // Sched's "Sync to Google" button hands out Google Calendar add-by-URL
  // links (google.com/calendar/render?cid=<feed url>) — unwrap the feed.
  if (/(^|\.)google\.com$/i.test(url.hostname) && url.searchParams.has('cid')) {
    return toIcsUrl(url.searchParams.get('cid'));
  }
  url.protocol = 'https:'; // http feeds would be blocked as mixed content
  url.hash = '';
  url.search = '';
  let path = url.pathname.replace(/\/+$/, '');
  if (path === '') throw new Error('That looks like an event home page — paste your personal profile URL (it ends with your username).');
  if (!path.toLowerCase().endsWith('.ics')) path += '.ics';
  url.pathname = path;
  return url.toString();
}

const PROXIES = [
  (u) => u, // direct — works if Sched ever sends CORS headers
  (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
];

export async function fetchScheduleIcs(profileUrl, { onStatus = () => {} } = {}) {
  const icsUrl = toIcsUrl(profileUrl);
  let lastError = null;
  for (let i = 0; i < PROXIES.length; i++) {
    const attempt = PROXIES[i](icsUrl);
    onStatus(i === 0 ? 'Fetching from Sched…' : `Retrying via relay ${i}…`);
    try {
      const res = await fetch(attempt, { redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!/BEGIN:VCALENDAR/i.test(text)) {
        throw new Error('Response was not an iCal file (is the profile public?)');
      }
      return { text, icsUrl };
    } catch (err) {
      lastError = err;
    }
  }
  const e = new Error(
    `Couldn't fetch the schedule automatically (${lastError?.message || 'network error'}). ` +
    `Open ${icsUrl} in a new tab, save the file, and use “Upload .ics file” instead — ` +
    `and check that your Sched profile is set to public.`,
  );
  e.icsUrl = icsUrl;
  throw e;
}
