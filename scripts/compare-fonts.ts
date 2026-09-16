import {execFileSync} from 'node:child_process'
import {mkdtempSync, readFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {readMetrics, textAdvance} from '../src/metrics.ts'

const folder = process.argv[2]
if (folder === undefined) throw new Error('Usage: node scripts/compare-fonts.ts <font-directory>')
const fonts = [
  ['01   清松手写体 1', 'JasonHandwriting1.ttf'],
  ['02   清松手写体 3', 'JasonHandwriting3.ttf'],
  ['03   清松手写体 8', 'JasonHandwriting8.ttf'],
  ['04   悠哉 Yozai Regular', 'Yozai-Regular.ttf'],
  ['05   辰宇落雁体 Thin 2.0', 'ChenYuluoyan-2.0-Thin.ttf'],
  ['06   小赖 Xiaolai Regular', 'Xiaolai-Regular.ttf'],
] as const
const main = '你好，世界！今天也要開心。'
const small = '手寫字體 Doodle：自然、有點俏皮。'
const measure = '手寫字體'
const probe = '缓存调度请求执行任务队列输入输出重试失败连接字体设计开关'
const ui = '/System/Library/Fonts/STHeiti Light.ttc'
const output = fileURLToPath(new URL('../artifacts/handwriting-fonts-comparison.png', import.meta.url))

function renderText(text: string, font: string, size: number, color: string, output: string): readonly [number, number] {
  execFileSync('magick', ['-background', 'none', '-fill', color, '-font', font, '-pointsize', size.toFixed(3), 'label:' + text, '-trim', '+repage', output])
  const dimensions = execFileSync('magick', ['identify', '-format', '%w %h', output], {encoding: 'utf8'}).split(' ').map(Number)
  return [dimensions[0]!, dimensions[1]!]
}

const temporary = mkdtempSync(join(tmpdir(), 'yono-font-comparison-'))
try {
  const args = ['-size', '1600x1640', 'xc:white', '-gravity', 'northwest']
  const labels = [
    ['中文手写字体 · 同文对比', 42, '#273447', 76, 49],
    ['真实字体渲染 / 共同繁体样本 / 按汉字实际高度对齐', 24, '#77808d', 79, 111],
    ['每款均保留原始笔画粗细；展示文字已检查字符覆盖，无字体回退。', 23, '#77808d', 79, 1575],
  ] as const
  for (const [index, [text, size, color, x, y]] of labels.entries()) {
    const image = join(temporary, `label-${index}.png`)
    renderText(text, ui, size, color, image)
    args.push(image, '-geometry', `+${x}+${y}`, '-composite')
  }
  for (const [index, [name, filename]] of fonts.entries()) {
    const font = resolve(folder, filename)
    const metrics = readMetrics(readFileSync(font))
    textAdvance(metrics, main + small + measure, 120)
    const missing = [...new Set([...probe].filter(char => !metrics.cmap.has(char.codePointAt(0)!)))].join('')
    console.log(`${filename}: simplified probe missing = ${missing || '(none in this sample)'}`)
    const [, measuredHeight] = renderText(measure, font, 120, '#303d51', join(temporary, `measure-${index}.png`))
    const y = 184 + index * 225
    const title = join(temporary, `title-${index}.png`)
    renderText(name, ui, 28, '#687689', title)
    args.push(title, '-geometry', `+80+${y}`, '-composite')
    for (const [label, text, height, offset] of [['main', main, 57, 49], ['small', small, 31, 136]] as const) {
      const image = join(temporary, `${label}-${index}.png`)
      const [width, actualHeight] = renderText(text, font, 120 * height / measuredHeight, '#303d51', image)
      if (width > 1440 || actualHeight > 84) throw new Error(`${filename}: specimen exceeds its layout bounds`)
      args.push(image, '-geometry', `+80+${y + offset}`, '-composite')
    }
    if (index < fonts.length - 1) args.push('-stroke', '#e8edf1', '-strokewidth', '1', '-draw', `line 80,${y + 199} 1520,${y + 199}`)
  }
  execFileSync('magick', [...args, output], {stdio: 'inherit'})
  console.log(output)
} finally {
  rmSync(temporary, {recursive: true, force: true})
}
