import { describe, expect, it } from 'vitest'
import { resolveRecommendationSlots } from './sommelierSlots.js'

const cave = { id: 'r1', name: 'Cave principale', slots: [{ number: 12 }, { number: 13 }] }
const homonyme = { id: 'r2', name: 'Cave principale', slots: [{ number: 12 }] }

describe('resolveRecommendationSlots', () => {
  it('allume tous les exemplaires d’un vin, y compris dans des casiers homonymes', () => {
    expect(
      resolveRecommendationSlots(
        [
          {
            locations: [
              { rackId: 'r1', slotNumber: 12 },
              { rackId: 'r1', slotNumber: 13 },
              { rackId: 'r2', slotNumber: 12 },
            ],
          },
        ],
        [cave, homonyme],
      ),
    ).toEqual(['r1:12', 'r1:13', 'r2:12'])
  })

  it('ignore sans repli un rackId halluciné et un emplacement absent', () => {
    expect(
      resolveRecommendationSlots(
        [
          {
            locations: [
              { rackId: 'inconnu', slotNumber: 12 },
              { rackId: 'r1', slotNumber: 99 },
            ],
          },
        ],
        [cave],
      ),
    ).toEqual([])
  })

  it('ignore les bouteilles sans emplacement physique', () => {
    expect(
      resolveRecommendationSlots(
        [
          {
            locations: [
              { rackId: null, slotNumber: null },
              { rackId: 'r1', slotNumber: null },
            ],
          },
        ],
        [cave],
      ),
    ).toEqual([])
  })

  it('déduplique les emplacements répétés entre recommandations', () => {
    expect(
      resolveRecommendationSlots(
        [
          { locations: [{ rackId: 'r1', slotNumber: 12 }] },
          { locations: [{ rackId: 'r1', slotNumber: 12 }] },
        ],
        [cave],
      ),
    ).toEqual(['r1:12'])
  })
})
