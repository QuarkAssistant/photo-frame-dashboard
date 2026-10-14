// Current conditions from the National Weather Service (api.weather.gov):
// latest observation of the nearest station. Open-Meteo's model "current" can
// miss light rain, so the header trusts a real station report when it's fresh.
// Station: NWS_STATION in .env, else points/{lat,lon} -> nearest stations
// (DuPage Airport KDPA first for Naperville), fallback KARR.
const UA = 'coelho-dashboard/1.0 (family photo frame; github.com/QuarkAssistant/photo-frame-dashboard)';
const TTL = 5 * 60 * 1000;
let cache = null;
let stations = null;

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/geo+json' } });
  if (!res.ok) throw new Error(`NWS ${res.status}`);
  return res.json();
}

async function stationList(lat, lon) {
  if (stations) return stations;
  const list = [];
  if (process.env.NWS_STATION) list.push(process.env.NWS_STATION);
  list.push('KDPA'); // DuPage Airport, closest ASOS to Naperville
  try {
    const pt = await getJson(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`);
    const st = await getJson(pt.properties.observationStations);
    for (const f of (st.features || []).slice(0, 3)) list.push(f.properties.stationIdentifier);
  } catch { /* fall back below */ }
  for (const id of ['KDPA', 'KARR']) if (!list.includes(id)) list.push(id);
  stations = list;
  return list;
}

// NWS text/icon -> dashboard icon + label.
export function mapNws(text, iconUrl, night) {
  const t = String(text || '').toLowerCase();
  const icon = String(iconUrl || '');
  if (/thunder|t-storm|tsra/.test(t) || /\/tsra/.test(icon)) return { code: 'storm', label: 'Thunderstorms' };
  if (/snow|sleet|ice pellets|flurr/.test(t)) return { code: 'snow', label: t.includes('light') ? 'Light snow' : 'Snow' };
  if (/drizzle/.test(t)) return { code: 'rain', label: 'Drizzle' };
  if (/rain|shower/.test(t) || /\/(rain|shra|ra)\b/.test(icon)) {
    return { code: 'rain', label: t.includes('heavy') ? 'Heavy rain' : t.includes('light') ? 'Light rain' : 'Rain' };
  }
  if (/fog|mist|haze|smoke/.test(t)) return { code: 'fog', label: t.includes('fog') ? 'Fog' : t.includes('haze') ? 'Haze' : 'Mist' };
  if (/^cloudy|overcast/.test(t)) return { code: 'cloud', label: 'Overcast' };
  if (/mostly cloudy/.test(t)) return { code: 'cloud', label: 'Mostly cloudy' };
  if (/partly|scattered|few clouds|mostly clear|mostly sunny/.test(t)) return { code: night ? 'night' : 'partly', label: night ? 'Partly cloudy' : 'Partly sunny' };
  if (/clear|sunny|fair/.test(t)) return { code: night ? 'moon' : 'sun', label: night ? 'Clear' : 'Sunny' };
  return null;
}

export async function nwsCurrent(lat, lon, now = new Date()) {
  if (cache && now - cache.at < TTL) return cache.data;
  let data = null;
  for (const id of await stationList(lat, lon)) {
    try {
      const obs = (await getJson(`https://api.weather.gov/stations/${id}/observations/latest`)).properties;
      if (!obs || !obs.timestamp) continue;
      const ageMin = (now - new Date(obs.timestamp)) / 60000;
      if (ageMin > 90) continue;
      const c = obs.temperature && obs.temperature.value;
      data = {
        station: id,
        at: obs.timestamp,
        ageMin: Math.round(ageMin),
        text: obs.textDescription || '',
        icon: obs.icon || '',
        tempC: c == null ? null : c,
        tempF: c == null ? null : c * 9 / 5 + 32,
        precipLastHourMm: obs.precipitationLastHour && obs.precipitationLastHour.value,
      };
      break;
    } catch { /* next station */ }
  }
  cache = { at: now.getTime(), data };
  return data;
}
