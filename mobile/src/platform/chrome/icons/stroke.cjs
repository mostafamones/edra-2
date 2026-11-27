// Hugeicons' stroke weights: the default 1.5, and the heavier stroke shown while iOS Bold Text is on.
const STROKE = '1.5'
const BOLD_STROKE = '2'

/** The same Hugeicon geometry redrawn at the bold stroke width. */
function boldSvg(svg) {
  const text = String(svg)
  const bold = text.replaceAll(`stroke-width="${STROKE}"`, `stroke-width="${BOLD_STROKE}"`)
  if (bold === text) throw new Error(`Hugeicon without stroke-width="${STROKE}"`)
  return bold
}

module.exports = { STROKE, BOLD_STROKE, boldSvg }
