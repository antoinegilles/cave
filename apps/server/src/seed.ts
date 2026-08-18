import { randomBytes } from 'node:crypto'
import { FEATURE_FLAGS, FOOD_TAGS } from '@cave/shared'
import { config } from './config.js'
import { defaultCellarCreate } from './lib/defaultCellar.js'
import { hashPassword } from './lib/password.js'
import { prisma } from './lib/prisma.js'

/**
 * Données de référence, appliquées à chaque démarrage (idempotent).
 *
 * Le référentiel d'accords vit dans le code partagé et doit être synchronisé en base pour
 * pouvoir être joint en SQL. Ajouter un tag dans `FOOD_TAGS` suffit : il apparaît au
 * prochain démarrage.
 */
export async function seedReferenceData(): Promise<void> {
  for (const tag of FOOD_TAGS) {
    await prisma.foodTag.upsert({
      where: { slug: tag.slug },
      create: { slug: tag.slug, labelFr: tag.labelFr, emoji: tag.emoji },
      update: { labelFr: tag.labelFr, emoji: tag.emoji },
    })
  }

  // Le flag est créé une seule fois depuis l'env ; ensuite c'est l'admin qui le pilote,
  // et un redémarrage ne doit pas écraser son choix.
  await prisma.featureFlag.upsert({
    where: { key: FEATURE_FLAGS.AI_SOMMELIER },
    create: { key: FEATURE_FLAGS.AI_SOMMELIER, enabled: config.AI_SOMMELIER_ENABLED },
    update: {},
  })
}

/**
 * Amorçage d'une instance neuve : premier administrateur et casier de départ.
 *
 * Le mot de passe est généré aléatoirement et affiché une seule fois dans les logs —
 * jamais de compte par défaut avec un mot de passe connu.
 */
async function bootstrap(): Promise<void> {
  await seedReferenceData()

  let cellarOwner = await prisma.user.findFirst({
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
  })

  if (!cellarOwner) {
    // `||` et non `??` : dans un fichier .env, une variable déclarée mais non renseignée
    // vaut la chaîne vide, pas `undefined`. Avec `??`, `ADMIN_PASSWORD=` créerait un compte
    // administrateur au mot de passe vide.
    const email = process.env['ADMIN_EMAIL'] || 'admin@cave.local'
    const password = process.env['ADMIN_PASSWORD'] || randomBytes(12).toString('base64url')

    if (password.length < 10) {
      console.error('ADMIN_PASSWORD doit faire au moins 10 caractères. Amorçage interrompu.')
      process.exit(1)
    }

    const passwordHash = await hashPassword(password)
    cellarOwner = await prisma.$transaction((tx) =>
      tx.user.create({
        data: {
          email: email.toLowerCase(),
          name: process.env['ADMIN_NAME'] || 'Administrateur',
          role: 'ADMIN',
          passwordHash,
          racks: { create: defaultCellarCreate('Cave principale') },
        },
      }),
    )

    console.log('\n┌─────────────────────────────────────────────────┐')
    console.log('│  Compte administrateur créé                     │')
    console.log('└─────────────────────────────────────────────────┘')
    console.log(`   e-mail       : ${email}`)
    console.log(`   mot de passe : ${password}`)
    console.log('   Note-le maintenant : il ne sera plus affiché.\n')
  }

  if ((await prisma.rack.count({ where: { ownerId: cellarOwner.id } })) === 0) {
    await prisma.rack.create({
      data: {
        ownerId: cellarOwner.id,
        ...defaultCellarCreate('Cave principale'),
      },
    })
    console.log('Casier « Cave principale » créé (6 × 10 = 60 emplacements).')
  }
}

// Exécuté seulement via `npm run db:seed`, pas à l'import depuis index.ts.
if (process.argv[1]?.includes('seed')) {
  bootstrap()
    .then(() => prisma.$disconnect())
    .catch(async (error) => {
      console.error(error)
      await prisma.$disconnect()
      process.exit(1)
    })
}
