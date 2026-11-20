// Run: node --test mobile/react-native/src/navigation/*.test.ts (Node ≥ 22.18, no dependencies).
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { BAR_ICON_POINTS, pointSized } from './barIcon.ts'

const catalog = new URL('../platform/chrome/icons/', import.meta.url)
const nativeCatalog = new URL('../../assets/hugeicons/', import.meta.url)

test('a 96 px @1x catalog icon becomes a 24 pt bar image at 4x', () => {
  assert.deepEqual(pointSized({ uri: 'icon', width: 96, height: 96, scale: 1 }),
    { uri: 'icon', width: 24, height: 24, scale: 4 })
  assert.deepEqual(pointSized({ uri: 'icon', width: 24, height: 24, scale: 3 }),
    { uri: 'icon', width: 24, height: 24, scale: 3 })
})

test('every catalog icon is square and has enough pixels for a 24 pt bar item at 3x', () => {
  const files = readdirSync(catalog).filter((name) => name.endsWith('.png'))
  assert.ok(files.length > 0)
  for (const file of files) {
    const png = readFileSync(new URL(file, catalog))
    // IHDR: width and height follow the 8-byte signature and the chunk length/type.
    const width = png.readUInt32BE(16)
    const height = png.readUInt32BE(20)
    assert.equal(width, height, file)
    const sized = pointSized({ uri: file, width, height, scale: 1 })
    assert.equal(sized.width, BAR_ICON_POINTS, file)
    assert.ok(sized.scale >= 3, `${file}: ${width} px is too small for ${BAR_ICON_POINTS} pt at 3x`)
  }
})

test('native Hugeicons and React Native PNGs come from the same catalog', () => {
  const nativeNames = readdirSync(nativeCatalog)
    .filter((name) => name.startsWith('hugeicons-') && name.endsWith('.imageset'))
    .map((name) => name.slice('hugeicons-'.length, -'.imageset'.length))
    .sort()
  const reactNativeNames = readdirSync(catalog)
    .filter((name) => name.endsWith('.png'))
    .map((name) => name.slice(0, -'.png'.length))
    .sort()

  assert.ok(nativeNames.length > 0)
  assert.deepEqual(reactNativeNames, nativeNames)
})

test('the bundled AccentColor matches the Swift app asset', () => {
  const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
  assert.deepEqual(read('../../assets/AccentColor.colorset/Contents.json'),
    read('../../../EdraInstructor/Resources/Assets.xcassets/AccentColor.colorset/Contents.json'))
})
