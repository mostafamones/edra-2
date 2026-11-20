// Android screen bodies: React Native views that follow the iOS layout and copy with Material-like styling.
import { useRef, useState, type ComponentRef } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { NETWORK_MESSAGE } from './auth.ts'
import { SETUP_INSTRUCTION, type AccessScreenProps } from './platformTypes.ts'

// shortcut: fixed light palette (the foundation's Android values); switch to the shared theme once chosen.
const palette = {
  background: '#fef7ff',
  label: '#1c1b1f',
  secondaryLabel: '#49454f',
  fill: '#e8def8',
  accent: '#6750a4',
  onAccent: '#ffffff',
  error: '#b3261e',
  card: '#ffffff',
}

export function SignInScreen({ auth }: AccessScreenProps['SignIn']) {
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const passwordField = useRef<ComponentRef<typeof TextInput>>(null)
  const signingIn = auth.state === 'signingIn'

  const submit = () => {
    if (signingIn) return
    passwordField.current?.blur()
    void auth.signIn(phone, password)
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Text style={styles.title} accessibilityRole="header">
          Sign in
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>Phone number</Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="01012345678"
            placeholderTextColor={palette.secondaryLabel}
            accessibilityLabel="Phone number"
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => passwordField.current?.focus()}
            editable={!signingIn}
            style={styles.input}
          />
          {auth.phoneError ? (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {auth.phoneError}
            </Text>
          ) : null}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            ref={passwordField}
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={palette.secondaryLabel}
            accessibilityLabel="Password"
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submit}
            editable={!signingIn}
            style={styles.input}
          />
        </View>

        {auth.errorMessage ? (
          <Text style={styles.error} accessibilityLabel={`Error: ${auth.errorMessage}`} accessibilityLiveRegion="polite">
            {auth.errorMessage}
          </Text>
        ) : null}

        <Pressable
          onPress={submit}
          disabled={signingIn}
          accessibilityRole="button"
          accessibilityLabel="Sign in"
          accessibilityState={{ disabled: signingIn, busy: signingIn }}
          android_ripple={{ color: '#ffffff33' }}
          style={styles.button}
        >
          {signingIn ? <ActivityIndicator color={palette.onAccent} /> : <Text style={styles.buttonText}>Sign in</Text>}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}

function Progress({ label }: { label: string }) {
  return (
    <SafeAreaView style={[styles.screen, styles.center]}>
      <ActivityIndicator color={palette.accent} size="large" />
      <Text style={styles.progressLabel}>{label}</Text>
    </SafeAreaView>
  )
}

export const RestoringScreen = () => <Progress label="Loading…" />
export const SigningOutScreen = () => <Progress label="Signing out…" />

export function RestoreFailedScreen({ onRetry }: AccessScreenProps['RestoreFailed']) {
  return (
    <SafeAreaView style={[styles.screen, styles.center]}>
      <Text style={styles.unavailableTitle} accessibilityRole="header">
        Couldn't sign you in
      </Text>
      <Text style={styles.unavailableMessage}>{NETWORK_MESSAGE}</Text>
      <Pressable onPress={onRetry} accessibilityRole="button" style={[styles.button, styles.retry]}>
        <Text style={styles.buttonText}>Retry</Text>
      </Pressable>
    </SafeAreaView>
  )
}

export function NotConfiguredScreen({ issues }: AccessScreenProps['NotConfigured']) {
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.list}>
        <Text style={styles.navTitle} accessibilityRole="header">
          Setup needed
        </Text>
        <Text style={styles.sectionHeader}>App is not configured</Text>
        <View style={styles.card}>
          <Text style={styles.row}>{SETUP_INSTRUCTION}</Text>
        </View>
        <Text style={styles.sectionHeader}>Problems</Text>
        <View style={styles.card}>
          {issues.map((issue) => (
            <Text key={issue} style={styles.row}>
              {issue}
            </Text>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  form: { padding: 24, gap: 20 },
  title: { fontSize: 34, fontWeight: '700', color: palette.secondaryLabel },
  field: { gap: 6 },
  label: { fontSize: 15, fontWeight: '500', color: palette.label },
  input: { padding: 12, borderRadius: 10, backgroundColor: palette.fill, fontSize: 17, color: palette.label },
  error: { fontSize: 13, color: palette.error },
  button: {
    minHeight: 48, borderRadius: 24, backgroundColor: palette.accent,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, overflow: 'hidden',
  },
  buttonText: { fontSize: 17, fontWeight: '600', color: palette.onAccent },
  progressLabel: { marginTop: 12, fontSize: 15, color: palette.secondaryLabel },
  unavailableTitle: { fontSize: 22, fontWeight: '700', color: palette.label, textAlign: 'center' },
  unavailableMessage: { marginTop: 8, fontSize: 15, color: palette.secondaryLabel, textAlign: 'center' },
  retry: { marginTop: 20 },
  list: { padding: 16, gap: 8 },
  navTitle: { fontSize: 28, fontWeight: '700', color: palette.label, marginBottom: 8 },
  sectionHeader: { marginTop: 16, marginHorizontal: 16, fontSize: 13, color: palette.secondaryLabel, textTransform: 'uppercase' },
  card: { backgroundColor: palette.card, borderRadius: 12, overflow: 'hidden' },
  row: { paddingHorizontal: 16, paddingVertical: 12, fontSize: 17, color: palette.label },
})
