import assert from 'node:assert/strict';
import test from 'node:test';
import { flashOnce, NAV_V2, routeFor, shouldIdleHome, wantsV2 } from '../nav.js';

test('rail has the nine approved items in order', () => {
  assert.deepEqual(NAV_V2.map((n) => n.label),
    ['Home', 'Calendar', 'Weather', 'Family', 'Chores', 'Grocery', 'Media', 'Cameras', 'Settings']);
  assert.equal(NAV_V2.find((n) => n.id === 'settings').hold, true);
  assert.equal(NAV_V2.filter((n) => n.hold).length, 1);
});

test('sub-pages light their parent and go Back to it', () => {
  assert.deepEqual(
    [routeFor('#photos').section, routeFor('photos').parent, routeFor('photos').view],
    ['media', 'media', 'photos']);
  assert.equal(routeFor('long-drift').section, 'media');
  assert.equal(routeFor('coming-up').section, 'calendar');
  assert.equal(routeFor('trips').view, 'coming-up');
  assert.equal(routeFor('calendar').parent, null);
});

test('person hashes open the member page under Family (Thiago included)', () => {
  for (const id of ['thiago', 'gilmara', 'jp', 'lucas']) {
    const r = routeFor(`#${id}`);
    assert.equal(r.view, 'member');
    assert.equal(r.section, 'family');
    assert.equal(r.person, id);
    assert.equal(r.parent, 'family');
  }
});

test('v1 hashes keep working and unknown hashes fall back to Home', () => {
  for (const h of ['home', 'calendar', 'chores', 'grocery', 'weather', 'settings']) assert.equal(routeFor(h).view, h);
  assert.equal(routeFor('').view, 'home');
  assert.equal(routeFor('#nope').name, 'home');
  assert.equal(routeFor('#JP').person, 'jp');
});

test('idle on a detail page returns Home after 3 minutes, never from Home or Settings', () => {
  assert.equal(shouldIdleHome('calendar', 179), false);
  assert.equal(shouldIdleHome('calendar', 180), true);
  assert.equal(shouldIdleHome('member', 600), true);
  assert.equal(shouldIdleHome('home', 999), false);
  assert.equal(shouldIdleHome('settings', 999), false);
  assert.equal(shouldIdleHome('calendar', 999, 0), false);
});

test('flashOnce fires once per key and stays bounded', () => {
  const seen = new Set();
  assert.equal(flashOnce(seen, 'ev1:now'), true);
  assert.equal(flashOnce(seen, 'ev1:now'), false);
  assert.equal(flashOnce(seen, 'ev1:late'), true);
  assert.equal(flashOnce(seen, ''), false);
  for (let i = 0; i < 100; i++) flashOnce(seen, `k${i}`);
  assert.ok(seen.size <= 50);
});

test('v2 shell is opt-in with ?ui=v2', () => {
  assert.equal(wantsV2(''), false);
  assert.equal(wantsV2('?layout=v1'), false);
  assert.equal(wantsV2('?ui=v2&now=2026-10-20T15:12:00-05:00'), true);
});
