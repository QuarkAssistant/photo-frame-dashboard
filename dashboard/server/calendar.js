import { dedupeEvents } from '../events.js';
import { TIMEZONE } from '../family.js';
import { mockCalendar } from '../mock.js';
import { chicagoRange, formatCalUtc } from '../time.js';
import { decodeXml, eventsFromIcs, hrefIn, normName, xmlBlocks } from './ical.js';

const TTL = 5 * 60 * 1000;
let cache = null;

function authHeader(user, pass) {
  return `Basic ${Buffer.from(`${user}:${pass}`, 'utf8').toString('base64')}`;
}

async function dav(url, { method, body, depth, user, pass }) {
  const headers = {
    Authorization: authHeader(user, pass),
    'Content-Type': 'application/xml; charset=utf-8',
    Depth: depth,
    'User-Agent': 'coelho-dashboard/0.1',
  };
  let current = url;
  for (let i = 0; i < 6; i++) {
    const res = await fetch(current, { method, headers, body, redirect: 'manual' });
    if (res.status === 301 || res.status === 302 || res.status === 303 || res.status === 307 || res.status === 308) {
      const loc = res.headers.get('location');
      if (!loc) throw new Error('CalDAV redirect missing Location');
      current = new URL(loc, current).href;
      continue;
    }
    const text = await res.text();
    if (res.status === 401 || res.status === 403) {
      const err = new Error('iCloud calendar login failed');
      err.status = res.status;
      throw err;
    }
    if (res.status >= 400) throw new Error(`CalDAV ${method} ${res.status}`);
    return { url: current, text };
  }
  throw new Error('Too many CalDAV redirects');
}

async function findCalendar(user, pass, wanted) {
  // 1. Principal discovery on caldav.icloud.com
  const principalXml = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`;
  const root = await dav('https://caldav.icloud.com/', {
    method: 'PROPFIND', body: principalXml, depth: '0', user, pass,
  });
  const principalPath = hrefIn(root.text, 'current-user-principal');
  if (!principalPath) throw new Error('No current-user-principal');
  const principalUrl = new URL(principalPath, root.url).href;

  // 2. calendar-home-set on the principal (often a different pXX-caldav host)
  const homeXml = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>`;
  const home = await dav(principalUrl, { method: 'PROPFIND', body: homeXml, depth: '0', user, pass });
  const homePath = hrefIn(home.text, 'calendar-home-set');
  if (!homePath) throw new Error('No calendar-home-set');
  const homeUrl = new URL(homePath, home.url).href;

  // 3. List calendars and pick the one with the configured display name.
  const listXml = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:displayname/><d:resourcetype/></d:prop>
</d:propfind>`;
  const list = await dav(homeUrl, { method: 'PROPFIND', body: listXml, depth: '1', user, pass });
  const target = normName(wanted);
  let fallback = null;
  const names = [];
  for (const block of xmlBlocks(list.text, 'response')) {
    const name = normName(xmlBlocks(block, 'displayname')[0] || '');
    if (name) names.push(name);
    const href = hrefIn(block, '');
    const isCal = /<(?:[\w.-]+:)?calendar[\s/>]/i.test(block);
    if (!isCal || !href) continue;
    const url = new URL(decodeXml(href), list.url).href;
    if (name === target) return url;
    if (!fallback && name.toLowerCase() === target.toLowerCase()) fallback = url;
  }
  if (fallback) return fallback;
  const err = new Error(`Calendar not found: ${wanted}`);
  err.names = names;
  throw err;
}

async function report(calendarUrl, user, pass, start, end) {
  const a = formatCalUtc(start);
  const b = formatCalUtc(end);
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <c:calendar-data>
      <c:expand start="${a}" end="${b}"/>
    </c:calendar-data>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${a}" end="${b}"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;
  const res = await dav(calendarUrl, { method: 'REPORT', body, depth: '1', user, pass });
  const chunks = [];
  for (const block of xmlBlocks(res.text, 'response')) {
    const data = xmlBlocks(block, 'calendar-data')[0];
    if (data) chunks.push(decodeXml(data));
  }
  return chunks.join('\n');
}

export async function calendarPayload(now = new Date()) {
  const user = process.env.ICLOUD_USER || '';
  const pass = process.env.ICLOUD_APP_PASSWORD || '';
  const name = process.env.ICLOUD_CALENDAR_NAME || 'Calendário da Família';
  const range = chicagoRange(now, 14);
  if (!user || !pass) {
    return {
      source: 'mock',
      timezone: TIMEZONE,
      updated: now.toISOString(),
      events: dedupeEvents(mockCalendar(now)),
    };
  }
  if (cache && now.getTime() - cache.at < TTL) return { ...cache.data, cached: true };
  try {
    const url = cache?.url || await findCalendar(user, pass, name);
    const ics = await report(url, user, pass, range.start, range.end);
    const events = dedupeEvents(eventsFromIcs(ics, range.start, range.end)).slice(0, 400);
    const data = { source: 'icloud', timezone: TIMEZONE, updated: now.toISOString(), calendar: name, events };
    cache = { at: now.getTime(), url, data };
    return data;
  } catch (err) {
    console.error('calendar:', err.message);
    if (cache) return { ...cache.data, stale: true, updated: new Date(cache.at).toISOString() };
    return {
      source: 'error',
      timezone: TIMEZONE,
      updated: now.toISOString(),
      error: err.message,
      events: [],
    };
  }
}
