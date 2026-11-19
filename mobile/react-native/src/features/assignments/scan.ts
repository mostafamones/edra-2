/**
 * Camera identification for one assignment: one recognized code opens that student's marking sheet.
 * A handled code stays ignored until it leaves view. Owned by the workspace (not the camera view), so
 * suppression survives the camera being torn down and recreated. Decoding itself is the native module's.
 */
export class ScanFilter {
  private _suppressed = new Set<string>()

  /** Codes ignored until they leave the camera view. Kept while a sheet covers the camera. */
  get suppressed(): ReadonlySet<string> {
    return this._suppressed
  }

  /** Called with every code currently visible (empty when none). Returns the code to look up, if any. */
  recognized(codes: readonly string[], paused: boolean): string | null {
    const visible = new Set(codes.map((c) => c.trim()).filter((c) => c !== '' && Array.from(c).length <= 40))
    this._suppressed = new Set([...this._suppressed].filter((c) => visible.has(c)))
    if (paused) return null
    const code = [...visible].filter((c) => !this._suppressed.has(c)).sort()[0]
    if (code === undefined) return null
    this._suppressed.add(code)
    return code
  }
}
