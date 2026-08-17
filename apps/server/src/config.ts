import { z } from 'zod'

/**
 * `z.coerce.boolean()` est un piège : `Boolean('false') === true`, donc `VIVINO_ENABLED=false`
 * activerait le provider. On parse explicitement les valeurs textuelles usuelles.
 */
const boolEnv = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((raw) => {
      if (raw === undefined || raw.trim() === '') return defaultValue
      return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase())
    })

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  HOST: z.string().default('0.0.0.0'),

  DATABASE_URL: z.string().default('file:../../../data/cave.db'),
  DATA_DIR: z.string().default('./data'),

  /** Obligatoire en production : le serveur refuse de démarrer avec le secret de dev. */
  JWT_SECRET: z.string().min(32).default('dev-only-secret-change-me-in-production-32+'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().default(60),

  /** Clé Google AI Studio. Absente → scan et sommelier renvoient une erreur explicite. */
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-3.1-flash-lite'),

  VIVINO_ENABLED: boolEnv(true),
  /** Délai minimum entre deux requêtes Vivino, en ms. */
  VIVINO_MIN_INTERVAL_MS: z.coerce.number().int().default(2000),

  AI_SOMMELIER_ENABLED: boolEnv(true),
  // Le sommelier répond désormais à *chaque* recherche : un quota de 3 rendait l'app muette
  // dès la quatrième question de la journée. 15 couvre un usage familial normal tout en
  // bornant un emballement (boucle, onglet qui se rafraîchit).
  AI_DAILY_QUOTA: z.coerce.number().int().min(0).default(15),
  AI_ENABLE_GROUNDING: boolEnv(false),
  /** Plafond de vins injectés dans le contexte du sommelier — borne la facture en tokens. */
  AI_MAX_CONTEXT_WINES: z.coerce.number().int().min(1).max(300).default(60),

  /**
   * Qui peut créer un compte.
   *  - `open`    : inscription publique libre (choix retenu pour cette installation) ;
   *  - `invite`  : inscription publique, mais protégée par REGISTRATION_INVITE_CODE ;
   *  - `closed`  : seul un administrateur crée les comptes.
   * Passer de `open` à `invite` referme l'inscription sans toucher au code.
   */
  REGISTRATION_MODE: z.enum(['open', 'invite', 'closed']).default('open'),
  REGISTRATION_INVITE_CODE: z.string().optional(),

  SERVE_STATIC: boolEnv(true),
  STATIC_DIR: z.string().default('./public'),
  CORS_ORIGIN: z.string().optional(),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('Configuration invalide :')
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')} — ${issue.message}`)
  }
  process.exit(1)
}

export const config = parsed.data

if (config.NODE_ENV === 'production' && config.JWT_SECRET.startsWith('dev-only-secret')) {
  console.error('JWT_SECRET doit être défini en production. Génère-le avec : openssl rand -hex 32')
  process.exit(1)
}

// Un mode `invite` sans code configuré laisserait passer tout le monde : on refuse
// de démarrer plutôt que d'ouvrir l'inscription en croyant l'avoir fermée.
if (config.REGISTRATION_MODE === 'invite' && !config.REGISTRATION_INVITE_CODE) {
  console.error('REGISTRATION_MODE=invite exige REGISTRATION_INVITE_CODE.')
  process.exit(1)
}

export const isProd = config.NODE_ENV === 'production'
