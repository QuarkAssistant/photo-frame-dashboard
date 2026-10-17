// Soccer uniform icons for the event popup (v1 and v2 share it). The server sends
// ev.uniform = { text, colors: [{ name, hex }] } (server/uniform.js); here each colour is paired
// with the garments named after it: "Red Jersey / Black shorts & socks" → red jersey, black
// shorts, black socks. When the text starts with a garment, each garment takes the colour after it
// ("camisa vermelha", Portuguese order). With no garment words, the first colour is the jersey.
const GARMENTS = [
  ['jersey', /\b(?:jerseys?|shirts?|tops?|kit|camisas?|camisetas?)\b/g],
  ['shorts', /\b(?:shorts?|cal[cç](?:[aã]o|[oõ]es)|bermudas?)\b/g],
  ['socks', /\b(?:socks?|meias?)\b/g],
];

function colourHits(low, colors) {
  const hits = [];
  for (const c of colors || []) {
    if (!c || !/^#[0-9a-f]{6}$/i.test(c.hex) || !c.name) continue;
    const re = new RegExp(`(^|[^a-zà-ú])${String(c.name).toLowerCase().replace(/ /g, '\\s+')}(?=[^a-zà-ú]|$)`, 'g');
    let m;
    while ((m = re.exec(low))) hits.push({ at: m.index + m[1].length, end: re.lastIndex, kind: 'color', color: c });
  }
  return hits;
}

export function uniformKit(u) {
  if (!u || !u.text) return null;
  const low = String(u.text).toLowerCase();
  const tokens = colourHits(low, u.colors);
  for (const [kind, re] of GARMENTS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(low))) tokens.push({ at: m.index, kind });
  }
  tokens.sort((a, b) => a.at - b.at);
  const colours = tokens.filter((t) => t.kind === 'color');
  if (!colours.length) return null;
  const kit = { jersey: null, shorts: null, socks: null };
  if (tokens.length === colours.length) {
    kit.jersey = colours[0].color;
    return kit;
  }
  const set = (g, c) => { if (c && !kit[g]) kit[g] = c; };
  if (tokens[0].kind === 'color') {
    // English order: a colour covers the garments after it, up to the next colour.
    let c = null;
    for (const t of tokens) {
      if (t.kind === 'color') c = t.color;
      else set(t.kind, c);
    }
  } else {
    // Portuguese order ("camisa vermelha, calção preto e meias"): a garment takes the next
    // colour before the next garment, else the colour of the garment before it.
    let last = null;
    tokens.forEach((t, i) => {
      if (t.kind === 'color') return;
      const next = tokens[i + 1];
      const c = next && next.kind === 'color' ? next.color : last;
      set(t.kind, c);
      if (c) last = c;
    });
  }
  if (!kit.jersey && !kit.shorts && !kit.socks) kit.jersey = colours[0].color;
  return kit;
}

// Thin dark outline over a light halo, so white and black kits read on cream and on night green.
const SHAPES = {
  jersey: 'M8 3 4 5.5 2 10l3 1.6L6.5 9.6V21h11V9.6l1.5 2L22 10l-2-4.5L16 3c-.6 1.6-2 2.6-4 2.6S8.6 4.6 8 3Z',
  shorts: 'M4 4h16l1 15h-7l-2-8-2 8H3L4 4Z',
  socks: 'M8 2h5v10.5l4.6 3.2c1.6 1.1 1.5 3.6-.3 4.4L14 21.7c-1 .5-2.2.3-3-.4L7.8 18.4c-.5-.5-.8-1.1-.8-1.8V2Z',
};
const LABEL = { jersey: 'jersey', shorts: 'shorts', socks: 'socks' };

export function kitIcon(kind, hex, size) {
  const d = SHAPES[kind];
  return `<svg class="uni-ico uni-${kind}" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">` +
    `<path d="${d}" fill="none" stroke="rgba(251,246,236,0.85)" stroke-width="3.2" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="${hex}" stroke="#1F2A2E" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
}

// HTML for the popup: icons for each known garment, or '' when no colour is known.
export function kitHtml(u, size = 36) {
  const kit = uniformKit(u);
  if (!kit) return '';
  return ['jersey', 'shorts', 'socks'].filter((k) => kit[k])
    .map((k) => `<span class="uni-g" title="${kit[k].name} ${LABEL[k]}">${kitIcon(k, kit[k].hex, k === 'jersey' ? size : Math.round(size * 0.85))}</span>`)
    .join('');
}
