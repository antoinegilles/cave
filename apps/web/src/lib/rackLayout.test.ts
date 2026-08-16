import { describe, expect, it } from 'vitest'
import {
  CELL,
  MIN_CELL_PX,
  formatSlotLabel,
  rackLayout,
  rowTopPercent,
  scrollLeftFor,
  slotY,
  visibleColumns,
} from './rackLayout.js'

/** Largeur réellement rendue d'une alvéole, dans un conteneur donné. */
function renderedCellPx(rows: number, cols: number, containerPx: number): number {
  const layout = rackLayout(rows, cols)
  const svgPx = Math.max(containerPx, layout.minWidthPx)
  return (svgPx / layout.unitsWidth) * CELL
}

describe('rackLayout', () => {
  it('conserve la géométrie du viewBox', () => {
    const layout = rackLayout(6, 10)
    expect(layout.unitsWidth).toBe(1178)
    expect(layout.unitsHeight).toBe(738)
  })

  /**
   * Le cœur du correctif : c'est cette assertion qui empêche l'alvéole de retomber aux
   * 27 px du rendu d'origine sur un téléphone.
   */
  it('garantit une alvéole d’au moins 52 px sur tous les téléphones', () => {
    for (const container of [232, 287, 313, 360]) {
      expect(renderedCellPx(6, 10, container)).toBeGreaterThanOrEqual(MIN_CELL_PX)
    }
  })

  it('tient la garantie sur un très grand casier', () => {
    expect(renderedCellPx(40, 60, 287)).toBeGreaterThanOrEqual(MIN_CELL_PX)
    expect(renderedCellPx(200, 50, 287)).toBeGreaterThanOrEqual(MIN_CELL_PX)
  })

  it('laisse le bureau s’ajuster sans défilement', () => {
    const layout = rackLayout(6, 10)
    // À 952 px (max-w-4xl), la largeur disponible dépasse le plancher : pas de barre.
    expect(layout.minWidthPx).toBeLessThan(952)
    expect(renderedCellPx(6, 10, 952)).toBeGreaterThan(70)
  })

  it('réduit la police quand les numéros sont très longs', () => {
    expect(rackLayout(2, 3, [1, 2, 60]).numberFontUnits).toBe(25)
    expect(rackLayout(2, 3, [1, 2, 9999]).numberFontUnits).toBe(25)
    expect(rackLayout(2, 3, [1, 2, 123456]).numberFontUnits).toBeLessThan(25)
  })

  it('n’active le complément que si tout le casier tient sur deux chiffres', () => {
    expect(rackLayout(2, 3, [1, 2, 3, 60]).padTo2).toBe(true)
    expect(rackLayout(2, 3, [1, 2, 3, 100, 5, 6]).padTo2).toBe(false)
  })
})

describe('slotY / rowTopPercent', () => {
  /** Invariant produit : la rangée A est celle du bas, comme devant la cave. */
  it('place la rangée 0 en bas', () => {
    const rows = 6
    expect(slotY(0, rows)).toBeGreaterThan(slotY(rows - 1, rows))
  })

  it('exprime le repère de rangée en pourcentage de la hauteur', () => {
    const first = Number.parseFloat(rowTopPercent(0, 6))
    const last = Number.parseFloat(rowTopPercent(5, 6))

    expect(first).toBeGreaterThan(last)
    expect(first).toBeLessThan(100)
    expect(last).toBeGreaterThan(0)
  })
})

describe('formatSlotLabel', () => {
  it('complète sur deux chiffres dans un casier ordinaire', () => {
    expect(formatSlotLabel(3, true)).toBe('03')
    expect(formatSlotLabel(60, true)).toBe('60')
  })

  it('rend le numéro tel quel dans un casier hétérogène', () => {
    expect(formatSlotLabel(5, false)).toBe('5')
    expect(formatSlotLabel(100, false)).toBe('100')
  })
})

describe('scrollLeftFor', () => {
  const scale = 0.52
  const viewport = 287
  const maxScroll = 613 - viewport

  it('ne défile pas avant le début', () => {
    expect(scrollLeftFor(0, scale, viewport, maxScroll)).toBe(0)
  })

  it('ne dépasse jamais la fin', () => {
    expect(scrollLeftFor(9, scale, viewport, maxScroll)).toBeLessThanOrEqual(maxScroll)
  })

  it('centre une colonne intermédiaire', () => {
    const left = scrollLeftFor(5, scale, viewport, maxScroll)
    expect(left).toBeGreaterThan(0)
    expect(left).toBeLessThan(maxScroll)
  })
})

describe('visibleColumns', () => {
  const scale = 0.52
  const viewport = 287

  it('couvre le début quand on n’a pas défilé', () => {
    const { first } = visibleColumns(0, viewport, scale, 10)
    expect(first).toBe(0)
  })

  it('ne sort jamais des bornes du casier', () => {
    const { first, last } = visibleColumns(99999, viewport, scale, 10)
    expect(first).toBeGreaterThanOrEqual(0)
    expect(last).toBeLessThanOrEqual(9)
  })

  it('restreint réellement le rendu sur un grand casier', () => {
    const { first, last } = visibleColumns(0, viewport, scale, 200)
    expect(last - first).toBeLessThan(200)
  })

  it('rend tout le casier tant que l’échelle est inconnue', () => {
    expect(visibleColumns(0, 0, 0, 10)).toEqual({ first: 0, last: 9 })
  })
})
