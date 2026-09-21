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
import type {IGlyphWikiSource} from '../src/glyphwiki.ts'
import {fontMaster, productionMasters} from '../src/masters.ts'
import {readMetrics} from '../src/metrics.ts'
import {readNames} from '../src/names.ts'
import {checksum, glyphData, readTables, table} from '../src/sfnt.ts'
import {build} from '../scripts/build.ts'
import {fontVariants} from '../src/variants.ts'
import type {FontVariant} from '../src/variants.ts'

const source = readFileSync(new URL('../sources/jason-handwriting-8/JasonHandwriting8.ttf', import.meta.url))
const license = readFileSync(new URL('../sources/jason-handwriting-8/OFL.txt', import.meta.url), 'utf8')
const skeletonBytes = readFileSync(new URL('../sources/glyphwiki/subset.json', import.meta.url))
const skeletons: IGlyphWikiSource = JSON.parse(skeletonBytes.toString('utf8'))
const result = deriveFont(source, license, skeletons)
const before = readTables(source)
const after = readTables(result.ttf)
const sourceMetrics = readMetrics(source)
const metrics = readMetrics(result.ttf)
const redrawn = new Set(result.redrawnCharacters.map(character => character.codePointAt(0)!))

function assertGlyphs(actual: TTF.TTFObject, expected: TTF.TTFObject): void {
  assert.equal(actual.glyf.length, expected.glyf.length)
  for (const [index, glyph] of expected.glyf.entries()) {
    const other = actual.glyf[index]!
    assert.equal(other.name, glyph.name)
    assert.deepEqual(other.unicode, glyph.unicode)
    assert.deepEqual(other.contours ?? [], glyph.contours ?? [], `outline for ${glyph.name}`)
    assert.equal(other.leftSideBearing, glyph.leftSideBearing, `bearing for ${glyph.name}`)
    assert.equal(other.advanceWidth, glyph.advanceWidth, `advance for ${glyph.name}`)
  }
}

function assertVariant(data: Buffer, variant: FontVariant): void {
  const tables = readTables(data)
  const head = table(tables, 'head')
  const os2 = table(tables, 'OS/2')
  const hhea = table(tables, 'hhea')
  const maxp = table(tables, 'maxp')
  const bold = variant.weight === 700
  const italic = variant.italicAngle !== 0
  assert.equal(checksum(data), 0xb1b0afba)
  assert.equal(os2.readUInt16BE(4), variant.weight)
  assert.equal(os2[34], bold ? 8 : 5)
  for (const offset of [4, 6, 8]) assert.equal(hhea.readInt16BE(offset), table(after, 'hhea').readInt16BE(offset), `${variant.id}: shared hhea metrics`)
  for (const offset of [68, 70, 72, 74, 76]) assert.equal(os2.readUInt16BE(offset), table(after, 'OS/2').readUInt16BE(offset), `${variant.id}: shared OS/2 metrics`)
  assert.equal(os2.readUInt16BE(62) & 0x261, (bold ? 32 : 0) | (italic ? 1 : 0) | (!bold && !italic ? 64 : 0))
  assert.equal(head.readUInt16BE(44) & 3, (bold ? 1 : 0) | (italic ? 2 : 0))
  assert.equal(table(tables, 'post').readInt32BE(4) / 65536, variant.italicAngle)
  assert.ok(Math.abs(hhea.readInt16BE(20) / hhea.readInt16BE(18) - Math.tan(-variant.italicAngle * Math.PI / 180)) < 0.001)
  const names = new Map(readNames(table(tables, 'name')).filter(record => record.platform === 3 && record.language === 0x409)
    .map(record => [record.id, Buffer.from(record.data).swap16().toString('utf16le')]))
  assert.equal(names.get(1), design.family)
  assert.equal(names.get(2), variant.subfamily)
  assert.equal(names.get(3), `${design.postScriptFamily}-${design.version}-${variant.id}`)
  assert.equal(names.get(4), `${design.family} ${variant.subfamily}`)
  assert.equal(names.get(6), `${design.postScriptFamily}-${variant.id}`)
  assert.equal(names.get(16), design.family)
  assert.equal(names.get(17), variant.subfamily)
  assert.equal(names.get(13), license)
  assert.deepEqual(readMetrics(data), metrics, `${variant.id}: coverage and advances`)
  const regularGlyphs = glyphData(after)
  for (const [id, raw] of glyphData(tables).entries()) {
    if (raw.length === 0 || raw.readInt16BE(0) === 0) continue
    assert.ok(raw.readInt16BE(2) >= head.readInt16BE(36), `${variant.id} glyph ${id}: xMin`)
    assert.ok(raw.readInt16BE(6) <= head.readInt16BE(40), `${variant.id} glyph ${id}: xMax`)
    assert.ok(raw.readInt16BE(8) <= hhea.readInt16BE(4), `${variant.id} glyph ${id}: ascent`)
    assert.ok(raw.readInt16BE(4) >= hhea.readInt16BE(6), `${variant.id} glyph ${id}: descent`)
    assert.ok(raw.readInt16BE(8) <= os2.readUInt16BE(74))
    assert.ok(raw.readInt16BE(4) >= -os2.readUInt16BE(76))
    const count = raw.readInt16BE(0)
    assert.ok(count > 0 && count <= maxp.readUInt16BE(8))
    assert.ok(raw.readUInt16BE(10 + (count - 1) * 2) + 1 <= maxp.readUInt16BE(6))
    if (variant.id !== 'Regular') assert.notDeepEqual(raw, regularGlyphs[id], `${variant.id} glyph ${id}: changed outline`)
  }
}

test('all 20,976 target ideographs and every ASCII character have new masters', () => {
  assert.equal(createHash('sha256').update(skeletonBytes).digest('hex'), design.glyphwikiSha256)
  const coverage: {target_codepoints: string[]} = JSON.parse(readFileSync(new URL('../artifacts/coverage-baseline.json', import.meta.url), 'utf8'))
  const targets = coverage.target_codepoints.map(value => Number.parseInt(value.slice(2), 16)).filter(cp => cp >= 0x4e00 && cp <= 0x9fff)
  assert.equal(targets.length, 20976)
  for (const cp of [...targets, ...Array.from({length: 95}, (_, i) => 32 + i)]) {
    assert.ok(redrawn.has(cp), `master U+${cp.toString(16)}`)
    assert.ok(metrics.cmap.has(cp), `cmap U+${cp.toString(16)}`)
  }
  assert.equal(result.redrawnCharacters.length, 21110)
  assert.equal(result.codepoints.length, 21316)
  assert.equal(result.addedCharacters.length, 11855)
  for (const cp of sourceMetrics.cmap.keys()) assert.ok(metrics.cmap.has(cp))
})

test('all encoded production outlines and advances match their vector masters', () => {
  const iterator = productionMasters(skeletons)
  let finished = false
  while (!finished) {
    const batch = []
    for (let i = 0; i < 384; i += 1) {
      const item = iterator.next()
      if (item.done) { finished = true; break }
      batch.push(item.value)
    }
    if (batch.length === 0) break
    const decoded = readFont(result.ttf, batch.map(([character]) => character.codePointAt(0)!))
    const glyphs = new Map(decoded.glyf.flatMap(glyph => (glyph.unicode ?? []).map(cp => [cp, glyph] as const)))
    for (const [character, outline] of batch) {
      const actual = glyphs.get(character.codePointAt(0)!)!
      const expected = fontMaster(outline, 1000)
      assert.equal(actual.advanceWidth, expected.advance, character)
      const contours = (actual.contours ?? []).map(contour => contour.map(point => ({...point, onCurve: point.onCurve ?? false})))
      assert.deepEqual(contours, expected.contours, character)
    }
  }
})

test('source bytes, unrelated tables, and every untouched source glyph are preserved', () => {
  assert.equal(createHash('sha256').update(source).digest('hex'), design.sourceSha256)
  const changed = new Set(['glyf', 'loca', 'hmtx', 'head', 'hhea', 'OS/2', 'name', 'maxp', 'cmap', 'post'])
  for (const [tag, data] of before) if (!changed.has(tag)) assert.deepEqual(table(after, tag), data, tag)
  const oldGlyphs = glyphData(before)
  const newGlyphs = glyphData(after)
  for (const [cp, id] of sourceMetrics.cmap) {
    if (redrawn.has(cp)) continue
    assert.equal(metrics.cmap.get(cp), id)
    assert.deepEqual(newGlyphs[id], oldGlyphs[id], `U+${cp.toString(16)}`)
    assert.equal(metrics.advances[id], sourceMetrics.advances[id])
  }
})

test('font identity, license, checksums, maxp capacity and every vertical boundary are valid', () => {
  assert.equal(checksum(result.ttf), 0xb1b0afba)
  const records = readNames(table(after, 'name')).filter(record => record.platform === 3 && record.language === 0x409)
  const names = new Map(records.map(record => [record.id, Buffer.from(record.data).swap16().toString('utf16le')]))
  assert.equal(names.get(1), design.family)
  assert.equal(names.get(6), design.postScriptName)
  assert.equal(names.get(13), license)
  assert.match(names.get(10)!, /20976 Chinese characters/)
  const hhea = table(after, 'hhea')
  const os2 = table(after, 'OS/2')
  const maxp = table(after, 'maxp')
  const rawGlyphs = glyphData(after)
  for (const [id, raw] of rawGlyphs.entries()) {
    if (raw.length === 0 || raw.readInt16BE(0) === 0) continue
    assert.ok(raw.readInt16BE(8) <= hhea.readInt16BE(4), `glyph ${id}: ascent`)
    assert.ok(raw.readInt16BE(4) >= hhea.readInt16BE(6), `glyph ${id}: descent`)
    assert.ok(raw.readInt16BE(8) <= os2.readUInt16BE(74))
    assert.ok(raw.readInt16BE(4) >= -os2.readUInt16BE(76))
    if (raw.readInt16BE(0) > 0) {
      const count = raw.readInt16BE(0)
      assert.ok(count <= maxp.readUInt16BE(8))
      assert.ok(raw.readUInt16BE(10 + (count - 1) * 2) + 1 <= maxp.readUInt16BE(6))
    }
  }
  for (const cp of redrawn) {
    const id = metrics.cmap.get(cp)!
    const raw = rawGlyphs[id]!
    if (raw.length === 0) continue
    const instructions = 10 + raw.readInt16BE(0) * 2
    assert.equal(raw.readUInt16BE(instructions), 0)
    assert.ok((raw[instructions + 2]! & 0x40) !== 0)
  }
})

test('a changed upstream source is rejected before derivation', () => {
  const modified = Buffer.from(source)
  modified[modified.length - 1] = (modified[modified.length - 1] ?? 0) ^ 1
  assert.throws(() => deriveFont(modified, license, skeletons), /pinned source font/)
})

test('WOFF2 round-trip preserves every mapped outline, metric, and name in bounded batches', async () => {
  const woff2 = await encodeWoff2(result.ttf)
  assert.equal(woff2.toString('ascii', 0, 4), 'wOF2')
  const decoded = await decodeWoff2(woff2)
  assert.deepEqual(readMetrics(decoded), metrics)
  for (let i = 0; i < result.codepoints.length; i += 384) {
    const subset = result.codepoints.slice(i, i + 384)
    assertGlyphs(readFont(decoded, subset), readFont(result.ttf, subset))
  }
  for (const tag of ['cmap', 'GDEF', 'post', 'name']) {
    assert.deepEqual(table(readTables(decoded), tag), table(after, tag), tag)
  }
})

test('production builds are reproducible and report the hashes of their actual deliverables', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'yono-build-test-'))
  try {
    const first = join(directory, 'first')
    const second = join(directory, 'second')
    const report = await build(first)
    await build(second)
    for (const filename of [...Object.keys(report.files), 'build-report.json', 'OFL.txt', 'GlyphWiki-LICENSE.txt']) {
      assert.deepEqual(await readFile(join(first, filename)), await readFile(join(second, filename)), filename)
    }
    assert.equal(report.designed_chinese, 20976)
    assert.equal(report.designed_ascii, 95)
    assert.equal(report.unicode_codepoints, 21316)
    assert.equal(report.redrawn_characters.length, 21110)
    assert.deepEqual(report.variants.map(face => face.id), ['Regular', 'Bold', 'Italic', 'BoldItalic'])
    for (const face of report.variants) assert.deepEqual(face.vertical_metrics, report.vertical_metrics, face.id)
    assert.equal(Object.keys(report.files).length, 9)
    for (const [name, metadata] of Object.entries(report.files)) {
      const data = await readFile(join(first, name))
      assert.equal(data.length, metadata.bytes)
      assert.equal(createHash('sha256').update(data).digest('hex'), metadata.sha256)
    }
    const css = await readFile(join(first, 'yono-hand.css'), 'utf8')
    assert.equal(css.match(/@font-face/g)?.length, 4)
    for (const variant of fontVariants) {
      const name = `${design.postScriptFamily}-${variant.id}`
      const ttf = await readFile(join(first, name + '.ttf'))
      assertVariant(ttf, variant)
      const face = css.split('@font-face').find(block => block.includes(name + '.woff2'))!
      assert.ok(face.includes(`font-weight: ${variant.weight};`))
      assert.ok(face.includes(`font-style: ${variant.italicAngle === 0 ? 'normal' : 'italic'};`))
      if (variant.id === 'Regular') continue
      const decoded = await decodeWoff2(await readFile(join(first, name + '.woff2')))
      assert.deepEqual(readMetrics(decoded), metrics)
      const decodedTables = readTables(decoded)
      const originalTables = readTables(ttf)
      for (const tag of ['name', 'OS/2', 'hhea', 'post', 'cmap']) assert.deepEqual(table(decodedTables, tag), table(originalTables, tag), `${name}: ${tag}`)
      for (let i = 0; i < result.codepoints.length; i += 384) {
        const subset = result.codepoints.slice(i, i + 384)
        assertGlyphs(readFont(decoded, subset), readFont(ttf, subset))
      }
    }
    const inherited = [...sourceMetrics.cmap.keys()].filter(cp => cp > 32 && !redrawn.has(cp)).slice(0, 16).map(cp => String.fromCodePoint(cp)).join('')
    for (const sample of ['Hamburgefontsiv 0123456789', '中文藏龍鬱齉龘', inherited]) {
      const text = sample.replaceAll('\\', '\\\\').replaceAll("'", "\\'")
      const pixels = fontVariants.map(variant => execFileSync('magick', ['-size', '1500x180', 'xc:white', '-fill', 'black', '-stroke', 'none',
        '-pointsize', '64', '-set', 'type:hinting', 'off', '-font', join(first, `${design.postScriptFamily}-${variant.id}.ttf`),
        '-draw', `text 30,110 '${text}'`, '-colorspace', 'gray', '-depth', '8', 'gray:-']))
      const ink = pixels.map(bytes => bytes.reduce((sum, value) => sum + 255 - value, 0))
      assert.ok(ink[1]! > ink[0]! * 1.1, `Bold ink: ${sample}`)
      assert.ok(ink[3]! > ink[2]! * 1.1, `Bold Italic ink: ${sample}`)
      assert.ok(Math.abs(ink[2]! / ink[0]! - 1) < 0.03, `Italic preserves ink area: ${sample}`)
      assert.notDeepEqual(pixels[0], pixels[2], `Italic changes pixels: ${sample}`)
    }
  } finally {
    await rm(directory, {recursive: true, force: true})
  }
})

test('unhinted FreeType keeps untouched character pixels identical to the independent 0.100 baseline', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'yono-render-test-'))
  try {
    const font = join(directory, 'derived.ttf')
    await writeFile(font, result.ttf)
    const phrase = [...sourceMetrics.cmap.keys()].filter(cp => cp > 32 && !redrawn.has(cp)).slice(0, 16).map(cp => String.fromCodePoint(cp)).join('')
    assert.ok(phrase.length > 0)
    const text = phrase.replaceAll('\\', '\\\\').replaceAll("'", "\\'")
    /** Latin redesign changes auto-hinter blue zones; compare the actual unhinted outlines. */
    const args = ['-size', '1200x180', 'xc:white', '-fill', '#344158', '-stroke', 'none', '-pointsize', '48', '-set', 'type:hinting', 'off']
    const expected = execFileSync('magick', [...args, '-font', fileURLToPath(new URL('fixtures/yono-v0.100-reference.ttf', import.meta.url)), '-draw', `text 30,100 '${text}'`, '-depth', '8', 'rgba:-'])
    const actual = execFileSync('magick', [...args, '-font', font, '-draw', `text 30,100 '${text}'`, '-depth', '8', 'rgba:-'])
    assert.equal(actual.equals(expected), true, 'Untouched glyph pixels changed')
  } finally {
    await rm(directory, {recursive: true, force: true})
  }
})
