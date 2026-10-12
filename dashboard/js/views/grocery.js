import { GROCERY_CATS, USUALS } from '../../mock.js';
import { groceryAction, state } from '../data.js';
import { register } from '../app.js';
import { esc } from '../ui.js';

function paint(el) {
  const open = state.groceries.filter((g) => !g.done);
  const done = state.groceries.filter((g) => g.done);
  const cats = GROCERY_CATS.filter((cat) => open.some((g) => g.cat === cat));
  const groups = cats.map((cat) => {
    const rows = open.filter((g) => g.cat === cat).map((g) => row(g)).join('');
    return `<section class="s-cat"><div class="s-cat-h"><b>${esc(cat)}</b><span>${open.filter((g) => g.cat === cat).length}</span></div>${rows}</section>`;
  }).join('');
  el.querySelector('.s-list').innerHTML = groups || '<div class="empty serif">The list is clear.</div>';
  el.querySelector('.s-count').innerHTML = `<span class="num">${open.length}</span> to get`;
  el.querySelector('.s-done').innerHTML = done.length
    ? `<button class="s-drawer-h" type="button" data-grocery="show-done">Checked <span class="num">${done.length}</span></button>` +
      (el.dataset.showDone === '1'
        ? `<div class="s-drawer-list">${done.map((g) =>
          `<button class="s-got" type="button" data-grocery="toggle" data-name="${esc(g.id)}">${esc(g.name)}</button>`).join('')}` +
          `<button class="s-clear" type="button" data-grocery="clear-done">Clear checked</button></div>`
        : '')
    : '';
}

function row(g) {
  return `<div class="s-row"><button class="s-hit" type="button" data-grocery="toggle" data-name="${esc(g.id)}">` +
    `<span class="s-box"></span><span class="s-name"><b>${esc(g.name)}</b></span></button></div>`;
}

register('grocery', {
  show(el) {
    if (!el.dataset.built) {
      el.dataset.built = '1';
      const chips = USUALS.map(([name, cat]) =>
        `<button class="s-tile" type="button" data-grocery="add" data-name="${esc(name)}" data-cat="${esc(cat)}"><b>${esc(name)}</b></button>`
      ).join('');
      el.innerHTML = `<div class="shop"><header class="s-head"><h1 class="serif">Grocery</h1><div class="s-count"></div></header>` +
        `<div class="s-main"><div class="s-list"></div><div class="s-done"></div></div>` +
        `<aside class="s-side"><form class="s-add" data-add-grocery>` +
        `<label class="s-input-wrap"><input class="s-input" name="name" placeholder="Add an item" autocomplete="off" enterkeyhint="done"></label>` +
        `<button class="btn btn--solid" type="submit">Add</button></form>` +
        `<div class="s-suggest"><div class="label">Quick add</div><div class="s-usuals">${chips}</div></div></aside></div>`;
    }
    paint(el);
  },
  act(action, name, cat) {
    const el = document.getElementById('view-grocery');
    if (action === 'show-done') {
      if (el) el.dataset.showDone = el.dataset.showDone === '1' ? '0' : '1';
      if (el) paint(el);
      return;
    }
    if (action === 'clear-done') return groceryAction({ action: 'clear-done' });
    if (action === 'toggle') return groceryAction({ action: 'toggle', id: name });
    if (action === 'add') return groceryAction({ action: 'add', name, cat: cat || 'Other' });
  },
});
