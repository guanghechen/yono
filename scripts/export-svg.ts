import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {parseArgs} from 'node:util'
import {readFont} from '../src/font.ts'
import {readMetrics} from '../src/metrics.ts'
import {contourSvg} from '../src/pen.ts'

const root = new URL('../', import.meta.url)
const {values} = parseArgs({options: {
  text: {type: 'string', default: 'Yono Hand 手写字体'},
  output: {type: 'string', default: fileURLToPath(new URL('artifacts/yono-export.svg', root))},
  font: {type: 'string', default: fileURLToPath(new URL('build/YonoHand-Regular.ttf', root))},
  size: {type: 'string', default: '64'},
}})
const size = Number(values.size)
if (!Number.isFinite(size) || size <= 0 || size > 2000) throw new Error('SVG size must be in (0, 2000]')
const fontBytes = readFileSync(values.font)
const metrics = readMetrics(fontBytes)
const lines = values.text.split(/\r?\n/)
const characters = [...new Set(lines.join(''))]
for (const character of characters) {
  if (!metrics.cmap.has(character.codePointAt(0)!)) throw new Error(`Font does not cover ${character} (U+${character.codePointAt(0)!.toString(16).toUpperCase()})`)
}
const decoded = readFont(fontBytes, characters.length === 0 ? [32] : characters.map(character => character.codePointAt(0)!))
const glyphs = new Map(decoded.glyf.flatMap(glyph => (glyph.unicode ?? []).map(cp => [cp, glyph] as const)))
const scale = size / metrics.unitsPerEm
const ascent = decoded.hhea.ascent!
const height = (ascent - decoded.hhea.descent! + decoded.hhea.lineGap!) * scale
const margin = 24
const escapeXml = (text: string): string => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const definitions = characters.map(character => {
  const glyph = glyphs.get(character.codePointAt(0)!)!
  if ('compound' in glyph && glyph.compound) throw new Error(`SVG export requires flattened compound glyph ${character}`)
  return `<g id="g${character.codePointAt(0)!.toString(16)}" data-character="${escapeXml(character)}">`
    + (glyph.contours ?? []).map(contour => `<path d="${contourSvg(contour.map(point => ({...point, onCurve: point.onCurve ?? false})))}"/>`).join('') + '</g>'
})
let width = 0
const content = lines.map((line, row) => {
  let advance = 0
  const uses = [...line].map(character => {
    const glyph = glyphs.get(character.codePointAt(0)!)!
    const use = `<use xlink:href="#g${character.codePointAt(0)!.toString(16)}" transform="translate(${advance} 0)"/>`
    advance += glyph.advanceWidth
    return use
  })
  width = Math.max(width, advance * scale)
  return `<g transform="translate(${margin} ${margin + row * height + ascent * scale}) scale(${scale} ${-scale})">${uses.join('')}</g>`
})
const canvasWidth = Math.ceil(width + margin * 2)
const canvasHeight = Math.ceil(lines.length * height + margin * 2)
const document = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}">
<title>${escapeXml(values.text)}</title>
<desc>Editable Yono glyph outlines exported from the built TrueType font. No installed font is required.</desc>
<defs>${definitions.join('\n')}</defs>
<rect width="100%" height="100%" fill="white"/>
<g fill="#242831">${content.join('\n')}</g>
</svg>\n`
const output = resolve(values.output)
mkdirSync(dirname(output), {recursive: true})
writeFileSync(output, document)
console.log(output)
