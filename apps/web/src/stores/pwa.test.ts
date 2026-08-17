import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ registerSW: vi.fn() }))

vi.mock('virtual:pwa-register', () => ({ registerSW: mocks.registerSW }))

import { usePwaStore } from './pwa'

interface PwaCallbacks {
  onNeedRefresh(): void
  onRegisterError(error: unknown): void
}

function browserEnvironment() {
  const listeners = new Map<string, (event: Event) => void>()
  const displayListeners: Array<() => void> = []
  vi.stubGlobal('navigator', {
    onLine: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    platform: 'MacIntel',
    maxTouchPoints: 0,
  })
  vi.stubGlobal('window', {
    addEventListener: vi.fn((type: string, listener: (event: Event) => void) => {
      listeners.set(type, listener)
    }),
    matchMedia: vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn((_type: string, listener: () => void) => {
        displayListeners.push(listener)
      }),
      addListener: vi.fn((listener: () => void) => {
        displayListeners.push(listener)
      }),
    })),
  })
  return { listeners, displayListeners }
}

describe('store PWA', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mocks.registerSW.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('initialise une seule fois et expose une mise à jour choisie', async () => {
    browserEnvironment()
    let callbacks: PwaCallbacks | undefined
    const update = vi.fn().mockResolvedValue(undefined)
    mocks.registerSW.mockImplementation((options: PwaCallbacks) => {
      callbacks = options
      return update
    })
    const pwa = usePwaStore()

    pwa.initialize()
    pwa.initialize()
    callbacks!.onNeedRefresh()
    await pwa.applyUpdate()

    expect(mocks.registerSW).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith(true)
    expect(pwa.updating).toBe(false)
  })

  it('laisse remonter un échec du prompt afin que la coque l’annonce', async () => {
    const { listeners } = browserEnvironment()
    mocks.registerSW.mockReturnValue(vi.fn())
    const pwa = usePwaStore()
    pwa.initialize()
    const installEvent = {
      preventDefault: vi.fn(),
      prompt: vi.fn().mockRejectedValue(new Error('prompt indisponible')),
      userChoice: Promise.resolve({ outcome: 'dismissed', platform: 'web' }),
    } as unknown as Event
    listeners.get('beforeinstallprompt')?.(installEvent)

    await expect(pwa.promptInstall()).rejects.toThrow('prompt indisponible')
    expect(pwa.canInstall).toBe(true)
  })

  it('conserve la bannière de mise à jour après un échec et libère le bouton', async () => {
    browserEnvironment()
    let callbacks: PwaCallbacks | undefined
    mocks.registerSW.mockImplementation((options: PwaCallbacks) => {
      callbacks = options
      return vi.fn().mockRejectedValue(new Error('échec update'))
    })
    const pwa = usePwaStore()
    pwa.initialize()
    callbacks!.onNeedRefresh()

    await expect(pwa.applyUpdate()).rejects.toThrow('échec update')

    expect(pwa.updateAvailable).toBe(true)
    expect(pwa.updating).toBe(false)
  })

  it('n’empêche pas l’application de démarrer si le service worker échoue', () => {
    browserEnvironment()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.registerSW.mockImplementation(() => {
      throw new Error('service worker incompatible')
    })
    const pwa = usePwaStore()

    expect(() => pwa.initialize()).not.toThrow()
    expect(pwa.registrationError).toBe(true)
    consoleError.mockRestore()
  })
})
