import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = path.join(root, 'components', 'teskeid', 'teskeidLogoPaths.ts')
const outputDir = path.join(root, 'public', 'favicon-options')
const appIconPath = path.join(root, 'app', 'icon.svg')
const source = await fs.readFile(sourcePath, 'utf8')

function readExport(name) {
  const match = source.match(new RegExp(`export const ${name} = (.+)`))
  if (!match) throw new Error(`Missing ${name} in ${sourcePath}`)
  return JSON.parse(match[1])
}

const greenPath = readExport('TESKEID_GREEN_PATH')
const creamPath = readExport('TESKEID_CREAM_DETAILS_PATH')
const green = '#245a31'
const cream = '#fbf8f1'

function svg({ viewBox, background = cream, greenContent = true, creamContent = true }) {
  const [x, y, width, height] = viewBox.split(' ').map(Number)

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="Teskeið">
  <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${background}"/>
  ${greenContent ? `<path d="${greenPath}" fill="${green}" fill-rule="evenodd"/>` : ''}
  ${creamContent ? `<path d="${creamPath}" fill="${cream}" fill-rule="evenodd"/>` : ''}
</svg>
`
}

const faceBadge = svg({
  viewBox: '400 135 420 420',
})

const options = {
  'full-badge.svg': svg({
    viewBox: '0 0 1200 1223',
  }),
  'face-badge.svg': faceBadge,
  'cap-mark.svg': svg({
    viewBox: '450 125 325 250',
  }),
  'glasses-smile.svg': svg({
    viewBox: '445 365 330 215',
    background: green,
    greenContent: false,
  }),
}

await fs.mkdir(outputDir, { recursive: true })
await Promise.all(
  Object.entries(options).map(([filename, content]) =>
    fs.writeFile(path.join(outputDir, filename), content),
  ),
)

await fs.writeFile(appIconPath, faceBadge)
await Promise.all(
  [192, 512].map((size) =>
    sharp(Buffer.from(faceBadge))
      .resize(size, size)
      .png()
      .toFile(path.join(root, 'public', `icon-${size}.png`)),
  ),
)

console.log(`Generated ${Object.keys(options).length} favicon options in ${outputDir}`)
console.log('Promoted face-badge.svg to app/icon.svg, icon-192.png and icon-512.png')
