// Single source of truth for the family. First names only — safe to commit.
export const BRAND = 'Coelho de Oliveira';
export const TIMEZONE = 'America/Chicago';

export const FAMILY = [
  { id: 'thiago', name: 'Thiago', initial: 'T', color: '#1F3A3A', rgb: '31, 58, 58', ink: '#F4EFE4', kid: false },
  { id: 'gilmara', name: 'Gilmara', initial: 'G', color: '#7A8A3C', rgb: '122, 138, 60', ink: '#1F3A3A', kid: false },
  { id: 'jp', name: 'JP', initial: 'JP', color: '#2F6A62', rgb: '47, 106, 98', ink: '#F4EFE4', kid: true },
  { id: 'lucas', name: 'Lucas', initial: 'L', color: '#C4A46A', rgb: '196, 164, 106', ink: '#1F3A3A', kid: true },
];

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
