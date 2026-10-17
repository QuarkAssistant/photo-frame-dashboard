import assert from 'node:assert/strict';
import test from 'node:test';
import { moonPhase, moonSvg } from '../js/moon.js';
import {
  aqiPos, arcPoint, dayLength, nightRuns, rainArrival, smoothPath, sunProgress, tempPoints, uvPos, weekBars,
} from '../js/wxchart.js';
import { worldPx } from './radar.js';
import { aqiLabel, clockText, compass, hourText, rainWindow, shapeDetail, uvLabel, whatToWear } from './weatherv2.js';

// Made-up forecast in Open-Meteo's shape: 30 hours from 2 PM, showers 5–8 PM, 7 days.
function fixture() {
  const time = [];
  const temp = [];
  const feels = [];
  const pop = [];
  const code = [];
  const wind = [];
  const isDay = [];
  for (let i = 0; i < 30; i++) {
    const h = (14 + i) % 24;
    const day = 17 + Math.floor((14 + i) / 24);
    time.push(`2026-10-${day}T${String(h).padStart(2, '0')}:00`);
    temp.push(60 - i * 0.5);
    feels.push(58 - i * 0.5);
    pop.push(i >= 3 && i <= 6 ? 70 : 5);
    code.push(i >= 3 && i <= 6 ? 81 : 2);
    wind.push(i === 4 ? 21 : 9);
    isDay.push(h >= 7 && h < 18 ? 1 : 0);
  }
  const dt = ['2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'];
  return {
    current: { temperature_2m: 61.2, apparent_temperature: 59.4, weather_code: 2, wind_speed_10m: 8.6, wind_gusts_10m: 17.9, wind_direction_10m: 225, uv_index: 3.4, is_day: 1 },
    hourly: { time, temperature_2m: temp, apparent_temperature: feels, precipitation_probability: pop, weather_code: code, wind_speed_10m: wind, wind_gusts_10m: wind, is_day: isDay },
    daily: {
      time: dt, temperature_2m_max: [64, 66, 71, 73, 62, 58, 60, 61], temperature_2m_min: [51, 47, 52, 55, 49, 44, 42, 40],
      weather_code: [81, 1, 2, 2, 61, 3, 0, 0], precipitation_probability_max: [70, 5, 10, 20, 80, 30, 0, 0],
      sunrise: dt.map((d) => `${d}T07:09`), sunset: dt.map((d) => `${d}T18:07`), daylight_duration: dt.map(() => 39480),
    },
  };
}

test('shapeDetail: Now extras, 25 hours from the current hour, 7 days from today', () => {
  const d = shapeDetail(fixture(), { current: { us_aqi: 42 } }, '2026-10-17T14:35');
  assert.equal(d.hours.length, 25);
  assert.equal(d.hours[0].label, '2 PM');
  assert.equal(d.hours[10].label, '12 AM');
  assert.equal(d.feels, 59);
  assert.equal(d.feelsC, 15);
  assert.deepEqual(d.air, { aqi: 42, label: 'Good' });
  assert.deepEqual(d.uv, { value: 3, label: 'Moderate' });
  assert.deepEqual(d.wind, { mph: 9, gust: 18, from: 225, compass: 'SW' });
  assert.equal(d.daylight.rise, '7:09 AM');
  assert.equal(d.daylight.set, '6:07 PM');
  assert.equal(d.daylight.minutes, 658);
  assert.equal(d.days.length, 7);
  assert.equal(d.days[0].date, '2026-10-17');
  assert.equal(d.days[0].hiC, 18);
  assert.equal(d.rain.text, 'Showers 5–9 PM');
  assert.deepEqual(d.windPeak, { mph: 21, at: '6 PM' });
  assert.equal(d.wear, 'jacket + umbrella');
  assert.equal(d.current.temp, 61);
  assert.equal(d.hours[5].day, false);
});

test('shapeDetail: missing air quality and UV stay empty, never invented', () => {
  const fc = fixture();
  delete fc.current.uv_index;
  const d = shapeDetail(fc, null, '2026-10-17T14:00');
  assert.equal(d.air, null);
  assert.equal(d.uv, null);
});

test('rainWindow: only when the data supports it; spans AM/PM', () => {
  const h = (time, p, wmo = 61) => ({ time, pop: p, wmo });
  assert.equal(rainWindow([h('2026-10-17T15:00', 10), h('2026-10-17T16:00', 30)]), null);
  assert.equal(rainWindow([h('2026-10-17T10:00', 50), h('2026-10-17T11:00', 60), h('2026-10-17T12:00', 60)]).text, 'Rain 10 AM–1 PM');
  assert.equal(rainWindow([h('2026-10-17T22:00', 40, 95), h('2026-10-17T23:00', 45, 95)]).text, 'Storms 10 PM–12 AM');
});

test('whatToWear: documented thresholds', () => {
  const hrs = (feels, pop = 0, wmo = 0) => Array.from({ length: 12 }, () => ({ feels, pop, wmo }));
  assert.equal(whatToWear(hrs(75)), 't-shirt');
  assert.equal(whatToWear(hrs(60)), 'light layer');
  assert.equal(whatToWear(hrs(50, 60)), 'jacket + umbrella');
  assert.equal(whatToWear(hrs(40)), 'warm coat');
  assert.equal(whatToWear(hrs(20, 80, 73)), 'winter coat + hat + boots');
});

test('labels and clock text', () => {
  assert.equal(aqiLabel(51), 'Moderate');
  assert.equal(aqiLabel(160), 'Unhealthy');
  assert.equal(uvLabel(0), 'Low');
  assert.equal(uvLabel(11), 'Extreme');
  assert.equal(compass(350), 'N');
  assert.equal(compass(100), 'E');
  assert.equal(hourText('2026-10-17T00:00'), '12 AM');
  assert.equal(hourText('2026-10-17T12:00'), '12 PM');
  assert.equal(clockText('2026-10-17T18:07'), '6:07 PM');
});

test('moonPhase matches known 2024 phases', () => {
  const at = (iso) => moonPhase(new Date(iso));
  const nm = at('2024-04-08T18:21:00Z');
  assert.ok(nm.fraction < 0.01);
  assert.equal(nm.name, 'New moon');
  const fq = at('2024-04-15T19:13:00Z');
  assert.ok(Math.abs(fq.fraction - 0.5) < 0.03 && fq.waxing);
  assert.equal(fq.name, 'First quarter');
  const fm = at('2024-04-23T23:49:00Z');
  assert.ok(fm.fraction > 0.99);
  assert.equal(fm.name, 'Full moon');
  const lq = at('2024-05-01T11:27:00Z');
  assert.ok(Math.abs(lq.fraction - 0.5) < 0.03 && !lq.waxing);
  assert.equal(lq.name, 'Last quarter');
  const wc = at('2024-04-11T12:00:00Z');
  assert.equal(wc.name, 'Waxing crescent');
  assert.equal(at('2024-04-28T12:00:00Z').name, 'Waning gibbous');
  assert.equal(at('2024-05-05T12:00:00Z').name, 'Waning crescent');
});

test('moonSvg lights the right side while waxing and the left while waning', () => {
  const wax = moonSvg({ fraction: 0.2, waxing: true });
  const wan = moonSvg({ fraction: 0.2, waxing: false });
  assert.match(wax, /M12 2A10 10 0 0 1 12 22/);
  assert.match(wan, /M12 2A10 10 0 0 0 12 22/);
  assert.doesNotMatch(moonSvg({ fraction: 0, waxing: true }), /F3E7C4/);
});

test('chart geometry', () => {
  const d = smoothPath([[0, 10], [10, 0], [20, 10]]);
  assert.match(d, /^M0 10C/);
  assert.equal((d.match(/C/g) || []).length, 2);
  // Monotone: the curve never dips below the lowest point's control box at the peak.
  assert.match(d, /C[\d.]+ 0 [\d.]+ 0 10 0|10 0C/);
  const pts = tempPoints([50, 60], { x: 0, y: 100, w: 10, h: 50 });
  assert.ok(pts[1][1] < pts[0][1]);
  assert.deepEqual(nightRuns([{ day: true }, { day: false }, { day: false }, { day: true }, { day: false }]), [[1, 2], [4, 4]]);
  assert.equal(aqiPos(0), 0);
  assert.equal(aqiPos(50), 1 / 6);
  assert.equal(aqiPos(999), 1);
  assert.equal(uvPos(11), 1);
  assert.equal(sunProgress('2026-10-17T07:00', '2026-10-17T19:00', '2026-10-17T13:00'), 0.5);
  assert.equal(sunProgress('2026-10-17T07:00', '2026-10-17T19:00', '2026-10-17T20:00'), null);
  const [x, y] = arcPoint(0.5, 0, 100, 80, 60);
  assert.equal(Math.round(x), 50);
  assert.equal(Math.round(y), 20);
  const bars = weekBars([{ lo: 40, hi: 60 }, { lo: 50, hi: 80 }]);
  assert.deepEqual(bars[0], { left: 0, width: 0.5 });
  assert.equal(bars[1].left, 0.25);
  assert.equal(dayLength(658), '10 h 58 m');
  assert.equal(rainArrival([{ pop: 10 }, { pop: 60, label: '5 PM' }], 'Showers'), 'Showers arriving ~5 PM');
  assert.equal(rainArrival([{ pop: 0 }]), 'No rain in the next 24 h');
});

test('worldPx: web-mercator pixels', () => {
  assert.deepEqual(worldPx(0, 0, 0), { x: 128, y: 128 });
  assert.deepEqual(worldPx(0, -180, 1), { x: 0, y: 256 });
});
