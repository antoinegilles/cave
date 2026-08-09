/**
 * Redimensionnement de la photo d'étiquette avant envoi.
 *
 * Une photo de téléphone fait 3 à 8 Mo ; à 1024 px de côté, l'étiquette reste parfaitement
 * lisible par le modèle vision pour environ 150 Ko. C'est ce qui garde la consommation de
 * tokens basse et l'envoi rapide en 4G depuis une cave.
 */

const MAX_DIMENSION = 1024
const JPEG_QUALITY = 0.85

export interface PreparedImage {
  base64: string
  mimeType: string
  previewUrl: string
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file)

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Impossible de préparer l’image.')

  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  const base64 = dataUrl.split(',')[1]
  if (!base64) throw new Error('Impossible d’encoder l’image.')

  return { base64, mimeType: 'image/jpeg', previewUrl: dataUrl }
}
