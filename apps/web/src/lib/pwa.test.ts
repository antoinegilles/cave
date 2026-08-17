import { describe, expect, it } from 'vitest'
import { detectPwaEnvironment } from './pwa'

const desktop = {
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
  platform: 'MacIntel',
  maxTouchPoints: 0,
  displayModeStandalone: false,
}

describe('détection de l’environnement PWA', () => {
  it('reconnaît iOS classique et le mode autonome', () => {
    expect(
      detectPwaEnvironment({
        ...desktop,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
        platform: 'iPhone',
        navigatorStandalone: true,
      }),
    ).toEqual({ isIos: true, isStandalone: true })
  })

  it('reconnaît un iPad qui se présente comme un Mac', () => {
    expect(detectPwaEnvironment({ ...desktop, maxTouchPoints: 5 }).isIos).toBe(true)
  })

  it('ne propose pas les instructions iOS sur un bureau ordinaire', () => {
    expect(detectPwaEnvironment(desktop)).toEqual({ isIos: false, isStandalone: false })
  })
})
