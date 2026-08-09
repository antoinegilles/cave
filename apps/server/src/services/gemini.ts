import { config } from '../config.js'

/**
 * Client Gemini minimal (REST, sans SDK).
 *
 * Deux usages seulement : lecture d'étiquette (vision) et sommelier. Les deux passent par
 * une sortie structurée `responseSchema` et un `maxOutputTokens` serré — c'est ce qui garde
 * la consommation dans le free tier Google AI Studio.
 */

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'GeminiError'
  }
}

export interface GeminiUsage {
  tokensIn: number | null
  tokensOut: number | null
}

interface GeminiPart {
  text?: string
  inline_data?: { mime_type: string; data: string }
}

interface GenerateOptions {
  parts: GeminiPart[]
  systemInstruction?: string
  responseSchema: Record<string, unknown>
  maxOutputTokens: number
  temperature?: number
  /** Recherche web Google. Coûteuse en latence et en tokens — désactivée par défaut. */
  enableGrounding?: boolean
  timeoutMs?: number
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
  error?: { message?: string; status?: string }
}

export function isGeminiConfigured(): boolean {
  return Boolean(config.GEMINI_API_KEY)
}

export async function generateStructured<T>(
  options: GenerateOptions,
): Promise<{ data: T; usage: GeminiUsage }> {
  if (!config.GEMINI_API_KEY) {
    throw new GeminiError('GEMINI_API_KEY n’est pas configurée sur le serveur.')
  }

  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: options.parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: options.responseSchema,
      maxOutputTokens: options.maxOutputTokens,
      temperature: options.temperature ?? 0.2,
    },
  }

  if (options.systemInstruction) {
    body['systemInstruction'] = { parts: [{ text: options.systemInstruction }] }
  }
  if (options.enableGrounding) {
    body['tools'] = [{ google_search: {} }]
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000)

  let payload: GeminiResponse
  try {
    const res = await fetch(
      `${ENDPOINT}/${encodeURIComponent(config.GEMINI_MODEL)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': config.GEMINI_API_KEY,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    )

    payload = (await res.json()) as GeminiResponse

    if (!res.ok) {
      // 429 = quota Google épuisé. À distinguer de notre quota applicatif : le message
      // affiché doit dire à l'utilisateur d'attendre demain, pas qu'il a mal saisi.
      const detail = payload.error?.message ?? `HTTP ${res.status}`
      throw new GeminiError(
        res.status === 429
          ? 'Le quota gratuit Gemini est atteint pour aujourd’hui. Réessaie demain.'
          : `Gemini a répondu en erreur : ${detail}`,
        res.status,
      )
    }
  } catch (error) {
    if (error instanceof GeminiError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new GeminiError('Gemini n’a pas répondu à temps.')
    }
    throw new GeminiError(`Appel Gemini impossible : ${(error as Error).message}`)
  } finally {
    clearTimeout(timer)
  }

  const usage: GeminiUsage = {
    tokensIn: payload.usageMetadata?.promptTokenCount ?? null,
    tokensOut: payload.usageMetadata?.candidatesTokenCount ?? null,
  }

  const candidate = payload.candidates?.[0]
  const text = candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''

  if (!text.trim()) {
    // MAX_TOKENS ici veut dire que notre plafond est trop bas pour le schéma demandé.
    const reason = candidate?.finishReason
    throw new GeminiError(
      reason === 'MAX_TOKENS'
        ? 'Réponse Gemini tronquée avant d’être exploitable.'
        : 'Gemini n’a renvoyé aucun contenu.',
    )
  }

  try {
    return { data: JSON.parse(text) as T, usage }
  } catch {
    throw new GeminiError('Gemini a renvoyé un JSON invalide.')
  }
}
