import assert from 'node:assert/strict';
import test from 'node:test';
import { flashOnce, NAV_V2, routeFor, shouldIdleHome, uiDefault, wantsV2, withUiDefault } from '../nav.js';

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

test('server default picks the shell; ?ui= overrides it', () => {
  assert.equal(wantsV2('', 'v2'), true);
  assert.equal(wantsV2('?ui=v1', 'v2'), false);
  assert.equal(wantsV2('?ui=v2', null), true);
  assert.equal(wantsV2('', null), false);
  assert.equal(wantsV2('', 'v1'), false);
});

test('DASHBOARD_UI marks the page only for v2', () => {
  const page = '<!doctype html>\n<html lang="en">\n<head></head></html>';
  assert.equal(uiDefault(' V2 '), 'v2');
  assert.equal(uiDefault(undefined), 'v1');
  assert.equal(uiDefault('v3'), 'v1');
  assert.equal(withUiDefault(page, 'v2'), '<!doctype html>\n<html data-ui-default="v2" lang="en">\n<head></head></html>');
  assert.equal(withUiDefault(page, ''), page);
  assert.equal(withUiDefault(page, 'v1'), page);
  assert.equal(withUiDefault('<html>x</html>', 'v2'), '<html data-ui-default="v2">x</html>');
});
