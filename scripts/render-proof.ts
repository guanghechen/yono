import {execFileSync} from 'node:child_process'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {design} from '../src/design.ts'
import {readMetrics, textAdvance} from '../src/metrics.ts'

const root = new URL('../', import.meta.url)
const ui = '/System/Library/Fonts/STHeiti Light.ttc'
const source = fileURLToPath(new URL('sources/jason-handwriting-8/JasonHandwriting8.ttf', root))
const derivative = fileURLToPath(new URL(`build/${design.postScriptName}.ttf`, root))
const output = fileURLToPath(new URL(`artifacts/yono-hand-v${design.version}-proof.png`, root))
const samples: readonly (readonly [number, number, string])[] = [
  [315, 90, '中文 AaBb 012'],
  [438, 46, '你好，世界！ Hello, world!'],
  [520, 46, '缓存 Cache / 调度 Scheduler'],
  [602, 46, '手写字体 Doodle 2026'],
  [684, 46, 'API v2.0: cache_hit = true'],
  [854, 31, '想法慢慢长大，Doodle 让它发生。'],
  [915, 31, '小字也要清楚。abc xyz 0123456789'],
  [1060, 42, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'],
  [1125, 42, 'abcdefghijklmnopqrstuvwxyz'],
  [1190, 42, '0123456789  .,:;!?  () [] {}'],
]

function drawText(args: string[], font: string, size: number, x: number, y: number, text: string, color = '#344158'): void {
  const escaped = text.replaceAll('\\', '\\\\').replaceAll("'", "\\'")
  args.push('-stroke', 'none', '-fill', color, '-font', font, '-pointsize', String(size), '-draw', `text ${x},${y} '${escaped}'`)
}

const args = ['-size', '1800x1370', 'xc:white']
const current = readMetrics(readFileSync(derivative))
drawText(args, ui, 42, 78, 78, `${design.family} ${design.version} · 中英文视觉调整`)
drawText(args, ui, 25, 80, 126, `同字号、同基线对比 · 五个中文字形重画 · 西文等比放大 ${Math.round((design.asciiScale - 1) * 100)}% · 收紧单词空格`, '#758194')
drawText(args, ui, 29, 80, 205, '清松 8 原版', '#68768b')
drawText(args, ui, 29, 950, 205, `${design.family} Regular`, '#68768b')
args.push('-stroke', '#e8edf2', '-strokewidth', '1', '-draw', 'line 900,175 900,1240')
for (const y of [738, 974]) args.push('-draw', `line 80,${y} 1720,${y}`)
for (const [path, x] of [[source, 80], [derivative, 950]] as const) {
  const font = path === derivative ? current : readMetrics(readFileSync(path))
  for (const [y, size, text] of samples) {
    if (textAdvance(font, text, size) > 770) throw new Error(`Proof line exceeds its column: ${text}`)
    drawText(args, path, size, x, y, text)
  }
}
drawText(args, ui, 23, 80, 1300, `当前保留原字库的 ${current.cmap.size.toLocaleString('en-US')} 个码点；完整 Maple 覆盖仍在后续补字阶段。`, '#758194')
execFileSync('magick', [...args, output], {stdio: 'inherit'})
console.log(output)
