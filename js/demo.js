// Demo group with SDCC-2026-flavored data so the app can be tried (and
// tested) without real Sched imports. Dates match SDCC 2026: Jul 23–26,
// with Preview Night Jul 22.

import { DEFAULT_TZ, wallToEpoch } from './time.js';
import { eventKey } from './logic.js';

const TZ = DEFAULT_TZ;

function ev(id, title, venue, day, h1, m1, h2, m2, description = '') {
  const start = wallToEpoch(TZ, 2026, 7, day, h1, m1);
  const end = wallToEpoch(TZ, 2026, 7, day, h2, m2);
  return {
    uid: `demo-${id}@sdcc-planner`,
    title, venue, start, end,
    allDay: false,
    description,
    url: '',
  };
}

const E = [
  // Wednesday (Preview Night)
  ev('pn', 'Preview Night', 'Exhibit Hall', 22, 18, 0, 21, 0,
    'Badge-holders get an early walk of the Exhibit Hall before the crowds. Exclusive first-night merch drops at the big booths, so bring a game plan.'),
  // Thursday
  ev('t1', 'Marvel Studios: The Next Saga', 'Hall H', 23, 10, 0, 11, 30,
    'Kevin Feige and surprise guests unveil the next phase of the MCU with exclusive footage. The Hall H line forms the night before — plan accordingly.'),
  ev('t2', 'The Art of Cosplay Armor', 'Room 25ABC', 23, 10, 30, 11, 30,
    'Champion cosplayers demo EVA foam shaping, worbla thermoforming, and paint weathering. Bring questions about your current build for the open workshop segment.'),
  ev('t3', 'Star Wars: Stories from a Galaxy Far, Far Away', 'Hall H', 23, 12, 0, 13, 0,
    'Lucasfilm creators discuss the upcoming slate of series and films, with a look behind the scenes at practical effects and creature design.'),
  ev('t4', 'Indie Comics Spotlight', 'Room 5AB', 23, 12, 15, 13, 15,
    'Small-press creators talk crowdfunding, self-publishing, and getting your book onto shelves. Q&A and portfolio tips in the back half.'),
  ev('t5', 'Critical Role: Live Q&A', 'Indigo Ballroom', 23, 14, 0, 15, 30,
    'The full cast answers fan questions live, with a few in-character bits and an announcement about the next campaign.'),
  ev('t6', 'Writing for Animation', 'Room 24ABC', 23, 14, 30, 15, 30,
    'Working story editors break down how an animated episode goes from pitch to storyboard, and how writers actually get hired.'),
  ev('t7', 'Exhibit Hall Crawl', 'Exhibit Hall', 23, 16, 0, 18, 0,
    'Unstructured group time to hit artist alley and the big vendor booths together before Thursday closing.'),
  // Friday
  ev('f1', 'DC Films: What’s Next', 'Hall H', 24, 10, 0, 11, 30,
    'James Gunn presents the road map for the next wave of DC films and series, with cast appearances and a first-look trailer.'),
  ev('f2', 'Anime Industry Roundtable', 'Room 6BCF', 24, 10, 0, 11, 0,
    'Licensors and studio reps discuss the state of simulcasts, dubs, and what titles are coming west next year.'),
  ev('f3', 'The Lord of the Rings: The Hunt for Gollum', 'Hall H', 24, 11, 45, 13, 0,
    'Andy Serkis and the filmmakers screen new footage and talk about returning to Middle-earth, mixing practical sets with new performance-capture tech.'),
  ev('f4', 'Kaiju Cinema Retrospective', 'Room 6A', 24, 12, 0, 13, 0,
    'Film historians trace giant-monster movies from 1954 to today, with rare production stills and suit-acting stories.'),
  ev('f5', 'Doctor Who: 63 Years and Counting', 'Ballroom 20', 24, 15, 0, 16, 0,
    'Cast and showrunner look back at the latest series and tease the holiday special. Expect a surprise video message or two.'),
  ev('f6', 'Portfolio Review Prep', 'Room 4', 24, 15, 15, 16, 15,
    'Art directors explain what they actually look for in a portfolio review and common mistakes that get artists passed over.'),
  ev('f7', 'Masquerade Prejudging Meetup', 'Sails Pavilion', 24, 17, 0, 18, 0,
    'Informal meetup for Saturday Masquerade entrants: workmanship judging sign-ups, staging questions, and prop check-in rules.'),
  // Saturday
  ev('s1', 'Stranger Things: The Final Season', 'Hall H', 25, 10, 30, 11, 45,
    'The cast says goodbye to Hawkins with a retrospective, blooper reel, and the final-season trailer premiere.'),
  ev('s2', 'Comics Coloring Masterclass', 'Room 2', 25, 10, 30, 11, 30,
    'A pro colorist works through a page live, covering flatting, rendering styles, and color scripts for mood.'),
  ev('s3', 'The Great LEGO Build-Off', 'Room 6DE', 25, 12, 0, 13, 0,
    'Teams of master builders race the clock on themed builds voted on by the audience. Loud, chaotic, extremely fun.'),
  ev('s4', 'Studio Ghibli Tribute Panel', 'Ballroom 20', 25, 12, 30, 13, 30,
    'Animators and critics celebrate the studio’s legacy with rare concept art and a discussion of its influence on western animation.'),
  ev('s5', 'Saturday Night Masquerade', 'Ballroom 20', 25, 20, 30, 23, 0,
    'The convention’s flagship costume competition: 40+ entries, celebrity judges, and halftime entertainment. Doors open an hour early.'),
  // Sunday
  ev('u1', 'Kids’ Day: Superhero Sketch-Along', 'Room 11AB', 26, 10, 0, 11, 0,
    'Family-friendly drawing session where a comics artist teaches kids to sketch their own superhero. Supplies provided.'),
  ev('u2', 'Best and Worst Comic Adaptations', 'Room 23ABC', 26, 11, 30, 12, 30,
    'Critics and fans debate the greatest hits and biggest misses of comics-to-screen adaptations. Audience votes settle the ties.'),
  ev('u3', 'Closing Ceremonies & Fan Awards', 'Indigo Ballroom', 26, 14, 0, 15, 0,
    'Wrap-up of the weekend: fan award winners, next year’s dates, and thank-yous from the organizing committee.'),
];

const KEYS = Object.fromEntries(E.map((e) => [e.uid.split('@')[0].slice(5), eventKey(e)]));

export function demoState(base) {
  const events = {};
  for (const e of E) events[eventKey(e)] = { key: eventKey(e), ...e };

  const people = [
    { id: 'demo-matt', name: 'Matt', color: '#3b82f6', source: 'demo' },
    { id: 'demo-sam', name: 'Sam', color: '#e5484d', source: 'demo' },
    { id: 'demo-riley', name: 'Riley', color: '#16a34a', source: 'demo' },
    { id: 'demo-jordan', name: 'Jordan', color: '#d97706', source: 'demo' },
  ];

  // Tiers: 1 = must-see, 2 = want, 3 = if time, 0 = bookmarked (undecided).
  const picks = {
    'demo-matt': {
      [KEYS.pn]: 2, [KEYS.t1]: 1, [KEYS.t3]: 2, [KEYS.t5]: 1, [KEYS.t7]: 3,
      [KEYS.f1]: 1, [KEYS.f3]: 2, [KEYS.f5]: 2,
      [KEYS.s1]: 1, [KEYS.s3]: 0, [KEYS.s4]: 2, [KEYS.s5]: 2, [KEYS.u3]: 2, // s3 bookmarked: overlaps s4 but no conflict
    },
    'demo-sam': {
      [KEYS.pn]: 2, [KEYS.t1]: 1, [KEYS.t2]: 1, [KEYS.t5]: 2,
      [KEYS.f2]: 1, [KEYS.f3]: 1, [KEYS.f7]: 2,
      [KEYS.s2]: 1, [KEYS.s4]: 1, [KEYS.s5]: 1, [KEYS.u2]: 3,
    },
    'demo-riley': {
      [KEYS.t1]: 2, [KEYS.t4]: 1, [KEYS.t6]: 2,
      [KEYS.f1]: 2, [KEYS.f4]: 1, [KEYS.f6]: 1, // f5/f6 overlap handled by group
      [KEYS.s1]: 2, [KEYS.s3]: 1, [KEYS.s5]: 2, [KEYS.u2]: 0, [KEYS.u3]: 1,
    },
    'demo-jordan': {
      [KEYS.pn]: 3, [KEYS.t1]: 1, [KEYS.t5]: 1, [KEYS.t6]: 3, // t5/t6 overlap => personal conflict
      [KEYS.f1]: 1, [KEYS.f4]: 2, [KEYS.f5]: 1, [KEYS.f6]: 2, // another personal conflict
      [KEYS.s1]: 1, [KEYS.s3]: 2, [KEYS.u1]: 1, [KEYS.u3]: 2,
    },
  };

  return { ...base, tz: TZ, people, events, picks };
}
