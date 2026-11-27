/** Exact two-decimal scores as integer hundredths; never binary floating point. */

/** "7.5" → 750. Accepts Arabic-Indic digits and a comma or Arabic decimal separator from the keypad. */
export function hundredths(text: string): number | null {
  let ascii = ''
  for (const char of text.replace(/^[\p{Zs}\t]+|[\p{Zs}\t]+$/gu, '')) {
    const code = char.codePointAt(0)!
    if (code >= 0x30 && code <= 0x39) ascii += char
    else if (code >= 0x660 && code <= 0x669) ascii += String.fromCharCode(code - 0x660 + 0x30)
    else if (code >= 0x6f0 && code <= 0x6f9) ascii += String.fromCharCode(code - 0x6f0 + 0x30)
    else if (code === 0x2e || code === 0x2c || code === 0x66b) ascii += '.'
    else return null
  }
  const pieces = ascii.split('.')
  if (pieces.length < 1 || pieces.length > 2) return null
  const whole = pieces[0]!
  const fraction = pieces[1] ?? ''
  if (whole === '' && pieces.length !== 2) return null
  if (whole.length > 7 || fraction.length > 2) return null
  if (pieces.length === 2 && whole === '' && fraction === '') return null
  return Number(whole || '0') * 100 + Number(fraction.padEnd(2, '0'))
}

/** 750 → "7.5", 1000 → "10", 725 → "7.25". */
export function formatScore(value: number): string {
  const whole = Math.trunc(value / 100)
  const fraction = value % 100
  if (fraction === 0) return `${whole}`
  return fraction % 10 === 0 ? `${whole}.${fraction / 10}` : `${whole}.${fraction < 10 ? '0' : ''}${fraction}`
}

/** A server decimal for display ("10.00" → "10"); "–" when absent. */
export function displayScore(text: string | null | undefined): string {
  if (text == null) return '–'
  const value = hundredths(text)
  return value === null ? text : formatScore(value)
}
