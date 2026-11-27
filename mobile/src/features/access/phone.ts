/** Mirrors web/src/lib/phone.ts (and iOS PhoneNumber): Egyptian mobile numbers normalized to +201XXXXXXXXX. */
export function normalizeEgyptianPhone(value: string): string | null {
  let national = value.trim().replace(/[\s().-]/g, '')
  if (national.startsWith('0020')) national = national.slice(4)
  else if (national.startsWith('+20')) national = national.slice(3)
  else if (national.startsWith('20')) national = national.slice(2)
  if (national.startsWith('0')) national = national.slice(1)
  const normalized = `+20${national}`
  return /^\+201[0125]\d{8}$/.test(normalized) ? normalized : null
}
