// Run with the Expo scaffold's pinned @resvg/resvg-js dependency installed.
const { readdirSync, readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { Resvg } = require('@resvg/resvg-js')

const catalog = join(__dirname, '../../../../../EdraInstructor/Resources/Assets.xcassets/Icons')
for (const folder of readdirSync(catalog).filter((name) => name.endsWith('.imageset')).sort()) {
  const name = folder.replace(/^hugeicons-/, '').replace(/\.imageset$/, '')
  const directory = join(catalog, folder)
  const file = readdirSync(directory).find((entry) => entry.endsWith('.svg'))
  const svg = readFileSync(join(directory, file))
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 96 } }).render().asPng()
  writeFileSync(join(__dirname, `${name}.png`), png)
}
