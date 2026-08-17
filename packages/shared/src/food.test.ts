import { describe, expect, it } from 'vitest'
import { matchFoodTag, matchFoodTags, normalizeFoodTerm } from './food.js'

describe('normalizeFoodTerm', () => {
  it('retire accents, casse et ponctuation', () => {
    expect(normalizeFoodTerm('Bœuf')).toBe('b uf')
    expect(normalizeFoodTerm('Fromage de chèvre')).toBe('fromage de chevre')
  })

  it('écarte les précisions entre parenthèses des libellés Vivino', () => {
    expect(normalizeFoodTerm('Poisson gras (saumon, thon, etc.)')).toBe('poisson gras')
    expect(normalizeFoodTerm('Gibier (cerf, chevreuil)')).toBe('gibier')
  })
})

describe('matchFoodTag — normalisation des libellés providers', () => {
  it('rabat les libellés Vivino français', () => {
    expect(matchFoodTag('Poisson gras (saumon, thon, etc.)')).toBe('rich-fish')
    expect(matchFoodTag('Gibier (cerf, chevreuil)')).toBe('game')
    expect(matchFoodTag('Fromage doux et à pâte molle')).toBe('mild-cheese')
    expect(matchFoodTag('Crustacés')).toBe('shellfish')
  })

  it('rabat les libellés anglais sur les mêmes slugs', () => {
    expect(matchFoodTag('Rich fish')).toBe('rich-fish')
    expect(matchFoodTag('Game (deer, venison)')).toBe('game')
    expect(matchFoodTag('Mature and hard cheese')).toBe('hard-cheese')
    expect(matchFoodTag('Goats milk cheese')).toBe('goat-cheese')
  })

  it('privilégie le terme le plus spécifique', () => {
    // « fromage de chevre » doit primer sur un simple « fromage ».
    expect(matchFoodTag('fromage de chevre')).toBe('goat-cheese')
    expect(matchFoodTag('fromage bleu')).toBe('blue-cheese')
  })

  it('ne renvoie rien sur un libellé inconnu', () => {
    expect(matchFoodTag('quelque chose de totalement inconnu')).toBeUndefined()
    expect(matchFoodTag('')).toBeUndefined()
  })
})

describe('matchFoodTags — recherche utilisateur', () => {
  it('remonte les deux tags poisson pour « poisson »', () => {
    const tags = matchFoodTags('poisson')
    expect(tags).toContain('lean-fish')
    expect(tags).toContain('rich-fish')
  })

  it('comprend un plat précis', () => {
    expect(matchFoodTags('saumon')).toContain('rich-fish')
    expect(matchFoodTags('entrecote')).toContain('beef')
    expect(matchFoodTags('huitres')).toContain('shellfish')
  })

  it('comprend une phrase entière', () => {
    expect(matchFoodTags('je mange du poisson gras ce soir')).toContain('rich-fish')
    expect(matchFoodTags('un gigot pour six personnes')).toContain('lamb')
  })

  /**
   * Régression : une phrase construite autour d'un mot **générique** ne remontait rien.
   * « poisson » seul donnait deux tags, mais « du poisson » aucun — une requête de deux mots
   * ne tient plus dans un terme, et aucun synonyme ne s'appelle « du poisson ». Le cas de
   * l'exemple ci-dessous est celui que la documentation de `matchFoodTags` promettait déjà.
   */
  it('comprend une phrase construite sur un mot générique', () => {
    for (const phrase of ['du poisson', 'je mange du poisson', 'un poisson pour ce soir']) {
      expect(matchFoodTags(phrase)).toContain('rich-fish')
      expect(matchFoodTags(phrase)).toContain('lean-fish')
    }
    expect(matchFoodTags('avec du fromage')).toContain('hard-cheese')
    // « viande » n'ouvre une catégorie que depuis l'ajout de « viande blanche ».
    expect(matchFoodTags('je sers une viande')).toContain('beef')
    expect(matchFoodTags('je sers une viande')).toContain('poultry')
  })

  /**
   * Garde-fou du seuil : « fruit » n'ouvre que « fruits de mer ». Il ne doit donc pas être
   * traité comme un mot générique, sans quoi un dessert remonterait les crustacés.
   */
  it('n’érige pas « fruit » en catégorie', () => {
    expect(matchFoodTags('un dessert aux fruits')).not.toContain('shellfish')
  })

  /**
   * Le mot générique doit ouvrir au moins deux termes du référentiel, sinon un nom de
   * domaine deviendrait un accord : « sainte » n'ouvre que « sainte maure ».
   */
  it('n’allume pas un accord sur un nom de domaine', () => {
    expect(matchFoodTags('chateau sainte anne')).toEqual([])
    expect(matchFoodTags('un vin de bordeaux')).toEqual([])
  })

  it('reconnaît les plats de fromage fondu', () => {
    expect(matchFoodTags('je fais une raclette')).toContain('hard-cheese')
    expect(matchFoodTags('fondue savoyarde')).toContain('hard-cheese')
    expect(matchFoodTags('tartiflette')).toContain('mild-cheese')
  })

  it('tolère le pluriel', () => {
    expect(matchFoodTags('huitre')).toContain('shellfish')
    expect(matchFoodTags('huitres')).toContain('shellfish')
  })

  /**
   * Régression : « chevre » est une sous-chaîne de « chevreuil ». Avec une comparaison par
   * sous-chaîne, chercher un fromage de chèvre remontait aussi les vins de gibier.
   * Le français est plein de ces pièges — d'où la comparaison par mots entiers.
   */
  it('ne confond pas « chevre » et « chevreuil »', () => {
    const tags = matchFoodTags('chevre')
    expect(tags).toContain('goat-cheese')
    expect(tags).not.toContain('game')
  })

  it('ne confond pas « bar » (le poisson) et « barbecue »', () => {
    const tags = matchFoodTags('bar')
    expect(tags).toContain('lean-fish')
    expect(tags).not.toContain('bbq')
  })

  it('ne confond pas « veau » et « caveau »', () => {
    expect(matchFoodTags('caveau')).not.toContain('veal')
  })

  it('ignore les requêtes trop courtes', () => {
    expect(matchFoodTags('a')).toEqual([])
    expect(matchFoodTags('du')).toEqual([])
  })
})
