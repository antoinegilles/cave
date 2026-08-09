/**
 * Référentiel canonique des accords mets-vins.
 *
 * Les providers (Vivino, X-Wines) renvoient des libellés hétérogènes, en français ou en
 * anglais : « Poisson gras (saumon, thon, etc.) », « Rich fish », « Lamb », « Agneau »…
 * On les rabat tous sur un slug canonique via `matchFoodTag`, ce qui permet ensuite une
 * recherche SQL propre par jointure plutôt qu'un LIKE sur du texte libre.
 */

export interface FoodTagDef {
  slug: string
  labelFr: string
  emoji: string
  /** Termes saisis par l'utilisateur OU renvoyés par un provider qui pointent vers ce tag. */
  synonyms: string[]
}

export const FOOD_TAGS: FoodTagDef[] = [
  {
    slug: 'beef',
    labelFr: 'Bœuf',
    emoji: '🥩',
    synonyms: [
      'beef', 'boeuf', 'steak', 'entrecote', 'cote de boeuf', 'bavette', 'faux filet',
      'rumsteck', 'tartare', 'bourguignon', 'rosbif', 'filet de boeuf', 'viande rouge',
      'onglet', 'hamburger', 'burger',
    ],
  },
  {
    slug: 'pork',
    labelFr: 'Porc',
    emoji: '🐖',
    synonyms: ['pork', 'porc', 'cochon', 'jambon', 'roti de porc', 'travers', 'echine', 'filet mignon'],
  },
  {
    slug: 'lamb',
    labelFr: 'Agneau',
    emoji: '🐑',
    synonyms: ['lamb', 'agneau', 'gigot', 'mouton', 'souris dagneau', 'cotelettes dagneau', 'navarin'],
  },
  {
    slug: 'veal',
    labelFr: 'Veau',
    emoji: '🍖',
    synonyms: ['veal', 'veau', 'blanquette', 'escalope', 'osso buco', 'ris de veau'],
  },
  {
    slug: 'poultry',
    labelFr: 'Volaille',
    emoji: '🍗',
    synonyms: [
      'poultry', 'volaille', 'poulet', 'chicken', 'dinde', 'chapon', 'pintade', 'canard',
      'duck', 'magret', 'coq au vin', 'confit',
    ],
  },
  {
    slug: 'game',
    labelFr: 'Gibier',
    emoji: '🦌',
    synonyms: ['game', 'game meat', 'gibier', 'chevreuil', 'sanglier', 'biche', 'cerf', 'lievre', 'venaison'],
  },
  {
    slug: 'cured-meat',
    labelFr: 'Charcuterie',
    emoji: '🥓',
    synonyms: ['cured meat', 'charcuterie', 'saucisson', 'terrine', 'pate', 'rillettes', 'chorizo', 'lard', 'bacon'],
  },
  {
    slug: 'lean-fish',
    labelFr: 'Poisson maigre',
    emoji: '🐟',
    synonyms: [
      'lean fish', 'poisson maigre', 'poisson blanc', 'cabillaud', 'morue', 'sole', 'bar',
      'loup', 'daurade', 'dorade', 'lieu', 'colin', 'merlan', 'turbot', 'sandre', 'brochet',
    ],
  },
  {
    slug: 'rich-fish',
    labelFr: 'Poisson gras',
    emoji: '🐟',
    synonyms: [
      'rich fish', 'poisson gras', 'saumon', 'salmon', 'thon', 'tuna', 'maquereau',
      'sardine', 'anchois', 'hareng', 'truite', 'anguille',
    ],
  },
  {
    slug: 'shellfish',
    labelFr: 'Crustacés et fruits de mer',
    emoji: '🦐',
    synonyms: [
      'shellfish', 'crustaces', 'fruits de mer', 'crevette', 'homard', 'langouste',
      'langoustine', 'huitre', 'huitres', 'moule', 'moules', 'coquille saint jacques',
      'saint jacques', 'crabe', 'tourteau', 'bulot', 'plateau de fruits de mer',
    ],
  },
  {
    slug: 'pasta',
    labelFr: 'Pâtes',
    emoji: '🍝',
    synonyms: ['pasta', 'pates', 'spaghetti', 'lasagne', 'lasagnes', 'tagliatelle', 'ravioli', 'gnocchi', 'risotto'],
  },
  {
    slug: 'vegetarian',
    labelFr: 'Végétarien',
    emoji: '🥗',
    synonyms: [
      'vegetarian', 'vegetarien', 'legumes', 'salade', 'ratatouille', 'quiche', 'tarte aux legumes',
      'vegan', 'vegetalien', 'buddha bowl',
    ],
  },
  {
    slug: 'mushrooms',
    labelFr: 'Champignons',
    emoji: '🍄',
    synonyms: ['mushrooms', 'champignons', 'cepes', 'girolles', 'truffe', 'morilles'],
  },
  {
    slug: 'spicy-food',
    labelFr: 'Cuisine épicée',
    emoji: '🌶️',
    synonyms: ['spicy food', 'spicy', 'epice', 'epicee', 'cuisine epicee', 'curry', 'chili', 'mexicain', 'tajine'],
  },
  {
    slug: 'asian-food',
    labelFr: 'Cuisine asiatique',
    emoji: '🥢',
    synonyms: [
      'asian food', 'cuisine asiatique', 'asiatique', 'sushi', 'sushis', 'chinois',
      'japonais', 'thai', 'vietnamien', 'nem', 'wok',
    ],
  },
  {
    slug: 'bbq',
    labelFr: 'Grillades et barbecue',
    emoji: '🔥',
    synonyms: ['bbq', 'barbecue', 'grillades', 'grillade', 'brochettes', 'plancha', 'merguez'],
  },
  {
    slug: 'mild-cheese',
    labelFr: 'Fromage doux et à pâte molle',
    emoji: '🧀',
    synonyms: [
      'mild cheese', 'soft cheese', 'fromage doux', 'fromage a pate molle', 'brie',
      'camembert', 'coulommiers', 'reblochon', 'mozzarella', 'burrata',
    ],
  },
  {
    slug: 'hard-cheese',
    labelFr: 'Fromage à pâte dure',
    emoji: '🧀',
    synonyms: [
      'hard cheese', 'mature and hard cheese', 'fromage a pate dure', 'comte', 'gruyere',
      'beaufort', 'parmesan', 'cantal', 'mimolette', 'tomme', 'abondance',
    ],
  },
  {
    slug: 'blue-cheese',
    labelFr: 'Fromage bleu',
    emoji: '🧀',
    synonyms: ['blue cheese', 'fromage bleu', 'roquefort', 'gorgonzola', 'fourme dambert', 'bleu dauvergne', 'stilton'],
  },
  {
    slug: 'goat-cheese',
    labelFr: 'Fromage de chèvre',
    emoji: '🧀',
    synonyms: ['goats milk cheese', 'goat cheese', 'fromage de chevre', 'chevre', 'crottin', 'sainte maure', 'brebis'],
  },
  {
    slug: 'fruity-dessert',
    labelFr: 'Desserts fruités',
    emoji: '🍮',
    synonyms: [
      'fruity desserts', 'desserts fruites', 'dessert', 'desserts', 'tarte aux pommes',
      'tarte tatin', 'sorbet', 'salade de fruits', 'creme brulee', 'patisserie',
    ],
  },
  {
    slug: 'chocolate',
    labelFr: 'Chocolat',
    emoji: '🍫',
    synonyms: ['chocolate', 'chocolat', 'fondant au chocolat', 'mousse au chocolat', 'brownie', 'moelleux'],
  },
  {
    slug: 'aperitif',
    labelFr: 'Apéritif',
    emoji: '🥂',
    synonyms: ['aperitif', 'apero', 'appetizers and snacks', 'amuse bouche', 'amuse bouches', 'tapas', 'chips', 'olives'],
  },
]

const BY_SLUG = new Map(FOOD_TAGS.map((t) => [t.slug, t]))

/** Retire accents, ponctuation et casse pour comparer des libellés hétérogènes. */
export function normalizeFoodTerm(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    // « Poisson gras (saumon, thon, etc.) » → on ne garde que la partie utile
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const SYNONYM_INDEX = new Map<string, string>()
for (const tag of FOOD_TAGS) {
  SYNONYM_INDEX.set(normalizeFoodTerm(tag.slug), tag.slug)
  SYNONYM_INDEX.set(normalizeFoodTerm(tag.labelFr), tag.slug)
  for (const syn of tag.synonyms) SYNONYM_INDEX.set(normalizeFoodTerm(syn), tag.slug)
}

export function getFoodTag(slug: string): FoodTagDef | undefined {
  return BY_SLUG.get(slug)
}

/** Singulier approximatif : « huitres » → « huitre », mais on ne touche pas à « gras ». */
function singularize(word: string): string {
  return word.length > 4 && word.endsWith('s') ? word.slice(0, -1) : word
}

function words(normalized: string): string[] {
  return normalized.split(' ').filter(Boolean).map(singularize)
}

/**
 * Vrai si `needle` apparaît dans `haystack` comme séquence de mots entiers.
 *
 * On raisonne par mots et non par sous-chaînes : « chevre » est une sous-chaîne de
 * « chevreuil », donc une recherche de fromage de chèvre proposerait un vin de gibier.
 * Le français est plein de ces pièges (« bar » dans « barbecue », « veau » dans « caveau »).
 */
function containsWordSequence(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    if (needle.every((w, j) => haystack[i + j] === w)) return true
  }
  return false
}

/**
 * Rabat un libellé libre sur un slug canonique.
 *
 * Sert surtout à normaliser ce que renvoient les providers : « Rich fish »,
 * « Poisson gras (saumon, thon, etc.) » et « Gibier (cerf, chevreuil) » doivent tous
 * tomber sur le bon slug.
 */
export function matchFoodTag(input: string): string | undefined {
  const normalized = normalizeFoodTerm(input)
  if (!normalized) return undefined

  const exact = SYNONYM_INDEX.get(normalized)
  if (exact) return exact

  // Le terme le plus long l'emporte : « fromage de chevre » doit primer sur « fromage ».
  const inputWords = words(normalized)
  let best: { slug: string; length: number } | undefined

  for (const [term, slug] of SYNONYM_INDEX) {
    if (term.length < 3) continue
    if (containsWordSequence(inputWords, words(term)) && (!best || term.length > best.length)) {
      best = { slug, length: term.length }
    }
  }
  return best?.slug
}

/**
 * Variante multi-résultats pour la recherche utilisateur : « poisson » doit allumer les
 * emplacements des vins accordés au poisson maigre ET au poisson gras.
 *
 * La correspondance joue dans les deux sens, mais toujours par mots entiers : la requête
 * peut être plus riche que le terme (« je mange du poisson ») ou plus pauvre
 * (« poisson » face à « poisson gras »).
 */
export function matchFoodTags(input: string): string[] {
  const normalized = normalizeFoodTerm(input)
  if (normalized.length < 3) return []

  const inputWords = words(normalized)
  const matches = new Set<string>()

  for (const [term, slug] of SYNONYM_INDEX) {
    if (term.length < 3) continue
    const termWords = words(term)
    if (
      containsWordSequence(inputWords, termWords) ||
      containsWordSequence(termWords, inputWords)
    ) {
      matches.add(slug)
    }
  }
  return [...matches]
}
