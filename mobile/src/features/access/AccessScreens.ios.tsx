// iOS screen bodies rendered by SwiftUI (@expo/ui), matching the SwiftUI app's SignInView, RootView states
// and NotConfiguredView view for view.
import {
  Button, ContentUnavailableView, Group, Host, List, NavigationStack, ProgressView, ScrollView, SecureField,
  Section, Text, TextField, VStack, type SecureFieldRef, type TextFieldRef,
} from '@expo/ui/swift-ui'
import {
  accessibilityLabel, background, buttonStyle, disabled, font, foregroundStyle, frame, keyboardType,
  navigationTitle, onSubmit, padding, scrollDismissesKeyboard, shapes, submitLabel, textContentType,
} from '@expo/ui/swift-ui/modifiers'
import { useRef } from 'react'
import { PlatformColor, View } from 'react-native'
import { NETWORK_MESSAGE } from './auth.ts'
import { SETUP_INSTRUCTION, type AccessScreenProps } from './platformTypes.ts'

const fieldBackground = background(
  PlatformColor('tertiarySystemFill'), // .fill.tertiary
  shapes.roundedRectangle({ cornerRadius: 10, roundedCornerStyle: 'continuous' }),
)

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: PlatformColor('systemBackground') }}>
      <Host style={{ flex: 1 }}>{children}</Host>
    </View>
  )
}

export function SignInScreen({ auth }: AccessScreenProps['SignIn']) {
  const phone = useRef('')
  const password = useRef('')
  const phoneField = useRef<TextFieldRef>(null)
  const passwordField = useRef<SecureFieldRef>(null)
  const signingIn = auth.state === 'signingIn'

  const submit = () => {
    if (signingIn) return
    void phoneField.current?.blur()
    void passwordField.current?.blur()
    void auth.signIn(phone.current, password.current)
  }

  return (
    <Screen>
      <ScrollView modifiers={[scrollDismissesKeyboard('interactively'), disabled(signingIn)]}>
        <VStack alignment="leading" spacing={20} modifiers={[padding({ all: 24 })]}>
          <VStack alignment="leading" spacing={4}>
            <Text modifiers={[font({ textStyle: 'largeTitle', weight: 'bold' }), foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
              Sign in
            </Text>
          </VStack>

          <VStack alignment="leading" spacing={6}>
            <Text modifiers={[font({ textStyle: 'subheadline', weight: 'medium' })]}>Phone number</Text>
            <TextField
              ref={phoneField}
              placeholder="01012345678"
              onTextChange={(value) => (phone.current = value)}
              modifiers={[textContentType('telephoneNumber'), keyboardType('phone-pad'), padding({ all: 12 }), fieldBackground]}
            />
            {auth.phoneError ? (
              <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle('red')]}>{auth.phoneError}</Text>
            ) : null}
          </VStack>

          <VStack alignment="leading" spacing={6}>
            <Text modifiers={[font({ textStyle: 'subheadline', weight: 'medium' })]}>Password</Text>
            <SecureField
              ref={passwordField}
              placeholder="Password"
              onTextChange={(value) => (password.current = value)}
              modifiers={[textContentType('password'), submitLabel('go'), onSubmit(submit), padding({ all: 12 }), fieldBackground]}
            />
          </VStack>

          {auth.errorMessage ? (
            <Text
              modifiers={[font({ textStyle: 'footnote' }), foregroundStyle('red'), accessibilityLabel(`Error: ${auth.errorMessage}`)]}
            >
              {auth.errorMessage}
            </Text>
          ) : null}

          <Button onPress={submit} modifiers={[buttonStyle('borderedProminent'), disabled(signingIn)]}>
            <Group modifiers={[frame({ maxWidth: Infinity }), padding({ vertical: 6 })]}>
              {signingIn ? <ProgressView /> : <Text>Sign in</Text>}
            </Group>
          </Button>
        </VStack>
      </ScrollView>
    </Screen>
  )
}

function Progress({ label }: { label: string }) {
  return (
    <Screen>
      <ProgressView>
        <Text>{label}</Text>
      </ProgressView>
    </Screen>
  )
}

export const RestoringScreen = () => <Progress label="Loading…" />
export const SigningOutScreen = () => <Progress label="Signing out…" />

export function RestoreFailedScreen({ onRetry }: AccessScreenProps['RestoreFailed']) {
  return (
    <Screen>
      <ContentUnavailableView
        title="Couldn't sign you in"
        description={NETWORK_MESSAGE}
        actions={<Button label="Retry" onPress={onRetry} modifiers={[buttonStyle('borderedProminent')]} />}
      />
    </Screen>
  )
}

export function NotConfiguredScreen({ issues }: AccessScreenProps['NotConfigured']) {
  return (
    <Screen>
      <NavigationStack>
        <List modifiers={[navigationTitle('Setup needed')]}>
          <Section title="App is not configured">
            <Text>{SETUP_INSTRUCTION}</Text>
          </Section>
          <Section title="Problems">
            {issues.map((issue) => (
              <Text key={issue}>{issue}</Text>
            ))}
          </Section>
        </List>
      </NavigationStack>
    </Screen>
  )
}
