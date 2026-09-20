/** Preserve every Unicode mapping while adding new glyphs; legacy BMP and full Unicode share runs. */
export function writeCmap(mapping: ReadonlyMap<number, number>): Buffer {
  const entries = [...mapping].sort(([a], [b]) => a - b)
  const runs: {start: number; end: number; glyph: number}[] = []
  for (const [cp, glyph] of entries) {
    if (!Number.isInteger(cp) || cp < 0 || cp > 0x10ffff || cp >= 0xd800 && cp <= 0xdfff
      || !Number.isInteger(glyph) || glyph <= 0 || glyph > 0xffff) throw new Error('Invalid Unicode glyph mapping')
    const last = runs.at(-1)
    if (last !== undefined && cp === last.end + 1 && glyph === last.glyph + cp - last.start) last.end = cp
    else runs.push({start: cp, end: cp, glyph})
  }
  const full = Buffer.alloc(16 + runs.length * 12)
  full.writeUInt16BE(12, 0)
  full.writeUInt32BE(full.length, 4)
  full.writeUInt32BE(runs.length, 12)
  for (const [index, run] of runs.entries()) {
    full.writeUInt32BE(run.start, 16 + index * 12)
    full.writeUInt32BE(run.end, 20 + index * 12)
    full.writeUInt32BE(run.glyph, 24 + index * 12)
  }
  const bmpRuns: {start: number; end: number; glyphs: number[]}[] = []
  for (const [cp, glyph] of entries) {
    if (cp >= 0xffff) continue
    const last = bmpRuns.at(-1)
    if (last !== undefined && cp === last.end + 1) {
      last.end = cp
      last.glyphs.push(glyph)
    } else bmpRuns.push({start: cp, end: cp, glyphs: [glyph]})
  }
  bmpRuns.push({start: 0xffff, end: 0xffff, glyphs: [0]})
  const direct = bmpRuns.map(run => run.glyphs.every((glyph, index) => glyph === run.glyphs[0]! + index))
  const count = bmpRuns.length
  const arrayWords = bmpRuns.reduce((sum, run, index) => sum + (direct[index] ? 0 : run.glyphs.length), 0)
  const bmp = Buffer.alloc(16 + count * 8 + arrayWords * 2)
  if (bmp.length > 0xffff) throw new Error('BMP cmap exceeds format 4 capacity; regroup mappings before publishing')
  const selector = Math.floor(Math.log2(count))
  bmp.writeUInt16BE(4, 0)
  bmp.writeUInt16BE(bmp.length, 2)
  bmp.writeUInt16BE(count * 2, 6)
  bmp.writeUInt16BE(2 ** selector * 2, 8)
  bmp.writeUInt16BE(selector, 10)
  bmp.writeUInt16BE(count * 2 - 2 ** selector * 2, 12)
  let glyphArray = 16 + count * 8
  for (const [index, run] of bmpRuns.entries()) {
    bmp.writeUInt16BE(run.end, 14 + index * 2)
    bmp.writeUInt16BE(run.start, 16 + count * 2 + index * 2)
    if (direct[index]) {
      bmp.writeUInt16BE((run.glyphs[0]! - run.start) & 0xffff, 16 + count * 4 + index * 2)
    } else {
      const offsetWord = 16 + count * 6 + index * 2
      bmp.writeUInt16BE(glyphArray - offsetWord, offsetWord)
      for (const glyph of run.glyphs) {
        bmp.writeUInt16BE(glyph, glyphArray)
        glyphArray += 2
      }
    }
  }
  const header = Buffer.alloc(36)
  header.writeUInt16BE(4, 2)
  for (const [index, [platform, encoding, offset]] of [
    [0, 3, header.length], [0, 4, header.length + bmp.length],
    [3, 1, header.length], [3, 10, header.length + bmp.length],
  ].entries()) {
    header.writeUInt16BE(platform!, 4 + index * 8)
    header.writeUInt16BE(encoding!, 6 + index * 8)
    header.writeUInt32BE(offset!, 8 + index * 8)
  }
  return Buffer.concat([header, bmp, full])
}

/** Append PostScript names without changing existing glyph indices or their names. */
export function extendPost(original: Buffer, names: readonly string[]): Buffer {
  if (names.length === 0) return original
  if (original.readUInt32BE(0) !== 0x00020000) throw new Error('Adding glyphs requires a format 2 post table')
  const count = original.readUInt16BE(32)
  const indices = Array.from({length: count}, (_, index) => original.readUInt16BE(34 + index * 2))
  const nextCustom = Math.max(257, ...indices) + 1
  if (count + names.length > 0xffff || nextCustom + names.length > 0x10000) throw new Error('PostScript glyph capacity exceeded')
  const header = Buffer.alloc(34 + (count + names.length) * 2)
  original.copy(header, 0, 0, 32)
  header.writeUInt16BE(count + names.length, 32)
  for (const [index, id] of [...indices, ...names.map((_, index) => nextCustom + index)].entries()) {
    header.writeUInt16BE(id, 34 + index * 2)
  }
  const strings = names.map(name => {
    if (!/^[A-Za-z0-9_.]+$/.test(name) || name.length > 255) throw new Error('Invalid PostScript glyph name')
    return Buffer.concat([Buffer.from([name.length]), Buffer.from(name, 'ascii')])
  })
  return Buffer.concat([header, original.subarray(34 + count * 2), ...strings])
}
