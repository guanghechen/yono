import assert from 'node:assert/strict'
import test from 'node:test'
import {createSkeletonResolver, skeletonContours, strokeCenterline} from '../src/glyphwiki.ts'
import type {IGlyphWikiSource} from '../src/glyphwiki.ts'
import {fontMaster} from '../src/masters.ts'
import {penContour} from '../src/pen.ts'

function fixture(glyphs: Readonly<Record<string, string>>): IGlyphWikiSource {
  return {source_sha256: '', target_count: 1, mainland_roots: 1, canonical_roots: 0, roots: {'一': 'root'}, glyphs}
}

test('pinned component versions are expanded with their own placement, without mutating cached children', () => {
  const resolve = createSkeletonResolver(fixture({
    root: '99:0:0:10:30:110:130:stem@2',
    stem: '1:0:0:0:0:200:0',
    'stem@2': '1:0:0:10:20:190:180',
  }))
  assert.deepEqual(resolve('root')[0]!.points, [[15, 40], [105, 120]])
  assert.deepEqual(resolve('stem@2')[0]!.points, [[10, 20], [190, 180]])
  assert.deepEqual(resolve('root')[0]!.points, [[15, 40], [105, 120]])
})

test('piecewise stretching moves the selected pivot while preserving component extrema', () => {
  const resolve = createSkeletonResolver(fixture({root: '99:250:0:0:0:200:200:curve:0:0:0', curve: '2:0:7:20:30:100:50:180:70'}))
  assert.deepEqual(resolve('root')[0]!.points, [[20, 30], [150, 50], [180, 70]])
})

test('unknown strokes, drawing transforms, missing versions, and cycles cannot silently lose ink', () => {
  for (const glyphs of [
    {root: '8:0:0:10:10:20:20'},
    {root: '0:98:0:0:0:200:200'},
    {root: '99:0:0:0:0:200:200:missing@2'},
    {root: '99:0:0:0:0:200:200:root'},
    {root: '1:0:0:10:NaN:20:20'},
  ]) assert.throws(() => createSkeletonResolver(fixture(glyphs))('root'))
  assert.throws(() => skeletonContours([]), /empty skeleton/)
})

test('quadratic and cubic skeletons retain their endpoints and distinct curvature', () => {
  const quadratic = strokeCenterline({kind: 2, head: 0, tail: 7, points: [[0, 0], [100, 0], [100, 100]]})
  assert.deepEqual(quadratic[0], [0, 0])
  assert.deepEqual(quadratic.at(-1), [100, 100])
  assert.deepEqual(quadratic[6], [75, 25])
  const cubic = strokeCenterline({kind: 6, head: 0, tail: 7, points: [[0, 0], [100, 0], [0, 100], [100, 100]]})
  assert.deepEqual(cubic[6], [50, 50])
})

test('production pen geometry fits the em and compiles into clockwise integer contours', () => {
  const contours = skeletonContours([
    {kind: 1, head: 0, tail: 4, points: [[-30, -20], [20, 210]]},
    {kind: 2, head: 7, tail: 8, points: [[30, 10], [100, 130], [250, 180]]},
  ])
  for (const point of contours.flat()) {
    assert.ok(point.x >= 3 - 1e-8 && point.x <= 97 + 1e-8)
    assert.ok(point.y >= 3 - 1e-8 && point.y <= 97 + 1e-8)
  }
  for (const contour of fontMaster({advance: 100, contours}, 1000).contours) {
    let area = 0
    for (const [i, point] of contour.entries()) {
      const next = contour[(i + 1) % contour.length]!
      assert.ok(Number.isInteger(point.x) && Number.isInteger(point.y))
      area += point.x * next.y - next.x * point.y
    }
    assert.ok(area < 0)
  }
})

test('font compilation removes redundant quadratic midpoints while retaining the same curve controls', () => {
  const contour = penContour([[10, 15, 3], [30, 60, 5], [70, 70, 2]])
  const result = fontMaster({advance: 100, contours: [contour]}, 1000)
  const controls = [...contour].reverse().filter(point => !point.onCurve)
  assert.equal(result.contours[0]!.length, controls.length)
  assert.deepEqual(result.contours[0], controls.map(point => ({x: Math.round(point.x * 10), y: Math.round((86 - point.y) * 10), onCurve: false})))
})
