import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const input = new URL('../feedback/images/teskeid-final-logo-reference.png', import.meta.url)
const output = new URL('../components/teskeid/teskeidLogoCodexPaths.ts', import.meta.url)

const { data, info } = await sharp(fileURLToPath(input))
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true })
const { width, height, channels } = info

const GREEN = [33, 79, 40]
const CREAM = [250, 246, 238]

function distanceSquared(r, g, b, target) {
  return (r - target[0]) ** 2 + (g - target[1]) ** 2 + (b - target[2]) ** 2
}

const greenMask = new Uint8Array(width * height)
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const offset = (y * width + x) * channels
    const r = data[offset]
    const g = data[offset + 1]
    const b = data[offset + 2]
    greenMask[y * width + x] =
      distanceSquared(r, g, b, GREEN) < distanceSquared(r, g, b, CREAM) ? 1 : 0
  }
}

function enclosedCreamMask(mask) {
  const result = new Uint8Array(mask.length)
  const seen = new Uint8Array(mask.length)
  const queue = new Int32Array(mask.length)
  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]

  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] || seen[start]) continue

    let head = 0
    let tail = 0
    let touchesBorder = false
    let minX = width
    let maxX = 0
    let minY = height
    let maxY = 0
    const pixels = []

    queue[tail++] = start
    seen[start] = 1

    while (head < tail) {
      const index = queue[head++]
      const x = index % width
      const y = Math.floor(index / width)
      pixels.push(index)
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
      touchesBorder ||= x === 0 || y === 0 || x === width - 1 || y === height - 1

      for (const [dx, dy] of directions) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        const next = ny * width + nx
        if (!mask[next] && !seen[next]) {
          seen[next] = 1
          queue[tail++] = next
        }
      }
    }

    const isCentralDetail =
      !touchesBorder &&
      pixels.length >= 20 &&
      minX >= 350 &&
      maxX <= 850 &&
      minY >= 100 &&
      maxY <= 700

    if (isCentralDetail) {
      for (const pixel of pixels) result[pixel] = 1
    }
  }

  return result
}

function key(x, y) {
  return `${x},${y}`
}

function directionIndex(from, to) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (dx === 1) return 0
  if (dy === 1) return 1
  if (dx === -1) return 2
  return 3
}

function traceLoops(mask) {
  const edges = new Map()

  function addEdge(x1, y1, x2, y2) {
    const start = key(x1, y1)
    const list = edges.get(start) ?? []
    list.push({ x: x2, y: y2 })
    edges.set(start, list)
  }

  function active(x, y) {
    return x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!active(x, y)) continue
      if (!active(x, y - 1)) addEdge(x, y, x + 1, y)
      if (!active(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1)
      if (!active(x, y + 1)) addEdge(x + 1, y + 1, x, y + 1)
      if (!active(x - 1, y)) addEdge(x, y + 1, x, y)
    }
  }

  const loops = []

  while (edges.size > 0) {
    const [startKey, initialEnds] = edges.entries().next().value
    const [startX, startY] = startKey.split(',').map(Number)
    const start = { x: startX, y: startY }
    const first = initialEnds.pop()
    if (initialEnds.length === 0) edges.delete(startKey)

    const loop = [start, first]
    let previous = start
    let current = first

    while (current.x !== start.x || current.y !== start.y) {
      const currentKey = key(current.x, current.y)
      const candidates = edges.get(currentKey)
      if (!candidates?.length) break

      const incoming = directionIndex(previous, current)
      const preferences = [(incoming + 1) % 4, incoming, (incoming + 3) % 4, (incoming + 2) % 4]
      let selectedIndex = 0

      for (const preferred of preferences) {
        const found = candidates.findIndex((candidate) => directionIndex(current, candidate) === preferred)
        if (found !== -1) {
          selectedIndex = found
          break
        }
      }

      const [next] = candidates.splice(selectedIndex, 1)
      if (candidates.length === 0) edges.delete(currentKey)
      previous = current
      current = next
      loop.push(current)
    }

    if (loop.length > 8 && current.x === start.x && current.y === start.y) loops.push(loop)
  }

  return loops
}

function perpendicularDistance(point, start, end) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y)
  return Math.abs(dy * point.x - dx * point.y + end.x * start.y - end.y * start.x) /
    Math.hypot(dx, dy)
}

function rdp(points, epsilon) {
  if (points.length <= 2) return points
  let maxDistance = 0
  let index = 0

  for (let i = 1; i < points.length - 1; i += 1) {
    const distance = perpendicularDistance(points[i], points[0], points[points.length - 1])
    if (distance > maxDistance) {
      maxDistance = distance
      index = i
    }
  }

  if (maxDistance <= epsilon) return [points[0], points[points.length - 1]]
  const left = rdp(points.slice(0, index + 1), epsilon)
  const right = rdp(points.slice(index), epsilon)
  return [...left.slice(0, -1), ...right]
}

function simplifyClosed(loop, epsilon) {
  const points = loop.slice(0, -1)
  let leftmost = 0
  for (let i = 1; i < points.length; i += 1) {
    if (points[i].x < points[leftmost].x) leftmost = i
  }

  const rotated = [...points.slice(leftmost), ...points.slice(0, leftmost)]
  let farthest = 1
  let maxDistance = 0
  for (let i = 1; i < rotated.length; i += 1) {
    const distance = Math.hypot(
      rotated[i].x - rotated[0].x,
      rotated[i].y - rotated[0].y,
    )
    if (distance > maxDistance) {
      maxDistance = distance
      farthest = i
    }
  }

  const first = rdp(rotated.slice(0, farthest + 1), epsilon)
  const second = rdp([...rotated.slice(farthest), rotated[0]], epsilon)
  return [...first.slice(0, -1), ...second.slice(0, -1)]
}

function pathData(mask, epsilon) {
  return traceLoops(mask)
    .map((loop) => simplifyClosed(loop, epsilon))
    .filter((loop) => loop.length >= 3)
    .map(loopToPath)
    .join('')
}

function rounded(value) {
  return Number(value.toFixed(1))
}

function loopToPath(loop) {
  const xs = loop.map((point) => point.x)
  const ys = loop.map((point) => point.y)
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))

  if (span < 100 || loop.length < 6) {
    return `M${loop.map((point) => `${point.x} ${point.y}`).join('L')}Z`
  }

  const count = loop.length
  let path = `M${loop[0].x} ${loop[0].y}`
  for (let index = 0; index < count; index += 1) {
    const p0 = loop[(index - 1 + count) % count]
    const p1 = loop[index]
    const p2 = loop[(index + 1) % count]
    const p3 = loop[(index + 2) % count]
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    path += `C${rounded(c1x)} ${rounded(c1y)} ${rounded(c2x)} ${rounded(c2y)} ${p2.x} ${p2.y}`
  }
  return `${path}Z`
}

const greenPath = pathData(greenMask, 1.6)
const creamDetailsPath = pathData(enclosedCreamMask(greenMask), 1.2)

const source = `// Generated from feedback/images/teskeid-final-logo-reference.png.
// Run: node scripts/trace-teskeid-logo.mjs
export const TESKEID_CODEX_VIEWBOX = '0 0 ${width} ${height}'
export const TESKEID_CODEX_ASPECT_RATIO = ${width} / ${height}
export const TESKEID_CODEX_GREEN_PATH = ${JSON.stringify(greenPath)}
export const TESKEID_CODEX_CREAM_DETAILS_PATH = ${JSON.stringify(creamDetailsPath)}
`

await fs.writeFile(output, source)
console.log(`Generated ${output.pathname}`)
console.log(`Green path: ${greenPath.length} chars`)
console.log(`Cream details path: ${creamDetailsPath.length} chars`)
