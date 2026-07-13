# 🎟️ Sched Lane

Compare **Sched.com** personal schedules across a group of friends — built for
San Diego Comic-Con (`comiccon2026.sched.com`), works for any Sched event.

Everyone builds their own schedule in Sched as usual. Sched Lane pulls those
schedules together and shows you:

- **Timeline** — a day-by-day grid with a column per person, so you can see the
  whole group side by side. A `👥 n` chip marks events multiple people picked;
  side-by-side blocks in one column mean that person is double-booked.
- **Conflicts** — the resolver. Time windows where people picked *different*
  overlapping events become cards with a suggested **Group pick**, scored by
  everyone's rankings (Must-see = 3, Want = 2, If time = 1), plus warnings when
  switching would cost someone a must-see. Personal double-bookings are listed
  separately with a keep/drop suggestion.
- **Rankings** — tier each pick (**MUST / WANT / MAYBE**). Tiers feed the
  conflict math, so ranking honestly gets your panel picked.

It's a fully static app: no server, no accounts. Data lives in your browser's
localStorage and moves between friends via share codes.

## Getting schedules in

Three ways, most to least convenient:

1. **Sched profile URL** — paste `https://comiccon2026.sched.com/yourusername`.
   Sched publishes an iCal feed at that URL + `.ics` (it's what the
   "Mobile App + iCal" sync buttons use); the app derives and fetches it.
   Your Sched profile must be set to public. Sched doesn't send CORS headers,
   so the app falls back to public CORS relays — if your network blocks those,
   use option 2.
2. **Upload the .ics file** — in Sched, open your schedule → the icons in the
   top-right → *Mobile App + iCal* (or *Export Calendar* for private events),
   save the `.ics`, and upload it here.
3. **Paste raw iCal text** — paste the contents of the `.ics` file directly.

Re-importing replaces that person's picks but keeps the tiers you'd already
assigned to events still on the schedule.

## Sharing with your group

On the **Group** tab, hit **Copy share code** and send the code (starts with
`SL1:`, it's your group gzipped + base64'd) over text/Discord. Friends paste it
into the same box and **Merge into group** — people are matched by name, and
their picks come along. **Download JSON** gives a plain backup of everything.

Practical flow: one person collects everyone's `.ics`/URLs, imports them all,
then sends one share code to the group so everyone sees the same picture.

## Running it

It's static files — serve the folder any way you like:

```sh
python3 -m http.server 8080   # or: npx serve .
```

then open http://localhost:8080. (A server is needed because the app uses ES
modules; opening `index.html` from `file://` won't work.)

To host for your group, enable **GitHub Pages** on this repo (Settings →
Pages → deploy from branch) — no build step required.

Try it instantly with the **Load demo group** button (a fake SDCC 2026 group
of four with built-in overlaps and conflicts).

## Development

- No dependencies, no build. Plain ES modules: parsing/logic (`js/ics.js`,
  `js/logic.js`, `js/time.js`) are pure and unit-tested; views live in
  `js/ui/`.
- `npm test` runs the unit tests (`node --test`, Node 18+).
- Times are stored as epoch ms and rendered in America/Los_Angeles.
