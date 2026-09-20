import type {Contour} from './glyph.ts'
import {penContour} from './pen.ts'
import type {PenKnot} from './pen.ts'

export interface IGlyphWikiSource {
  readonly source_sha256: string
  readonly target_count: number
  readonly mainland_roots: number
  readonly canonical_roots: number
  readonly roots: Readonly<Record<string, string>>
  readonly glyphs: Readonly<Record<string, string>>
}

type Position = readonly [x: number, y: number]

export interface ISkeletonStroke {
  readonly kind: number
  readonly head: number
  readonly tail: number
  readonly points: readonly Position[]
}

/** Decode KAGE skeletons, including pinned references and piecewise component stretching. */
export function createSkeletonResolver(source: IGlyphWikiSource): (name: string) => readonly ISkeletonStroke[] {
  const cache = new Map<string, readonly ISkeletonStroke[]>()
  const roots = new Set(Object.values(source.roots))
  function resolve(name: string, active: readonly string[]): readonly ISkeletonStroke[] {
    if (active.includes(name) || active.length > 64) throw new Error(`Cyclic or excessive component nesting at ${name}`)
    const cached = cache.get(name)
    if (cached !== undefined) return cached
    const data = source.glyphs[name]
    if (data === undefined) throw new Error(`Missing component ${name}`)
    const result: ISkeletonStroke[] = []
    for (const row of data.split('$')) {
      const fields = row.split(':')
      const kind = Number(fields[0])
      if (kind === 0) {
        if (Number(fields[1]) !== 0) throw new Error(`Unsupported drawing transform in ${name}: ${row}`)
        continue
      }
      if (kind !== 99) {
        const base = kind % 100
        const count = base === 1 ? 2 : [2, 3, 4].includes(base) ? 3 : [6, 7].includes(base) ? 4 : 0
        if (count === 0) throw new Error(`Unsupported stroke ${kind} in ${name}`)
        const head = Number(fields[1])
        const tail = Number(fields[2])
        const points: Position[] = Array.from({length: count}, (_, i) => [Number(fields[3 + i * 2]), Number(fields[4 + i * 2])])
        if (![head, tail, ...points.flat()].every(Number.isFinite)) throw new Error(`Nonfinite stroke in ${name}`)
        result.push({kind: base, head: ((head % 100) + 100) % 100, tail: ((tail % 100) + 100) % 100, points})
        continue
      }
      const child = resolve(fields[7]!, [...active, name])
      const [x1, y1, x2, y2] = fields.slice(3, 7).map(Number)
      const stretchX = Number(fields[1])
      const stretchY = Number(fields[2])
      const sourceX = stretchX > 100 ? Number(fields[9] ?? 0) : 0
      const sourceY = stretchX > 100 ? Number(fields[10] ?? 0) : 0
      const destinationX = stretchX > 100 ? stretchX - 200 : stretchX
      if (![x1, y1, x2, y2, stretchX, stretchY, sourceX, sourceY].every(value => value !== undefined && Number.isFinite(value))) {
        throw new Error(`Invalid component placement in ${name}`)
      }
      const points = child.flatMap(stroke => stroke.points)
      const minX = Math.min(200, ...points.map(point => point[0]))
      const maxX = Math.max(0, ...points.map(point => point[0]))
      const minY = Math.min(200, ...points.map(point => point[1]))
      const maxY = Math.max(0, ...points.map(point => point[1]))
      const warped = stretchX !== 0 || stretchY !== 0
      function stretch(value: number, low: number, high: number, from: number, to: number): number {
        const pivot = 100 + from
        const destination = 100 + to
        const left = value < pivot
        const start = left ? low : pivot
        const end = left ? pivot : high
        const newStart = left ? low : destination
        const newEnd = left ? destination : high
        if (start === end) {
          if (from === to) return Math.floor(value)
          throw new Error(`Degenerate component stretch in ${name}`)
        }
        return Math.floor(newStart + (value - start) * (newEnd - newStart) / (end - start))
      }
      result.push(...child.map(stroke => ({...stroke, points: stroke.points.map(([x, y]): Position => [
        x1! + (warped ? stretch(x, minX, maxX, sourceX, destinationX) : x) * (x2! - x1!) / 200,
        y1! + (warped ? stretch(y, minY, maxY, sourceY, stretchY) : y) * (y2! - y1!) / 200,
      ])})))
    }
    if (!roots.has(name)) cache.set(name, result)
    return result
  }
  return name => resolve(name, [])
}

function interpolate(a: Position, b: Position, fraction: number): Position {
  return [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction]
}

/** Sample source geometry before applying the handwriting pressure and terminal profiles. */
export function strokeCenterline(stroke: ISkeletonStroke): readonly Position[] {
  const p = stroke.points
  const first = p[0]!
  const second = p[1]!
  if (stroke.kind === 1) return Array.from({length: 7}, (_, i) => interpolate(first, second, i / 6))
  if (stroke.kind === 2 || stroke.kind === 6) {
    return Array.from({length: 13}, (_, i) => {
      const t = i / 12
      const a = interpolate(first, second, t)
      const b = interpolate(second, p[2]!, t)
      if (stroke.kind === 2) return interpolate(a, b, t)
      const c = interpolate(p[2]!, p[3]!, t)
      return interpolate(interpolate(a, b, t), interpolate(b, c, t), t)
    })
  }
  if (stroke.kind === 7) {
    return [
      ...Array.from({length: 5}, (_, i) => interpolate(first, second, i / 4)),
      ...Array.from({length: 10}, (_, i) => {
        const t = (i + 1) / 10
        return interpolate(interpolate(second, p[2]!, t), interpolate(p[2]!, p[3]!, t), t)
      }),
    ]
  }
  if (stroke.kind !== 3 && stroke.kind !== 4) throw new Error(`No centerline for stroke ${stroke.kind}`)
  const third = p[2]!
  const before = Math.hypot(second[0] - first[0], second[1] - first[1])
  const after = Math.hypot(third[0] - second[0], third[1] - second[1])
  const radius = Math.min(stroke.kind === 4 ? 24 : 7, before * 0.3, after * 0.3)
  if (before === 0 || after === 0) return [first, third]
  const entry = interpolate(second, first, radius / before)
  const exit = interpolate(second, third, radius / after)
  return [
    ...Array.from({length: 5}, (_, i) => interpolate(first, entry, i / 4)),
    ...Array.from({length: 6}, (_, i) => {
      const t = (i + 1) / 6
      return interpolate(interpolate(entry, second, t), interpolate(second, exit, t), t)
    }),
    ...Array.from({length: 5}, (_, i) => interpolate(exit, third, (i + 1) / 5)),
  ]
}

/** Yono's own pen renderer: rising horizontals, pressure changes, open counters and restrained hooks. */
export function skeletonContours(strokes: readonly ISkeletonStroke[]): readonly Contour[] {
  if (strokes.length === 0) throw new Error('An ideograph cannot have an empty skeleton')
  const baseWidth = 4.8 * Math.min(1, Math.sqrt(17 / strokes.length))
  const contours = strokes.map(stroke => {
    const sampled = strokeCenterline(stroke)
    const points = sampled.filter((point, i) => i === 0 || Math.hypot(point[0] - sampled[i - 1]![0], point[1] - sampled[i - 1]![1]) > 0.0001)
    if (points.length < 2) throw new Error('A skeleton stroke has no extent')
    const last = points.at(-1)!
    if (stroke.tail === 4) points.push([last[0] - 10, last[1] - 5])
    if (stroke.tail === 5) points.push([last[0] + 2, last[1] - 12])
    const distances = [0]
    for (let i = 1; i < points.length; i += 1) {
      distances.push(distances[i - 1]! + Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]))
    }
    const length = distances.at(-1)!
    const startWidth = stroke.head === 7 ? 0.30 : 0.62
    const endWidth = [4, 5, 7, 8].includes(stroke.tail) ? 0.14 : stroke.tail === 0 ? 0.48 : 0.65
    const knots: PenKnot[] = points.map(([x, y], i) => {
      const t = distances[i]! / length
      const body = 0.84 + 0.26 * Math.sin(Math.PI * t)
      const entry = startWidth + (body - startWidth) * Math.min(1, t / 0.20)
      const pressure = endWidth + (entry - endWidth) * Math.min(1, (1 - t) / 0.18)
      const tiltX = x / 2 + (100 - y) * 0.012
      const tiltY = y / 2 - (x - 100) * 0.042
      return [tiltX, tiltY, Math.max(0.35, baseWidth * pressure)]
    })
    return penContour(knots, 0.06)
  })
  const points = contours.flat()
  const minX = Math.min(...points.map(point => point.x))
  const maxX = Math.max(...points.map(point => point.x))
  const minY = Math.min(...points.map(point => point.y))
  const maxY = Math.max(...points.map(point => point.y))
  const scale = Math.min(1, 94 / (maxX - minX), 94 / (maxY - minY))
  const left = 50 + (minX - 50) * scale
  const right = 50 + (maxX - 50) * scale
  const top = 50 + (minY - 50) * scale
  const bottom = 50 + (maxY - 50) * scale
  const dx = left < 3 ? 3 - left : right > 97 ? 97 - right : 0
  const dy = top < 3 ? 3 - top : bottom > 97 ? 97 - bottom : 0
  return contours.map(contour => contour.map(point => ({...point,
    x: 50 + (point.x - 50) * scale + dx,
    y: 50 + (point.y - 50) * scale + dy,
  })))
}
