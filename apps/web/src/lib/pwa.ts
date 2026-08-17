export interface PwaEnvironmentInput {
  userAgent: string
  platform: string
  maxTouchPoints: number
  displayModeStandalone: boolean
  navigatorStandalone?: boolean
}

export interface PwaEnvironment {
  isIos: boolean
  isStandalone: boolean
}

/**
 * Détecte le cas iOS, y compris iPadOS qui se présente comme macOS depuis iOS 13.
 * Les valeurs sont injectées afin que cette logique reste testable sans navigateur.
 */
export function detectPwaEnvironment(input: PwaEnvironmentInput): PwaEnvironment {
  const classicIos = /iPad|iPhone|iPod/.test(input.userAgent)
  const disguisedIpad = input.platform === 'MacIntel' && input.maxTouchPoints > 1

  return {
    isIos: classicIos || disguisedIpad,
    isStandalone: input.displayModeStandalone || input.navigatorStandalone === true,
  }
}
