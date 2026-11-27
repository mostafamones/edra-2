/** The subset of expo-secure-store this store uses (Android: AES key in the Android Keystore). */
export interface SecureItems {
  getItemAsync(key: string): Promise<string | null>
  setItemAsync(key: string, value: string): Promise<void>
  deleteItemAsync(key: string): Promise<void>
}

/** Code units per chunk: ≤ 1,800 UTF-8 bytes even for 3-byte characters, under SecureStore's 2,048-byte value limit. */
export const CHUNK_LENGTH = 600

type Manifest = { generation: number; count: number }

/**
 * Supabase `storage` over SecureStore for values larger than one secure item (a session with user metadata
 * often exceeds 2 KB). Chunks are written under a new generation before the manifest switches to them, so
 * an interrupted write leaves the previous value readable. Keys use only SecureStore's allowed characters.
 * supabase-js serializes its storage calls under its auth lock; never log values.
 */
export function chunkedSecureStorage(items: SecureItems) {
  const manifestOf = async (key: string): Promise<Manifest | null> => {
    const raw = await items.getItemAsync(key)
    if (!raw) return null
    try {
      const { generation, count } = JSON.parse(raw) as Manifest
      return Number.isInteger(generation) && Number.isInteger(count) ? { generation, count } : null
    } catch {
      return null
    }
  }
  const chunkKey = (key: string, generation: number, index: number) => `${key}.${generation}.${index}`
  const deleteChunks = async (key: string, manifest: Manifest | null) => {
    if (!manifest) return
    for (let i = 0; i < manifest.count; i++) await items.deleteItemAsync(chunkKey(key, manifest.generation, i))
  }

  return {
    async getItem(key: string): Promise<string | null> {
      const manifest = await manifestOf(key)
      if (!manifest) return null
      let value = ''
      for (let i = 0; i < manifest.count; i++) {
        const chunk = await items.getItemAsync(chunkKey(key, manifest.generation, i))
        if (chunk === null) return null
        value += chunk
      }
      return value
    },

    async setItem(key: string, value: string): Promise<void> {
      const previous = await manifestOf(key)
      const generation = (previous?.generation ?? 0) + 1
      let count = 0
      for (let start = 0; start < value.length; count++) {
        let end = Math.min(start + CHUNK_LENGTH, value.length)
        // Never split a surrogate pair: each chunk must be valid UTF-16 to survive native encoding.
        if (end < value.length && /[\uD800-\uDBFF]/.test(value[end - 1]!)) end -= 1
        await items.setItemAsync(chunkKey(key, generation, count), value.slice(start, end))
        start = end
      }
      await items.setItemAsync(key, JSON.stringify({ generation, count }))
      await deleteChunks(key, previous)
    },

    async removeItem(key: string): Promise<void> {
      const previous = await manifestOf(key)
      await items.deleteItemAsync(key)
      await deleteChunks(key, previous)
    },
  }
}
