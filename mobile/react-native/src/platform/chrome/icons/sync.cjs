// Run with the Expo scaffold's pinned @resvg/resvg-js dependency installed.
const { readdirSync, readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { Resvg } = require('@resvg/resvg-js')
const { boldSvg } = require('./stroke.cjs')

const catalog = join(__dirname, '../../../../assets/hugeicons')
const render = (svg) => new Resvg(svg, { fitTo: { mode: 'width', value: 96 } }).render().asPng()
for (const folder of readdirSync(catalog).filter((name) => name.endsWith('.imageset')).sort()) {
  const name = folder.replace(/^hugeicons-/, '').replace(/\.imageset$/, '')
  const directory = join(catalog, folder)
  const file = readdirSync(directory).find((entry) => entry.endsWith('.svg'))
  const svg = readFileSync(join(directory, file))
  writeFileSync(join(__dirname, `${name}.png`), render(svg))
  writeFileSync(join(__dirname, 'bold', `${name}.png`), render(boldSvg(svg)))
}
