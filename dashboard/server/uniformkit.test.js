import assert from 'node:assert/strict';
import test from 'node:test';
import { colorsIn } from './uniform.js';
import { kitHtml, uniformKit } from '../js/uniformkit.js';
import { homeTitle } from '../js/homev2data.js';

const kit = (text) => {
  const k = uniformKit({ text, colors: colorsIn(text) });
  return k && Object.fromEntries(Object.entries(k).map(([g, c]) => [g, c ? c.name : null]));
};

test('uniform text pairs each garment with its colour', () => {
  assert.deepEqual(kit('Red Jersey / Black shorts & socks'), { jersey: 'red', shorts: 'black', socks: 'black' });
  assert.deepEqual(kit('White jersey, navy shorts, white socks'), { jersey: 'white', shorts: 'navy', socks: 'white' });
  assert.deepEqual(kit('Black shorts and socks, white jersey'), { jersey: 'white', shorts: 'black', socks: 'black' });
  assert.deepEqual(kit('Camisa vermelha, calção preto e meias'), { jersey: 'vermelha', shorts: 'preto', socks: 'preto' });
});

test('one colour and no garments shows just the jersey; no colour shows nothing', () => {
  assert.deepEqual(kit('All black'), { jersey: 'black', shorts: null, socks: null });
  assert.deepEqual(kit('Blue'), { jersey: 'blue', shorts: null, socks: null });
  assert.equal(kit('Away kit'), null);
  assert.equal(uniformKit(null), null);
});

test('icons are filled with the kit colours and outlined', () => {
  const u = { text: 'Red Jersey / Black shorts & socks', colors: colorsIn('Red Jersey / Black shorts & socks') };
  const html = kitHtml(u, 40);
  assert.equal((html.match(/class="uni-ico/g) || []).length, 3);
  assert.match(html, /uni-jersey[\s\S]*fill="#B23A32"/);
  assert.match(html, /uni-shorts[\s\S]*fill="#1E1E1E"/);
  assert.match(html, /stroke="#1F2A2E"/);
  assert.equal((kitHtml({ text: 'All black', colors: colorsIn('All black') }).match(/uni-ico/g) || []).length, 1);
});

test('v2 Home titles are the full calendar title (team prefix kept)', () => {
  const e = { title: '⚽️ JP — U14 Boys Academy - Team Training', displayTitle: 'U14 Boys Academy - Team Training' };
  assert.equal(homeTitle(e), 'U14 Boys Academy - Team Training');
});
