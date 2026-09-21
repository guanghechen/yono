import {execFileSync} from 'node:child_process'
import {mkdirSync, readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {design} from '../src/design.ts'
import {readMetrics, textAdvance} from '../src/metrics.ts'
import {fontVariants} from '../src/variants.ts'

const root = new URL('../', import.meta.url)
const ui = '/System/Library/Fonts/STHeiti Light.ttc'
const output = fileURLToPath(new URL('artifacts/yono-variants-proof.png', root))
const args = ['-size', '1600x1840', 'xc:white', '-set', 'type:hinting', 'off']

function drawText(font: string, size: number, x: number, y: number, text: string, color = '#242831'): void {
  const escaped = text.replaceAll('\\', '\\\\').replaceAll("'", "\\'")
  args.push('-stroke', 'none', '-fill', color, '-font', font, '-pointsize', String(size), '-draw', `text ${x},${y} '${escaped}'`)
}

drawText(ui, 36, 70, 66, `${design.family} ${design.version} / 四款字体`)
drawText(ui, 21, 72, 108, '实际 TTF 轮廓 · 相同字号与字距 · Regular / Bold / Italic / Bold Italic', '#747d88')
for (const [index, variant] of fontVariants.entries()) {
  const y = 155 + index * 410
  const path = fileURLToPath(new URL(`build/${design.postScriptFamily}-${variant.id}.ttf`, root))
  const metrics = readMetrics(readFileSync(path))
  drawText(ui, 25, 72, y + 28, `${variant.subfamily} / ${variant.weight}`, '#466c8e')
  for (const [offset, size, sample] of [
    [107, 54, '你好，世界！ Hello, world! AaBb 0123'],
    [175, 39, '缓存 Cache / 调度 Scheduler / 状态 State'],
    [235, 38, '一二三木林森國語藏龍龜鬱齉龘 → ≤ ≠ × ÷'],
    [285, 24, '运行时边界 / API v2.0: cache_hit = true; state.count += 1;'],
    [327, 24, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ / abcdefghijklmnopqrstuvwxyz / 0123456789'],
    [372, 32, '¢ £ ¥ § ※ € ℃ ℉ 〈〉『』 ㄅㄆㄇㄈ ０１２３'],
  ] as const) {
    if (textAdvance(metrics, sample, size) > 1440) throw new Error(`Proof line exceeds canvas: ${sample}`)
    drawText(path, size, 72, y + offset, sample)
  }
}
drawText(ui, 20, 72, 1810, '四款均覆盖 21,316 个码点；粗体使用加宽笔画，斜体使用 10° 右倾轮廓。', '#747d88')
mkdirSync(new URL('artifacts/', root), {recursive: true})
execFileSync('magick', [...args, output], {stdio: 'inherit'})
console.log(output)
