import { ANYONE, FAMILY } from '../../family.js';
import { state, toggleChore } from '../data.js';
import { register, routineNow } from '../app.js';
import { avatar, esc, pstyle, ring } from '../ui.js';

let routine = null;

function people() {
  return FAMILY.concat([ANYONE]);
}

function paint(el) {
  const current = routine || routineNow().id;
  routine = current;
  const lanes = people().map((p) => {
    const list = state.chores.filter((c) => c.routine === current && c.who === p.id);
    const done = list.filter((c) => c.done).length;
    const rows = list.map((c) =>
      `<button class="ch${c.done ? ' is-done' : ''}" type="button" data-chore="${esc(c.id)}" style="${pstyle(p)}">` +
      `<span class="ch-emoji">${c.emoji}</span><span class="ch-text"><b>${esc(c.title)}</b></span>` +
      `<span class="ch-box">${c.done ? '✓' : ''}</span></button>`
    ).join('') || '<div class="ch-none serif"><i>Nothing here</i></div>';
    return `<section class="ch-lane" style="${pstyle(p)}">` +
      `<header class="ch-head">${avatar(p)}<div><b>${esc(p.name)}</b><small>${done}/${list.length || 0}</small></div>` +
      `<span class="ch-ring">${ring(done, list.length || 0)}</span></header>` +
      `<div class="ch-list">${rows}</div></section>`;
  }).join('');
  el.querySelector('.ch-lanes').innerHTML = lanes;
  el.querySelectorAll('[data-routine]').forEach((b) => b.classList.toggle('is-on', b.dataset.routine === current));
  const total = state.chores.filter((c) => c.routine === current);
  const done = total.filter((c) => c.done).length;
  el.querySelector('.t-count').textContent = total.length ? `${done}/${total.length}` : '';
}

register('chores', {
  show(el) {
    if (!routine) routine = routineNow().id;
    if (!el.dataset.built) {
      el.dataset.built = '1';
      const segs = (state.routines.length ? state.routines : [{ id: 'morning', name: 'Morning' }, { id: 'after', name: 'After school' }, { id: 'evening', name: 'Evening' }])
        .map((r) => `<button type="button" data-routine="${r.id}">${esc(r.name)}</button>`).join('');
      el.innerHTML = `<div class="tasks"><header class="t-head"><div class="t-title"><h1 class="serif">Chores</h1><p>Tap to check off</p></div>` +
        `<div class="t-count num"></div><div class="seg">${segs}</div></header><div class="ch-lanes"></div></div>`;
    }
    paint(el);
  },
  setRoutine(id) {
    routine = id;
    const el = document.getElementById('view-chores');
    if (el) paint(el);
  },
  toggle(id) { toggleChore(id); },
});
