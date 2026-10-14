import test from 'node:test';
import assert from 'node:assert/strict';
import { sectionFor, sortBySection } from '../sections.js';

test('examples land in the right section', () => {
  const cases = {
    Tomate: 'Produce', Cebola: 'Produce', Salsinha: 'Produce', 'Pão de alho': 'Bakery', 'Queijo coalho': 'Dairy',
    'Batata congelada': 'Frozen', Gelo: 'Frozen', 'Milho doce': 'Frozen', 'Água com gás pequena': 'Drinks',
    Refrigerante: 'Drinks', 'Suco caixinha': 'Drinks', Espumante: "Alcohol / Binny's", 'Toddy grande': 'Pantry',
    Sabonete: 'Personal care', 'Pasta de dente Thiago - Oral B': 'Personal care',
    'Talheres, prato e copos descartáveis': 'Party & paper', Guardanapo: 'Party & paper', 'Água tônica': "Alcohol / Binny's",
    'Coisa estranha': 'Other',
  };
  for (const [name, sec] of Object.entries(cases)) assert.equal(sectionFor(name), sec, name);
});

test('sorted by section order then alphabetically', () => {
  const items = ['Sabonete', 'Gelo', 'Tomate', 'Cebola', 'Toddy grande'].map((name) => ({ name, cat: sectionFor(name) }));
  assert.deepEqual(sortBySection(items).map((i) => i.name), ['Cebola', 'Tomate', 'Gelo', 'Toddy grande', 'Sabonete']);
});
