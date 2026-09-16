import {createHash} from 'node:crypto'
import {design} from './design.ts'
import {readFont} from './font.ts'
import {encodeGlyph, joinGlyphs, outlineBounds, scaleContours} from './glyph.ts'
import {readCmap} from './metrics.ts'
import {renameFont} from './names.ts'
import {glyphData, readTables, table, writeTables} from './sfnt.ts'

export interface IDerivedFont {
  readonly ttf: Buffer
  readonly transformedGlyphs: readonly string[]
  readonly codepoints: readonly number[]
  readonly verticalMetrics: {
    readonly ascent: number
    readonly descent: number
    readonly lineGap: number
  }
}

export function deriveFont(source: Buffer, license: string): IDerivedFont {
  if (createHash('sha256').update(source).digest('hex') !== design.sourceSha256) {
    throw new Error('The pinned source font has changed; review it before building')
  }
  const tables = new Map(readTables(source))
  const decoded = readFont(source)
  const cmap = readCmap(table(tables, 'cmap'))
  const glyphs = [...glyphData(tables)]
  const metrics = decoded.glyf.map((glyph, index) => {
    const data = glyphs[index]!
    return {
      advance: glyph.advanceWidth,
      bearing: glyph.leftSideBearing,
      xMin: data.length === 0 ? 0 : data.readInt16BE(2),
      yMin: data.length === 0 ? 0 : data.readInt16BE(4),
      xMax: data.length === 0 ? 0 : data.readInt16BE(6),
      yMax: data.length === 0 ? 0 : data.readInt16BE(8),
    }
  })
  const selected = new Set<number>()
  for (let cp = 0x20; cp <= 0x7e; cp += 1) {
    const id = cmap.get(cp)
    if (id === undefined) throw new Error(`Source is missing ASCII U+${cp.toString(16)}`)
    selected.add(id)
  }
  for (const [cp, id] of cmap) {
    if (selected.has(id) && (cp < 0x20 || cp > 0x7e)) {
      throw new Error(`ASCII glyph ${id} is also mapped at U+${cp.toString(16)}`)
    }
  }

  const hhea = table(tables, 'hhea')
  const hmtx = table(tables, 'hmtx')
  const longMetrics = hhea.readUInt16BE(34)
  for (const id of selected) {
    const glyph = decoded.glyf[id]!
    const original = glyphs[id]!
    if (id >= longMetrics || original.length > 0 && original.readInt16BE(0) < 0) {
      throw new Error(`Source glyph ${id} does not meet the simple ASCII glyph contract`)
    }
    const contours = scaleContours(glyph.contours ?? [], design.asciiScale)
    if (contours.length > 0) {
      const instructions = 10 + contours.length * 2
      const flags = instructions + 2 + original.readUInt16BE(instructions)
      const overlap = (original[flags]! & 0x40) !== 0
      glyphs[id] = encodeGlyph(contours, overlap)
    }
    const advance = id === cmap.get(0x20) ? design.spaceAdvance : Math.floor(glyph.advanceWidth * design.asciiScale + 0.5)
    const bearing = Math.floor(glyph.leftSideBearing * design.asciiScale + 0.5)
    metrics[id] = {...outlineBounds(contours), advance, bearing}
    hmtx.writeUInt16BE(advance, id * 4)
    hmtx.writeInt16BE(bearing, id * 4 + 2)
  }
  const {glyf, loca} = joinGlyphs(glyphs)
  tables.set('glyf', glyf)
  tables.set('loca', loca)
  tables.set('name', renameFont(table(tables, 'name'), license))

  const visible = metrics.filter((_, index) => glyphs[index]!.length > 0 && glyphs[index]!.readInt16BE(0) !== 0)
  const top = Math.max(...visible.map(glyph => glyph.yMax))
  const bottom = Math.min(...visible.map(glyph => glyph.yMin))
  const head = table(tables, 'head')
  const os2 = table(tables, 'OS/2')
  const ascent = Math.max(top, hhea.readInt16BE(4), os2.readInt16BE(68))
  const descent = Math.min(bottom, hhea.readInt16BE(6), os2.readInt16BE(70))
  head.writeInt32BE(Math.floor(Number(design.version) * 65536 + 0.5), 4)
  head.writeInt16BE(Math.min(...visible.map(glyph => glyph.xMin)), 36)
  head.writeInt16BE(bottom, 38)
  head.writeInt16BE(Math.max(...visible.map(glyph => glyph.xMax)), 40)
  head.writeInt16BE(top, 42)
  head.writeUInt16BE(head.readUInt16BE(44) & ~3, 44)
  head.writeInt16BE(1, 50)
  hhea.writeInt16BE(ascent, 4)
  hhea.writeInt16BE(descent, 6)
  hhea.writeUInt16BE(Math.max(...metrics.map(glyph => glyph.advance)), 10)
  hhea.writeInt16BE(Math.min(...metrics.map(glyph => glyph.bearing)), 12)
  hhea.writeInt16BE(Math.min(...metrics.map(glyph => glyph.advance - glyph.bearing - glyph.xMax + glyph.xMin)), 14)
  hhea.writeInt16BE(Math.max(...metrics.map(glyph => glyph.bearing + glyph.xMax - glyph.xMin)), 16)
  const widths = metrics.map(glyph => glyph.advance).filter(width => width > 0)
  os2.writeInt16BE(Math.round(widths.reduce((sum, width) => sum + width, 0) / widths.length), 2)
  os2.writeUInt16BE(400, 4)
  os2.write('YONO', 58, 4, 'ascii')
  let selection = (os2.readUInt16BE(62) & ~0b100001) | 0b1000000
  if (os2.readUInt16BE(0) >= 4) selection |= 0b10000000
  os2.writeUInt16BE(selection, 62)
  os2.writeInt16BE(ascent, 68)
  os2.writeInt16BE(descent, 70)
  os2.writeUInt16BE(Math.max(os2.readUInt16BE(74), top), 74)
  os2.writeUInt16BE(Math.max(os2.readUInt16BE(76), -bottom), 76)
  os2.writeInt16BE(Math.floor(os2.readInt16BE(86) * design.asciiScale + 0.5), 86)
  os2.writeInt16BE(Math.floor(os2.readInt16BE(88) * design.asciiScale + 0.5), 88)

  return {
    ttf: writeTables(tables),
    transformedGlyphs: [...selected].map(id => decoded.glyf[id]!.name).sort(),
    codepoints: [...cmap.keys()].sort((a, b) => a - b),
    verticalMetrics: {ascent, descent, lineGap: hhea.readInt16BE(8)},
  }
}
