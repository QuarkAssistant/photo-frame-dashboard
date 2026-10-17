import { parseUniform } from './uniform.js';
import { assignEvent, displayTitle, TIMEZONE } from '../family.js';
import { addDaysYmd, ymd, zonedToUtc } from '../time.js';

export function unfold(text) {
  return String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '');
}

function unescapeText(value) {
  let out = '';
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '\\' && i + 1 < value.length) {
      const n = value[++i];
      if (n === 'n' || n === 'N') out += '\n';
      else out += n;
    } else out += value[i];
  }
  return out;
}

function parseLine(line) {
  if (!line) return null;
  const idx = line.indexOf(':');
  if (idx < 0) return null;
  const left = line.slice(0, idx);
  const value = unescapeText(line.slice(idx + 1));
  const bits = left.split(';');
  const params = {};
  for (let i = 1; i < bits.length; i++) {
    const eq = bits[i].indexOf('=');
    if (eq < 0) continue;
    const key = bits[i].slice(0, eq).toUpperCase();
    let val = bits[i].slice(eq + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    params[key] = val;
  }
  return { name: bits[0].toUpperCase(), params, value: value.trim() };
}

function parseTree(ics) {
  const root = { name: 'ROOT', props: [], children: [] };
  const stack = [root];
  for (const line of unfold(ics).split('\n')) {
    const prop = parseLine(line.trim());
    if (!prop) continue;
    if (prop.name === 'BEGIN') {
      const node = { name: prop.value.toUpperCase(), props: [], children: [] };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    } else if (prop.name === 'END') {
      if (stack.length > 1) stack.pop();
    } else {
      stack[stack.length - 1].props.push(prop);
    }
  }
  return root;
}

function prop(node, name) {
  return node.props.find((p) => p.name === name) || null;
}

function applyDuration(start, spec) {
  const m = String(spec).match(/P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?/i);
  if (!m) return new Date(start.getTime() + 3600000);
  const ms = (((Number(m[1] || 0) * 24 + Number(m[2] || 0)) * 60 + Number(m[3] || 0)) * 60 + Number(m[4] || 0)) * 1000;
  return new Date(start.getTime() + ms);
}

function parseWhen(p) {
  if (!p) return null;
  const v = p.value;
  const isDate = (p.params.VALUE || '').toUpperCase() === 'DATE' || /^\d{8}$/.test(v);
  if (isDate) {
    return { allDay: true, ymd: `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` };
  }
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!m) return null;
  const year = +m[1], month = +m[2], day = +m[3], hh = +m[4], mm = +m[5], ss = +m[6];
  const date = m[7] === 'Z'
    ? new Date(Date.UTC(year, month - 1, day, hh, mm, ss))
    : zonedToUtc(year, month, day, hh, mm, ss, p.params.TZID || TIMEZONE);
  return { allDay: false, date };
}

function collect(node, name, out) {
  for (const child of node.children) {
    if (child.name === name) out.push(child);
    else collect(child, name, out);
  }
}

function overlaps(ev, start, end) {
  if (ev.allDay) {
    const ws = ymd(start);
    const we = ymd(new Date(end.getTime() - 1));
    return ev.start <= we && ev.end > ws;
  }
  return new Date(ev.start) < end && new Date(ev.end) > start;
}

export function eventsFromIcs(ics, windowStart, windowEnd) {
  const tree = parseTree(ics);
  const nodes = [];
  collect(tree, 'VEVENT', nodes);
  const events = [];
  for (const node of nodes) {
    const status = (prop(node, 'STATUS')?.value || '').toUpperCase();
    if (status === 'CANCELLED') continue;
    const summary = prop(node, 'SUMMARY')?.value?.replace(/\s+/g, ' ').trim();
    if (!summary) continue;
    const startP = parseWhen(prop(node, 'DTSTART'));
    if (!startP) continue;
    const endP = parseWhen(prop(node, 'DTEND'));
    const duration = prop(node, 'DURATION')?.value;
    let start;
    let end;
    let allDay = false;
    if (startP.allDay) {
      allDay = true;
      start = startP.ymd;
      end = endP && endP.allDay ? endP.ymd : addDaysYmd(start, 1);
    } else {
      start = startP.date.toISOString();
      if (endP && !endP.allDay) end = endP.date.toISOString();
      else if (duration) end = applyDuration(startP.date, duration).toISOString();
      else end = new Date(startP.date.getTime() + 3600000).toISOString();
    }
    const uid = prop(node, 'UID')?.value || summary;
    const rid = prop(node, 'RECURRENCE-ID')?.value || start;
    const who = assignEvent(summary);
    const ev = {
      id: `${uid}:${rid}`,
      title: summary,
      displayTitle: displayTitle(summary),
      start,
      end,
      allDay,
      location: prop(node, 'LOCATION')?.value?.replace(/\\n/g, ' ').trim() || '',
      everyone: who.everyone,
      people: who.people,
    };
    if (/⚽|soccer|futebol/i.test(summary)) {
      const uniform = parseUniform(prop(node, 'DESCRIPTION')?.value);
      if (uniform) ev.uniform = uniform;
    }
    if (!windowStart || overlaps(ev, windowStart, windowEnd)) events.push(ev);
  }
  events.sort((a, b) => String(a.start).localeCompare(String(b.start)));
  return events;
}

export function decodeXml(s) {
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function tagInner(xml, tag) {
  const re = new RegExp(`<(?:[\\w.-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : '';
}

export function xmlBlocks(xml, tag) {
  const re = new RegExp(`<(?:[\\w.-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${tag}>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

export function hrefIn(xml, tag) {
  const block = tag ? tagInner(xml, tag) : xml;
  const href = tagInner(block, 'href');
  return decodeXml(href).trim();
}

export function normName(s) {
  return decodeXml(s).replace(/\s+/g, ' ').trim().normalize('NFC');
}
