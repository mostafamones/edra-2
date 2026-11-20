import { useEffect, useState } from 'react'
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native'
import type { AssessmentPlatform } from './platform.ts'
import { font, useColors } from './theme.ts'
import { ProminentButton, useModel } from './ui.tsx'
import type { WorkspaceModel } from './workspace.ts'

/**
 * The Scan tab (AssignmentScanView.swift): one recognized code opens that student's marking sheet.
 * Suppression lives in the workspace's ScanFilter, so it survives this view being recreated.
 */
export function ScanPane({ model, platform }: { model: WorkspaceModel; platform: AssessmentPlatform }) {
  useModel(model)
  const colors = useColors()
  const [access, setAccess] = useState<'granted' | 'denied' | null>(null)
  useEffect(() => {
    let live = true
    void platform.requestCameraPermission().then((a) => live && setAccess(a))
    return () => {
      live = false
    }
  }, [platform])

  return (
    // Air between the preview and the tab bar.
    <View style={[styles.page, { backgroundColor: colors.groupedBackground }]}>
      <View style={[styles.camera, { backgroundColor: colors.secondaryGroupedBackground }]}>
        {access === 'granted' ? (
          // The model pauses recognition while a lookup or sheet is open and plays the haptics.
          <platform.Camera style={StyleSheet.absoluteFill} onCodes={(codes) => void model.scanned(codes)} />
        ) : access === 'denied' ? (
          <View style={styles.denied}>
            <Text style={[font.body, { color: colors.secondaryLabel }]}>Camera access is off</Text>
            <ProminentButton title="Open Settings" onPress={() => void Linking.openSettings()} />
          </View>
        ) : (
          <ActivityIndicator />
        )}
      </View>
      <View style={styles.status}>
        {model.isLookingUp ? <ActivityIndicator /> : model.lookupError !== null ? <Text style={[font.body, styles.center, { color: colors.red }]}>{model.lookupError}</Text> : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  camera: { flex: 1, borderRadius: 20, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  denied: { alignItems: 'center', gap: 12 },
  status: { alignItems: 'center' },
  center: { textAlign: 'center' },
})
