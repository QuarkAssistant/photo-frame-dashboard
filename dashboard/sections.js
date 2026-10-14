// Grocery store sections (shared by server + dashboard). Fixed walking order.
// Matching: accent/case-insensitive whole words; the LONGEST matching keyword
// wins, so "pão de alho" (Bakery) beats "alho" (Produce) and "batata congelada"
// (Frozen) beats "batata" (Produce).
export const SECTIONS = ['Produce', 'Bakery', 'Meat', 'Dairy', 'Frozen', 'Pantry', 'Drinks',
  "Alcohol / Binny's", 'Personal care', 'Party & paper', 'Household', 'Other'];

const RULES = {
  Produce: ['tomate', 'tomato', 'cebola', 'onion', 'alho', 'garlic', 'salsinha', 'salsa', 'parsley', 'cebolinha', 'scallion', 'green onion', 'coentro', 'cilantro', 'manjericao', 'basil', 'hortela', 'mint', 'alface', 'lettuce', 'rucula', 'arugula', 'espinafre', 'spinach', 'couve', 'kale', 'repolho', 'cabbage', 'brocolis', 'broccoli', 'couve flor', 'cauliflower', 'cenoura', 'carrot', 'batata', 'potato', 'batata doce', 'sweet potato', 'mandioca', 'abobrinha', 'zucchini', 'abobora', 'pumpkin', 'squash', 'pepino', 'cucumber', 'pimentao', 'bell pepper', 'pimenta', 'jalapeno', 'cogumelo', 'mushroom', 'milho', 'corn', 'limao', 'lime', 'lemon', 'laranja', 'orange', 'banana', 'maca', 'apple', 'pera', 'pear', 'uva', 'grapes', 'morango', 'strawberries', 'mirtilo', 'blueberries', 'abacaxi', 'pineapple', 'manga', 'mango', 'mamao', 'papaya', 'melancia', 'watermelon', 'melao', 'melon', 'abacate', 'avocado', 'kiwi', 'gengibre', 'ginger', 'salada', 'salad'],
  Bakery: ['pao', 'bread', 'pao de alho', 'garlic bread', 'pao frances', 'baguete', 'baguette', 'bisnaguinha', 'croissant', 'bagel', 'bagels', 'tortilla', 'tortillas', 'muffin', 'bolo', 'cake', 'rosca', 'donut', 'donuts', 'brioche', 'hamburger buns', 'hot dog buns', 'pao de hamburguer', 'pao de cachorro quente'],
  Meat: ['carne', 'beef', 'carne moida', 'ground beef', 'picanha', 'alcatra', 'fraldinha', 'costela', 'ribs', 'frango', 'chicken', 'peito de frango', 'coxa', 'asa', 'wings', 'porco', 'pork', 'linguica', 'sausage', 'bacon', 'presunto', 'ham', 'peru', 'turkey', 'salsicha', 'hot dog', 'peixe', 'fish', 'salmao', 'salmon', 'tilapia', 'camarao', 'shrimp', 'atum fresco', 'steak', 'bife', 'hamburguer', 'burgers'],
  Dairy: ['leite', 'milk', 'queijo', 'cheese', 'queijo coalho', 'mussarela', 'mozzarella', 'parmesao', 'parmesan', 'cheddar', 'requeijao', 'catupiry', 'cream cheese', 'iogurte', 'yogurt', 'manteiga', 'butter', 'margarina', 'creme de leite', 'heavy cream', 'sour cream', 'nata', 'ovos', 'ovo', 'eggs', 'leite condensado'],
  Frozen: ['congelado', 'congelada', 'congelados', 'frozen', 'batata congelada', 'batata frita', 'french fries', 'gelo', 'ice', 'sorvete', 'ice cream', 'picole', 'popsicle', 'milho doce', 'ervilha congelada', 'frozen peas', 'pizza congelada', 'frozen pizza', 'pao de queijo', 'nuggets', 'acai', 'polpa'],
  Pantry: ['toddy', 'nescau', 'arroz', 'rice', 'feijao', 'beans', 'macarrao', 'pasta', 'molho de tomate', 'tomato sauce', 'acucar', 'sugar', 'sal', 'salt', 'farinha', 'flour', 'farofa', 'oleo', 'oil', 'azeite', 'olive oil', 'vinagre', 'vinegar', 'cafe', 'coffee', 'cha', 'tea', 'cereal', 'aveia', 'oats', 'granola', 'biscoito', 'bolacha', 'cookies', 'crackers', 'chocolate', 'achocolatado', 'mel', 'honey', 'geleia', 'jam', 'pasta de amendoim', 'peanut butter', 'atum', 'tuna', 'milho em lata', 'enlatado', 'ketchup', 'mostarda', 'mustard', 'maionese', 'mayo', 'tempero', 'spices', 'fermento', 'yeast', 'goiabada', 'doce de leite', 'pipoca', 'popcorn', 'salgadinho', 'chips', 'snacks', 'castanha', 'nuts', 'amendoim', 'peanuts', 'maizena', 'fuba', 'tapioca', 'polvilho', 'palmito'],
  Drinks: ['agua', 'water', 'agua com gas', 'sparkling water', 'agua mineral', 'refrigerante', 'soda', 'coca', 'coca cola', 'guarana', 'suco', 'juice', 'suco caixinha', 'isotonico', 'gatorade', 'energetico', 'energy drink', 'kombucha', 'leite de coco', 'coconut water', 'agua de coco'],
  "Alcohol / Binny's": ['vinho', 'wine', 'espumante', 'prosecco', 'champagne', 'champanhe', 'cava', 'cerveja', 'beer', 'ipa', 'lager', 'cidra', 'cider', 'hard seltzer', 'vodka', 'whisky', 'whiskey', 'bourbon', 'rum', 'gin', 'tequila', 'mezcal', 'cachaca', 'licor', 'liqueur', 'cognac', 'conhaque', 'aperol', 'campari', 'vermouth', 'vermute', 'agua tonica', 'tonica', 'tonic', 'tonic water', 'club soda', 'bitters', 'angostura', 'ginger beer'],
  'Personal care': ['sabonete', 'soap', 'pasta de dente', 'creme dental', 'toothpaste', 'escova de dente', 'toothbrush', 'fio dental', 'floss', 'enxaguante', 'mouthwash', 'shampoo', 'condicionador', 'conditioner', 'desodorante', 'deodorant', 'protetor solar', 'sunscreen', 'hidratante', 'lotion', 'absorvente', 'lamina', 'razor', 'band aid', 'curativo', 'remedio', 'vitamina', 'vitamins', 'cotonete', 'algodao', 'fralda', 'diapers', 'lenco umedecido', 'wipes'],
  'Party & paper': ['descartavel', 'descartaveis', 'disposable', 'talheres', 'cutlery', 'prato', 'pratos', 'plates', 'copo', 'copos', 'cups', 'guardanapo', 'guardanapos', 'napkins', 'canudo', 'straws', 'vela', 'velas', 'candles', 'balao', 'baloes', 'balloons', 'papel aluminio', 'aluminum foil', 'papel filme', 'plastic wrap', 'papel manteiga', 'parchment', 'toalha de mesa', 'tablecloth'],
  Household: ['papel higienico', 'toilet paper', 'papel toalha', 'paper towels', 'lenco', 'tissues', 'detergente', 'dish soap', 'sabao em po', 'laundry detergent', 'amaciante', 'fabric softener', 'esponja', 'sponge', 'saco de lixo', 'trash bags', 'desinfetante', 'disinfectant', 'agua sanitaria', 'bleach', 'limpador', 'cleaner', 'pilha', 'pilhas', 'batteries', 'lampada', 'light bulb', 'racao', 'dog food', 'cat food', 'ziploc', 'saco ziploc'],
};

export function norm(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const INDEX = [];
for (const [sec, words] of Object.entries(RULES)) for (const w of words) INDEX.push([norm(w), sec]);
INDEX.sort((a, b) => b[0].length - a[0].length);

export function sectionFor(name) {
  const t = ` ${norm(name)} `;
  for (const [k, sec] of INDEX) if (t.includes(` ${k} `)) return sec;
  return 'Other';
}

// Section order, then alphabetical (pt-BR collation) inside a section.
export function sortBySection(items) {
  const rank = (c) => { const i = SECTIONS.indexOf(c); return i < 0 ? SECTIONS.length : i; };
  return items.slice().sort((a, b) => rank(a.cat) - rank(b.cat) || String(a.name).localeCompare(String(b.name), 'pt-BR', { sensitivity: 'base' }));
}
