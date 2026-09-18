import type {Contour, IPoint} from './glyph.ts'

/** Hand-placed pen positions in the source font's 1000-unit em; widths are diameters. */
type PenPoint = readonly [x: number, y: number, width: number]

function penStroke(positions: readonly PenPoint[]): Contour {
  const directions = positions.slice(1).map(([x, y], index) => {
    const previous = positions[index]!
    const length = Math.hypot(x - previous[0], y - previous[1])
    return {x: (x - previous[0]) / length, y: (y - previous[1]) / length}
  })
  const left: IPoint[] = []
  const right: IPoint[] = []
  for (const [index, [x, y, width]] of positions.entries()) {
    const before = directions[Math.max(0, index - 1)]!
    const after = directions[Math.min(index, directions.length - 1)]!
    const divisor = 1 + before.x * after.x + before.y * after.y
    const dx = -(before.y + after.y) * width / (2 * divisor)
    const dy = (before.x + after.x) * width / (2 * divisor)
    left.push({x: x + dx, y: y + dy, onCurve: true})
    right.push({x: x - dx, y: y - dy, onCurve: true})
  }
  const contour: IPoint[] = []
  for (const [side, direction] of [[left, directions.at(-1)!], [right.reverse(), directions[0]!]] as const) {
    for (const [index, point] of side.entries()) {
      if (index === 0 || index === side.length - 1) {
        contour.push(point)
      } else {
        const previous = side[index - 1]!
        const next = side[index + 1]!
        contour.push(
          {x: point.x * 0.8 + previous.x * 0.2, y: point.y * 0.8 + previous.y * 0.2, onCurve: true},
          {...point, onCurve: false},
          {x: point.x * 0.8 + next.x * 0.2, y: point.y * 0.8 + next.y * 0.2, onCurve: true},
        )
      }
    }
    const end = side.at(-1)!
    const opposite = side === left ? right[0]! : left[0]!
    const position = side === left ? positions.at(-1)! : positions[0]!
    const sign = side === left ? 1 : -1
    const dx = direction.x * position[2] / 2 * sign
    const dy = direction.y * position[2] / 2 * sign
    contour.push(
      {x: end.x + dx, y: end.y + dy, onCurve: false},
      {x: position[0] + dx, y: position[1] + dy, onCurve: true},
      {x: opposite.x + dx, y: opposite.y + dy, onCurve: false},
      opposite,
    )
  }
  return contour.map(point => ({...point, x: Math.round(point.x), y: Math.round(point.y)}))
}

/** Separate strokes keep the radicals legible; slight slope and pressure changes retain the hand. */
const strokes: ReadonlyMap<string, readonly (readonly PenPoint[])[]> = new Map([
  ['补', [
    [[277, 664, 46], [326, 610, 53]],
    [[174, 530, 47], [394, 545, 50], [310, 406, 48], [152, 260, 39]],
    [[298, 399, 50], [295, 193, 52], [291, -54, 45]],
    [[398, 375, 40], [355, 317, 45]],
    [[311, 315, 42], [435, 233, 47]],
    [[626, 655, 51], [631, 337, 54], [636, -67, 46]],
    [[663, 408, 44], [747, 366, 51], [826, 303, 43]],
  ]],
  ['沿', [
    [[153, 630, 46], [226, 577, 54]],
    [[127, 418, 46], [216, 377, 53]],
    [[148, -32, 46], [210, 105, 51], [271, 225, 37]],
    [[451, 637, 47], [430, 492, 50], [340, 371, 40]],
    [[689, 643, 48], [691, 468, 51], [724, 410, 48], [860, 420, 43]],
    [[405, 261, 48], [419, -52, 51]],
    [[407, 261, 47], [797, 269, 51], [781, -38, 47]],
    [[420, -32, 46], [782, -38, 50]],
  ]],
  ['缩', [
    [[271, 637, 45], [137, 422, 47], [288, 443, 42]],
    [[322, 491, 43], [148, 219, 47], [309, 249, 42]],
    [[132, 26, 47], [306, 91, 41]],
    [[642, 690, 41], [669, 647, 46]],
    [[417, 582, 43], [408, 490, 46]],
    [[416, 585, 44], [875, 593, 47], [865, 504, 40]],
    [[543, 429, 44], [481, 316, 46], [389, 201, 36]],
    [[471, 310, 45], [467, 101, 47], [464, -76, 43]],
    [[612, 431, 44], [895, 438, 46]],
    [[751, 428, 42], [710, 298, 43]],
    [[605, 291, 43], [610, -71, 46]],
    [[606, 293, 43], [868, 298, 46], [863, -69, 44]],
    [[612, 112, 41], [864, 117, 43]],
    [[611, -60, 42], [864, -62, 45]],
  ]],
  ['容', [
    [[480, 698, 46], [518, 638, 51]],
    [[213, 572, 47], [204, 452, 51]],
    [[214, 575, 47], [806, 586, 51], [791, 465, 43]],
    [[399, 459, 43], [352, 404, 47], [301, 365, 39]],
    [[605, 461, 42], [707, 380, 47]],
    [[506, 348, 47], [373, 227, 48], [178, 107, 36]],
    [[507, 341, 44], [653, 230, 51], [844, 135, 40]],
    [[339, 139, 47], [345, -101, 50]],
    [[340, 141, 46], [690, 147, 51], [685, -96, 47]],
    [[345, -82, 46], [686, -89, 48]],
  ]],
  ['算', [
    [[318, 710, 44], [276, 637, 48], [204, 566, 37]],
    [[290, 649, 44], [471, 657, 46]],
    [[369, 642, 41], [407, 574, 45]],
    [[640, 718, 44], [602, 647, 47], [551, 592, 37]],
    [[616, 659, 44], [819, 665, 46]],
    [[714, 648, 41], [753, 580, 45]],
    [[293, 479, 46], [298, 89, 48]],
    [[294, 481, 45], [737, 487, 48], [735, 89, 46]],
    [[300, 350, 40], [735, 354, 43]],
    [[302, 221, 40], [734, 226, 43]],
    [[299, 97, 43], [737, 96, 45]],
    [[158, -7, 46], [520, 1, 48], [866, 6, 44]],
    [[401, 68, 46], [390, -40, 47], [349, -124, 39]],
    [[645, 69, 47], [650, -136, 45]],
  ]],
])

export const chineseGlyphs: ReadonlyMap<string, readonly Contour[]> = new Map(
  [...strokes].map(([character, paths]) => [character, paths.map(penStroke)]),
)
