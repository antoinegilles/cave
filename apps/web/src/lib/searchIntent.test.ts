import { describe, expect, it } from 'vitest'
import { decideSearchMode } from './searchIntent'

const ready = {
  submitted: true,
  statusAvailable: true,
  featureEnabled: true,
  configured: true,
  quotaRemaining: 3,
}

describe('decideSearchMode', () => {
  it('appelle l’IA pour tout texte validé d’au moins trois caractères', () => {
    for (const query of ['vin', '  vin  ', 'poisson', 'Château Margaux', 'que servir ?']) {
      expect(decideSearchMode(query, ready), query).toEqual({
        mode: 'ai',
        reason: 'eligible-text',
      })
    }
  })

  it('ne déclenche jamais l’IA pendant la frappe', () => {
    expect(decideSearchMode('poisson', { ...ready, submitted: false })).toEqual({
      mode: 'sql',
      reason: 'not-submitted',
    })
  })

  it('reste en SQL sous trois caractères après trim', () => {
    for (const query of ['', '  ', 'a', ' ab ']) {
      expect(decideSearchMode(query, ready), query).toEqual({ mode: 'sql', reason: 'too-short' })
    }
  })

  it('distingue une erreur de statut, le flag et la configuration', () => {
    expect(decideSearchMode('vin', { ...ready, statusAvailable: false }).reason).toBe(
      'status-error',
    )
    expect(decideSearchMode('vin', { ...ready, featureEnabled: false }).reason).toBe(
      'feature-disabled',
    )
    expect(decideSearchMode('vin', { ...ready, configured: false }).reason).toBe('unconfigured')
  })

  it('reste en SQL lorsque le quota applicatif est épuisé', () => {
    expect(decideSearchMode('vin', { ...ready, quotaRemaining: 0 })).toEqual({
      mode: 'sql',
      reason: 'no-quota',
    })
  })

  it('annonce le premier garde-fou bloquant avec un texte admissible', () => {
    expect(
      decideSearchMode('vin', {
        ...ready,
        featureEnabled: false,
        configured: false,
        quotaRemaining: 0,
      }).reason,
    ).toBe('feature-disabled')
  })
})
