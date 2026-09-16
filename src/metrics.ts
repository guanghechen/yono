import {readTables, table} from './sfnt.ts'

export interface IFontMetrics {
  readonly unitsPerEm: number
  readonly cmap: ReadonlyMap<number, number>
  readonly advances: readonly number[]
}

export function readCmap(data: Buffer): ReadonlyMap<number, number> {
  const result = new Map<number, number>()
  const seen = new Set<number>()
  const count = data.readUInt16BE(2)
  for (let index = 0; index < count; index += 1) {
    const record = 4 + index * 8
    const platform = data.readUInt16BE(record)
    const encoding = data.readUInt16BE(record + 2)
    const offset = data.readUInt32BE(record + 4)
    if (!(platform === 0 || platform === 3 && (encoding === 1 || encoding === 10)) || seen.has(offset)) continue
    seen.add(offset)
    const format = data.readUInt16BE(offset)
    if (format === 12) {
      const groups = data.readUInt32BE(offset + 12)
      for (let group = 0; group < groups; group += 1) {
        const start = data.readUInt32BE(offset + 16 + group * 12)
        const end = data.readUInt32BE(offset + 20 + group * 12)
        const first = data.readUInt32BE(offset + 24 + group * 12)
        for (let cp = start; cp <= end; cp += 1) {
          const glyph = first + cp - start
          if (glyph !== 0) result.set(cp, glyph)
        }
      }
    } else if (format === 4) {
      const segments = data.readUInt16BE(offset + 6) / 2
      const ends = offset + 14
      const starts = ends + segments * 2 + 2
      const deltas = starts + segments * 2
      const ranges = deltas + segments * 2
      for (let segment = 0; segment < segments; segment += 1) {
        const end = data.readUInt16BE(ends + segment * 2)
        const start = data.readUInt16BE(starts + segment * 2)
        const delta = data.readInt16BE(deltas + segment * 2)
        const shift = data.readUInt16BE(ranges + segment * 2)
        for (let cp = start; cp <= end; cp += 1) {
          let glyph = (cp + delta) & 0xffff
          if (shift !== 0) {
            glyph = data.readUInt16BE(ranges + segment * 2 + shift + (cp - start) * 2)
            if (glyph !== 0) glyph = (glyph + delta) & 0xffff
          }
          if (glyph !== 0) result.set(cp, glyph)
        }
      }
    } else if (format !== 14) {
      throw new Error(`Unsupported Unicode cmap format: ${format}`)
    }
  }
  return result
}

export function readMetrics(font: Buffer): IFontMetrics {
  const tables = readTables(font)
  const count = table(tables, 'maxp').readUInt16BE(4)
  const longMetrics = table(tables, 'hhea').readUInt16BE(34)
  const hmtx = table(tables, 'hmtx')
  return {
    unitsPerEm: table(tables, 'head').readUInt16BE(18),
    cmap: readCmap(table(tables, 'cmap')),
    advances: Array.from({length: count}, (_, index) => hmtx.readUInt16BE(Math.min(index, longMetrics - 1) * 4)),
  }
}

export function textAdvance(font: IFontMetrics, text: string, size: number): number {
  let width = 0
  for (const character of text) {
    const cp = character.codePointAt(0)!
    const glyph = font.cmap.get(cp)
    if (glyph === undefined) throw new Error(`Missing character: ${character} (U+${cp.toString(16).toUpperCase()})`)
    const advance = font.advances[glyph]
    if (advance === undefined) throw new Error(`Invalid cmap glyph ID: ${glyph}`)
    width += advance
  }
  return width * size / font.unitsPerEm
}
