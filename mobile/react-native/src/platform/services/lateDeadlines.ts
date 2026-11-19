import { getItem, setItem } from 'expo-secure-store'
import type { AppServices } from '../../app/contract.ts'
import { createLateDeadlineStores } from './secureDeadlines.ts'

export const lateDeadlines: AppServices['lateDeadlines'] = createLateDeadlineStores({ getItem, setItem })
