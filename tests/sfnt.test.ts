import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import test from 'node:test'
import {checksum, glyphData, readTables, table, writeTables} from '../src/sfnt.ts'
import {readNames, renameFont} from '../src/names.ts'

const source = readFileSync(new URL('../sources/jason-handwriting-8/JasonHandwriting8.ttf', import.meta.url))

test('table serialization preserves unknown tables and leaves its input untouched', () => {
  const original = Buffer.from(source)
  const tables = new Map(readTables(source))
  tables.set('TEST', Buffer.from([1, 2, 3, 4, 5]))
  const encoded = writeTables(tables)
  const decoded = readTables(encoded)
  assert.equal(checksum(encoded), 0xb1b0afba)
  assert.deepEqual(source, original)
  for (const [tag, data] of tables) {
    if (tag === 'head') {
      const expected = Buffer.from(data)
      const actual = Buffer.from(table(decoded, tag))
      expected.writeUInt32BE(0, 8)
      actual.writeUInt32BE(0, 8)
      assert.deepEqual(actual, expected)
    } else {
      assert.deepEqual(table(decoded, tag), data)
    }
  }
  assert.deepEqual([...decoded.keys()], [...decoded.keys()].sort())
})

test('table checksums include zero padding without reading past the buffer', () => {
  assert.equal(checksum(Buffer.from([1])), 0x01000000)
  assert.equal(checksum(Buffer.from([1, 2, 3])), 0x01020300)
  assert.equal(checksum(Buffer.from([255, 255, 255, 255, 0, 0, 0, 1])), 0)
})

test('invalid table directories are rejected at the binary boundary', () => {
  assert.throws(() => readTables(Buffer.alloc(4)), /TrueType/)
  assert.throws(() => readTables(source.subarray(0, 20)), /directory/)
  const invalid = Buffer.from(source)
  invalid.writeUInt32BE(source.length + 1, 20)
  assert.throws(() => readTables(invalid), /Invalid sfnt table/)
})

test('loca preserves glyph ordering and raw outline data through sfnt serialization', () => {
  const tables = readTables(source)
  const glyphs = glyphData(tables)
  assert.equal(glyphs.length, table(tables, 'maxp').readUInt16BE(4))
  assert.deepEqual(glyphData(readTables(writeTables(tables))), glyphs)
})

test('renaming retains every copyright record and embeds the complete license', () => {
  const original = table(readTables(source), 'name')
  const license = readFileSync(new URL('../sources/jason-handwriting-8/OFL.txt', import.meta.url), 'utf8')
  const records = readNames(renameFont(original, license, 20976))
  assert.deepEqual(records.filter(record => record.id === 0), readNames(original).filter(record => record.id === 0))
  const english = records.filter(record => record.platform === 3 && record.language === 0x409)
  const text = (id: number): string => Buffer.from(english.find(record => record.id === id)!.data).swap16().toString('utf16le')
  assert.equal(text(1), 'Yono Hand')
  assert.equal(text(6), 'YonoHand-Regular')
  assert.equal(text(13), license)
  assert.equal(records.some(record => record.id === 11), false)
})
