import { describeWeather, hourLabelFromHour, mockWeather } from '../mock.js';
import { parts, ymd, zonedToUtc } from '../time.js';

const TTL = 10 * 60 * 1000;
let cache = null;

function wmoIcon(code, hour) {
  const n = Number(code);
  const night = hour >= 20 || hour < 6;
  if (n === 0) return night ? 'moon' : 'sun';
  if (n === 1 || n === 2) return night ? 'night' : 'partly';
  if (n === 3) return 'cloud';
  if (n === 45 || n === 48) return 'fog';
  if ((n >= 71 && n <= 77) || n === 85 || n === 86) return 'snow';
  if (n >= 95) return 'storm';
  if ((n >= 51 && n <= 67) || (n >= 80 && n <= 82)) return 'rain';
  return night ? 'night' : 'partly';
}

function dayName(iso, today) {
  if (iso === today) return 'Today';
  const [y, m, d] = iso.split('-').map(Number);
  return parts(zonedToUtc(y, m, d, 12, 0, 0)).weekday;
}

export async function weatherPayload(now = new Date()) {
  const lat = Number(process.env.LAT) || 41.7859;
  const lon = Number(process.env.LON) || -88.1473;
  const place = process.env.WEATHER_PLACE || 'Naperville';
  if (cache && now.getTime() - cache.at < TTL && cache.lat === lat && cache.lon === lon && cache.place === place) {
    return { ...cache.data, cached: true };
  }
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('current', 'temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m,apparent_temperature');
  url.searchParams.set('hourly', 'temperature_2m,precipitation_probability,weather_code');
  url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,weather_code');
  url.searchParams.set('temperature_unit', 'fahrenheit');
  url.searchParams.set('wind_speed_unit', 'mph');
  url.searchParams.set('precipitation_unit', 'inch');
  url.searchParams.set('timezone', 'America/Chicago');
  url.searchParams.set('forecast_days', '5');
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    const data = await res.json();
    const times = data.hourly?.time || [];
    const nowKey = `${parts(now).year}-${String(parts(now).month).padStart(2, '0')}-${String(parts(now).day).padStart(2, '0')}T${String(parts(now).hour).padStart(2, '0')}`;
    let idx = times.findIndex((t) => t.startsWith(nowKey));
    if (idx < 0) idx = 0;
    const hours = [];
    for (let i = 0; i < 8 && idx + i < times.length; i++) {
      const slot = times[idx + i];
      const hour = Number(slot.slice(11, 13));
      const temp = Math.round(data.hourly.temperature_2m[idx + i]);
      const pop = Math.round(data.hourly.precipitation_probability?.[idx + i] || 0);
      hours.push({
        label: hourLabelFromHour(hour, i === 0),
        temp,
        pop,
        code: wmoIcon(data.hourly.weather_code[idx + i], hour),
      });
    }
    const today = ymd(now);
    const dailyTimes = data.daily?.time || [];
    const days = [];
    for (let i = 0; i < 5 && i < dailyTimes.length; i++) {
      days.push({
        label: dayName(dailyTimes[i], today),
        hi: data.daily.temperature_2m_max?.[i] ?? hours[0]?.temp ?? 0,
        lo: data.daily.temperature_2m_min?.[i] ?? hours[0]?.temp ?? 0,
        code: wmoIcon(data.daily.weather_code?.[i] ?? 0, 12),
      });
    }
    const currentHour = parts(now).hour;
    const shaped = describeWeather({
      source: 'open-meteo',
      place,
      temp: data.current?.temperature_2m ?? hours[0]?.temp ?? 0,
      code: wmoIcon(data.current?.weather_code ?? data.hourly.weather_code[idx], currentHour),
      hi: days[0]?.hi ?? data.daily?.temperature_2m_max?.[0] ?? hours[0]?.temp ?? 0,
      lo: days[0]?.lo ?? data.daily?.temperature_2m_min?.[0] ?? hours[0]?.temp ?? 0,
      hours,
      days,
    });
    shaped.humidity = data.current?.relative_humidity_2m ?? null;
    shaped.wind = data.current?.wind_speed_10m ?? null;
    cache = { at: now.getTime(), lat, lon, place, data: shaped };
    return shaped;
  } catch (err) {
    console.error('weather:', err.message);
    if (cache) return { ...cache.data, stale: true };
    return mockWeather(now);
  }
}
