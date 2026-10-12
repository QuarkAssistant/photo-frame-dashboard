import { GROCERY_CATS } from '../../mock.js';
import { groceryAction, state } from '../data.js';
import { register } from '../app.js';
import { esc } from '../ui.js';

function reasonLine() {
  const reason = state.groceryReason;
  if (!reason || state.grocerySource === 'reminders') return '';
  const text = {
    denied: 'Reminders access denied',
    notDetermined: 'Reminders access not granted yet',
    restricted: 'Reminders access restricted',
    writeOnly: 'Reminders access is write-only',
    timeout: 'Reminders did not answer',
    noList: 'No Reminders list matches that name',
    unavailable: '',
  }[reason];
  if (text === '') return '';
  return `<p class="s-reason">${esc(text || `Reminders: ${reason}`)}</p>`;
}

function usualsHtml() {
  const list = state.groceryUsuals || [];
  if (!list.length) return '<p class="s-reason">Items you check off will show up here.</p>';
  return list.map((name) =>
    `<button class="s-tile" type="button" data-grocery="add" data-name="${esc(name)}" data-cat="Other"><b>${esc(name)}</b></button>`).join('');
}

function paint(el) {
  const u = el.querySelector('.s-usuals');
  if (u) u.innerHTML = usualsHtml();
  const open = state.groceries.filter((g) => !g.done);
  const done = state.groceries.filter((g) => g.done);
  const cats = GROCERY_CATS.filter((cat) => open.some((g) => g.cat === cat));
  const groups = cats.map((cat) => {
    const rows = open.filter((g) => g.cat === cat).map((g) => row(g)).join('');
    return `<section class="s-cat"><div class="s-cat-h"><b>${esc(cat)}</b><span>${open.filter((g) => g.cat === cat).length}</span></div>${rows}</section>`;
  }).join('');
  el.querySelector('.s-list').innerHTML = groups || '<div class="empty serif">The list is clear.</div>';
  el.querySelector('.s-count').innerHTML = `<span class="num">${open.length}</span> to get${reasonLine()}`;
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
      el.innerHTML = `<div class="shop"><header class="s-head"><h1 class="serif">Grocery</h1><div class="s-count"></div></header>` +
        `<div class="s-main"><div class="s-list"></div><div class="s-done"></div></div>` +
        `<aside class="s-side"><form class="s-add" data-add-grocery>` +
        `<label class="s-input-wrap"><input class="s-input" name="name" placeholder="Add an item" autocomplete="off" enterkeyhint="done"></label>` +
        `<button class="btn btn--solid" type="submit">Add</button></form>` +
        `<div class="s-suggest"><div class="label">Quick add</div><div class="s-usuals"></div></div></aside></div>`;
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
