// Holidays (US + BR, date.nager.at) and Flamengo fixtures (ESPN public JSON).
// No API keys. Cached: holidays 24 h, fixtures 3 h.
const HOLIDAY_TTL = 24 * 3600 * 1000;
const FIXTURE_TTL = 3 * 3600 * 1000;
const FLAMENGO_ESPN_ID = '819';
const cache = { holidays: null, fixtures: null };

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function cached(key, ttl, load) {
  const c = cache[key];
  if (c && Date.now() - c.at < ttl) return c.data;
  try {
    const data = await load();
    cache[key] = { at: Date.now(), data };
    return data;
  } catch (e) {
    if (c) return c.data;
    throw e;
  }
}

function todayChicago() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
}

async function loadHolidays() {
  const lists = await Promise.all(['US', 'BR'].map((cc) =>
    getJson(`https://date.nager.at/api/v3/NextPublicHolidays/${cc}`).catch(() => [])));
  const all = [];
  for (const list of lists) {
    for (const h of list || []) {
      if (h.global === false) continue;
      all.push({ date: h.date, name: h.name, local: h.localName, country: h.countryCode });
    }
  }
  all.sort((a, b) => a.date.localeCompare(b.date) || a.country.localeCompare(b.country));
  return all;
}

async function loadFixtures() {
  const d = await getJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/all/teams/${FLAMENGO_ESPN_ID}/schedule?fixture=true`);
  return (d.events || []).map((e) => {
    const c = (e.competitions || [])[0] || {};
    const teams = c.competitors || [];
    const fla = teams.find((t) => t.team && t.team.id === FLAMENGO_ESPN_ID);
    const opp = teams.find((t) => t !== fla);
    const league = (e.league && (e.league.shortName || e.league.name)) || '';
    return {
      start: e.date,
      home: fla ? fla.homeAway === 'home' : null,
      opponent: opp && opp.team ? (opp.team.shortDisplayName || opp.team.displayName) : '',
      competition: league.replace(/^CONMEBOL /, '').replace(/^Brazilian /, ''),
      stage: (e.seasonType && e.seasonType.abbreviation) || '',
      timeTBD: Boolean(c.timeValid === false),
    };
  }).filter((f) => f.start && f.opponent);
}

export async function extrasPayload() {
  const today = todayChicago();
  const [holidays, fixtures] = await Promise.all([
    cached('holidays', HOLIDAY_TTL, loadHolidays).catch(() => []),
    cached('fixtures', FIXTURE_TTL, loadFixtures).catch(() => []),
  ]);
  const cutoff = Date.now() - 2 * 3600 * 1000; // keep a game visible while it's being played
  return {
    holidays: holidays.filter((h) => h.date >= today).slice(0, 3),
    fixtures: fixtures.filter((f) => Date.parse(f.start) >= cutoff).slice(0, 2),
  };
}
