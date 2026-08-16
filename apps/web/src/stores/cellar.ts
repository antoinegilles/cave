import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '../lib/api'
import type { RackView, SearchResult } from '../lib/types'

/**
 * État de la cave et de la recherche courante.
 *
 * Le point central : `highlightedSlots` est alimenté aussi bien par la recherche classique
 * que par le sommelier IA, et c'est lui seul que la vue casier consulte pour allumer les
 * emplacements. Les deux chemins partagent donc exactement le même rendu.
 */
export const useCellarStore = defineStore('cellar', () => {
  const racks = ref<RackView[]>([])
  const activeRackId = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const searchActive = ref(false)
  const searchLabel = ref('')
  const searchResult = ref<SearchResult | null>(null)
  /** Numéro monotone : une réponse lente ne peut jamais écraser une interaction récente. */
  let searchRequest = 0
  /** Clés `rackId:slotNumber` des emplacements à allumer. */
  const highlightedSlots = ref<Set<string>>(new Set())
  /**
   * Emplacement que la vue doit amener sous les yeux.
   *
   * Allumer un emplacement ne sert à rien s'il se trouve hors de l'écran : sur téléphone
   * le plan défile horizontalement, et c'est ce champ qui déclenche le défilement.
   */
  const focusedSlot = ref<{ rackId: string; number: number } | null>(null)

  const activeRack = computed(
    () => racks.value.find((r) => r.id === activeRackId.value) ?? racks.value[0] ?? null,
  )

  const totalBottles = computed(() =>
    racks.value.reduce((sum, rack) => sum + rack.slots.filter((s) => s.bottle).length, 0),
  )

  const totalSlots = computed(() => racks.value.reduce((sum, rack) => sum + rack.slots.length, 0))

  function slotKey(rackId: string, slotNumber: number): string {
    return `${rackId}:${slotNumber}`
  }

  function isHighlighted(rackId: string, slotNumber: number): boolean {
    return highlightedSlots.value.has(slotKey(rackId, slotNumber))
  }

  async function loadRacks(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const data = await api.get<{ racks: RackView[] }>('/api/racks')
      racks.value = data.racks
      if (!activeRackId.value || !data.racks.some((r) => r.id === activeRackId.value)) {
        activeRackId.value = data.racks[0]?.id ?? null
      }
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  async function search(body: Record<string, unknown>, label: string): Promise<SearchResult> {
    const request = ++searchRequest
    const result = await api.post<SearchResult>('/api/bottles/search', body)
    if (request !== searchRequest) return result
    applyHighlight(
      result.matchedSlots.map((s) => slotKey(s.rackId, s.slotNumber)),
      label,
    )
    searchResult.value = result
    return result
  }

  /**
   * Emplacements trouvés, groupés par casier et triés.
   *
   * Le groupement compte : une cave à plusieurs meubles affichait « emplacements 3, 3,
   * 12 » sans dire lequel était où, puisque le `rackId` était jeté au passage.
   */
  const matchedByRack = computed(() => {
    const groups: { rack: RackView; numbers: number[] }[] = []

    for (const rack of racks.value) {
      const numbers: number[] = []
      for (const key of highlightedSlots.value) {
        const separator = key.lastIndexOf(':')
        if (key.slice(0, separator) !== rack.id) continue
        numbers.push(Number(key.slice(separator + 1)))
      }
      if (numbers.length > 0) groups.push({ rack, numbers: numbers.sort((a, b) => a - b) })
    }

    return groups
  })

  /** Désigne l'emplacement à amener sous les yeux, en basculant sur son casier. */
  function focusSlot(rackId: string, number: number): void {
    activeRackId.value = rackId
    focusedSlot.value = { rackId, number }
  }

  /** Utilisé aussi par le sommelier IA pour allumer les emplacements recommandés. */
  function applyHighlight(keys: string[], label: string): void {
    highlightedSlots.value = new Set(keys)
    searchActive.value = true
    searchLabel.value = label

    // Une recherche qui allume un emplacement doit aussi y conduire : sans cela, sur
    // téléphone, la bonne alvéole reste hors de l'écran.
    const first = matchedByRack.value[0]
    focusedSlot.value = first ? { rackId: first.rack.id, number: first.numbers[0]! } : null
    if (first) activeRackId.value = first.rack.id
  }

  function clearSearch(): void {
    // Invalide aussi une requête déjà partie lorsque le dernier filtre vient d'être retiré.
    searchRequest += 1
    searchActive.value = false
    searchLabel.value = ''
    searchResult.value = null
    highlightedSlots.value = new Set()
    focusedSlot.value = null
  }

  return {
    racks,
    activeRackId,
    activeRack,
    loading,
    error,
    searchActive,
    searchLabel,
    searchResult,
    highlightedSlots,
    focusedSlot,
    matchedByRack,
    totalBottles,
    totalSlots,
    slotKey,
    isHighlighted,
    focusSlot,
    loadRacks,
    search,
    applyHighlight,
    clearSearch,
  }
})
