import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtemp, readFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import test from 'node:test'
import {design} from '../src/design.ts'
import {readMetrics} from '../src/metrics.ts'
import {readNames} from '../src/names.ts'
import {readTables, table} from '../src/sfnt.ts'

test('configured word spacing agrees across production masters, font metrics, SVG and metadata', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'yono-spacing-test-'))
  const originalAdvance = design.spaceAdvance
  /** This test file has an isolated process; configure it before the production masters load. */
  Object.assign(design, {spaceAdvance: 500})
  try {
    const {penMasters, outlineMasters} = await import('../src/masters.ts')
    const {build} = await import('../scripts/build.ts')
    for (const character of [' ', '\u00a0']) {
      assert.equal(penMasters.get(character)!.advance, 50)
      assert.equal(outlineMasters.get(character)!.advance, 50)
    }
    const report = await build(directory)
    const fontPath = join(directory, 'YonoHand-Regular.ttf')
    const font = await readFile(fontPath)
    const metrics = readMetrics(font)
    for (const cp of [0x20, 0xa0]) {
      assert.equal(metrics.advances[metrics.cmap.get(cp)!], 500)
    }
    assert.equal(report.space_advance, 500)
    assert.equal(JSON.parse(await readFile(join(directory, 'build-report.json'), 'utf8')).space_advance, 500)
    const description = readNames(table(readTables(font), 'name'))
      .find(record => record.id === 10 && record.platform === 3 && record.language === 0x409)!
    assert.match(Buffer.from(description.data).swap16().toString('utf16le'), /Word spaces use 500 units\./)

    const svgPath = join(directory, 'spaces.svg')
    execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/export-svg.ts', import.meta.url)),
      '--font', fontPath, '--text', ' \u00a0 ', '--output', svgPath])
    const svg = await readFile(svgPath, 'utf8')
    assert.match(svg, /width="144"/)
    assert.match(svg, /xlink:href="#ga0" transform="translate\(500 0\)"/)
    assert.match(svg, /xlink:href="#g20" transform="translate\(1000 0\)"/)
  } finally {
    Object.assign(design, {spaceAdvance: originalAdvance})
    await rm(directory, {recursive: true, force: true})
  }
})
