import { Button, Host, NavigationStack, ProgressView, RNHostView, Toolbar, ToolbarItem, useNativeState } from '@expo/ui/swift-ui'
import { accessibilityLabel, buttonStyle, disabled, navigationBarTitleDisplayMode, navigationTitle, searchable } from '@expo/ui/swift-ui/modifiers'
import { useEffect, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import type { BarItem, NavigationBarProps } from '../../features/assignments/platform.ts'
import { FeatureIcon } from './FeatureIcon.tsx'

function Action({ item }: { item: BarItem }) {
  if (item.kind === 'progress') return <ProgressView modifiers={[accessibilityLabel('In progress')]} />
  if (item.kind === 'text') {
    return <Button label={item.title} onPress={item.onPress}
      modifiers={[disabled(!!item.disabled), ...(item.prominent ? [buttonStyle('borderedProminent')] : [])]} />
  }
  return (
    <Button onPress={item.onPress} modifiers={[accessibilityLabel(item.label), disabled(!!item.disabled)]}>
      <RNHostView matchContents><FeatureIcon name={item.icon} size={20} /></RNHostView>
    </Button>
  )
}

export function NavigationBar({ title, leading, trailing, search, children }: NavigationBarProps) {
  const value = search?.text ?? ''
  const query = useNativeState(value)
  const lastNativeEdit = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (value !== lastNativeEdit.current) query.set(value)
    lastNativeEdit.current = undefined
  }, [query, value])

  return (
    <Host style={styles.fill}>
      <NavigationStack>
        <Toolbar modifiers={[
          navigationTitle(title),
          navigationBarTitleDisplayMode('inline'),
          ...(search ? [searchable(query, {
            placement: 'navigationBarDrawer',
            prompt: search.prompt,
            onChange(text) {
              lastNativeEdit.current = text
              search.onChange(text)
            },
          })] : []),
        ]}>
          <RNHostView><View style={styles.fill}>{children}</View></RNHostView>
          <Toolbar.Content>
            {leading && <ToolbarItem placement="cancellationAction"><Action item={leading} /></ToolbarItem>}
            {trailing && <ToolbarItem placement="confirmationAction"><Action item={trailing} /></ToolbarItem>}
          </Toolbar.Content>
        </Toolbar>
      </NavigationStack>
    </Host>
  )
}

const styles = StyleSheet.create({ fill: { flex: 1 } })
