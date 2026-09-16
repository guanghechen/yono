import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import test from 'node:test'
import {readCmap, readMetrics, textAdvance} from '../src/metrics.ts'

test('both source and migration baseline expose the complete preserved character map', () => {
  const source = readMetrics(readFileSync(new URL('../sources/jason-handwriting-8/JasonHandwriting8.ttf', import.meta.url)))
  const reference = readMetrics(readFileSync(new URL('fixtures/yono-v0.100-reference.ttf', import.meta.url)))
  assert.equal(source.cmap.size, 9461)
  assert.deepEqual(reference.cmap, source.cmap)
  assert.equal(textAdvance(source, ' ', 1000), 512)
  assert.equal(textAdvance(reference, ' ', 1000), 350)
  assert.equal(textAdvance(source, '中文', 1000), 2048)
  assert.equal(textAdvance(reference, '中文', 1000), 2048)
  assert.throws(() => textAdvance(source, '→', 24), /Missing character/)
})

test('format 12 retains non-BMP codepoints and excludes the missing-glyph mapping', () => {
  const data = Buffer.alloc(52)
  data.writeUInt16BE(1, 2)
  data.writeUInt16BE(3, 4)
  data.writeUInt16BE(10, 6)
  data.writeUInt32BE(12, 8)
  data.writeUInt16BE(12, 12)
  data.writeUInt32BE(40, 16)
  data.writeUInt32BE(2, 24)
  data.writeUInt32BE(65, 28)
  data.writeUInt32BE(66, 32)
  data.writeUInt32BE(0, 36)
  data.writeUInt32BE(0x20000, 40)
  data.writeUInt32BE(0x20001, 44)
  data.writeUInt32BE(100, 48)
  assert.deepEqual([...readCmap(data)], [[66, 1], [0x20000, 100], [0x20001, 101]])
})
