import type { EventName } from '@cave/shared'
import { config } from '../config.js'
import { prisma } from '../lib/prisma.js'

/**
 * Traçage produit — journalise un événement de parcours dans la table `Event`.
 *
 * Deux garde-fous non négociables :
 *  1. **Jamais bloquant.** Une écriture d'analytics ne doit pas casser l'action de
 *     l'utilisateur : on avale toute erreur (même philosophie que « aucune source externe
 *     n'est bloquante »). L'appelant peut ne pas `await`, ou `await` sans crainte.
 *  2. **Admins exclus.** La navigation d'un compte ADMIN ne doit pas polluer les stats — on
 *     coupe à la source dès que le rôle est connu.
 *
 * `props` est sérialisé en JSON (SQLite n'a pas de type JSON), volontairement petit et sans
 * donnée personnelle.
 */
type EventProps = Record<string, string | number | boolean>

export async function logEvent(
  name: EventName,
  opts: {
    userId?: string | null
    userRole?: string | null
    anonId?: string | null
    props?: EventProps
    path?: string | null
  } = {},
): Promise<void> {
  if (!config.ANALYTICS_ENABLED) return
  if (opts.userRole === 'ADMIN') return

  try {
    await prisma.event.create({
      data: {
        name,
        userId: opts.userId ?? null,
        anonId: opts.anonId ?? null,
        props: JSON.stringify(opts.props ?? {}),
        path: opts.path ?? null,
      },
    })
  } catch {
    // Silencieux par conception : un échec de traçage ne remonte jamais dans le chemin
    // critique d'une requête utilisateur.
  }
}
