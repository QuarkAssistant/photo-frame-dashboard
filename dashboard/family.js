// Single source of truth for the family. First names only — safe to commit.
export const BRAND = 'Coelho de Oliveira';
export const TIMEZONE = 'America/Chicago';

export const FAMILY = [
  { id: 'thiago', name: 'Thiago', initial: 'T', color: '#1F3A3A', rgb: '31, 58, 58', ink: '#F4EFE4', kid: false },
  { id: 'gilmara', name: 'Gilmara', initial: 'G', color: '#7A8A3C', rgb: '122, 138, 60', ink: '#1F3A3A', kid: false },
  { id: 'jp', name: 'JP', initial: 'JP', color: '#2F6A62', rgb: '47, 106, 98', ink: '#F4EFE4', kid: true },
  { id: 'lucas', name: 'Lucas', initial: 'L', color: '#C4A46A', rgb: '196, 164, 106', ink: '#1F3A3A', kid: true },
];

// ?layout=v2 mockup: person colors sampled from each avatar's background.
// Default on; ?layout=v1 restores the original colors.
export const V2 = !(typeof location !== 'undefined' && /[?&]layout=v1\b/.test(location.search));
if (V2) {
  const C = {
    thiago: ['#AB2320', '171, 35, 32', '#FFF4EC'],
    gilmara: ['#F78872', '247, 136, 114', '#3A1410'],
    jp: ['#3D78BC', '61, 120, 188', '#F4F8FF'],
    lucas: ['#8EAD74', '142, 173, 116', '#1E2E14'],
  };
  FAMILY.forEach((p) => { const c = C[p.id]; p.color = c[0]; p.rgb = c[1]; p.ink = c[2]; p.photo = `/avatars/${p.id}.jpg`; });
}

export const EVERYONE = {
  id: 'everyone', name: 'Everyone', initial: '★', color: '#1F3A3A', rgb: '31, 58, 58', ink: '#E8DCC4',
};
export const ANYONE = {
  id: 'any', name: 'Anyone', initial: '★', color: '#1F3A3A', rgb: '31, 58, 58', ink: '#E8DCC4',
};

export function memberById(id) {
  if (id === 'any') return ANYONE;
  if (id === 'everyone' || id === 'family') return EVERYONE;
  return FAMILY.find((p) => p.id === id) || EVERYONE;
}

// "⚽️ JP — Team Training" → JP. "KJHS — No School" → everyone.
export function assignEvent(title) {
  const text = String(title || '');
  const idx = text.search(/[—–]/);
  const all = FAMILY.map((p) => p.id);
  if (idx === -1) return { everyone: true, people: all };
  let head = text.slice(0, idx).trim();
  head = head.replace(/^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|\uFE0F|\u200D|\s)+/gu, '').trim();
  const match = FAMILY.find((p) => p.name.toLowerCase() === head.toLowerCase());
  if (!match) return { everyone: true, people: all };
  return { everyone: false, people: [match.id] };
}

export function displayTitle(title) {
  const text = String(title || '').trim();
  const idx = text.search(/[—–]/);
  if (idx === -1) return text;
  return text.slice(idx + 1).trim() || text;
}
