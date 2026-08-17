import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { post } = vi.hoisted(() => ({ post: vi.fn() }))

vi.mock('../lib/api', () => ({ api: { post, get: vi.fn() } }))

import type { SearchResult } from '../lib/types'
import { useCellarStore } from './cellar'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function result(total: number): SearchResult {
  return { bottles: [], matchedSlots: [], total, interpretedFoodTags: [] }
}

describe('recherche de la cave', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    post.mockReset()
  })

  /**
   * Régression : l'appelant déduisait ce drapeau en comparant `searchResult` à l'objet
   * renvoyé. `searchResult` étant un `ref` profond, sa lecture rend un proxy réactif et
   * l'égalité est toujours fausse — une recherche normale passait donc pour « doublée »,
   * et le sommelier n'était jamais interrogé. Le drapeau doit être vrai ici.
   */
  it('signale qu’une recherche normale a bien pris la main', async () => {
    post.mockResolvedValueOnce(result(1))
    const cellar = useCellarStore()

    const { applied } = await cellar.search({ q: 'raclette' }, 'raclette')

    expect(applied).toBe(true)
    expect(cellar.searchActive).toBe(true)
    expect(cellar.searchResult?.total).toBe(1)
  })

  it('signale qu’une réponse doublée n’a pas pris la main', async () => {
    const first = deferred<SearchResult>()
    post.mockReturnValueOnce(first.promise).mockResolvedValueOnce(result(2))
    const cellar = useCellarStore()

    const firstSearch = cellar.search({ colors: ['RED'] }, 'Rouge')
    await cellar.search({ colors: ['WHITE'] }, 'Blanc')
    first.resolve(result(8))

    expect((await firstSearch).applied).toBe(false)
  })

  it('conserve la dernière réponse quand les requêtes arrivent dans le désordre', async () => {
    const first = deferred<SearchResult>()
    const second = deferred<SearchResult>()
    post.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const cellar = useCellarStore()

    const firstSearch = cellar.search({ colors: ['RED'] }, 'Rouge')
    const secondSearch = cellar.search({ colors: ['WHITE'] }, 'Blanc')

    second.resolve(result(2))
    await secondSearch
    first.resolve(result(8))
    await firstSearch

    expect(cellar.searchResult?.total).toBe(2)
    expect(cellar.searchLabel).toBe('Blanc')
  })

  it('n’active pas une réponse revenue après l’effacement du dernier filtre', async () => {
    const pending = deferred<SearchResult>()
    post.mockReturnValueOnce(pending.promise)
    const cellar = useCellarStore()

    const search = cellar.search({ colors: ['RED'] }, 'Rouge')
    cellar.clearSearch()
    pending.resolve(result(3))
    await search

    expect(cellar.searchActive).toBe(false)
    expect(cellar.searchResult).toBeNull()
  })
})
