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
  /** Clés `rackId:slotNumber` des emplacements à allumer. */
  const highlightedSlots = ref<Set<string>>(new Set())

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
    const result = await api.post<SearchResult>('/api/bottles/search', body)
    applyHighlight(
      result.matchedSlots.map((s) => slotKey(s.rackId, s.slotNumber)),
      label,
    )
    searchResult.value = result
    return result
  }

  /** Utilisé aussi par le sommelier IA pour allumer les emplacements recommandés. */
  function applyHighlight(keys: string[], label: string): void {
    highlightedSlots.value = new Set(keys)
    searchActive.value = true
    searchLabel.value = label
  }

  function clearSearch(): void {
    searchActive.value = false
    searchLabel.value = ''
    searchResult.value = null
    highlightedSlots.value = new Set()
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
    totalBottles,
    totalSlots,
    slotKey,
    isHighlighted,
    loadRacks,
    search,
    applyHighlight,
    clearSearch,
  }
})
