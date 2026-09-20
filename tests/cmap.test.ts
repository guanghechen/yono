import assert from 'node:assert/strict'
import test from 'node:test'
import {writeCmap} from '../src/cmap.ts'
import {readCmap} from '../src/metrics.ts'

test('format 4 handles alternating old and added CJK glyph IDs within the BMP size limit', () => {
  const mapping = new Map(Array.from({length: 20976}, (_, i) => [0x4e00 + i, i % 2 === 0 ? 1 + i / 2 : 11000 + (i - 1) / 2]))
  const encoded = writeCmap(mapping)
  assert.deepEqual(readCmap(encoded), mapping)
  const offset = encoded.readUInt32BE(8)
  assert.equal(encoded.readUInt16BE(offset), 4)
  assert.ok(encoded.readUInt16BE(offset + 2) < 0xffff)
})

test('BMP gaps, U+FFFF, aliases, and supplementary-plane mappings round-trip', () => {
  const mapping = new Map([[32, 1], [65, 2], [66, 3], [1000, 2], [0xffff, 40], [0x20000, 41], [0x20001, 42], [0x10ffff, 43]])
  assert.deepEqual(readCmap(writeCmap(mapping)), mapping)
})

test('invalid Unicode scalar values and unencodable glyph IDs are rejected', () => {
  for (const [cp, glyph] of [[-1, 1], [0xd800, 1], [0x110000, 1], [65, 0], [65, 65536], [65, 1.5]]) {
    assert.throws(() => writeCmap(new Map([[cp!, glyph!]])), /Invalid Unicode/)
  }
})
