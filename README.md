# 🎟️ Cosplan

Compare **Sched.com** personal schedules across a group of friends — built for
San Diego Comic-Con (`comiccon2026.sched.com`), works for any Sched event.

Everyone builds their own schedule in Sched as usual. Cosplan pulls those
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
  conflict math, so ranking honestly gets your panel picked. Not sure yet?
  **🔖 Bookmark** it instead — bookmarked events stay on your timeline
  (shown dashed) but sit out of the conflict math until you rank them.

It's a fully static app: no server, no accounts. Data lives in your browser's
localStorage and moves between friends via share codes.

## Getting schedules in

Three ways, most to least convenient:

1. **Sched profile URL** — paste `https://comiccon2026.sched.com/yourusername`.
   Sched publishes an iCal feed at that URL + `.ics` (it's what the
   "Mobile App + iCal" sync buttons use); the app derives and fetches it.
   Pasting the feed URL itself, a `webcal://` link, or the Google Calendar
   sync link (`google.com/calendar/render?cid=…`) works too. Your Sched
   profile must be set to public. Sched doesn't send CORS headers, so the
   app falls back to public CORS relays — if your network blocks those,
   use option 2.

   URL imports also **auto-refresh**: any open tab re-pulls each person's
   feed every 15 minutes (and when you switch back to the tab), so schedule
   edits made in Sched flow in on their own — no server involved. Refreshes
   that change nothing are discarded locally; real changes update the group
   (and live sync, if on) while keeping your assigned tiers.
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

## Live sync (optional, via Supabase)

Share codes work with zero setup, but with ~15 minutes of one-time setup you
get automatic syncing: everyone joins a group once and edits appear on the
others' devices within seconds (changes push immediately; the app also polls
every 20s and refetches when you switch back to the tab). Setup:

1. Create a free project at [supabase.com](https://supabase.com).
2. In the project's **SQL Editor**, paste and run
   [`supabase/schema.sql`](supabase/schema.sql) from this repo.
3. In **Project Settings → API**, copy the *Project URL* and *anon public*
   key into [`js/config.js`](js/config.js), commit, and push (redeploys
   Pages automatically).

A **Live sync** card then appears on the Group tab: one person hits
**Create sync group** and sends the join link (`…/#g=<code>`); everyone who
opens it is in. No accounts — the unguessable group code *is* the membership,
same trust model as the share codes. The database is locked down (RLS with no
policies) so the public anon key can only call two functions that require
knowing a code; nobody can list groups.

How conflicts resolve: each person in the group carries a revision that bumps
whenever their picks change, and the newest revision wins per person — so two
friends editing their own schedules at once never clobber each other, and
removals propagate properly (deleted people get tombstones). "Load demo
group" and "Clear everything" deliberately drop you out of the sync group
first so you can't wipe the shared copy by accident. The free Supabase tier
covers this easily, but note it pauses projects after ~a week of inactivity —
poke the dashboard before con week.

## Running it

It's static files — serve the folder any way you like:

```sh
python3 -m http.server 8080   # or: npx serve .
```

then open http://localhost:8080. (A server is needed because the app uses ES
modules; opening `index.html` from `file://` won't work.)

To host for your group, deploy to **Cloudflare Pages** — no build step
required (build command: none, output directory: `/`). Two ways:

- **Dashboard (simplest):** Cloudflare dashboard → Workers & Pages → Create →
  Pages → Connect to Git → pick this repo. Leave the build command empty and
  set the output directory to `/`. Cloudflare redeploys automatically on every
  push to `main`.
- **GitHub Actions (already wired up):** [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
  deploys on push to `main` via Cloudflare's Wrangler action. Add two repo
  secrets (Settings → Secrets and variables → Actions) first:
  `CLOUDFLARE_API_TOKEN` (a token with *Cloudflare Pages: Edit* permission)
  and `CLOUDFLARE_ACCOUNT_ID` (from the dashboard's right sidebar). The
  workflow publishes to a Pages project named `sched-lane` (the project's
  original name, kept as the internal identifier for the existing deployment
  and its live data) — create it once (either method above) or the first
  Action run will create it for you.

Try it instantly with the **Load demo group** button (a fake SDCC 2026 group
of four with built-in overlaps and conflicts).

## Development

- No dependencies, no build. Plain ES modules: parsing/logic (`js/ics.js`,
  `js/logic.js`, `js/time.js`) are pure and unit-tested; views live in
  `js/ui/`.
- `npm test` runs the unit tests (`node --test`, Node 18+).
- Times are stored as epoch ms and rendered in America/Los_Angeles.
