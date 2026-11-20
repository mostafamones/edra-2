import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import type { BarItem, Dialog, MenuItem, SessionsPlatform } from './platform.ts'
import { type, useColors } from './theme.ts'

// shortcut: React Native-core stand-ins so the screens run before the foundation's native components land.
// Icons render as empty boxes, the camera is a placeholder, sheets can't block swipe-dismiss and the
// header is drawn in-screen. Replace every member with the foundation's native implementation.

function present(dialog: Dialog) {
  const actions = dialog.actions
  if (dialog.style === 'actionSheet' && Platform.OS === 'ios') {
    const options = [...actions]
    if (!options.some((a) => a.role === 'cancel')) options.push({ title: 'Cancel', role: 'cancel', onPress: dialog.onDismiss })
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: dialog.title,
        message: dialog.message,
        options: options.map((a) => a.title),
        cancelButtonIndex: options.findIndex((a) => a.role === 'cancel'),
        destructiveButtonIndex: options.flatMap((a, i) => (a.role === 'destructive' ? [i] : [])),
      },
      (index) => options[index]?.onPress?.(),
    )
    return
  }
  const buttons = actions.map((a) => ({ text: a.title, style: a.role, onPress: a.onPress }))
  if (dialog.style === 'actionSheet' && !actions.some((a) => a.role === 'cancel')) {
    buttons.push({ text: 'Cancel', style: 'cancel', onPress: dialog.onDismiss })
  }
  Alert.alert(dialog.title, dialog.message, buttons, { cancelable: true, onDismiss: dialog.onDismiss })
}

function BarButton({ item }: { item?: BarItem }) {
  const colors = useColors()
  if (!item) return <View style={styles.barSlot} />
  if (item.busy) return <View style={styles.barSlot}><ActivityIndicator /></View>
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.title}
      accessibilityState={{ disabled: !!item.disabled }}
      disabled={item.disabled}
      onPress={item.onPress}
      hitSlop={8}
      style={styles.barSlot}
    >
      <Text
        style={[type.body, item.role === 'confirm' && { fontWeight: '600' }, { color: item.disabled ? colors.secondary : colors.accentText }]}
        numberOfLines={1}
      >
        {item.title}
      </Text>
    </Pressable>
  )
}

export const corePlatform: SessionsPlatform = {
  Icon: ({ size = 22 }) => <View style={{ width: size, height: size }} />,
  Header({ title, leading, trailing, search }) {
    const colors = useColors()
    return (
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <BarButton item={leading} />
          <Text accessibilityRole="header" style={[type.headline, styles.headerTitle, { color: colors.label }]} numberOfLines={1}>
            {title}
          </Text>
          <BarButton item={trailing} />
        </View>
        {search && (
          <TextInput
            value={search.value}
            onChangeText={search.onChange}
            onSubmitEditing={search.onSubmit}
            placeholder={search.placeholder}
            placeholderTextColor={colors.secondary as string}
            returnKeyType="search"
            clearButtonMode="while-editing"
            autoCorrect={false}
            accessibilityLabel={search.placeholder}
            style={[type.body, styles.search, { backgroundColor: colors.fill, color: colors.label }]}
          />
        )}
      </View>
    )
  },
  Sheet({ visible, onDismiss, fullScreen, dismissDisabled, children }) {
    const colors = useColors()
    return (
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle={fullScreen ? 'fullScreen' : 'pageSheet'}
        onRequestClose={() => {
          if (!dismissDisabled) onDismiss()
        }}
        onDismiss={onDismiss}
      >
        <View style={{ flex: 1, backgroundColor: colors.background }}>{children}</View>
      </Modal>
    )
  },
  Menu({ items, accessibilityLabel, disabled, children, style }) {
    const actions = items.filter((i): i is Extract<MenuItem, { title: string }> => 'title' in i && !i.disabled)
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        disabled={disabled}
        style={style}
        onPress={() =>
          present({
            style: 'actionSheet',
            title: '',
            actions: actions.map((a) => ({
              title: a.checked ? `✓ ${a.title}` : a.title,
              role: a.destructive ? 'destructive' : 'default',
              onPress: a.onPress,
            })),
          })
        }
      >
        {children}
      </Pressable>
    )
  },
  GlassButton({ icon, accessibilityLabel, onPress, prominent, diameter }) {
    const colors = useColors()
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        disabled={!onPress}
        onPress={onPress}
        style={{
          width: diameter,
          height: diameter,
          borderRadius: diameter / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: prominent ? colors.accent : colors.fill,
        }}
      >
        <corePlatform.Icon name={icon} size={diameter * 0.5} color={(prominent ? colors.onAccent : colors.label) as string} />
      </Pressable>
    )
  },
  Camera({ style }) {
    const colors = useColors()
    return (
      <View style={[style, styles.center]}>
        <Text style={[type.subheadline, { color: colors.secondary }]}>Camera preview needs the native camera module.</Text>
      </View>
    )
  },
  present,
  requestCameraAccess: async () => 'granted',
  openSettings: () => void Linking.openSettings(),
  useIsFocused: () => true,
  useBottomInset: () => 0,
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 8, paddingTop: 8, paddingBottom: 8, gap: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  headerTitle: { flex: 1, textAlign: 'center' },
  barSlot: { minWidth: 72, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  search: { marginHorizontal: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24 },
})
