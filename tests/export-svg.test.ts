import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import test from 'node:test'
import {Font} from 'fonteditor-core'

test('SVG export retains overhanging ink, aligned lines and logical advances', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'yono-svg-test-'))
  try {
    const font = Font.create()
    const data = font.get()
    data.head.unitsPerEm = 1000
    data.hhea.ascent = 800
    data.hhea.descent = -200
    data.hhea.lineGap = 0
    for (const [character, left, right] of [[' ', 0, 0], ['A', 100, 900], ['L', -200, 800], ['R', 100, 1200]] as const) {
      data.glyf.push({
        name: character === ' ' ? 'space' : character, unicode: [character.codePointAt(0)!],
        advanceWidth: character === ' ' ? 500 : 1000, leftSideBearing: left,
        xMin: left, xMax: right, yMin: 0, yMax: character === ' ' ? 0 : 700,
        contours: character === ' ' ? [] : [[
          {x: left, y: 0, onCurve: true}, {x: left, y: 700, onCurve: true},
          {x: right, y: 700, onCurve: true}, {x: right, y: 0, onCurve: true},
        ]],
      })
    }
    const fontPath = join(directory, 'overhang.ttf')
    await writeFile(fontPath, font.write({type: 'ttf', toBuffer: true}))
    const svgPath = join(directory, 'proof.svg')
    for (const text of ['R', 'L', 'LR', 'A\nR\nL', ' A ', '   ', '']) {
      execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/export-svg.ts', import.meta.url)),
        '--font', fontPath, '--text', text, '--size', '512', '--output', svgPath])
      const svg = await readFile(svgPath, 'utf8')
      const dimensions = svg.match(/<svg[^>]* width="(\d+)" height="(\d+)"/)!
      const width = Number(dimensions[1])
      const height = Number(dimensions[2])
      if (text === 'LR') assert.match(svg, /xlink:href="#g52" transform="translate\(1000 0\)"/)
      if (text === ' A ') {
        assert.equal(width, 1072)
        assert.match(svg, /xlink:href="#g41" transform="translate\(500 0\)"/)
        assert.match(svg, /xlink:href="#g20" transform="translate\(1500 0\)"/)
      }
      if (text === '   ' || text === '') {
        assert.equal(width, text.length * 256 + 48)
        continue
      }
      if (text.includes('\n')) {
        const origins = [...svg.matchAll(/<g transform="translate\(([-\d.]+) ([-\d.]+)\) scale/g)].map(match => Number(match[1]))
        assert.equal(origins.length, 3)
        assert.equal(new Set(origins).size, 1)
      }
      const pixels = execFileSync('magick', [svgPath, '-colorspace', 'gray', '-depth', '8', 'gray:-'], {maxBuffer: width * height + 1024})
      assert.equal(pixels.length, width * height)
      let left = width
      let right = -1
      for (let index = 0; index < pixels.length; index += 1) {
        if (pixels[index]! >= 250) continue
        left = Math.min(left, index % width)
        right = Math.max(right, index % width)
      }
      assert.ok(right >= left, `visible ink: ${JSON.stringify(text)}`)
      assert.ok(left >= 23, `left margin: ${JSON.stringify(text)} at ${left}`)
      assert.ok(right < width - 23, `right margin: ${JSON.stringify(text)} at ${right}/${width}`)
    }
  } finally {
    await rm(directory, {recursive: true, force: true})
  }
})
