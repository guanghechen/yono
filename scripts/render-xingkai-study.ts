import {execFileSync} from 'node:child_process'
import {mkdirSync, writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {xingkaiGlyphs, xingkaiStyle} from '../designs/xingkai/glyphs.ts'
import {contourSvg, penContour} from '../src/pen.ts'
import {whiteboardLatin} from '../designs/xingkai/whiteboard-latin.ts'

const root = new URL('../', import.meta.url)
const output = new URL('artifacts/', root)
const ink = '#242831'
const muted = '#747d88'
const blue = '#466c8e'
const studyGlyphs = new Map([...xingkaiGlyphs, ...whiteboardLatin])
const round = (value: number): string => Number(value.toFixed(2)).toString()

function escapeXml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}


const definitions: string[] = []
for (const [prefix, glyphs] of [['g', studyGlyphs], ['b', xingkaiGlyphs]] as const) {
  for (const [character, glyph] of glyphs) {
    const id = character.codePointAt(0)!.toString(16)
    const isChinese = /\p{Script=Han}/u.test(character)
    const isWhiteboard = prefix === 'g' && whiteboardLatin.has(character)
    const pressure = isWhiteboard ? 1 : isChinese ? xingkaiStyle.chinesePressure : xingkaiStyle.latinPressure
    const slant = !isWhiteboard && /[a-zA-Z0-9]/u.test(character) ? xingkaiStyle.latinSlant : 0
    definitions.push(`<g id="${prefix}${id}" data-character="${escapeXml(character)}" data-advance="${glyph.advance}">`
      + glyph.strokes.map(stroke => `<path d="${contourSvg(penContour(stroke.map(([x, y, width]) => [
        x + (xingkaiStyle.latinBaseline - y) * slant, y, width * pressure,
      ]))) }"/>`).join('') + '</g>')
  }
}

function specimen(text: string, x: number, y: number, size: number, before = false): string {
  let advance = 0
  const glyphs = before ? xingkaiGlyphs : studyGlyphs
  const children = [...text].map(character => {
    const glyph = glyphs.get(character)
    if (glyph === undefined) throw new Error(`No designed glyph for ${character}`)
    const id = character.codePointAt(0)!.toString(16)
    const use = `<use xlink:href="#${before ? 'b' : 'g'}${id}" transform="translate(${advance} 0)"/>`
    advance += glyph.advance
    return use
  })
  if (x + advance * size / 100 > 1380) throw new Error(`Specimen exceeds its canvas: ${text}`)
  return `<g aria-label="${escapeXml(text)}" fill="${ink}" transform="translate(${x} ${y}) scale(${size / 100})">${children.join('')}</g>`
}

function label(text: string, x: number, y: number, size = 18, color = muted): string {
  return `<text x="${x}" y="${y}" font-family="Arial, PingFang SC, sans-serif" font-size="${size}" fill="${color}">${escapeXml(text)}</text>`
}

function rule(y: number): string {
  return `<path d="M72 ${y}H1368" fill="none" stroke="#e3e8ed"/>`
}

function svg(height: number, title: string, content: readonly string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1440" height="${height}" viewBox="0 0 1440 ${height}">
<title>${escapeXml(title)}</title>
<desc>Yono glyph study 04: hard-pen semi-running Chinese with whiteboard-inspired Latin. All specimen glyphs are editable filled vector outlines. Annotation text uses system fonts. This is a design study, not a complete font.</desc>
<defs>${definitions.join('\n')}</defs>
<rect width="1440" height="${height}" fill="#fff"/>
${content.join('\n')}
</svg>\n`
}

const chinese = [...studyGlyphs.keys()].filter(character => /\p{Script=Han}/u.test(character))
const proof = [
  label('YONO / XINGKAI + WHITEBOARD', 72, 54, 19, blue),
  label('字形研究 04 · 英文白板手写', 1060, 54, 18),
  specimen('Doodle / Client / Server', 65, 102, 82),
  specimen('宏观分层与依赖 / State → Model', 70, 226, 42),
  rule(310),
  label('01 / 英文前后对照 · 同字号、同颜色', 72, 353, 18, blue),
  label('上一版 03', 72, 430, 17),
  specimen('Doodle / State → Model', 220, 380, 56, true),
  label('白板手写 04', 72, 527, 17),
  specimen('Doodle / State → Model', 220, 477, 56),
  label('圆润字腹 · 近等粗笔画', 1010, 428, 21, ink),
  label('高挑竖笔 · 自然不对称', 1010, 474, 19),
  label('重画英文，中文沿用 03', 1010, 512, 19),
  rule(563),
  label('02 / 字形细节与中英文搭配', 72, 606, 18, blue),
  specimen('abcdefghijklmnopqrstuvwxyz', 71, 638, 46),
  specimen('DCSMYHRF / 0123456789', 71, 724, 44),
  specimen('手写字体 中文 / Client · Server', 71, 808, 42),
  rule(902),
  label('03 / 实际字号', 72, 945, 18, blue),
  label('48 px', 72, 1009, 17),
  specimen('宏观分层与依赖 / Doodle', 198, 963, 48),
  label('32 px', 72, 1093, 17),
  specimen('运行时边界 / Client · Server', 198, 1061, 32),
  label('24 px', 72, 1164, 17),
  specimen('手写字体 · 中文 / State → Model / 0123456789', 198, 1140, 24),
  rule(1210),
  label('04 / 连续阅读与易混字符', 72, 1253, 18, blue),
  specimen('Hello, world. / minimum / drawing', 71, 1287, 48),
  specimen('o 0 / l 1 i / rn m / uv w', 71, 1383, 42),
  label('保留 o / 0、l / 1 / i 的结构区分', 960, 1424, 19),
  rule(1480),
  label(`${chinese.length} 个汉字 · 26 个英文小写 · 8 个英文大写 · 10 个数字 · 9 个间隔与标点`, 72, 1524, 17),
  label('SVG 字形母版阶段；本轮用于确认书写气质与可读性。', 72, 1558, 17),
]

const groups = [
  ['汉字 / 18', chinese],
  ['英文小写 / 26', [...'abcdefghijklmnopqrstuvwxyz']],
  ['英文大写 / 8', [...'DCSMYHRF']],
  ['数字 / 10', [...'0123456789']],
  ['间隔与标点 / 9', [...' ·.,:/-+→']],
] as const
const master: string[] = [
  label('YONO / XINGKAI — GLYPH MASTER 04', 72, 54, 20, blue),
  label('每个字形均为独立矢量轮廓；浅灰线标示字面、基线及 advance。', 72, 91, 18),
]
let top = 130
for (const [title, characters] of groups) {
  master.push(label(title, 72, top + 24, 20, blue))
  top += 51
  for (const [index, character] of characters.entries()) {
    const glyph = studyGlyphs.get(character)!
    const x = 72 + index % 8 * 164
    const y = top + Math.floor(index / 8) * 170
    const origin = x + (148 - glyph.advance * 1.1) / 2
    master.push(`<rect x="${x}" y="${y}" width="148" height="131" rx="3" fill="none" stroke="#e7ebef"/>`,
      `<path d="M${x} ${y + 16}H${x + 148} M${x} ${y + 104}H${x + 148}" fill="none" stroke="#edf0f3"/>`,
      `<path d="M${round(origin)} ${y + 8}V${y + 120} M${round(origin + glyph.advance * 1.1)} ${y + 8}V${y + 120}" fill="none" stroke="#e3eaf0" stroke-dasharray="2 4"/>`,
      specimen(character, origin, y + 5, 110),
      label(`U+${character.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')} / ${glyph.advance}`, x + 6, y + 151, 13))
  }
  top += Math.ceil(characters.length / 8) * 170 + 22
}
master.push(label('轮廓源：designs/xingkai/{glyphs,whiteboard-latin}.ts · 100-unit em', 72, top + 17, 17))

mkdirSync(output, {recursive: true})
for (const [name, document] of [
  ['yono-xingkai-04-specimen', svg(1598, 'Yono 字形研究 04 · 中文行楷与英文白板手写', proof)],
  ['yono-xingkai-04-master', svg(top + 55, 'Yono 字形研究 04 · 字形母版', master)],
] as const) {
  const svgPath = fileURLToPath(new URL(`${name}.svg`, output))
  const pngPath = fileURLToPath(new URL(`${name}.png`, output))
  writeFileSync(svgPath, document)
  execFileSync('magick', ['-background', 'white', '-font', '/System/Library/Fonts/STHeiti Light.ttc', svgPath, pngPath], {stdio: 'inherit'})
  console.log(svgPath)
  console.log(pngPath)
}
