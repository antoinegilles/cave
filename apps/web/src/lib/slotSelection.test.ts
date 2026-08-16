import { MAX_BOTTLES_PER_ADD, MAX_SLOT_NUMBER } from '@cave/shared'
import { describe, expect, it } from 'vitest'
import { parseSlotSelection } from './slotSelection'

describe('parseSlotSelection', () => {
  it('analyse une liste et développe les plages', () => {
    expect(parseSlotSelection('12, 14, 20-27')).toEqual({
      success: true,
      numbers: [12, 14, 20, 21, 22, 23, 24, 25, 26, 27],
    })
  })

  it('accepte les séparateurs usuels et les espaces autour du tiret', () => {
    expect(parseSlotSelection('8; 3\n5  10 - 11')).toEqual({
      success: true,
      numbers: [3, 5, 8, 10, 11],
    })
  })

  it('refuse une saisie vide ou mal formée', () => {
    expect(parseSlotSelection(' ').success).toBe(false)
    expect(parseSlotSelection('12, trois').success).toBe(false)
    expect(parseSlotSelection('12-14-16').success).toBe(false)
    expect(parseSlotSelection('12,').success).toBe(false)
    expect(parseSlotSelection('12, ; 14').success).toBe(false)
  })

  it('refuse une plage descendante', () => {
    const result = parseSlotSelection('20-12')

    expect(result.success).toBe(false)
    expect(result.success === false && result.error).toContain('plus petit au plus grand')
  })

  it('refuse les doublons explicites ou produits par des plages qui se chevauchent', () => {
    expect(parseSlotSelection('12, 14, 12').success).toBe(false)
    expect(parseSlotSelection('12-15, 15-18').success).toBe(false)
  })

  it('respecte les bornes communes', () => {
    expect(parseSlotSelection(`0, ${MAX_SLOT_NUMBER}`).success).toBe(true)
    expect(parseSlotSelection(String(MAX_SLOT_NUMBER + 1)).success).toBe(false)
    expect(parseSlotSelection(`1-${MAX_BOTTLES_PER_ADD + 1}`).success).toBe(false)
  })
})
