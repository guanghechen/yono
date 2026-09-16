export interface IPoint {
  readonly x: number
  readonly y: number
  readonly onCurve: boolean
}

export type Contour = readonly IPoint[]

export interface IBounds {
  readonly xMin: number
  readonly yMin: number
  readonly xMax: number
  readonly yMax: number
}

export function scaleContours(contours: readonly Contour[], scale: number): readonly Contour[] {
  return contours.map(contour => contour.map(point => ({
    x: Math.floor(point.x * scale + 0.5),
    y: Math.floor(point.y * scale + 0.5),
    onCurve: point.onCurve,
  })))
}

export function outlineBounds(contours: readonly Contour[]): IBounds {
  const points = contours.flat()
  if (points.length === 0) return {xMin: 0, yMin: 0, xMax: 0, yMax: 0}
  return {
    xMin: Math.min(...points.map(point => point.x)),
    yMin: Math.min(...points.map(point => point.y)),
    xMax: Math.max(...points.map(point => point.x)),
    yMax: Math.max(...points.map(point => point.y)),
  }
}

/** Simple outlines use explicit signed deltas; untouched glyphs retain their original bytes. */
export function encodeGlyph(contours: readonly Contour[], overlap: boolean): Buffer {
  const points = contours.flat()
  if (points.length === 0) return Buffer.alloc(0)
  const bounds = outlineBounds(contours)
  const header = 12 + contours.length * 2
  const output = Buffer.alloc(header + points.length * 5)
  output.writeInt16BE(contours.length, 0)
  output.writeInt16BE(bounds.xMin, 2)
  output.writeInt16BE(bounds.yMin, 4)
  output.writeInt16BE(bounds.xMax, 6)
  output.writeInt16BE(bounds.yMax, 8)
  let pointCount = 0
  for (const [index, contour] of contours.entries()) {
    pointCount += contour.length
    output.writeUInt16BE(pointCount - 1, 10 + index * 2)
  }
  let x = 0
  let y = 0
  for (const [index, point] of points.entries()) {
    output[header + index] = (point.onCurve ? 1 : 0) | (index === 0 && overlap ? 0x40 : 0)
    output.writeInt16BE(point.x - x, header + points.length + index * 2)
    output.writeInt16BE(point.y - y, header + points.length * 3 + index * 2)
    x = point.x
    y = point.y
  }
  return output
}

export function joinGlyphs(glyphs: readonly Buffer[]): {glyf: Buffer; loca: Buffer} {
  const loca = Buffer.alloc((glyphs.length + 1) * 4)
  const chunks: Buffer[] = []
  let offset = 0
  for (const [index, glyph] of glyphs.entries()) {
    loca.writeUInt32BE(offset, index * 4)
    chunks.push(glyph)
    const padding = (4 - glyph.length % 4) % 4
    if (padding !== 0) chunks.push(Buffer.alloc(padding))
    offset += glyph.length + padding
  }
  loca.writeUInt32BE(offset, glyphs.length * 4)
  return {glyf: Buffer.concat(chunks), loca}
}
