import { gunzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseSearchPage, parseWinePage } from './vivino.js'

/**
 * Ces tests tournent sur des captures réelles de vivino.com.
 *
 * C'est leur seul intérêt : le jour où Vivino change son markup ou déplace
 * `__PRELOADED_STATE__`, ces tests cassent en CI et on le sait avant que l'ajout d'une
 * bouteille ne se mette à échouer silencieusement chez l'utilisateur.
 */

function fixture(name: string): string {
  const path = fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))
  return gunzipSync(readFileSync(path)).toString('utf8')
}

describe('parseSearchPage', () => {
  const html = fixture('vivino-search-page.html.gz')

  it('extrait les vins de la page de résultats', () => {
    const results = parseSearchPage(html)

    expect(results.length).toBeGreaterThan(0)
    for (const candidate of results) {
      expect(candidate.provider).toBe('VIVINO')
      expect(candidate.ref).toMatch(/^\d+$/)
      expect(candidate.label.length).toBeGreaterThan(0)
    }
  })

  it('déduplique les vins présents plusieurs fois dans la page', () => {
    const results = parseSearchPage(html)
    expect(new Set(results.map((r) => r.ref)).size).toBe(results.length)
  })

  it('trouve le vin recherché et son millésime', () => {
    const results = parseSearchPage(html)
    const margaux = results.find((r) => r.label.includes('Margaux'))

    expect(margaux).toBeDefined()
    expect(margaux!.vintage).toBeGreaterThan(1900)
    expect(margaux!.imageUrl).toMatch(/^https:\/\//)
  })

  it('renvoie un tableau vide sur une page sans résultat', () => {
    expect(parseSearchPage('<html><body>Aucun résultat</body></html>')).toEqual([])
  })
})

describe('parseWinePage', () => {
  it('extrait la fiche complète (locale EN)', () => {
    const wine = parseWinePage(fixture('vivino-wine-page.html.gz'), '1720306')

    expect(wine).not.toBeNull()
    expect(wine!.name).toBe('Margaux du Château Margaux')
    expect(wine!.producer).toBe('Château Margaux')
    expect(wine!.region).toBe('Margaux')
    expect(wine!.country).toBe('France')
    expect(wine!.color).toBe('RED')
    expect(wine!.source).toBe('VIVINO')
    expect(wine!.vivinoId).toBe('1720306')
  })

  it('récupère la note Vivino et son volume', () => {
    const wine = parseWinePage(fixture('vivino-wine-page.html.gz'), '1720306')

    expect(wine!.vivinoRating).toBeCloseTo(4.4, 1)
    expect(wine!.vivinoRatingCount).toBeGreaterThan(1000)
  })

  it('récupère les cépages', () => {
    const wine = parseWinePage(fixture('vivino-wine-page.html.gz'), '1720306')
    expect(wine!.grapes).toContain('Cabernet Sauvignon')
    expect(wine!.grapes).toContain('Merlot')
  })

  it('rabat les accords anglais sur les slugs canoniques', () => {
    const wine = parseWinePage(fixture('vivino-wine-page.html.gz'), '1720306')
    // Page EN : « Beef », « Lamb », « Poultry », « Game (deer, venison) »
    expect(wine!.foodTags).toContain('beef')
    expect(wine!.foodTags).toContain('lamb')
    expect(wine!.foodTags).toContain('poultry')
    expect(wine!.foodTags).toContain('game')
  })

  it('rabat les accords français sur les MÊMES slugs canoniques', () => {
    const wine = parseWinePage(fixture('vivino-wine-page-fr.html.gz'), '1720306')
    // Page FR : « Bœuf », « Agneau », « Volaille », « Gibier (cerf, chevreuil) »
    expect(wine!.foodTags).toContain('beef')
    expect(wine!.foodTags).toContain('lamb')
    expect(wine!.foodTags).toContain('poultry')
    expect(wine!.foodTags).toContain('game')
  })

  it('renseigne au moins deux axes du profil gustatif', () => {
    const wine = parseWinePage(fixture('vivino-wine-page.html.gz'), '1720306')
    const filled = Object.values(wine!.structure).filter((v) => v !== null)
    expect(filled.length).toBeGreaterThanOrEqual(2)
  })

  it('renvoie null sur une page qui n’est pas une fiche vin', () => {
    expect(parseWinePage('<html><body>404</body></html>', '1')).toBeNull()
  })

  it('ne se laisse pas piéger par du JS après le state préchargé', () => {
    // Reproduit la vraie structure : le JSON est suivi d'autre code dans le même <script>.
    const html = `<script>
      window.__PRELOADED_STATE__.winePageInformation = {"wine":{"id":42,"name":"Test \\"guillemets\\" }","type_id":2}};
      window.somethingElse = { nested: { deep: true } };
    </script>`
    const wine = parseWinePage(html, '42')

    expect(wine).not.toBeNull()
    expect(wine!.name).toBe('Test "guillemets" }')
    expect(wine!.color).toBe('WHITE')
  })
})
