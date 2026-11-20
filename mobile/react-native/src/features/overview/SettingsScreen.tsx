import { Pressable, ScrollView, Text, View } from 'react-native'
import { FeatureIcon } from '../../platform/chrome/FeatureIcon.tsx'
import { Avatar } from './Avatar.tsx'
import { Section, styles as parts } from '../sessions/screens/parts.tsx'
import type { SessionsPlatform } from '../sessions/screens/platform.ts'
import { type, useColors } from '../sessions/screens/theme.ts'

type Props = { platform: SessionsPlatform; name: string | null; avatarUrl: string | null; onSignOut: () => void }

/**
 * Settings, pushed from the Overview avatar: the account's name and picture (read-only) and Sign out. Profile
 * editing and notification preferences wait for an approved account API contract.
 */
export function SettingsScreen({ platform, name, avatarUrl, onSignOut }: Props) {
  const colors = useColors()
  return (
    <>
      <platform.Header title="Settings" />
      <ScrollView style={{ flex: 1, backgroundColor: colors.grouped }} contentInsetAdjustmentBehavior="automatic">
        {(name || avatarUrl) && (
          <Section>
            <View style={parts.row} accessible={!!name} accessibilityLabel={name ?? undefined}>
              <Avatar uri={avatarUrl} size={60} />
              {!!name && <Text style={[type.title3, { flex: 1, color: colors.label }]} numberOfLines={2}>{name}</Text>}
            </View>
          </Section>
        )}
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
