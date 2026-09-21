import {createHash} from 'node:crypto'
import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {parseArgs} from 'node:util'
import {design} from '../src/design.ts'
import {deriveFont} from '../src/derive.ts'
import {encodeWoff2} from '../src/font.ts'
import type {IGlyphWikiSource} from '../src/glyphwiki.ts'
import {fontVariants} from '../src/variants.ts'

const root = new URL('../', import.meta.url)

export interface IBuildReport {
  readonly family: string
  readonly version: string
  readonly source_sha256: string
  readonly designed_ascii: number
  readonly designed_chinese: number
  readonly glyphwiki_subset_sha256: string
  readonly added_characters: readonly string[]
  readonly space_advance: number
  readonly transformed_glyphs: readonly string[]
  readonly redrawn_characters: readonly string[]
  readonly unicode_codepoints: number
  readonly maple_target_codepoints: number
  readonly maple_target_covered: number
  readonly maple_target_missing: number
  readonly vertical_metrics: {readonly ascent: number; readonly descent: number; readonly line_gap: number}
  readonly variants: readonly {
    readonly id: string
    readonly subfamily: string
    readonly weight: number
    readonly style: 'normal' | 'italic'
    readonly italic_angle: number
    readonly ttf: string
    readonly woff2: string
    readonly vertical_metrics: {readonly ascent: number; readonly descent: number; readonly line_gap: number}
  }[]
  readonly files: Readonly<Record<string, {readonly bytes: number; readonly sha256: string}>>
}

export async function build(output: string): Promise<IBuildReport> {
  const [source, license, coverage, glyphwikiBytes, glyphwikiLicense] = await Promise.all([
    readFile(new URL('sources/jason-handwriting-8/JasonHandwriting8.ttf', root)),
    readFile(new URL('sources/jason-handwriting-8/OFL.txt', root), 'utf8'),
    readFile(new URL('artifacts/coverage-baseline.json', root), 'utf8'),
    readFile(new URL('sources/glyphwiki/subset.json', root)),
    readFile(new URL('sources/glyphwiki/LICENSE.txt', root), 'utf8'),
  ])
  if (createHash('sha256').update(glyphwikiBytes).digest('hex') !== design.glyphwikiSha256) {
    throw new Error('The pinned GlyphWiki subset has changed; review its source before building')
  }
  const glyphwiki: IGlyphWikiSource = JSON.parse(glyphwikiBytes.toString('utf8'))
  const baseline: {target_codepoints: string[]} = JSON.parse(coverage)
  const target = new Set(baseline.target_codepoints.map(value => Number.parseInt(value.slice(2), 16)))
  const font = deriveFont(source, license, glyphwiki)
  const redrawn = new Set(font.redrawnCharacters.map(character => character.codePointAt(0)!))
  const chineseTargets = [...target].filter(cp => cp >= 0x4e00 && cp <= 0x9fff)
  if (chineseTargets.length !== 20976) throw new Error('The approved Chinese target changed; review the coverage baseline')
  const missingChinese = chineseTargets.filter(cp => !redrawn.has(cp))
  if (missingChinese.length > 0) {
    throw new Error(`Installable release is gated: ${chineseTargets.length - missingChinese.length}/${chineseTargets.length} target Chinese masters completed`)
  }
  const covered = font.codepoints.filter(cp => target.has(cp)).length
  const files = new Map<string, Buffer>()
  const variants: IBuildReport['variants'][number][] = []
  const css: string[] = []
  for (const variant of fontVariants) {
    const face = variant.id === 'Regular' ? font : deriveFont(source, license, glyphwiki, variant)
    if (face.codepoints.length !== font.codepoints.length || face.codepoints.some((cp, i) => cp !== font.codepoints[i])) {
      throw new Error(`Variant coverage differs: ${variant.id}`)
    }
    const name = `${design.postScriptFamily}-${variant.id}`
    files.set(name + '.ttf', face.ttf)
    files.set(name + '.woff2', await encodeWoff2(face.ttf))
    const style = variant.italicAngle === 0 ? 'normal' : 'italic'
    variants.push({
      id: variant.id, subfamily: variant.subfamily, weight: variant.weight, style, italic_angle: variant.italicAngle,
      ttf: name + '.ttf', woff2: name + '.woff2',
      vertical_metrics: {ascent: face.verticalMetrics.ascent, descent: face.verticalMetrics.descent, line_gap: face.verticalMetrics.lineGap},
    })
    css.push(`@font-face {\n  font-family: '${design.family}';\n  src: url('./${name}.woff2') format('woff2');\n  font-weight: ${variant.weight};\n  font-style: ${style};\n  font-display: swap;\n}`)
  }
  files.set('yono-hand.css', Buffer.from(css.join('\n\n') + '\n'))
  const report: IBuildReport = {
    family: design.family,
    version: design.version,
    source_sha256: design.sourceSha256,
    designed_ascii: [...redrawn].filter(cp => cp >= 0x20 && cp <= 0x7e).length,
    designed_chinese: chineseTargets.length,
    glyphwiki_subset_sha256: design.glyphwikiSha256,
    added_characters: font.addedCharacters,
    space_advance: design.spaceAdvance,
    transformed_glyphs: font.transformedGlyphs,
    redrawn_characters: font.redrawnCharacters,
    unicode_codepoints: font.codepoints.length,
    maple_target_codepoints: target.size,
    maple_target_covered: covered,
    maple_target_missing: target.size - covered,
    vertical_metrics: {ascent: font.verticalMetrics.ascent, descent: font.verticalMetrics.descent, line_gap: font.verticalMetrics.lineGap},
    variants,
    files: Object.fromEntries([...files].map(([name, data]) => [name, {
      bytes: data.length,
      sha256: createHash('sha256').update(data).digest('hex'),
    }])),
  }
  /** Finish all font computation before replacing deliverables; publish the report last. */
  await mkdir(output, {recursive: true})
  for (const [name, data] of files) await writeFile(resolve(output, name), data)
  await writeFile(resolve(output, 'OFL.txt'), license)
  await writeFile(resolve(output, 'GlyphWiki-LICENSE.txt'), glyphwikiLicense)
  await writeFile(resolve(output, 'build-report.json'), JSON.stringify(report, null, 2) + '\n')
  return report
}

if (import.meta.main) {
  const {values} = parseArgs({options: {output: {type: 'string', default: fileURLToPath(new URL('build', root))}}})
  const report = await build(resolve(values.output))
  console.log(JSON.stringify({...report,
    transformed_glyphs: report.transformed_glyphs.length,
    redrawn_characters: report.redrawn_characters.length,
    added_characters: report.added_characters.length,
  }, null, 2))
}
