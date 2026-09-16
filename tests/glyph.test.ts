import assert from 'node:assert/strict'
import test from 'node:test'
import {encodeGlyph, joinGlyphs, outlineBounds, scaleContours} from '../src/glyph.ts'

test('scaling uses OpenType rounding and retains on-curve flags and input coordinates', () => {
  const input = [[{x: -3, y: 3, onCurve: true}, {x: 5, y: -5, onCurve: false}]]
  assert.deepEqual(scaleContours(input, 0.5), [[
    {x: -1, y: 2, onCurve: true}, {x: 3, y: -2, onCurve: false},
  ]])
  assert.deepEqual(input[0]?.[0], {x: -3, y: 3, onCurve: true})
})

test('simple glyph encoding stores contour ends, flags, and signed coordinate deltas', () => {
  const contours = [[
    {x: 10, y: -20, onCurve: true},
    {x: 30, y: 40, onCurve: false},
    {x: -10, y: 5, onCurve: true},
  ]]
  assert.deepEqual(outlineBounds(contours), {xMin: -10, yMin: -20, xMax: 30, yMax: 40})
  const data = encodeGlyph(contours, true)
  assert.equal(data.readInt16BE(0), 1)
  assert.equal(data.readUInt16BE(10), 2)
  assert.equal(data.readUInt16BE(12), 0)
  assert.deepEqual([...data.subarray(14, 17)], [0x41, 0, 1])
  assert.deepEqual([17, 19, 21].map(offset => data.readInt16BE(offset)), [10, 20, -40])
  assert.deepEqual([23, 25, 27].map(offset => data.readInt16BE(offset)), [-20, 60, -35])
})

test('joining glyphs keeps empty glyph IDs and records aligned long offsets', () => {
  const {glyf, loca} = joinGlyphs([Buffer.from([1, 2, 3]), Buffer.alloc(0), Buffer.from([4])])
  assert.deepEqual([0, 4, 8, 12].map(offset => loca.readUInt32BE(offset)), [0, 4, 4, 8])
  assert.deepEqual([...glyf], [1, 2, 3, 0, 4, 0, 0, 0])
})
