import { FAMILY, assignEvent, displayTitle } from './family.js';
import { addDaysYmd, parts, weekdayIndex, ymd, zonedToUtc } from './time.js';

export const ROUTINES = [
  { id: 'morning', name: 'Morning', from: 0, to: 11 },
  { id: 'after', name: 'After school', from: 11, to: 17 },
  { id: 'evening', name: 'Evening', from: 17, to: 24 },
];

export function routineForHour(hour) {
  return ROUTINES.find((r) => hour >= r.from && hour < r.to) || ROUTINES[ROUTINES.length - 1];
}

function at(day, h, min) {
  const [y, mo, d] = day.split('-').map(Number);
  return zonedToUtc(y, mo, d, h, min, 0).toISOString();
}

function make(title, start, end, extra = {}) {
  const who = assignEvent(title);
  return {
    id: extra.id || `${start}|${title}`,
    title,
    displayTitle: displayTitle(title),
    start,
    end,
    allDay: !!extra.allDay,
    location: extra.location || '',
    everyone: who.everyone,
    people: who.people,
  };
}

function isColumbusDay(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  if (m !== 10) return false;
  const dow = new Date(Date.UTC(y, 9, d)).getUTCDay();
  return dow === 1 && d >= 8 && d <= 14;
}

export function mockCalendar(now = new Date()) {
  const today = ymd(now);
  const events = [];
  for (let i = 0; i < 14; i++) {
    const day = addDaysYmd(today, i);
    const dow = weekdayIndex(day);
    if (isColumbusDay(day)) {
      events.push(make('KJHS — No School (Columbus Day)', day, addDaysYmd(day, 1), { allDay: true }));
    }
    if (dow >= 1 && dow <= 5 && !isColumbusDay(day)) {
      events.push(make('KJHS — School', day, addDaysYmd(day, 1), { allDay: true }));
      events.push(make('🚗 Thiago — School drop-off', at(day, 7, 15), at(day, 7, 40), { location: 'KJHS' }));
      events.push(make('Gilmara — Pickup', at(day, 15, 20), at(day, 15, 45), { location: 'KJHS' }));
    }
    if (dow === 1 || dow === 3) {
      events.push(make('⚽️ Lucas — U13 Boys Academy - Team Training', at(day, 17, 0), at(day, 18, 30), { location: 'Academy fields' }));
    }
    if (dow === 2 || dow === 4) {
      events.push(make('⚽️ JP — U14 Boys Academy - Team Training', at(day, 16, 30), at(day, 18, 0), { location: 'Academy fields' }));
    }
    if (dow === 4) {
      events.push(make('Gilmara — Book club', at(day, 19, 0), at(day, 20, 30)));
    }
    if (dow === 6) {
      events.push(make('⚽️ JP — U14 Boys Academy - Game', at(day, 9, 0), at(day, 10, 30), { location: 'Academy fields' }));
      events.push(make('⚽️ Lucas — U13 Boys Academy - Game', at(day, 11, 0), at(day, 12, 30), { location: 'Academy fields' }));
    }
    if (dow === 0) {
      events.push(make('Brunch — Family brunch', at(day, 10, 30), at(day, 12, 0), { location: 'Home' }));
    }
  }

  const upcoming = events
    .filter((e) => !e.allDay && new Date(e.start) > now)
    .sort((a, b) => new Date(a.start) - new Date(b.start))[0];
  const gap = upcoming ? new Date(upcoming.start) - now : Infinity;
  if (gap > 70 * 60000) {
    let start = new Date(Math.floor(now.getTime() / 300000) * 300000 + 25 * 60000);
    if (start - now < 8 * 60000) start = new Date(start.getTime() + 10 * 60000);
    const end = new Date(start.getTime() + 45 * 60000);
    const hour = parts(now).hour;
    const title = hour < 11 ? '🚗 Thiago — School drop-off'
      : hour < 15 ? 'Gilmara — Pickup'
        : hour < 19 ? '⚽️ JP — U14 Boys Academy - Team Training'
          : '⚽️ Lucas — U13 Boys Academy - Team Training';
    events.push(make(title, start.toISOString(), end.toISOString(), { location: 'Home' }));
  }

  events.sort((a, b) => {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    return String(a.start).localeCompare(String(b.start));
  });
  return events;
}

export function fToC(f) {
  return Math.round((Number(f) - 32) * 5 / 9);
}

function hourLabel(hour, first) {
  if (first) return 'Now';
  const h = hour % 12 || 12;
  return `${h} ${hour >= 12 ? 'PM' : 'AM'}`;
}

const WX_LABELS = {
  sun: 'Sunny',
  moon: 'Clear',
  partly: 'Partly cloudy',
  night: 'Mostly clear',
  cloud: 'Overcast',
  rain: 'Rain',
  snow: 'Snow',
  storm: 'Storm',
  fog: 'Fog',
};

export function describeWeather({ temp, code, hi, lo, hours, days, source, place }) {
  const list = hours || [];
  let summary = '';
  const wetAt = list.findIndex((h, i) => i > 0 && h.pop >= 50);
  if ((list[0] && list[0].pop >= 50) || code === 'rain' || code === 'snow' || code === 'storm') {
    summary = code === 'snow' ? 'Snow in the forecast' : code === 'storm' ? 'Storms nearby' : 'Rain right now';
  } else if (wetAt > 0) {
    summary = `Rain from ${list[wetAt].label}`;
  }
  const tempF = Math.round(temp);
  const hiF = Math.round(hi);
  const loF = Math.round(lo);
  return {
    source,
    place: place || 'Naperville',
    temp: tempF,
    tempC: fToC(tempF),
    code,
    label: WX_LABELS[code] || 'Forecast',
    hi: hiF,
    hiC: fToC(hiF),
    lo: loF,
    loC: fToC(loF),
    summary,
    hours: list.map((h) => {
      const f = Math.round(h.temp);
      return { ...h, temp: f, tempC: fToC(f) };
    }),
    days: (days || []).map((d) => {
      const dayHi = Math.round(d.hi);
      const dayLo = Math.round(d.lo);
      return { ...d, hi: dayHi, hiC: fToC(dayHi), lo: dayLo, loC: fToC(dayLo) };
    }),
  };
}

export function mockWeather(now = new Date()) {
  const hours = [];
  for (let i = 0; i < 8; i++) {
    const t = new Date(now.getTime() + i * 3600000);
    const hp = parts(t);
    const temp = Math.round(54 + 12 * Math.sin(((hp.hour - 4) / 24) * Math.PI * 2));
    const pop = hp.hour >= 16 && hp.hour <= 19 ? 70 : hp.hour === 15 || hp.hour === 20 ? 30 : 0;
    let code = 'partly';
    if (pop >= 50) code = 'rain';
    else if (hp.hour >= 20 || hp.hour < 6) code = i === 0 ? 'moon' : 'night';
    else if (hp.hour >= 11 && hp.hour <= 15) code = 'sun';
    hours.push({ label: hourLabel(hp.hour, i === 0), temp, code, pop });
  }
  const today = ymd(now);
  const days = [];
  for (let i = 0; i < 5; i++) {
    const day = addDaysYmd(today, i);
    const [y, m, d] = day.split('-').map(Number);
    const hi = 68 - i + (i === 2 ? -4 : 0);
    const lo = 49 - i;
    let code = 'partly';
    if (i === 2) code = 'rain';
    else if (i === 4) code = 'sun';
    days.push({
      label: i === 0 ? 'Today' : parts(zonedToUtc(y, m, d, 12, 0, 0)).weekday,
      hi,
      lo,
      code,
    });
  }
  return describeWeather({
    source: 'mock',
    place: 'Naperville',
    temp: hours[0].temp,
    code: hours[0].code,
    hi: days[0].hi,
    lo: days[0].lo,
    hours,
    days,
  });
}

export function hourLabelFromHour(hour, first) {
  return hourLabel(hour, first);
}

export function seedStore() {
  const chore = (id, who, routine, title, emoji, done) => ({ id, who, routine, title, emoji, done });
  return {
    seq: 40,
    chores: [
      chore('c1', 'thiago', 'morning', 'Start coffee', '☕', true),
      chore('c2', 'gilmara', 'morning', 'Pack lunches', '🥪', true),
      chore('c3', 'jp', 'morning', 'Make bed', '🛏️', true),
      chore('c4', 'lucas', 'morning', 'Brush teeth', '🪥', false),
      chore('c5', 'any', 'morning', 'Empty the dishwasher', '🍽️', true),
      chore('c6', 'jp', 'after', 'Unpack bag', '🎒', true),
      chore('c7', 'jp', 'after', 'Homework', '📚', false),
      chore('c8', 'lucas', 'after', 'Pack soccer bag', '⚽️', false),
      chore('c9', 'lucas', 'after', 'Read for 20 min', '📖', false),
      chore('c10', 'thiago', 'after', 'Take out recycling', '♻️', false),
      chore('c11', 'gilmara', 'after', 'Fold laundry', '🧺', true),
      chore('c12', 'any', 'after', 'Water the plants', '🪴', false),
      chore('c13', 'jp', 'evening', 'Lay out clothes', '👕', true),
      chore('c14', 'lucas', 'evening', 'Bath', '🛁', false),
      chore('c15', 'thiago', 'evening', 'Lock up', '🔐', true),
      chore('c16', 'gilmara', 'evening', 'Run the dishwasher', '🫧', false),
      chore('c17', 'any', 'evening', 'Wipe the counters', '🧽', false),
    ],
    groceries: [
      { id: 'g1', name: 'Bananas', cat: 'Produce', done: false },
      { id: 'g2', name: 'Grapes', cat: 'Produce', done: false },
      { id: 'g3', name: 'Strawberries', cat: 'Produce', done: false },
      { id: 'g4', name: 'Milk', cat: 'Dairy', done: false },
      { id: 'g5', name: 'Eggs', cat: 'Dairy', done: false },
      { id: 'g6', name: 'Sourdough', cat: 'Bakery', done: false },
      { id: 'g7', name: 'Olive oil', cat: 'Pantry', done: false },
      { id: 'g8', name: 'Granola bars', cat: 'Pantry', done: false },
      { id: 'g9', name: 'Dish soap', cat: 'Household', done: false },
      { id: 'g10', name: 'Paper towels', cat: 'Household', done: true },
      { id: 'g11', name: 'Lemons', cat: 'Produce', done: true },
    ],
    homework: [
      { id: 'h1', who: 'jp', title: 'Math worksheet', done: false },
      { id: 'h2', who: 'jp', title: 'Reading log', done: true },
      { id: 'h3', who: 'lucas', title: 'Spelling list', done: false },
      { id: 'h4', who: 'lucas', title: 'Piano theory', done: false },
    ],
  };
}

export const GROCERY_CATS = ['Produce', 'Dairy', 'Bakery', 'Pantry', 'Household', 'Other'];
export const USUALS = [
  ['Milk', 'Dairy'], ['Eggs', 'Dairy'], ['Bananas', 'Produce'], ['Bread', 'Bakery'],
  ['Apples', 'Produce'], ['Olive oil', 'Pantry'], ['Paper towels', 'Household'], ['Yogurt', 'Dairy'],
];
