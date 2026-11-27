import { fetch } from 'expo/fetch'
import { randomUUID } from 'expo-crypto'
import { impactAsync, ImpactFeedbackStyle, notificationAsync, NotificationFeedbackType } from 'expo-haptics'
import type { AppServices } from '../../app/contract.ts'
import { lateDeadlines } from './lateDeadlines'

const notifications = {
  success: NotificationFeedbackType.Success,
  warning: NotificationFeedbackType.Warning,
  failure: NotificationFeedbackType.Error,
}

export const appServices: AppServices = {
  fetch: (url, init) => fetch(url, { ...init, credentials: 'omit', redirect: 'error' }),
  newId: randomUUID,
  lateDeadlines,
  feedback(kind) {
    const effect = kind === 'recognized'
      ? impactAsync(ImpactFeedbackStyle.Medium)
      : notificationAsync(notifications[kind])
    // Feedback must never reject a scan or mutation.
    void effect.catch(() => {})
  },
}
