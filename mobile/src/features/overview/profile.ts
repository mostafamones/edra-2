import { ApiError, type ApiClient } from '../../core/api.ts'
import { Model } from '../../core/model.ts'
import type { AccountScope } from '../../core/ownership.ts'

/** The signed-in account's own display name and picture (`GET /api/v1/me`); either may be null. */
export type Profile = Readonly<{ name: string | null; avatarUrl: string | null; avatarExpiresAt: number | null }>

/** `unsupported`: the server has no `/api/v1/me` (404, an older deployment); not an empty profile. */
export type ProfileStatus = 'loading' | 'loaded' | 'unsupported' | 'failed'

export type ProfileDeps = Readonly<{
  api: Pick<ApiClient, 'get'>
  scope: AccountScope
  /** Scope-bound sign-out. */
  onUnauthenticated: () => void | Promise<void>
  now?: () => number
}>

/**
 * One account scope's profile. Only the newest load commits and nothing commits after the scope ends; a failed
 * refresh keeps the last good name. Reload on foreground to renew the one-hour picture URL.
 */
export class ProfileModel extends Model {
  status: ProfileStatus = 'loading'
  private profile: Profile | null = null
  private readonly deps: ProfileDeps
  private generation = 0

  constructor(deps: ProfileDeps) {
    super()
    this.deps = deps
  }

  get name(): string | null {
    return this.profile?.name ?? null
  }

  /** The picture URL while it is still valid; null means show the fallback icon. */
  get avatarUrl(): string | null {
    const { avatarUrl, avatarExpiresAt } = this.profile ?? {}
    return avatarUrl && avatarExpiresAt && avatarExpiresAt > (this.deps.now ?? Date.now)() ? avatarUrl : null
  }

  async load(): Promise<void> {
    const { scope } = this.deps
    const owner = ++this.generation
    const stale = () => !scope.isActive || owner !== this.generation
    try {
      const profile = await this.deps.api.get('api/v1/me', { signal: scope.signal, structuredErrors: true, decode: decodeProfile })
      if (stale()) return
      this.profile = profile
      this.status = 'loaded'
    } catch (error) {
      if (stale()) return
      const kind = error instanceof ApiError ? error.kind : 'network'
      if (kind === 'cancelled') return
      if (kind === 'unauthenticated') return void this.deps.onUnauthenticated()
      if (error instanceof ApiError && error.failure?.status === 404) {
        this.profile = null
        this.status = 'unsupported'
      } else if (!this.profile) this.status = 'failed'
    }
    this.changed()
  }
}

/** Validates the `Me` schema; anything else is an unreadable response. */
export function decodeProfile(json: unknown): Profile {
  const me = (json ?? {}) as Record<string, unknown>
  const nullable = (key: string) => {
    const value = me[key]
    if (value !== null && typeof value !== 'string') throw new TypeError(key)
    return value
  }
  if (typeof me.user_id !== 'string') throw new TypeError('user_id')
  const name = nullable('name')?.trim() || null
  const avatarUrl = nullable('avatar_url')
  const expires = Date.parse(nullable('avatar_expires_at') ?? '')
  // A URL without a readable expiry is treated as no picture rather than trusted indefinitely.
  return Object.freeze({ name, avatarUrl: Number.isFinite(expires) ? avatarUrl : null, avatarExpiresAt: Number.isFinite(expires) ? expires : null })
}
