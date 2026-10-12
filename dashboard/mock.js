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
    if (dow >= 1 && dow <= 5) {
      events.push(make('🚗 Thiago — School drop-off', at(day, 7, 15), at(day, 7, 40), { location: 'School' }));
      events.push(make('Gilmara — Pickup', at(day, 15, 20), at(day, 15, 45), { location: 'School' }));
    }
    if (dow === 1 || dow === 3) {
      events.push(make('🎹 Lucas — Piano lesson', at(day, 15, 45), at(day, 16, 30), { location: "Ms. Park's Studio" }));
    }
    if (dow === 2 || dow === 4) {
      events.push(make('⚽️ JP — U14 Boys Academy - Team Training', at(day, 16, 30), at(day, 18, 0), { location: 'Academy fields' }));
    }
    if (dow === 5) {
      events.push(make('⚽️ JP — U14 Boys Academy - Match', at(day, 16, 0), at(day, 17, 30), { location: 'Academy fields' }));
    }
    if (dow === 4) {
      events.push(make('Gilmara — Book club', at(day, 19, 0), at(day, 20, 30)));
    }
    if (dow === 6) {
      events.push(make('⚽️ JP — U14 Boys Academy - Game', at(day, 9, 0), at(day, 10, 30), { location: 'Academy fields' }));
      events.push(make('Lucas — Swim lesson', at(day, 11, 0), at(day, 12, 0)));
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
      : hour < 15 ? 'Gilmara — Appointment'
        : hour < 18 ? '⚽️ JP — U14 Boys Academy - Team Training'
          : hour < 21 ? '🎹 Lucas — Piano practice'
            : '📖 Lucas — Reading time';
    events.push(make(title, start.toISOString(), end.toISOString(), { location: 'Home' }));
  }

  events.sort((a, b) => {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    return String(a.start).localeCompare(String(b.start));
  });
  return events;
}

function hourLabel(hour, first) {
  if (first) return 'Now';
  const h = hour % 12 || 12;
  return `${h}${hour >= 12 ? 'p' : 'a'}`;
}

export function describeWeather({ temp, code, hi, lo, hours, source }) {
  const labels = { sun: 'Sunny', moon: 'Clear', partly: 'Partly cloudy', cloud: 'Overcast', rain: 'Rain' };
  let summary = 'Dry the rest of the day';
  let advice = temp < 50 ? 'Jacket weather' : 'Light layers';
  const wetAt = hours.findIndex((h, i) => i > 0 && h.pop >= 50);
  if ((hours[0] && hours[0].pop >= 50) || code === 'rain') {
    summary = 'Rain right now';
    advice = 'Grab a rain jacket';
  } else if (wetAt > 0) {
    summary = `Rain from ${hours[wetAt].label}`;
    advice = 'Pack a rain jacket';
  } else if (code === 'cloud') {
    summary = 'Cloudy';
  } else if (temp >= 80) {
    summary = 'Warm and dry';
    advice = 'Light clothes';
  }
  return {
    source,
    temp: Math.round(temp),
    code,
    label: labels[code] || 'Forecast',
    hi: Math.round(hi),
    lo: Math.round(lo),
    summary,
    advice,
    hours,
  };
}

export function mockWeather(now = new Date()) {
  const hours = [];
  for (let i = 0; i < 7; i++) {
    const t = new Date(now.getTime() + i * 3600000);
    const hp = parts(t);
    const temp = Math.round(54 + 12 * Math.sin(((hp.hour - 4) / 24) * Math.PI * 2));
    const pop = hp.hour >= 16 && hp.hour <= 19 ? 72 : hp.hour === 15 ? 40 : 8;
    let code = 'partly';
    if (pop >= 50) code = 'rain';
    else if (hp.hour >= 20 || hp.hour < 6) code = 'moon';
    else if (hp.hour >= 11 && hp.hour <= 15) code = 'sun';
    hours.push({ label: hourLabel(hp.hour, i === 0), temp, code, pop });
  }
  return describeWeather({
    source: 'mock',
    temp: hours[0].temp,
    code: hours[0].code,
    hi: 68,
    lo: 49,
    hours,
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
      chore('c8', 'lucas', 'after', 'Practice piano', '🎹', false),
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
