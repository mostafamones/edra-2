import { useState } from 'react'
import { FlatList, RefreshControl, View } from 'react-native'
import type { LiveSession } from '../contract.ts'
import type { LiveSessionsModel } from '../live.ts'
import type { AcademyContext } from '../port.ts'
import { useModel } from './hooks.ts'
import { Loading, SessionCard, Unavailable } from './parts.tsx'

/** Pull-to-refresh state around an async load (`.refreshable`). */
export function useRefresh(load: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await load()
    } finally {
      setRefreshing(false)
    }
  }
  return { refreshing, onRefresh }
}

/**
 * Sessions tab body: the selected academy's live sessions. The shell owns the large "Sessions" title,
 * academy subtitle and the Start button, loads on context changes and reloads after returning from a session.
 */
export function SessionsHomeScreen(props: { context: AcademyContext | null; sessions: LiveSessionsModel; onOpen: (session: LiveSession) => void }) {
  const sessions = useModel(props.sessions)
  const load = () => sessions.load(props.context)
  const refresh = useRefresh(load)
  const { state } = sessions

  if (state.kind === 'failed') return <Unavailable title="Couldn't load live sessions" message={state.message} action="Retry" onAction={load} />
  if (state.kind === 'loaded' && !sessions.sessions.length) {
    return (
      <Unavailable
        title="No live sessions"
        message="Start a session from a schedule, or pull to refresh when staff start one."
        action="Refresh"
        onAction={load}
      />
    )
  }
  if (!(state.kind === 'loaded' || (state.kind === 'loading' && sessions.sessions.length))) return <Loading label="Loading live sessions…" />
  return (
    <FlatList
      data={sessions.sessions}
      keyExtractor={(s) => s.id}
      renderItem={({ item }) => <SessionCard session={item} onPress={() => props.onOpen(item)} />}
      ItemSeparatorComponent={Gap}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={<RefreshControl {...refresh} />}
    />
  )
}

const Gap = () => <View style={{ height: 12 }} />
