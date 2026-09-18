import {chineseGlyphs} from './chinese.ts'
import {design} from './design.ts'

export interface INameRecord {
  readonly platform: number
  readonly encoding: number
  readonly language: number
  readonly id: number
  readonly data: Buffer
}

export function readNames(data: Buffer): readonly INameRecord[] {
  if (data.readUInt16BE(0) !== 0) throw new Error('Only name table format 0 is supported')
  const count = data.readUInt16BE(2)
  const storage = data.readUInt16BE(4)
  return Array.from({length: count}, (_, index) => {
    const offset = 6 + index * 12
    const length = data.readUInt16BE(offset + 8)
    const start = storage + data.readUInt16BE(offset + 10)
    if (start + length > data.length) throw new Error('Truncated name record')
    return {
      platform: data.readUInt16BE(offset),
      encoding: data.readUInt16BE(offset + 2),
      language: data.readUInt16BE(offset + 4),
      id: data.readUInt16BE(offset + 6),
      data: Buffer.from(data.subarray(start, start + length)),
    }
  })
}

export function renameFont(original: Buffer, license: string): Buffer {
  const identity = new Map([
    [1, design.family], [2, 'Regular'], [3, `YonoHand-${design.version}-Regular`],
    [4, `${design.family} Regular`], [5, `Version ${design.version}`], [6, design.postScriptName],
    [16, design.family], [17, 'Regular'],
  ])
  const replaced = new Set([...identity.keys(), 10, 11, 13, 14])
  const records = readNames(original).filter(record => !replaced.has(record.id))
  for (const [id, text] of identity) {
    records.push({id, platform: 1, encoding: 0, language: 0, data: Buffer.from(text, 'ascii')})
    records.push({id, platform: 3, encoding: 1, language: 0x409, data: Buffer.from(text, 'utf16le').swap16()})
  }
  for (const [id, text] of [
    [10, `Derived from JasonHandwriting8 by Jason (Yu Ching Sung). Redrawn Chinese glyphs: ${[...chineseGlyphs.keys()].join(' ')}. Other Chinese outlines are retained. ASCII is scaled by ${design.asciiScale.toFixed(2)}; word spaces use ${design.spaceAdvance} units. Prototype: full Maple coverage is not implemented.`],
    [13, license],
    [14, 'https://openfontlicense.org'],
  ] as const) {
    records.push({id, platform: 3, encoding: 1, language: 0x409, data: Buffer.from(text, 'utf16le').swap16()})
  }
  records.sort((a, b) => a.platform - b.platform || a.encoding - b.encoding || a.language - b.language || a.id - b.id)
  const storage = 6 + records.length * 12
  const output = Buffer.alloc(storage + records.reduce((sum, record) => sum + record.data.length, 0))
  output.writeUInt16BE(records.length, 2)
  output.writeUInt16BE(storage, 4)
  let cursor = storage
  for (const [index, record] of records.entries()) {
    const offset = 6 + index * 12
    output.writeUInt16BE(record.platform, offset)
    output.writeUInt16BE(record.encoding, offset + 2)
    output.writeUInt16BE(record.language, offset + 4)
    output.writeUInt16BE(record.id, offset + 6)
    output.writeUInt16BE(record.data.length, offset + 8)
    output.writeUInt16BE(cursor - storage, offset + 10)
    record.data.copy(output, cursor)
    cursor += record.data.length
  }
  return output
}
