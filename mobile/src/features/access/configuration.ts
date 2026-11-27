/**
 * Android/default configuration check, ported from iOS `AppConfiguration.load` (same rules and messages).
 * iOS reads its Info.plist through the native module instead. Only public values belong here.
 */
export type Configuration = Readonly<{ supabaseUrl: string; publishableKey: string; apiOrigin: string }>

export type ConfigurationResult = { configuration: Configuration } | { issues: string[] }

/** `null`: every origin must be HTTPS (release). Otherwise plain HTTP only to these exact API hosts. */
export type DevelopmentHTTPHosts = readonly string[] | null

export const SUPABASE_URL_KEY = 'EXPO_PUBLIC_EDRA_SUPABASE_URL'
export const PUBLISHABLE_KEY_KEY = 'EXPO_PUBLIC_EDRA_SUPABASE_PUBLISHABLE_KEY'
export const API_ORIGIN_KEY = 'EXPO_PUBLIC_EDRA_API_ORIGIN'

// RN's URL class lacks most accessors, so parse the only shape accepted: http(s)://host[:port][/path].
const URL_PATTERN = /^(https?):\/\/([^/?#:@\s]+)(?::\d+)?(?:[/?#]\S*)?$/i

export function loadConfiguration(
  values: Readonly<Record<string, string | undefined>>,
  httpHosts: DevelopmentHTTPHosts,
): ConfigurationResult {
  const issues: string[] = []

  const string = (key: string) => {
    const value = values[key]?.trim()
    if (!value) issues.push(`${key} is not set`)
    return value || null
  }

  const url = (key: string, allowsHTTP = false) => {
    const raw = string(key)
    if (!raw) return null
    const match = URL_PATTERN.exec(raw)
    if (!match) {
      issues.push(`${key} is not a valid URL`)
      return null
    }
    const secure = match[1]!.toLowerCase() === 'https'
    const host = match[2]!.toLowerCase()
    if (!secure && !(allowsHTTP && httpHosts?.some((h) => h.toLowerCase() === host))) {
      issues.push(`${key} must use https in this build`)
      return null
    }
    return raw
  }

  const supabaseUrl = url(SUPABASE_URL_KEY)
  const publishableKey = string(PUBLISHABLE_KEY_KEY)
  const apiOrigin = url(API_ORIGIN_KEY, true)
  if (issues.length || !supabaseUrl || !publishableKey || !apiOrigin) return { issues }
  return { configuration: { supabaseUrl, publishableKey, apiOrigin } }
}
