import { type LabelExtraction, WINE_COLORS, labelExtractionSchema } from '@cave/shared'
import { GeminiError, generateStructured } from './gemini.js'

/**
 * Lecture d'étiquette par Gemini en vision.
 *
 * Choisi plutôt qu'un OCR local (Tesseract) parce que les étiquettes de vin cumulent tout
 * ce qui met un OCR en échec : dorures, typographies manuscrites, texte courbe sur bouteille,
 * faible contraste. Un modèle vision lit tout ça et rend directement des champs structurés.
 *
 * Coût maîtrisé : image redimensionnée à 1024 px côté navigateur, sortie plafonnée.
 */

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    producer: { type: 'STRING', nullable: true },
    cuvee: { type: 'STRING', nullable: true },
    appellation: { type: 'STRING', nullable: true },
    vintage: { type: 'INTEGER', nullable: true },
    color: { type: 'STRING', enum: [...WINE_COLORS], nullable: true },
    country: { type: 'STRING', nullable: true },
  },
  required: ['producer', 'cuvee', 'appellation', 'vintage', 'color', 'country'],
} as const

const SYSTEM_INSTRUCTION = `Tu lis des étiquettes de bouteilles de vin.
Extrais uniquement ce qui est réellement visible sur l'image.
- producer : le domaine ou château (ex. « Château Margaux », « Domaine Leflaive »).
- cuvee : le nom de la cuvée s'il diffère du domaine.
- appellation : l'appellation ou la région (ex. « Margaux », « Chablis 1er Cru »).
- vintage : le millésime en 4 chiffres, ou null si la bouteille est non millésimée.
- color : déduis-la de l'étiquette et de l'appellation.
- country : le pays de production.
Mets null pour tout champ que tu ne peux pas lire avec certitude. N'invente jamais.`

export async function extractLabel(
  imageBase64: string,
  mimeType: string,
): Promise<{ extraction: LabelExtraction; tokensIn: number | null; tokensOut: number | null }> {
  const { data, usage } = await generateStructured<unknown>({
    systemInstruction: SYSTEM_INSTRUCTION,
    parts: [
      { inline_data: { mime_type: mimeType, data: imageBase64 } },
      { text: 'Lis cette étiquette.' },
    ],
    responseSchema: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
    maxOutputTokens: 256,
    temperature: 0,
  })

  // Le modèle respecte le schéma dans l'immense majorité des cas, mais on revalide :
  // un millésime aberrant ou une couleur hors énumération ne doit pas polluer la base.
  const parsed = labelExtractionSchema.safeParse(data)
  if (!parsed.success) {
    throw new GeminiError('La lecture de l’étiquette est inexploitable.')
  }

  return { extraction: parsed.data, tokensIn: usage.tokensIn, tokensOut: usage.tokensOut }
}
