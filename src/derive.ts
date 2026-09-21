import {createHash} from 'node:crypto'
import {extendPost, writeCmap} from './cmap.ts'
import {design} from './design.ts'
import {readFont} from './font.ts'
import {encodeGlyph, joinGlyphs, outlineBounds} from './glyph.ts'
import {fontMaster, productionMasters} from './masters.ts'
import type {IGlyphWikiSource} from './glyphwiki.ts'
import {readCmap} from './metrics.ts'
import {renameFont} from './names.ts'
import {glyphData, readTables, table, writeTables} from './sfnt.ts'
import {emboldenInherited, fontVariants, slantContours} from './variants.ts'
import type {FontVariant} from './variants.ts'

export interface IDerivedFont {
  readonly ttf: Buffer
  readonly transformedGlyphs: readonly string[]
  readonly redrawnCharacters: readonly string[]
  readonly codepoints: readonly number[]
  readonly addedCharacters: readonly string[]
  readonly verticalMetrics: {
    readonly ascent: number
    readonly descent: number
    readonly lineGap: number
  }
}

export function deriveFont(source: Buffer, license: string, glyphwiki?: IGlyphWikiSource, variant: FontVariant = fontVariants[0]): IDerivedFont {
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
  const units = table(tables, 'head').readUInt16BE(18)
  const glyphNames = decoded.glyf.map(glyph => glyph.name)
  const aliases = new Map<number, number[]>()
  for (const [cp, id] of cmap) aliases.set(id, [...(aliases.get(id) ?? []), cp])
  const updatedCmap = new Map(cmap)
  const selected = new Set<number>()
  const addedNames: string[] = []
  const addedCharacters: string[] = []
  const redrawnCharacters: string[] = []
  const maxp = table(tables, 'maxp')
  for (const [character, outline] of productionMasters(glyphwiki, variant.pressure)) {
    redrawnCharacters.push(character)
    const cp = character.codePointAt(0)!
    let id = cmap.get(cp)
    if (id === undefined || aliases.get(id)!.length > 1) {
      const added = id === undefined
      id = glyphs.length
      if (id >= 0xffff) throw new Error('TrueType glyph capacity exceeded')
      const name = 'uni' + cp.toString(16).toUpperCase().padStart(4, '0') + (added ? '' : '.yono')
      glyphs.push(Buffer.alloc(0))
      metrics.push({advance: 0, bearing: 0, xMin: 0, yMin: 0, xMax: 0, yMax: 0})
      glyphNames.push(name)
      addedNames.push(name)
      updatedCmap.set(cp, id)
      if (added) addedCharacters.push(character)
    }
    const master = fontMaster(outline, units)
    const contours = slantContours(master.contours, variant.italicAngle)
    const bounds = outlineBounds(contours)
    glyphs[id] = encodeGlyph(contours, true)
    metrics[id] = {...bounds, advance: master.advance, bearing: bounds.xMin}
    selected.add(id)
    maxp.writeUInt16BE(Math.max(maxp.readUInt16BE(6), master.contours.reduce((sum, contour) => sum + contour.length, 0)), 6)
    maxp.writeUInt16BE(Math.max(maxp.readUInt16BE(8), master.contours.length), 8)
  }
  if (variant.id !== 'Regular') {
    for (const [id, glyph] of decoded.glyf.entries()) {
      if (selected.has(id) || (glyph.contours ?? []).length === 0) continue
      const contours = slantContours(variant.weight === 700
        ? emboldenInherited(glyph.contours, units * 0.01) : glyph.contours, variant.italicAngle)
      const bounds = outlineBounds(contours)
      glyphs[id] = encodeGlyph(contours, true)
      metrics[id] = {...bounds, advance: glyph.advanceWidth, bearing: bounds.xMin}
      selected.add(id)
      maxp.writeUInt16BE(Math.max(maxp.readUInt16BE(6), contours.reduce((sum, contour) => sum + contour.length, 0)), 6)
      maxp.writeUInt16BE(Math.max(maxp.readUInt16BE(8), contours.length), 8)
    }
  }
  const hhea = table(tables, 'hhea')
  const hmtx = Buffer.alloc(metrics.length * 4)
  for (const [index, metric] of metrics.entries()) {
    hmtx.writeUInt16BE(metric.advance, index * 4)
    hmtx.writeInt16BE(metric.bearing, index * 4 + 2)
  }
  hhea.writeUInt16BE(metrics.length, 34)
  maxp.writeUInt16BE(glyphs.length, 4)
  const {glyf, loca} = joinGlyphs(glyphs)
  tables.set('glyf', glyf)
  tables.set('loca', loca)
  tables.set('hmtx', hmtx)
  tables.set('cmap', writeCmap(updatedCmap))
  tables.set('post', extendPost(table(tables, 'post'), addedNames))
  tables.set('name', renameFont(table(tables, 'name'), license, redrawnCharacters.filter(character => /\p{Script=Han}/u.test(character)).length, variant))

  const visible = metrics.filter((_, index) => glyphs[index]!.length > 0 && glyphs[index]!.readInt16BE(0) !== 0)
  const top = Math.max(...visible.map(glyph => glyph.yMax))
  const bottom = Math.min(...visible.map(glyph => glyph.yMin))
  const head = table(tables, 'head')
  const os2 = table(tables, 'OS/2')
  const ascent = Math.max(top, hhea.readInt16BE(4), os2.readInt16BE(68))
  const descent = Math.min(design.minimumDescent, bottom, hhea.readInt16BE(6), os2.readInt16BE(70))
  head.writeInt32BE(Math.floor(Number(design.version) * 65536 + 0.5), 4)
  head.writeInt16BE(Math.min(...visible.map(glyph => glyph.xMin)), 36)
  head.writeInt16BE(bottom, 38)
  head.writeInt16BE(Math.max(...visible.map(glyph => glyph.xMax)), 40)
  head.writeInt16BE(top, 42)
  const bold = variant.weight === 700
  const italic = variant.italicAngle !== 0
  head.writeUInt16BE((head.readUInt16BE(44) & ~3) | (bold ? 1 : 0) | (italic ? 2 : 0), 44)
  head.writeInt16BE(1, 50)
  hhea.writeInt16BE(ascent, 4)
  hhea.writeInt16BE(descent, 6)
  hhea.writeUInt16BE(Math.max(...metrics.map(glyph => glyph.advance)), 10)
  hhea.writeInt16BE(Math.min(...metrics.map(glyph => glyph.bearing)), 12)
  hhea.writeInt16BE(Math.min(...metrics.map(glyph => glyph.advance - glyph.bearing - glyph.xMax + glyph.xMin)), 14)
  hhea.writeInt16BE(Math.max(...metrics.map(glyph => glyph.bearing + glyph.xMax - glyph.xMin)), 16)
  hhea.writeInt16BE(italic ? units : 1, 18)
  hhea.writeInt16BE(italic ? Math.round(units * Math.tan(-variant.italicAngle * Math.PI / 180)) : 0, 20)
  hhea.writeInt16BE(0, 22)
  table(tables, 'post').writeInt32BE(variant.italicAngle * 65536, 4)
  const widths = metrics.map(glyph => glyph.advance).filter(width => width > 0)
  os2.writeInt16BE(Math.round(widths.reduce((sum, width) => sum + width, 0) / widths.length), 2)
  os2.writeUInt16BE(variant.weight, 4)
  os2[34] = bold ? 8 : 5
  os2.write('YONO', 58, 4, 'ascii')
  /** Clear inherited BOLD, ITALIC, REGULAR and OBLIQUE before linking the four faces. */
  let selection = (os2.readUInt16BE(62) & ~0x261) | (bold ? 0x20 : 0) | (italic ? 1 : 0) | (!bold && !italic ? 0x40 : 0)
  if (os2.readUInt16BE(0) >= 4) selection |= 0b10000000
  os2.writeUInt16BE(selection, 62)
  os2.writeInt16BE(ascent, 68)
  os2.writeInt16BE(descent, 70)
  os2.writeUInt16BE(Math.max(os2.readUInt16BE(74), top), 74)
  os2.writeUInt16BE(Math.max(os2.readUInt16BE(76), -descent), 76)
  os2.writeInt16BE(metrics[updatedCmap.get(0x78)!]!.yMax, 86)
  os2.writeInt16BE(metrics[updatedCmap.get(0x48)!]!.yMax, 88)
  for (const [start, end, bit] of [[0x80, 0xff, 1], [0x2000, 0x206f, 31], [0x2190, 0x21ff, 37], [0x2200, 0x22ff, 38], [0x3000, 0x303f, 48]] as const) {
    if ([...updatedCmap.keys()].some(cp => cp >= start && cp <= end)) {
      const offset = 42 + Math.floor(bit / 32) * 4
      os2.writeUInt32BE((os2.readUInt32BE(offset) | 2 ** (bit % 32)) >>> 0, offset)
    }
  }

  return {
    ttf: writeTables(tables),
    transformedGlyphs: [...selected].map(id => glyphNames[id]!).sort(),
    redrawnCharacters,
    addedCharacters,
    codepoints: [...updatedCmap.keys()].sort((a, b) => a - b),
    verticalMetrics: {ascent, descent, lineGap: hhea.readInt16BE(8)},
  }
}
