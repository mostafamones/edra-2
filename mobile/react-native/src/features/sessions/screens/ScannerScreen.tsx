import { useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { AddAttendeeModel } from '../attendees.ts'
import type { CodeCard, ScannerModel } from '../scanner.ts'
import { AddAttendeeScreen } from './AddAttendeeScreen.tsx'
import { useModel } from './hooks.ts'
import { Button, StudentCard } from './parts.tsx'
import type { SessionsPlatform } from './platform.ts'
import { type, useColors } from './theme.ts'

const NOTICE_MS = 2500

/** Student-code scanner, presented full screen. Preview writes nothing; Confirm checks the student in. */
export function ScannerScreen({ academyName, sessionTitle, makeAttendees, onClose, platform, ...props }: {
  model: ScannerModel
  academyName: string
  sessionTitle: string
  /** Opens the explicit add-attendee search for a code that isn't on the roster. */
  makeAttendees?: (code: string) => AddAttendeeModel
  onClose: () => void
  platform: SessionsPlatform
}) {
  const model = useModel(props.model)
  const colors = useColors()
  const [access, setAccess] = useState<'granted' | 'denied' | null>(null)
  const [attendee, setAttendee] = useState<{ code: string; model: AddAttendeeModel } | null>(null)

  useEffect(() => {
    let live = true
    void platform.requestCameraAccess().then((result) => live && setAccess(result))
    return () => void (live = false)
  }, [platform])

  // The success notice is short-lived.
  useEffect(() => {
    if (!model.notice) return
    const timer = setTimeout(() => model.clearNotice(), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [model.notice])

  const blocked = model.blockedReason
  let camera
  if (blocked) {
    camera = <Message text={blocked} />
  } else if (access === 'granted') {
    camera = <platform.Camera style={StyleSheet.absoluteFill} onCodes={(codes) => model.recognized(codes)} />
  } else if (access === 'denied') {
    camera = (
      <View style={styles.center}>
        <Message text="Camera access is off. Allow it in Settings to scan student cards." />
        <Button title="Open Settings" prominent onPress={platform.openSettings} />
      </View>
    )
  } else {
    camera = <ActivityIndicator />
  }

  const state = model.state
  let card = null
  switch (state.kind) {
    case 'scanning':
      if (!blocked) card = <Text style={[type.body, { color: colors.secondary, textAlign: 'center' }]}>Point the camera at a student card.</Text>
      break
    case 'awaitingDecision':
      card = <Decision model={model} card={state.card} canConfirm />
      break
    case 'submitting':
      card = <Decision model={model} card={state.attempt.card} busy />
      break
    case 'uncertain':
      card = <Decision model={model} card={state.attempt.card} status={state.message} canConfirm confirmTitle="Retry" />
      break
    case 'rejected':
      card = <Decision model={model} card={state.card} status={state.message} />
      break
    case 'notOnRoster': {
      const code = state.code
      card = (
        <View style={{ gap: 14 }}>
          <Text accessibilityLiveRegion="polite" style={[type.headline, { color: colors.label }]}>Code {code} isn't on this session's roster.</Text>
          <View style={styles.buttons}>
            <Button title="Dismiss" large onPress={() => model.dismiss()} />
            {model.canAddAttendee && makeAttendees && (
              <Button title="Find student" large prominent onPress={() => setAttendee({ code, model: makeAttendees(code) })}>
                <View style={styles.label}>
                  <platform.Icon name="hugeicons-user-add-01" size={20} color={colors.onAccent as string} />
                  <Text style={[type.headline, { color: colors.onAccent }]}>Find student</Text>
                </View>
              </Button>
            )}
          </View>
        </View>
      )
    }
  }

  const closeAttendee = () => {
    if (attendee) model.returnFromAdd(attendee.code)
    setAttendee(null)
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <platform.Header title="Scanner" leading={{ title: 'Close', role: 'cancel', onPress: onClose }} />
      <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
        <View style={{ gap: 2 }}>
          <Text accessibilityRole="header" style={[type.title3, { color: colors.label }]}>{sessionTitle}</Text>
          <Text style={[type.body, { color: colors.secondary }]}>{academyName}</Text>
        </View>
        <View style={[styles.camera, { backgroundColor: colors.tile }]}>
          {camera}
          {model.notice && (
            <View style={styles.noticeSlot} pointerEvents="none">
              <View style={[styles.notice, { backgroundColor: colors.accent }]} accessibilityLiveRegion="polite">
                <Text style={[type.subheadline, { fontWeight: '500', color: colors.onAccent }]}>{model.notice}</Text>
              </View>
            </View>
          )}
        </View>
        {card}
      </ScrollView>
      <platform.Sheet visible={!!attendee} onDismiss={closeAttendee}>
        {attendee && <AddAttendeeScreen model={attendee.model} onClose={closeAttendee} platform={platform} />}
      </platform.Sheet>
    </View>
  )
}

function Message({ text }: { text: string }) {
  const colors = useColors()
  return <Text style={[type.body, { color: colors.secondary, textAlign: 'center', padding: 24 }]}>{text}</Text>
}

function Decision({ model, card, status, canConfirm, busy, confirmTitle = '✓ Confirm' }: {
  model: ScannerModel
  card: CodeCard
  status?: string
  canConfirm?: boolean
  busy?: boolean
  confirmTitle?: string
}) {
  const colors = useColors()
  return (
    <View style={{ gap: 14 }}>
      <StudentCard entry={card.entry} />
      {status && <Text accessibilityLiveRegion="polite" style={[type.footnote, { color: colors.red }]}>{status}</Text>}
      <View style={styles.buttons}>
        <Button title="✕ Dismiss" large disabled={busy} onPress={() => model.dismiss()} />
        <Button title={confirmTitle} large prominent busy={busy} disabled={!canConfirm} onPress={() => void model.confirm()} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  content: { gap: 16, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32 },
  camera: { height: 300, borderRadius: 20, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', gap: 12 },
  noticeSlot: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', padding: 10 },
  notice: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  buttons: { flexDirection: 'row', gap: 12 },
  label: { flexDirection: 'row', alignItems: 'center', gap: 8 },
})
