import { useState } from 'react'
import { Image } from 'react-native'
import { FeatureIcon } from '../../platform/chrome/FeatureIcon.tsx'

/** The account picture, or the neutral profile icon when there is none or it fails to load (e.g. an expired URL). */
export function Avatar({ uri, size }: { uri: string | null; size: number }) {
  const [failed, setFailed] = useState<string | null>(null)
  if (!uri || failed === uri) return <FeatureIcon name="hugeicons-user-circle" size={size} />
  return (
    <Image
      source={{ uri }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      accessibilityIgnoresInvertColors
      onError={() => setFailed(uri)}
    />
  )
}
