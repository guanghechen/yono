import {chineseExtension} from '../designs/xingkai/chinese-extension.ts'
import {xingkaiGlyphs, xingkaiStyle} from '../designs/xingkai/glyphs.ts'
import type {IStudyGlyph} from '../designs/xingkai/glyphs.ts'
import {latinCompletion} from '../designs/xingkai/latin-complete.ts'
import {symbols} from '../designs/xingkai/symbols.ts'
import {whiteboardLatin} from '../designs/xingkai/whiteboard-latin.ts'
import {chineseStrokes} from './chinese.ts'
import {design} from './design.ts'
import type {Contour} from './glyph.ts'
import {createSkeletonResolver, skeletonContours} from './glyphwiki.ts'
import type {IGlyphWikiSource} from './glyphwiki.ts'
import {penContour} from './pen.ts'

export interface IOutlineMaster {
  readonly advance: number
  readonly contours: readonly Contour[]
}

/** Production masters retain the approved 04 outlines and add complete ASCII and text glyphs. */
export const penMasters: ReadonlyMap<string, IStudyGlyph> = new Map([
  ...xingkaiGlyphs,
  ...whiteboardLatin,
  ...latinCompletion,
  ...chineseExtension,
  ...symbols,
  /** Convert the pinned font's 1000-unit em into the masters' 100-unit em. */
  ...[' ', '\u00a0'].map((character): [string, IStudyGlyph] => [character, {
    advance: design.spaceAdvance / 10,
    strokes: [],
  }]),
  ...[...chineseStrokes].map(([character, strokes]): [string, IStudyGlyph] => [character, {
    advance: 100,
    strokes: strokes.map(stroke => stroke.map(([x, y, width], index) => [
      x / 10, 86 - y / 10, width / 10 * (index === 0 ? 0.62 : index === stroke.length - 1 ? 0.55 : 1),
    ])),
  }]),
])

export const outlineMasters: ReadonlyMap<string, IOutlineMaster> = new Map(
  [...penMasters].map(([character, glyph]) => {
    const chinese = /\p{Script=Han}/u.test(character)
    const approvedPunctuation = xingkaiGlyphs.has(character) && !chinese && !whiteboardLatin.has(character)
    const pressure = chinese ? xingkaiStyle.chinesePressure : approvedPunctuation ? xingkaiStyle.latinPressure : 1
    return [character, {
      advance: glyph.advance,
      contours: glyph.strokes.map(stroke => penContour(stroke.map(([x, y, width]) => [x, y, width * pressure]))),
    }]
  }),
)

/** Flip the shared design coordinates into the font's em, keeping clockwise filled strokes. */
export function fontMaster(master: IOutlineMaster, unitsPerEm: number): IOutlineMaster {
  const scale = unitsPerEm / 100
  return {
    advance: Math.round(master.advance * scale),
    contours: master.contours.map(contour => {
      const first = contour[0]!
      const last = contour.at(-1)!
      const points = first.x === last.x && first.y === last.y && first.onCurve === last.onCurve ? contour.slice(0, -1) : contour
      /** TrueType supplies exact quadratic midpoints implicitly; retain only real vertices. */
      return points.filter((point, index) => {
        const previous = points[(index + points.length - 1) % points.length]!
        const next = points[(index + 1) % points.length]!
        return !point.onCurve || previous.onCurve || next.onCurve
          || Math.abs(point.x - (previous.x + next.x) / 2) > 0.000001
          || Math.abs(point.y - (previous.y + next.y) / 2) > 0.000001
      }).reverse().map(point => ({
        x: Math.floor(point.x * scale + 0.5),
        y: Math.floor((86 - point.y) * scale + 0.5),
        onCurve: point.onCurve,
      }))
    }),
  }
}

export const chineseCharacters = [...penMasters.keys()].filter(character => /\p{Script=Han}/u.test(character))

/** Stream large CJK coverage so the build never retains all expanded point objects at once. */
export function* productionMasters(source?: IGlyphWikiSource): Generator<[string, IOutlineMaster]> {
  yield* outlineMasters
  if (source === undefined) return
  const resolve = createSkeletonResolver(source)
  for (const [character, name] of Object.entries(source.roots)) {
    if (outlineMasters.has(character)) continue
    yield [character, {advance: 100, contours: skeletonContours(resolve(name))}]
  }
}
