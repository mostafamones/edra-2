/** Minimal change notification so screens can use `useSyncExternalStore(model.subscribe, () => model.version)`. */
export class Model {
  version = 0
  private listeners = new Set<() => void>()
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }
  protected changed() {
    this.version += 1
    for (const listener of this.listeners) listener()
  }
}
