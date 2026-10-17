// Uniform colors for soccer events, parsed from the iCloud event notes
// (DESCRIPTION). Only the uniform line is sent to the client; the rest of
// the notes never leaves the server.

const COLORS = {
  white: '#F4F1EA', branco: '#F4F1EA', branca: '#F4F1EA',
  black: '#1E1E1E', preto: '#1E1E1E', preta: '#1E1E1E',
  navy: '#1F2E4D', 'navy blue': '#1F2E4D', 'dark blue': '#1F2E4D', 'azul marinho': '#1F2E4D',
  blue: '#2F5D9A', azul: '#2F5D9A', royal: '#2A4FA8', 'royal blue': '#2A4FA8',
  'light blue': '#8DB7DB', 'sky blue': '#8DB7DB', 'azul claro': '#8DB7DB', 'columbia blue': '#9BC4E2',
  red: '#B23A32', vermelho: '#B23A32', vermelha: '#B23A32', maroon: '#6E2430', burgundy: '#6E2430',
  green: '#2F6B45', verde: '#2F6B45', 'kelly green': '#2E8B4A', 'forest green': '#24503A',
  yellow: '#E2C044', amarelo: '#E2C044', amarela: '#E2C044', gold: '#C9A23A', dourado: '#C9A23A',
  orange: '#D9792B', laranja: '#D9792B',
  purple: '#5E3F86', roxo: '#5E3F86', roxa: '#5E3F86',
  grey: '#8A8A85', gray: '#8A8A85', cinza: '#8A8A85', silver: '#B9BAB5',
  pink: '#D98BA6', rosa: '#D98BA6', teal: '#2E7C7A', 'neon yellow': '#D6E33A',
};

const LABEL = /^\s*(?:uniforms?|uniforme|kit|jerseys?|camisas?|wear|colou?rs?)\b\s*(?:colou?rs?)?\s*[:=\-–—]\s*(.+)$/i;

export function unescapeIcs(v) {
  return String(v || '')
    .replace(/\\n/gi, '\n')
    .replace(/\\([,;\\])/g, '$1');
}

// Returns { text, colors: [{ name, hex }] } or null when the notes carry no uniform info.
export function parseUniform(description) {
  const lines = unescapeIcs(description).split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(LABEL);
    if (!m) continue;
    const text = cleanText(m[1]);
    if (!text) continue;
    return { text, colors: colorsIn(text) };
  }
  return null;
}

// Real notes look like "Red Jersey/black shorts & socks (Arrival Time: …)",
// "“Wear Orange” — laranja. Shorts e meias …" or "Wear Blue (coach email, …)".
// Keep only the English color phrase: drop parentheticals (they can carry
// names), anything after a spaced dash, quotes and a leading "Wear".
export function cleanText(raw) {
  let t = String(raw || '').split('(')[0];
  t = t.split(/\s[—–-]\s/)[0];
  t = t.replace(/[“”"«»]/g, '').replace(/\s+/g, ' ').trim();
  t = t.replace(/^wear\s+/i, '').replace(/[.;,:]+$/, '').trim();
  if (!t) return '';
  return (t[0].toUpperCase() + t.slice(1)).slice(0, 60);
}

export function colorsIn(text) {
  const low = ` ${String(text).toLowerCase()} `;
  const names = Object.keys(COLORS).sort((a, b) => b.length - a.length);
  const hits = [];
  let rest = low;
  for (const name of names) {
    const re = new RegExp(`(^|[^a-zà-ú])${name.replace(/ /g, '\\s+')}(?=[^a-zà-ú]|$)`, 'i');
    const m = rest.match(re);
    if (!m) continue;
    const at = low.search(re);
    hits.push({ at, name, hex: COLORS[name] });
    rest = rest.replace(re, (s, pre) => pre + ' '.repeat(s.length - pre.length));
  }
  const seen = new Set();
  return hits.sort((a, b) => a.at - b.at)
    .filter((h) => (seen.has(h.hex) ? false : seen.add(h.hex)))
    .slice(0, 4)
    .map(({ name, hex }) => ({ name, hex }));
}
