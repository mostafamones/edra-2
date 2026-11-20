import { Pressable, ScrollView, Text } from 'react-native'
import { FeatureIcon } from '../../platform/chrome/FeatureIcon.tsx'
import { Section, styles as parts } from '../sessions/screens/parts.tsx'
import type { SessionsPlatform } from '../sessions/screens/platform.ts'
import { type, useColors } from '../sessions/screens/theme.ts'

/**
 * Settings, pushed from the Overview avatar. Only actions that exist today: Sign out. Profile name/photo,
 * profile editing and notification preferences wait for an approved self-profile/account API contract.
 */
export function SettingsScreen({ platform, onSignOut }: { platform: SessionsPlatform; onSignOut: () => void }) {
  const colors = useColors()
  return (
    <>
      <platform.Header title="Settings" />
      <ScrollView style={{ flex: 1, backgroundColor: colors.grouped }} contentInsetAdjustmentBehavior="automatic">
        <Section>
          <Pressable
            accessibilityRole="button"
            onPress={onSignOut}
            style={({ pressed }) => [parts.row, pressed && { backgroundColor: colors.fill }]}
          >
            <FeatureIcon name="logout-01" size={22} color={colors.red} />
            <Text style={[type.body, { color: colors.red }]}>Sign out</Text>
          </Pressable>
        </Section>
      </ScrollView>
    </>
  )
}
