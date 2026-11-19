import { ApiError, type ApiClient } from '../../core/api.ts'
import { Model } from '../../core/model.ts'
import { AcademySelection, type AcademyContext, type AccountScope } from '../../core/ownership.ts'
import { NETWORK_MESSAGE, type SelectionStore } from './auth.ts'

export type Academy = Readonly<{ id: string; name: string; slug: string; icon: string; role: string }>

export type AcademiesState = { kind: 'loading' } | { kind: 'loaded' } | { kind: 'failed'; message: string }

export type AcademiesDeps = {
  api: Pick<ApiClient, 'get'>
  scope: AccountScope
  selection: SelectionStore
  /** Scope-bound sign-out, e.g. `() => auth.signOutFrom(scope)`. */
  onUnauthenticated: () => void | Promise<void>
  /** True while a voluntary switch would lose unsaved work (a marking draft). */
  hasUnsavedChanges?: () => boolean
  /**
   * The selected academy changed, including to none (suspension, removal, revocation). The UI returns to
   * Sessions, leaves both destination stacks and resets the start flow. Not called on reselection.
   */
  onContextChange?: (context: AcademyContext | null) => void
}

/**
 * The academies the server currently grants and the selected one (port of iOS AcademiesModel). One
 * instance per account scope. Only the newest load commits, and nothing commits after the scope ends.
 */
export class AcademiesController extends Model {
  state: AcademiesState = { kind: 'loading' }
  academies: readonly Academy[] = []
  /** A voluntary switch waiting for Save / Discard / Keep editing. */
  pendingAcademy: Academy | null = null

  private readonly deps: AcademiesDeps
  private readonly selection: AcademySelection
  private generation = 0

  constructor(deps: AcademiesDeps) {
    super()
    this.deps = deps
    this.selection = new AcademySelection(deps.scope)
  }

  /** The selected academy as an ownership token; A → B → A yields a new context. */
  get context(): AcademyContext | null {
    return this.selection.context
  }

  get selected(): Academy | null {
    return this.academies.find((a) => a.id === this.context?.academyId) ?? null
  }

  /** True while `context` is still the selection of the signed-in account that started the work. */
  isCurrent = (context: AcademyContext): boolean => this.selection.isCurrent(context)

  /** Ownership callbacks for academy-scoped features (the Sessions `Ownership` port). */
  readonly ownership = {
    onUnauthenticated: () => this.deps.onUnauthenticated(),
    /** A 403 revalidates academy access: a suspended or removed membership drops that academy. */
    onForbidden: () => this.load(),
  }

  /** Loads, or revalidates, the granted academies. A newer call supersedes any load in flight. */
  async load(): Promise<void> {
    const { scope } = this.deps
    const owner = ++this.generation
    const stale = () => !scope.isActive || owner !== this.generation
    this.state = { kind: 'loading' }
    this.changed()

    let academies: readonly Academy[]
    try {
      academies = await this.deps.api.get('api/v1/academies', { signal: scope.signal, decode: decodeAcademies })
    } catch (error) {
      if (stale()) return
      const kind = error instanceof ApiError ? error.kind : 'network'
      if (kind === 'unauthenticated') return this.deps.onUnauthenticated()
      if (kind === 'forbidden') {
        this.academies = []
        this.setSelection(null)
        this.state = { kind: 'loaded' }
      } else if (kind === 'cancelled') {
        // The owner went away mid-load: keep the last good state without reporting an error.
        if (this.academies.length) this.state = { kind: 'loaded' }
      } else {
        // Not evidence of revocation: keep the granted list; the next request revalidates.
        const message = kind === 'network' ? NETWORK_MESSAGE : (error as Error).message
        this.state = this.academies.length ? { kind: 'loaded' } : { kind: 'failed', message }
      }
      return this.changed()
    }

    // The remembered selection is read now, not when the request started.
    let remembered: string | null = null
    try {
      remembered = await this.deps.selection.read()
    } catch {}
    if (stale()) return

    this.academies = academies
    // Keep a still-granted selection, else the remembered one, else the first. Never restore from cache.
    const granted = (id: string | null | undefined) => !!id && academies.some((a) => a.id === id)
    const current = this.context?.academyId
    this.setSelection(granted(current) ? current! : granted(remembered) ? remembered : (academies[0]?.id ?? null))
    this.state = { kind: 'loaded' }
    this.changed()
  }

  /**
   * Scene became active: revalidate access. Resolves true when the selection is unchanged, so the
   * caller refreshes its academy-scoped lists itself (a changed context already reset them).
   */
  async revalidate(): Promise<boolean> {
    const before = this.context
    await this.load()
    return this.context === before
  }

  /** A user's academy choice. Switching away from unsaved work asks first; reselecting changes nothing. */
  choose(academyId: string): 'selected' | 'confirm' {
    const academy = this.academies.find((a) => a.id === academyId)
    if (academy && academyId !== this.context?.academyId && this.deps.hasUnsavedChanges?.()) {
      this.pendingAcademy = academy
      this.changed()
      return 'confirm'
    }
    this.select(academyId)
    return 'selected'
  }

  /** After the draft was saved successfully or discarded. A no-op if access to it was lost meanwhile. */
  confirmPendingSwitch(): void {
    const pending = this.pendingAcademy
    this.dismissPendingSwitch()
    if (pending) this.select(pending.id)
  }

  /** Keep editing, or the dialog was dismissed. */
  dismissPendingSwitch(): void {
    if (!this.pendingAcademy) return
    this.pendingAcademy = null
    this.changed()
  }

  select(academyId: string): void {
    if (!this.deps.scope.isActive || !this.academies.some((a) => a.id === academyId)) return
    this.setSelection(academyId)
    this.changed()
  }

  private setSelection(academyId: string | null): void {
    const before = this.context
    const context = this.selection.select(academyId)
    // Called synchronously so a later sign-out's clear() is issued after it; the store keeps call order.
    if (academyId !== null) {
      try {
        void Promise.resolve(this.deps.selection.write(academyId)).catch(() => {})
      } catch {}
    }
    if (context === before) return
    // A pending switch belongs to the screens the context change closes.
    this.pendingAcademy = null
    this.deps.onContextChange?.(context)
  }
}

/** Validates `{ academies: Academy[] }`; anything else is an unreadable response. */
export function decodeAcademies(json: unknown): readonly Academy[] {
  const list = (json as { academies?: unknown } | null)?.academies
  if (!Array.isArray(list)) throw new TypeError('academies')
  return list.map((item: unknown) => {
    const a = item as Record<string, unknown> | null
    const fields = ['id', 'name', 'slug', 'icon', 'role'] as const
    if (!a || fields.some((f) => typeof a[f] !== 'string')) throw new TypeError('academy')
    return Object.freeze({ id: a.id, name: a.name, slug: a.slug, icon: a.icon, role: a.role } as Academy)
  })
}
