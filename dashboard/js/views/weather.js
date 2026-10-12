import { state } from '../data.js';
import { register } from '../app.js';
import { dayStrip, hourStrip, nowBlock, tempChart } from '../weatherui.js';
import { esc } from '../ui.js';

function page(w) {
  if (!w) return '<div class="wx"><h1 class="serif">Weather</h1></div>';
  return `<div class="wx">` +
    `<header class="wx-head"><h1 class="serif">${esc(w.place || 'Naperville')}</h1>` +
    `<button class="wx-back" type="button" data-go="home">Today</button></header>` +
    nowBlock(w, 64) +
    `<section class="wx-block"><div class="label">Next hours</div>${hourStrip(w.hours, 32)}</section>` +
    `<section class="wx-block"><div class="label">Next 7 days</div>${dayStrip(w.days, 32, true)}</section>` +
    `<section class="wx-block wx-chart"><div class="label">Next 24 hours <span class="wx-legend">°F · rain %</span></div>${tempChart(w.chart || w.hours)}</section>` +
    `</div>`;
}

register('weather', {
  show(el) {
    el.innerHTML = page(state.weather);
  },
});
