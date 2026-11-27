/** SwiftUI's Hugeicons imagesets are 24 pt vectors; native bar items match that point size. */
export const BAR_ICON_POINTS = 24

type ResolvedAsset = { uri: string; width?: number; height?: number; scale: number }

/**
 * UITabBarItem and UIBarButtonItem size an image by its points; react-native-screens loads the
 * source at its declared size and scale. The feature catalog is 96 px at 1x (96 pt), so declare
 * the bar size with the scale its pixels imply: 24 pt at 4x. Android's bottom navigation uses
 * only the URI and its own icon box.
 */
export function pointSized({ uri, width = BAR_ICON_POINTS, height = width, scale }: ResolvedAsset, points = BAR_ICON_POINTS) {
  return { uri, width: points, height: (points * height) / width, scale: (width * scale) / points }
}
