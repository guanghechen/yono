import type {Contour} from './glyph.ts'

export const fontVariants = [
  {id: 'Regular', subfamily: 'Regular', weight: 400, pressure: 1, italicAngle: 0},
  {id: 'Bold', subfamily: 'Bold', weight: 700, pressure: 1.4, italicAngle: 0},
  {id: 'Italic', subfamily: 'Italic', weight: 400, pressure: 1, italicAngle: -10},
  {id: 'BoldItalic', subfamily: 'Bold Italic', weight: 700, pressure: 1.4, italicAngle: -10},
] as const

export type FontVariant = typeof fontVariants[number]

/** Bake the slant into font coordinates around the baseline; keep advances unchanged. */
export function slantContours(contours: readonly Contour[], angle: number): readonly Contour[] {
  if (angle === 0) return contours
  const slope = Math.tan(-angle * Math.PI / 180)
  return contours.map(contour => contour.map(point => ({
    ...point, x: Math.floor(point.x + point.y * slope + 0.5),
  })))
}

/**
 * The few inherited glyphs have no pen skeleton. Overlapping translated copies
 * thicken their existing outlines while retaining counter winding and curves.
 */
export function emboldenInherited(contours: readonly Contour[], radius: number): readonly Contour[] {
  return [
    ...contours,
    ...Array.from({length: 8}, (_, index) => {
      const angle = index * Math.PI / 4
      const dx = Math.round(radius * Math.cos(angle))
      const dy = Math.round(radius * Math.sin(angle))
      return contours.map(contour => contour.map(point => ({...point, x: point.x + dx, y: point.y + dy})))
    }).flat(),
  ]
}
