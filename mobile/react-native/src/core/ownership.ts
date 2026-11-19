/**
 * Ownership tokens for asynchronous work. Cancellation is best effort; correctness comes from checking
 * these after every await, before committing state, navigating or signing out.
 */

/**
 * One signed-in account's lifetime. Ended (sign-out, or another account signing in) before state is
 * cleared; work started under it must not commit afterwards. `signal` aborts the scope's requests.
 */
export class AccountScope {
  private readonly controller = new AbortController()

  get isActive(): boolean {
    return !this.controller.signal.aborted
  }

  get signal(): AbortSignal {
    return this.controller.signal
  }

  end(): void {
    this.controller.abort()
  }
}

/** The selected academy plus a selection epoch: A → B → A yields a new context. */
export type AcademyContext = Readonly<{ academyId: string; epoch: number }>

/** The account's academy selection. Only a change of academy starts a new epoch. */
export class AcademySelection {
  private readonly scope: AccountScope
  private epoch = 0
  private current: AcademyContext | null = null

  constructor(scope: AccountScope) {
    this.scope = scope
  }

  get context(): AcademyContext | null {
    return this.current
  }

  select(academyId: string | null): AcademyContext | null {
    if (academyId !== (this.current?.academyId ?? null)) {
      this.epoch += 1
      this.current = academyId === null ? null : Object.freeze({ academyId, epoch: this.epoch })
    }
    return this.current
  }

  /** True while `context` is still the selection of the signed-in account that started the work. */
  isCurrent(context: AcademyContext): boolean {
    return (
      this.scope.isActive &&
      this.current !== null &&
      this.current.academyId === context.academyId &&
      this.current.epoch === context.epoch
    )
  }
}

export type RequestTicket = Readonly<{ signal: AbortSignal; isCurrent: () => boolean }>

/**
 * Newest-request ownership for one load slot: only the latest `begin()` may commit. Older requests keep
 * running (as on iOS) but can no longer commit; `cancel()` aborts every outstanding request when the
 * owner goes away (context change, screen closed).
 */
export class LatestRequest {
  private generation = 0
  private controller = new AbortController()

  begin(): RequestTicket {
    this.generation += 1
    const owner = this.generation
    const signal = this.controller.signal
    return { signal, isCurrent: () => owner === this.generation && !signal.aborted }
  }

  cancel(): void {
    this.generation += 1
    this.controller.abort()
    this.controller = new AbortController()
  }
}
