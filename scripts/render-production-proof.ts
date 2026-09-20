import {execFileSync} from 'node:child_process'
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {createSkeletonResolver, skeletonContours} from '../src/glyphwiki.ts'
import type {IGlyphWikiSource} from '../src/glyphwiki.ts'
import {outlineMasters, chineseCharacters} from '../src/masters.ts'
import type {IOutlineMaster} from '../src/masters.ts'
import {contourSvg} from '../src/pen.ts'

const root = new URL('../', import.meta.url)
const data: IGlyphWikiSource = JSON.parse(readFileSync(new URL('sources/glyphwiki/subset.json', root), 'utf8'))
const resolve = createSkeletonResolver(data)
const ink = '#242831'
const muted = '#747d88'
const blue = '#466c8e'
const definitions = new Map<string, string>()
const escapeXml = (text: string): string => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

function master(character: string): IOutlineMaster {
  const hand = outlineMasters.get(character)
  if (hand !== undefined) return hand
  const name = data.roots[character]
  if (name === undefined) throw new Error(`Missing proof glyph: ${character}`)
  return {advance: 100, contours: skeletonContours(resolve(name))}
}

function text(text: string, x: number, y: number, size: number): string {
  let advance = 0
  const children = [...text].map(character => {
    const glyph = master(character)
    const id = 'g' + character.codePointAt(0)!.toString(16)
    if (!definitions.has(id)) definitions.set(id, `<g id="${id}" data-character="${escapeXml(character)}" data-advance="${glyph.advance}">`
      + glyph.contours.map(contour => `<path d="${contourSvg(contour)}"/>`).join('') + '</g>')
    const result = `<use xlink:href="#${id}" transform="translate(${advance} 0)"/>`
    advance += glyph.advance
    return result
  })
  if (x + advance * size / 100 > 1390) throw new Error(`Proof line exceeds canvas: ${text}`)
  return `<g aria-label="${escapeXml(text)}" fill="${ink}" transform="translate(${x} ${y}) scale(${size / 100})">${children.join('')}</g>`
}

function label(value: string, x: number, y: number, size = 18, color = muted): string {
  return `<text x="${x}" y="${y}" font-family="Arial, PingFang SC, sans-serif" font-size="${size}" fill="${color}">${escapeXml(value)}</text>`
}

function save(name: string, height: number, content: readonly string[]): void {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1440" height="${height}" viewBox="0 0 1440 ${height}">
<title>Yono Hand 0.200 · 生产字形样张</title>
<desc>Editable vector outlines from the shared production masters. Annotation labels use system fonts.</desc>
<defs>${[...definitions.values()].join('\n')}</defs>
<rect width="1440" height="${height}" fill="white"/>
${content.join('\n')}
</svg>\n`
  const output = new URL('artifacts/', root)
  mkdirSync(output, {recursive: true})
  const svgPath = fileURLToPath(new URL(name + '.svg', output))
  const pngPath = fileURLToPath(new URL(name + '.png', output))
  writeFileSync(svgPath, svg)
  execFileSync('magick', ['-background', 'white', '-font', '/System/Library/Fonts/STHeiti Light.ttc', svgPath, pngPath], {stdio: 'inherit'})
  console.log(svgPath)
  console.log(pngPath)
  definitions.clear()
}

save('yono-production-specimen', 1710, [
  label('YONO HAND / 0.200', 72, 54, 20, blue),
  label('中文行楷 + 英文白板手写', 1100, 54),
  text('你好，世界！ Hello, world!', 62, 102, 76),
  text('宏观分层与依赖 / Doodle', 68, 237, 53),
  label('01 / 中英文连续阅读', 72, 363, 18, blue),
  text('缓存 Cache / 调度 Scheduler', 70, 396, 49),
  text('状态 State / 视图 View / 模型 Model', 70, 484, 46),
  text('读取文件，写入数据。', 70, 574, 46),
  text('Input → Command → Controller → State', 70, 666, 44),
  label('02 / 全部 ASCII 与常用符号', 72, 782, 18, blue),
  text('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 70, 809, 43),
  text('abcdefghijklmnopqrstuvwxyz', 70, 890, 43),
  text('0123456789 / [] {} () <> @ # $ % & *', 70, 974, 41),
  text('，。！？：；、“”‘’（）【】《》…—', 70, 1056, 38),
  label('03 / 不同复杂度与生僻字', 72, 1174, 18, blue),
  text('一二三木林森國語藏龍龜鬱齉龘', 68, 1205, 61),
  label('04 / 24 px 正文', 72, 1337, 18, blue),
  text('运行时边界 / Client · Server / 数据与文件', 72, 1362, 24),
  text('补货下沿与缩容上沿，分别计算。', 72, 1413, 24),
  text('API v2.0: cache_hit = true; state.count += 1;', 72, 1464, 24),
  text('a != b / x <= y / 0 ≤ n ≤ 100 / x ≠ y / 3 × 4 ÷ 2', 72, 1515, 24),
  label('SVG 与字体使用同一轮廓源；全量目标为 20,976 个汉字。', 72, 1655, 18),
])

for (const [name, title, characters] of [
  ['yono-production-ascii', '完整 ASCII / 95 个字符', Array.from({length: 95}, (_, i) => String.fromCodePoint(32 + i))],
  ['yono-production-chinese', '手工字形与复杂字形检查', [...chineseCharacters, ...'一二三木林森國語藏龍龜鬱齉龘明清春夏秋冬霜雪雲霞鬥羲贏藝蘭醫難體讀寫鬧鑰龠禴麤鑫淼猋焱垚壵'] ],
] as const) {
  const rows = Math.ceil(characters.length / 10)
  const content = [label('YONO HAND / 0.200', 72, 53, 20, blue), label(title, 72, 93, 20)]
  for (const [index, character] of characters.entries()) {
    const x = 62 + index % 10 * 132
    const y = 128 + Math.floor(index / 10) * 144
    const glyph = master(character)
    content.push(text(character, x + (115 - glyph.advance * 0.95) / 2, y, 95),
      label('U+' + character.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0'), x + 19, y + 124, 13))
  }
  save(name, 170 + rows * 144, content)
}
