import type {Contour} from './glyph.ts'

/** Pen coordinates use a 100-unit, downward-y em; width is the diameter. */
export type PenKnot = readonly [x: number, y: number, width: number]

interface IPosition {
  readonly x: number
  readonly y: number
}

/** Serialize explicit and implicit TrueType quadratic points as editable SVG paths. */
export function contourSvg(contour: Contour): string {
  if (contour.length === 0) return ''
  const expanded = contour.flatMap((point, index) => {
    const next = contour[(index + 1) % contour.length]!
    return !point.onCurve && !next.onCurve
      ? [point, {x: (point.x + next.x) / 2, y: (point.y + next.y) / 2, onCurve: true}]
      : [point]
  })
  const start = expanded.findIndex(point => point.onCurve)
  const points = [...expanded.slice(start), ...expanded.slice(0, start)]
  const first = points[0]!
  const last = points.at(-1)!
  if (!last.onCurve || last.x !== first.x || last.y !== first.y) points.push(first)
  const xy = (point: IPosition): string => `${Number(point.x.toFixed(2))} ${Number(point.y.toFixed(2))}`
  const commands = [`M${xy(first)}`]
  for (let i = 1; i < points.length; i += 1) {
    const point = points[i]!
    commands.push(point.onCurve ? `L${xy(point)}` : `Q${xy(point)} ${xy(points[++i]!)}`)
  }
  return commands.join(' ') + 'Z'
}

/** Expand the explicit pen skeleton into a smooth ribbon, without texture or jitter. */
export function penContour(knots: readonly PenKnot[], boundaryTolerance = 0): Contour {
  if (knots.length < 2 || knots.some(knot => knot.some(value => !Number.isFinite(value)) || knot[2] <= 0)) {
    throw new Error('A stroke needs at least two finite knots with positive pen diameters')
  }
  const left: IPosition[] = []
  const right: IPosition[] = []
  const tangents: IPosition[] = []
  for (let i = 0; i < knots.length - 1; i += 1) {
    const p0 = knots[Math.max(0, i - 1)]!
    const p1 = knots[i]!
    const p2 = knots[i + 1]!
    const p3 = knots[Math.min(knots.length - 1, i + 2)]!
    const steps = Math.max(6, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 1.8))
    const m1 = {x: (p2[0] - p0[0]) * 0.4, y: (p2[1] - p0[1]) * 0.4}
    const m2 = {x: (p3[0] - p1[0]) * 0.4, y: (p3[1] - p1[1]) * 0.4}
    for (let step = i === 0 ? 0 : 1; step <= steps; step += 1) {
      const t = step / steps
      const a = 2 * t ** 3 - 3 * t ** 2 + 1
      const b = t ** 3 - 2 * t ** 2 + t
      const c = -2 * t ** 3 + 3 * t ** 2
      const d = t ** 3 - t ** 2
      const x = a * p1[0] + b * m1.x + c * p2[0] + d * m2.x
      const y = a * p1[1] + b * m1.y + c * p2[1] + d * m2.y
      const dx = (6 * t ** 2 - 6 * t) * p1[0] + (3 * t ** 2 - 4 * t + 1) * m1.x
        + (-6 * t ** 2 + 6 * t) * p2[0] + (3 * t ** 2 - 2 * t) * m2.x
      const dy = (6 * t ** 2 - 6 * t) * p1[1] + (3 * t ** 2 - 4 * t + 1) * m1.y
        + (-6 * t ** 2 + 6 * t) * p2[1] + (3 * t ** 2 - 2 * t) * m2.y
      const length = Math.hypot(dx, dy)
      if (length === 0) throw new Error(`A pen tangent vanishes at knot ${i}`)
      const radius = (p1[2] + (p2[2] - p1[2]) * t) / 2
      const normal = {x: -dy / length, y: dx / length}
      left.push({x: x + normal.x * radius, y: y + normal.y * radius})
      right.push({x: x - normal.x * radius, y: y - normal.y * radius})
      tangents.push({x: dx / length, y: dy / length})
    }
  }
  let points: IPosition[] = [...left]
  for (const [position, tangent, sign, side] of [
    [knots.at(-1)!, tangents.at(-1)!, 1, [...right].reverse()],
    [knots[0]!, tangents[0]!, -1, []],
  ] as const) {
    for (let step = 1; step < 8; step += 1) {
      const angle = Math.PI * step / 8
      const radius = position[2] / 2
      points.push({
        x: position[0] + sign * radius * (-tangent.y * Math.cos(angle) + tangent.x * Math.sin(angle)),
        y: position[1] + sign * radius * (tangent.x * Math.cos(angle) + tangent.y * Math.sin(angle)),
      })
    }
    points.push(...side)
  }
  if (boundaryTolerance > 0) {
    function simplify(chain: readonly IPosition[]): IPosition[] {
      const a = chain[0]!
      const b = chain.at(-1)!
      const dx = b.x - a.x
      const dy = b.y - a.y
      const square = dx * dx + dy * dy
      let farthest = boundaryTolerance ** 2
      let split = 0
      for (let i = 1; i < chain.length - 1; i += 1) {
        const point = chain[i]!
        const t = square === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / square))
        const distance = (point.x - a.x - t * dx) ** 2 + (point.y - a.y - t * dy) ** 2
        if (distance > farthest) {
          farthest = distance
          split = i
        }
      }
      return split === 0 ? [a, b] : [...simplify(chain.slice(0, split + 1)).slice(0, -1), ...simplify(chain.slice(split))]
    }
    /** Retain short boundary intervals: quadratic midpoint rounding must not cut across a long bend. */
    const reduced = simplify([...points, points[0]!]).slice(0, -1)
    points = reduced.flatMap((point, i) => {
      const next = reduced[(i + 1) % reduced.length]!
      const count = Math.max(1, Math.ceil(Math.hypot(next.x - point.x, next.y - point.y) / 5))
      return Array.from({length: count}, (_, index) => ({
        x: point.x + (next.x - point.x) * index / count,
        y: point.y + (next.y - point.y) * index / count,
      }))
    })
  }
  const mid = (a: IPosition, b: IPosition): IPosition => ({x: (a.x + b.x) / 2, y: (a.y + b.y) / 2})
  return [
    {...mid(points.at(-1)!, points[0]!), onCurve: true},
    ...points.flatMap((point, index) => [
      {...point, onCurve: false},
      {...mid(point, points[(index + 1) % points.length]!), onCurve: true},
    ]),
  ]
}
