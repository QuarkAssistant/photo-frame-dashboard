import { state, toggleChore, toggleHomework } from '../data.js';
import { member, now, register } from '../app.js';
import { ymd, addDaysYmd } from '../../time.js';
import { avatar, dayParts, esc, eventTitle, formatRange, onDay, owner, pstyle, relDay } from '../ui.js';

function upcoming(person) {
  const today = ymd(now());
  const end = addDaysYmd(today, 14);
  const list = state.events.filter((e) => {
    const day = e.allDay ? e.start : ymd(new Date(e.start));
    return day >= today && day < end && e.people.includes(person.id) && (e.allDay || new Date(e.end) > now());
  });
  list.sort((a, b) => String(a.start).localeCompare(String(b.start)));
  if (!list.length) return '<div class="empty serif">Nothing coming up.</div>';
  let last = '';
  return list.map((e) => {
    const day = e.allDay ? e.start : ymd(new Date(e.start));
    const head = day !== last
      ? `<div class="m-day"><b>${esc(relDay(day))}</b><span>${esc(dayParts(day).month)} ${esc(dayParts(day).day)}</span></div>`
      : '';
    last = day;
    const time = e.allDay ? 'All day' : formatRange(e.start, e.end);
    const p = owner(e);
    return head + `<button class="m-ev" type="button" data-ev="${esc(e.id)}" style="${pstyle(p)}">` +
      `<span class="m-ev-t">${esc(time)}</span><b>${esc(eventTitle(e))}</b></button>`;
  }).join('');
}

function chores(person) {
  const list = state.chores.filter((c) => c.who === person.id);
  if (!list.length) return '<div class="empty serif">No chores yet.</div>';
  return list.map((c) =>
    `<button class="ch${c.done ? ' is-done' : ''}" type="button" data-chore="${esc(c.id)}" style="${pstyle(person)}">` +
    `<span class="ch-emoji">${c.emoji}</span><span class="ch-text"><b>${esc(c.title)}</b><small>${esc(routineName(c.routine))}</small></span>` +
    `<span class="ch-box">${c.done ? '✓' : ''}</span></button>`
  ).join('');
}

function routineName(id) {
  return (state.routines.find((r) => r.id === id) || {}).name || '';
}

function homework(person) {
  const list = state.homework.filter((h) => h.who === person.id);
  if (!list.length) {
    return '<div class="ph-note serif"><i>Homework tracker</i> — we’ll define this later.</div>';
  }
  return list.map((h) =>
    `<button class="ch${h.done ? ' is-done' : ''}" type="button" data-homework="${esc(h.id)}" style="${pstyle(person)}">` +
    `<span class="ch-text"><b>${esc(h.title)}</b></span><span class="ch-box">${h.done ? '✓' : ''}</span></button>`
  ).join('');
}

register('member', {
  show(el) {
    const person = member();
    if (!person) return;
    const dp = dayParts(ymd(now()));
    el.innerHTML = `<div class="member" style="${pstyle(person)}">` +
      `<header class="m-head">${avatar(person)}<div><div class="label">Coelho de Oliveira</div>` +
      `<h1 class="serif">${esc(person.name)}</h1></div>` +
      `<div class="m-date serif">${esc(dp.weekday)} ${esc(dp.month)} ${esc(dp.day)}</div></header>` +
      `<section class="m-events card"><div class="label">Upcoming</div><div class="m-list">${upcoming(person)}</div></section>` +
      `<div class="m-side">` +
      `<section class="card m-block"><div class="label">Chores</div>${chores(person)}</section>` +
      `<section class="card m-block"><div class="label">Homework</div>${homework(person)}</section>` +
      `</div></div>`;
  },
  toggleHomework(id) { toggleHomework(id); },
});
