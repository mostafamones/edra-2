import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import type { NavigationBarProps } from '../../features/assignments/platform.ts'
import type { BarItem, HeaderProps } from '../../features/sessions/screens/platform.ts'
import { type, useColors } from '../../features/sessions/screens/theme.ts'
import { FeatureIcon } from './FeatureIcon.tsx'

function Action({ item }: { item?: BarItem }) {
  const colors = useColors()
  if (!item) return null
  if (item.busy) return <ActivityIndicator accessibilityLabel="In progress" style={styles.action} />
  const color = item.disabled ? colors.secondary : colors.accent
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={item.title} accessibilityState={{ disabled: !!item.disabled }}
      disabled={item.disabled} onPress={item.onPress} style={styles.action}>
      {item.icon ? <FeatureIcon name={item.icon} size={20} color={color} /> : (
        <Text numberOfLines={1} style={[type.body, { color }, item.role === 'confirm' && { fontWeight: '600' }]}>{item.title}</Text>
      )}
    </Pressable>
  )
}

export function Header({ title, leading, trailing, search }: HeaderProps) {
  const colors = useColors()
  return (
    <View style={styles.header}>
      <View style={styles.row}>
        <Action item={leading} />
        <Text numberOfLines={1} accessibilityRole="header" style={[type.headline, styles.title, { color: colors.label }]}>{title}</Text>
        <Action item={trailing} />
      </View>
      {search && (
        <View style={[styles.search, { backgroundColor: colors.fill }]}>
          <FeatureIcon name="search-01" size={18} color={colors.secondary} />
          <TextInput accessibilityLabel={search.placeholder} placeholder={search.placeholder}
            placeholderTextColor={colors.secondary} returnKeyType="search" autoCorrect={false} autoCapitalize="none"
            value={search.value} onChangeText={search.onChange} onSubmitEditing={search.onSubmit}
            style={[type.body, styles.input, { color: colors.label }]} />
          {!!search.value && (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => search.onChange('')} style={styles.action}>
              <FeatureIcon name="cancel-01" size={18} color={colors.secondary} />
            </Pressable>
          )}
        </View>
      )}
    </View>
  )
}

function barItem(item: NavigationBarProps['leading']): BarItem | undefined {
  if (!item) return undefined
  if (item.kind === 'progress') return { title: '', busy: true, onPress: () => {} }
  if (item.kind === 'icon') return { title: item.label, icon: item.icon, onPress: item.onPress, disabled: item.disabled }
  return { ...item, role: item.prominent ? 'confirm' : undefined }
}

export function NavigationBar({ title, leading, trailing, search, children }: NavigationBarProps) {
  return (
    <View style={{ flex: 1 }}>
      <Header title={title} leading={barItem(leading)} trailing={barItem(trailing)}
        search={search ? { value: search.text, onChange: search.onChange, placeholder: search.prompt } : undefined} />
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 12, paddingBottom: 6, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: 8 },
  title: { flex: 1, textAlign: 'center' },
  action: { minWidth: 44, minHeight: 44, maxWidth: '40%', paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingLeft: 12 },
  input: { flex: 1, minHeight: 44, paddingRight: 12 },
})
