export type FontTables = ReadonlyMap<string, Buffer>

export function readTables(font: Buffer): FontTables {
  if (font.length < 12 || font.readUInt32BE(0) !== 0x00010000) {
    throw new Error('Expected a TrueType sfnt font')
  }
  const count = font.readUInt16BE(4)
  const directoryEnd = 12 + count * 16
  if (directoryEnd > font.length) throw new Error('Truncated sfnt directory')
  const tables = new Map<string, Buffer>()
  for (let index = 0; index < count; index += 1) {
    const record = 12 + index * 16
    const tag = font.toString('ascii', record, record + 4)
    const offset = font.readUInt32BE(record + 8)
    const length = font.readUInt32BE(record + 12)
    if (offset < directoryEnd || offset + length > font.length || tables.has(tag)) {
      throw new Error(`Invalid sfnt table: ${tag}`)
    }
    tables.set(tag, Buffer.from(font.subarray(offset, offset + length)))
  }
  return tables
}

export function table(tables: FontTables, tag: string): Buffer {
  const data = tables.get(tag)
  if (data === undefined) throw new Error(`Missing sfnt table: ${tag}`)
  return data
}

export function checksum(data: Buffer): number {
  let sum = 0
  for (let offset = 0; offset < data.length; offset += 4) {
    let word = 0
    for (let byte = 0; byte < 4; byte += 1) word = (word << 8) | (data[offset + byte] ?? 0)
    sum = (sum + (word >>> 0)) >>> 0
  }
  return sum
}

export function writeTables(tables: FontTables): Buffer {
  const entries = [...tables].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
  const count = entries.length
  const selector = Math.floor(Math.log2(count))
  const size = 12 + count * 16 + entries.reduce((total, [, data]) => total + ((data.length + 3) & ~3), 0)
  const output = Buffer.alloc(size)
  output.writeUInt32BE(0x00010000, 0)
  output.writeUInt16BE(count, 4)
  output.writeUInt16BE(16 * 2 ** selector, 6)
  output.writeUInt16BE(selector, 8)
  output.writeUInt16BE(count * 16 - 16 * 2 ** selector, 10)
  let offset = 12 + count * 16
  let headOffset = 0
  for (const [index, [tag, original]] of entries.entries()) {
    const data = Buffer.from(original)
    if (tag === 'head') {
      data.writeUInt32BE(0, 8)
      headOffset = offset
    }
    const record = 12 + index * 16
    output.write(tag, record, 4, 'ascii')
    output.writeUInt32BE(checksum(data), record + 4)
    output.writeUInt32BE(offset, record + 8)
    output.writeUInt32BE(data.length, record + 12)
    data.copy(output, offset)
    offset += (data.length + 3) & ~3
  }
  if (headOffset === 0) throw new Error('Cannot serialize a font without head')
  output.writeUInt32BE((0xb1b0afba - checksum(output)) >>> 0, headOffset + 8)
  return output
}

export function glyphData(tables: FontTables): readonly Buffer[] {
  const count = table(tables, 'maxp').readUInt16BE(4)
  const longOffsets = table(tables, 'head').readInt16BE(50) === 1
  const loca = table(tables, 'loca')
  const glyf = table(tables, 'glyf')
  const offsets = Array.from({length: count + 1}, (_, index) =>
    longOffsets ? loca.readUInt32BE(index * 4) : loca.readUInt16BE(index * 2) * 2,
  )
  return offsets.slice(0, -1).map((start, index) => {
    const end = offsets[index + 1]!
    if (end < start || end > glyf.length) throw new Error(`Invalid loca entry: ${index}`)
    return glyf.subarray(start, end)
  })
}
