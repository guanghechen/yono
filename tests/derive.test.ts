import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import test from 'node:test'
import type {TTF} from 'fonteditor-core'
import {design} from '../src/design.ts'
import {deriveFont} from '../src/derive.ts'
import {decodeWoff2, encodeWoff2, readFont} from '../src/font.ts'
import {readMetrics} from '../src/metrics.ts'
import {readNames} from '../src/names.ts'
import {checksum, glyphData, readTables, table} from '../src/sfnt.ts'
import {build} from '../scripts/build.ts'

const source = readFileSync(new URL('../sources/jason-handwriting-8/JasonHandwriting8.ttf', import.meta.url))
const license = readFileSync(new URL('../sources/jason-handwriting-8/OFL.txt', import.meta.url), 'utf8')
const reference = readFileSync(new URL('fixtures/yono-v0.100-reference.ttf', import.meta.url))
const original = readFont(source)
const baseline = readFont(reference)
const result = deriveFont(source, license)
const derived = readFont(result.ttf)

function assertGlyphs(actual: TTF.TTFObject, expected: TTF.TTFObject): void {
  assert.equal(actual.glyf.length, expected.glyf.length)
  for (const [index, glyph] of expected.glyf.entries()) {
    const other = actual.glyf[index]!
    assert.equal(other.name, glyph.name, `glyph name at ${index}`)
    assert.deepEqual(other.contours ?? [], glyph.contours ?? [], `outline for ${glyph.name}`)
    assert.equal(other.advanceWidth, glyph.advanceWidth, `advance for ${glyph.name}`)
    assert.equal(other.leftSideBearing, glyph.leftSideBearing, `bearing for ${glyph.name}`)
  }
}

test('migration matches the validated reference outlines and horizontal metrics for every glyph', () => {
  assert.equal(createHash('sha256').update(reference).digest('hex'), '2cd67de328072001afb9a0bce200c8205e60636189804866898cc4738c21b267')
  assertGlyphs(derived, baseline)
  assert.deepEqual(readMetrics(result.ttf).cmap, readMetrics(reference).cmap)
  assert.equal(result.codepoints.length, 9461)
  assert.equal(result.transformedGlyphs.length, 95)
  assert.deepEqual(result.verticalMetrics, {ascent: 806, descent: -278, lineGap: 90})
})

test('source bytes, untouched tables, and non-ASCII glyph bytes are preserved', () => {
  assert.equal(createHash('sha256').update(source).digest('hex'), design.sourceSha256)
  const before = readTables(source)
  const after = readTables(result.ttf)
  assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort())
  const changed = new Set(['glyf', 'loca', 'hmtx', 'head', 'hhea', 'OS/2', 'name'])
  for (const [tag, data] of before) if (!changed.has(tag)) assert.deepEqual(table(after, tag), data, tag)
  const selected = new Set(result.transformedGlyphs)
  const oldGlyphs = glyphData(before)
  const newGlyphs = glyphData(after)
  for (const [index, glyph] of original.glyf.entries()) {
    if (!selected.has(glyph.name)) assert.deepEqual(newGlyphs[index], oldGlyphs[index], glyph.name)
  }
})

test('a modified source is rejected before any derivation takes place', () => {
  const modified = Buffer.from(source)
  modified[modified.length - 1] = (modified[modified.length - 1] ?? 0) ^ 1
  assert.throws(() => deriveFont(modified, license), /pinned source font/)
})

test('font identity, complete license, sfnt checksum, and vertical bounds are valid', () => {
  assert.equal(checksum(result.ttf), 0xb1b0afba)
  const tables = readTables(result.ttf)
  const records = readNames(table(tables, 'name')).filter(record => record.platform === 3 && record.language === 0x409)
  const names = new Map(records.map(record => [record.id, Buffer.from(record.data).swap16().toString('utf16le')]))
  assert.equal(names.get(1), design.family)
  assert.equal(names.get(6), design.postScriptName)
  assert.equal(names.get(13), license)
  const hhea = table(tables, 'hhea')
  const os2 = table(tables, 'OS/2')
  for (const glyph of glyphData(tables)) {
    if (glyph.length === 0 || glyph.readInt16BE(0) === 0) continue
    assert.ok(glyph.readInt16BE(8) <= hhea.readInt16BE(4))
    assert.ok(glyph.readInt16BE(4) >= hhea.readInt16BE(6))
    assert.ok(glyph.readInt16BE(8) <= os2.readUInt16BE(74))
    assert.ok(glyph.readInt16BE(4) >= -os2.readUInt16BE(76))
  }
})

test('reference WOFF2 codec round-trip preserves every outline, metric, and character mapping', async () => {
  const woff2 = await encodeWoff2(result.ttf)
  assert.equal(woff2.toString('ascii', 0, 4), 'wOF2')
  const decoded = await decodeWoff2(woff2)
  assertGlyphs(readFont(decoded), derived)
  assert.deepEqual(readMetrics(decoded), readMetrics(result.ttf))
  for (const tag of ['cmap', 'GDEF', 'post', 'name']) {
    assert.deepEqual(table(readTables(decoded), tag), table(readTables(result.ttf), tag), tag)
  }
})

test('build is reproducible and reports the hashes of its actual deliverables', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'yono-build-test-'))
  try {
    const first = join(directory, 'first')
    const second = join(directory, 'second')
    const report = await build(first)
    await build(second)
    for (const filename of ['YonoHand-Regular.ttf', 'YonoHand-Regular.woff2', 'build-report.json', 'OFL.txt']) {
      assert.deepEqual(await readFile(join(first, filename)), await readFile(join(second, filename)), filename)
    }
    assert.equal(report.maple_target_covered, 9313)
    assert.equal(report.maple_target_missing, 23782)
    for (const [name, metadata] of Object.entries(report.files)) {
      const data = await readFile(join(first, name))
      assert.equal(data.length, metadata.bytes)
      assert.equal(createHash('sha256').update(data).digest('hex'), metadata.sha256)
    }
  } finally {
    await rm(directory, {recursive: true, force: true})
  }
})

test('FreeType renders the migrated font and reference to identical pixels', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'yono-render-test-'))
  try {
    const font = join(directory, 'derived.ttf')
    await writeFile(font, result.ttf)
    const text = '中文 AaBb 012\n你好，世界！ Hello, world!\n缓存 Cache / 调度 Scheduler'
    const args = ['-background', 'white', '-fill', '#344158', '-pointsize', '48', '-interline-spacing', '12']
    const expected = execFileSync('magick', [...args, '-font', fileURLToPath(new URL('fixtures/yono-v0.100-reference.ttf', import.meta.url)), 'label:' + text, '-depth', '8', 'rgba:-'])
    const actual = execFileSync('magick', [...args, '-font', font, 'label:' + text, '-depth', '8', 'rgba:-'])
    assert.deepEqual(actual, expected)
  } finally {
    await rm(directory, {recursive: true, force: true})
  }
})
