import { describe, expect, it } from 'vitest'
import { countMeaningfulWords, decideSearchMode, looksConversational } from './searchIntent'

const ready = { submitted: true, aiAvailable: true, quotaRemaining: 3 }

describe('looksConversational', () => {
  it('traite un mot-clé simple comme une recherche classique', () => {
    // Le dictionnaire d'accords sait déjà répondre : dépenser un crédit serait absurde.
    for (const query of ['poisson', 'agneau', 'chablis', 'bordeaux', 'chateau margaux']) {
      expect(looksConversational(query), query).toBe(false)
    }
  })

  it('reconnaît une vraie question de sommelier', () => {
    for (const query of [
      'je fais un gigot d’agneau aux herbes',
      'que servir avec un plateau de fruits de mer ?',
      'quel vin pour accompagner un curry',
      'on mange indien ce soir',
      'conseille-moi quelque chose de léger',
    ]) {
      expect(looksConversational(query), query).toBe(true)
    }
  })

  it('bascule sur une phrase longue même sans amorce interrogative', () => {
    expect(looksConversational('gigot agneau herbes pommes grenaille')).toBe(true)
  })

  it('ne compte pas les articles comme de la complexité', () => {
    // « un peu de bœuf » : 4 mots bruts mais 2 signifiants → reste en SQL.
    expect(countMeaningfulWords('un peu de boeuf')).toBe(2)
    expect(looksConversational('un peu de boeuf')).toBe(false)
  })

  it('ignore accents et ponctuation', () => {
    expect(looksConversational('Quel vin ?')).toBe(true)
    expect(looksConversational('QUE SERVIR')).toBe(true)
  })

  it('ne confond pas « quel » avec un mot qui le contient', () => {
    expect(looksConversational('quelconque')).toBe(false)
  })

  it('traite une chaîne vide comme non conversationnelle', () => {
    expect(looksConversational('')).toBe(false)
    expect(looksConversational('   ')).toBe(false)
  })
})

describe('decideSearchMode', () => {
  it('appelle l’IA sur une question validée quand tout est disponible', () => {
    const decision = decideSearchMode('je fais un gigot pour six personnes', ready)

    expect(decision.mode).toBe('ai')
    expect(decision.reason).toBe('natural-language')
  })

  /**
   * Garde-fou central : sans validation explicite, l'IA ne part jamais.
   * Sinon taper une phrase épuiserait les 3 crédits du jour en quelques frappes.
   */
  it('ne déclenche JAMAIS l’IA pendant la frappe', () => {
    const decision = decideSearchMode('je fais un gigot pour six personnes', {
      ...ready,
      submitted: false,
    })

    expect(decision.mode).toBe('sql')
    expect(decision.reason).toBe('not-submitted')
  })

  it('reste en SQL sur un mot-clé, même validé', () => {
    const decision = decideSearchMode('poisson', ready)

    expect(decision.mode).toBe('sql')
    expect(decision.reason).toBe('too-short')
  })

  it('n’appelle pas l’IA quand le quota est épuisé', () => {
    const decision = decideSearchMode('je fais un gigot pour six personnes', {
      ...ready,
      quotaRemaining: 0,
    })

    expect(decision.mode).toBe('sql')
    expect(decision.reason).toBe('no-quota')
  })

  it('n’appelle pas l’IA quand le flag est coupé ou la clé absente', () => {
    const decision = decideSearchMode('que servir avec du poisson ?', {
      ...ready,
      aiAvailable: false,
    })

    expect(decision.mode).toBe('sql')
    expect(decision.reason).toBe('unavailable')
  })

  it('respecte le choix explicite de rester en recherche classique', () => {
    const decision = decideSearchMode('je fais un gigot pour six personnes', {
      ...ready,
      forceSql: true,
    })

    expect(decision.mode).toBe('sql')
    expect(decision.reason).toBe('forced')
  })

  it('donne la priorité au motif le plus explicite', () => {
    // Quota vide ET flag coupé : on annonce l'indisponibilité, pas le quota.
    const decision = decideSearchMode('que servir ?', {
      submitted: true,
      aiAvailable: false,
      quotaRemaining: 0,
    })

    expect(decision.reason).toBe('unavailable')
  })
})
