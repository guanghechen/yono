import {execFileSync} from 'node:child_process'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {chineseGlyphs} from '../src/chinese.ts'
import {design} from '../src/design.ts'
import {readMetrics, textAdvance} from '../src/metrics.ts'

const root = new URL('../', import.meta.url)
const ui = '/System/Library/Fonts/STHeiti Light.ttc'
const before = fileURLToPath(new URL('tests/fixtures/yono-v0.100-reference.ttf', root))
const after = process.argv[2] ?? fileURLToPath(new URL(`build/${design.postScriptName}.ttf`, root))
const output = fileURLToPath(new URL(`artifacts/yono-hand-v${design.version}-chinese-proof.png`, root))
const preview = fileURLToPath(new URL(`artifacts/yono-hand-v${design.version}-chinese-preview.png`, root))
const phrase = '补货下沿与缩容上沿，分别计算'
const fonts = new Map([before, after].map(path => [path, readMetrics(readFileSync(path))]))
const args = ['-size', '1500x1720', 'xc:white']

function drawText(font: string, size: number, x: number, y: number, text: string, color = '#24353b', stroke = 0): void {
  const metrics = fonts.get(font)
  if (metrics !== undefined && x + textAdvance(metrics, text, size) > 1450) {
    throw new Error(`Chinese proof line exceeds its canvas: ${text}`)
  }
  const escaped = text.replaceAll('\\', '\\\\').replaceAll("'", "\\'")
  args.push('-fill', color, '-stroke', stroke === 0 ? 'none' : color, '-strokewidth', String(stroke),
    '-font', font, '-pointsize', String(size), '-draw', `text ${x},${y} '${escaped}'`)
}

drawText(ui, 34, 56, 66, `Yono Hand ${design.version} · 五字重画`)
drawText(ui, 21, 58, 106, '同字号、同基线；上行为 0.100，下行为本次修改。', '#66747b')
drawText(ui, 21, 58, 157, '原句 · 72 px', '#66747b')
drawText(before, 72, 54, 240, phrase)
drawText(after, 72, 54, 349, phrase)

drawText(ui, 21, 58, 422, '单字 · 136 px', '#66747b')
for (const [index, character] of [...chineseGlyphs.keys()].entries()) {
  const x = 75 + index * 284
  drawText(before, 136, x, 576, character)
  drawText(after, 136, x, 759, character)
}

for (const [size, y] of [[48, 857], [32, 1060], [24, 1235]] as const) {
  drawText(ui, 21, 58, y, `原句 · ${size} px`, '#66747b')
  drawText(before, size, 58, y + 68, phrase)
  drawText(after, size, 58, y + 136, phrase)
}

drawText(ui, 21, 58, 1440, '加粗压力检查 · 32 px + 0.65 px 描边（仅用于样张）', '#66747b')
drawText(before, 32, 58, 1500, phrase, '#24353b', 0.65)
drawText(after, 32, 58, 1560, phrase, '#24353b', 0.65)
drawText(ui, 20, 58, 1650, '对照示例：补、沿、缩、容、算。当前版本已重建 20,976 个目标汉字。', '#66747b')
execFileSync('magick', [...args, output], {stdio: 'inherit'})
execFileSync('magick', [output, '-crop', '1200x390+0+0', '+repage', preview], {stdio: 'inherit'})
console.log(output)
console.log(preview)
