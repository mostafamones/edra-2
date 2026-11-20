import { useNavigation } from '@react-navigation/native'
import type { NativeStackHeaderItem, NativeStackNavigationOptions, NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { ActivityIndicator, Platform, Pressable } from 'react-native'
import type { SearchBarCommands } from 'react-native-screens'
import { HeaderTextButton } from '../chrome/HeaderIconButton'
import type { BarItem, HeaderProps } from '../features/sessions/screens/platform.ts'
import { useBoldText } from '../platform/chrome/boldText.ts'
import { FeatureIcon } from '../platform/chrome/FeatureIcon.tsx'
import { barIconSource } from './AppChrome.tsx'

function HeaderAction({ item }: { item: BarItem }) {
  if (item.busy) return <ActivityIndicator accessibilityLabel="In progress" />
  if (!item.icon) return <HeaderTextButton title={item.title} onPress={item.onPress} disabled={item.disabled} bold={item.role === 'confirm'} />
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={item.title} accessibilityState={{ disabled: !!item.disabled }}
      disabled={item.disabled} hitSlop={8} onPress={item.onPress} style={{ opacity: item.disabled ? 0.4 : 1 }}>
      <FeatureIcon name={item.icon} size={22} />
    </Pressable>
  )
}

function headerItem(item: BarItem, bold: boolean): NativeStackHeaderItem[] {
  if (item.busy) return [{ type: 'custom', element: <HeaderAction item={item} /> }]
  return [{
    type: 'button',
    label: item.title,
    accessibilityLabel: item.title,
    icon: item.icon ? { type: 'image', source: barIconSource(item.icon, bold) } : undefined,
    onPress: item.onPress,
    disabled: item.disabled,
    variant: item.role === 'confirm' ? 'done' : 'plain',
  }]
}

export function NativeHeader({ title, leading, trailing, search }: HeaderProps) {
  const navigation = useNavigation<NativeStackNavigationProp<Record<string, undefined>>>()
  const bold = useBoldText()
  const searchRef = useRef<SearchBarCommands>(null)
  const nativeText = useRef('')
  const listensToSearch = useRef(false)
  const searchValue = search?.value
  const searchPrompt = search?.placeholder
  const onSearchChange = search?.onChange
  const onSearchSubmit = search?.onSubmit
  const showSearch = !!search
  const showSearchAlways = search?.alwaysVisible

  useLayoutEffect(() => {
    listensToSearch.current = showSearch
    const clearSearch = () => {
      if (listensToSearch.current) onSearchChange?.('')
    }
    const options: NativeStackNavigationOptions = {
      title,
      headerBackVisible: !leading,
      headerLeft: leading ? () => <HeaderAction item={leading} /> : undefined,
      headerRight: trailing ? () => <HeaderAction item={trailing} /> : undefined,
      headerSearchBarOptions: showSearch ? {
        ref: searchRef,
        placeholder: searchPrompt,
        hideWhenScrolling: !showSearchAlways,
        hideNavigationBar: false,
        onChangeText: ({ nativeEvent: { text } }) => {
          if (!listensToSearch.current || text === nativeText.current) return
          nativeText.current = text
          onSearchChange?.(text)
        },
        onCancelButtonPress: clearSearch,
        onClose: clearSearch,
        onSearchButtonPress: onSearchSubmit,
      } : undefined,
    }
    if (Platform.OS === 'ios') {
      options.unstable_headerLeftItems = leading ? () => headerItem(leading, bold) : undefined
      options.unstable_headerRightItems = trailing ? () => headerItem(trailing, bold) : undefined
      if (showSearchAlways && options.headerSearchBarOptions) options.headerSearchBarOptions.placement = 'stacked'
    }
    navigation.setOptions(options)
    return () => {
      listensToSearch.current = false
    }
  }, [bold, leading, navigation, onSearchChange, onSearchSubmit, searchPrompt, showSearch, showSearchAlways, title, trailing])

  useEffect(() => {
    if (searchValue !== undefined && searchRef.current && searchValue !== nativeText.current) {
      nativeText.current = searchValue
      searchRef.current.setText(searchValue)
    }
  }, [searchValue])

  return null
}
