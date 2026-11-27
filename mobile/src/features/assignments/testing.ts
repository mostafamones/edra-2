// Fixtures and harness for the assignment tests; imported only by *.test.ts.
import { ApiClient } from '../../core/api.ts'
import { AcademySelection, AccountScope } from '../../core/ownership.ts'
import { ControlledFetch } from '../../core/testing.ts'
import type { AssignmentsEnvironment, Feedback } from './environment.ts'

// Part p1: Answer Sheet, two choice questions (A/B). Part p2: Written Work, seven questions max 2.
// Part p3: legacy total-only part, max 10.
export const DETAIL = JSON.stringify({
  id: 'asg', title: 'Homework 1', state: 'active', max_score: '26', year_open: true, ready: true,
  student_codes_enabled: true, actions: { mark: true, record_work: true, announce: true },
  parts: [
    { id: 'p2', position: 2, title: 'Written', instructions: '', max_score: '14', kind: 'file_upload', issues: [],
      questions: [7, 6, 5, 4, 3, 2, 1].map((n) => ({ id: `w${n}`, position: n, prompt: '', max_score: '2', choices: [] })) },
    { id: 'p1', position: 1, title: 'Choices', instructions: '', max_score: '2', kind: 'answer_sheet', issues: [],
      questions: [
        { id: 'q1', position: 1, prompt: '', max_score: '1', choices: [{ id: 'c1a', position: 1, label: '', is_correct: true }, { id: 'c1b', position: 2, label: '', is_correct: false }] },
        { id: 'q2', position: 2, prompt: '', max_score: '1', choices: [{ id: 'c2a', position: 1, label: '', is_correct: false }, { id: 'c2b', position: 2, label: '', is_correct: true }] },
      ] },
    { id: 'p3', position: 3, title: 'Legacy', instructions: '', max_score: '10', kind: null, issues: [], questions: [] },
  ],
})

type StudentOptions = Partial<{ name: string; version: number; marks: unknown[]; answers: unknown[]; marking: string; publication: string; total: string | null; feedback: string }>

export function student(id = 's1', o: StudentOptions = {}) {
  return {
    annual_student_record_id: id, full_name: o.name ?? 'Amal', archived: false, group_name: 'Nine A', student_code: '0001',
    work_status: 'submitted', received_at: null, work_note: '', feedback: o.feedback ?? '', version: o.version ?? 1,
    marks: o.marks ?? [], answers: o.answers ?? [], marked_parts: 0, updated_at: null, total: o.total ?? null,
    marking: o.marking ?? 'unmarked', publication: null, publication_state: o.publication ?? 'unpublished',
  }
}

export const page = (students: unknown[], total = students.length) => JSON.stringify({ total, students })
export const saved = (s: unknown, replayed = false) => JSON.stringify({ outcome: 'saved', student: s, work_recorded: true, replayed })
export const summary = { id: 'asg', title: 'Homework 1', dueAt: null, state: 'active', maxScore: '26', recipientCount: 3 }

/** A signed-in account with academy A selected, a controllable transport and recorded callbacks. */
export class Harness {
  readonly fetch = new ControlledFetch()
  readonly scope = new AccountScope()
  readonly selection = new AcademySelection(this.scope)
  readonly context = this.selection.select('A')!
  readonly feedback: Feedback[] = []
  readonly signedOut: number[] = []
  readonly forbidden: number[] = []
  private keys = 0
  readonly env: AssignmentsEnvironment = {
    api: new ApiClient({
      origin: 'https://api.example.test',
      auth: { accessToken: () => Promise.resolve('t') },
      fetch: this.fetch.fetch,
      newId: () => 'req',
    }),
    isCurrent: (c) => this.selection.isCurrent(c),
    onUnauthenticated: () => void this.signedOut.push(1),
    onForbidden: () => void this.forbidden.push(1),
    newKey: () => `key-${++this.keys}`,
    feedback: (kind) => void this.feedback.push(kind),
  }

  body(index: number): Record<string, unknown> {
    return JSON.parse(this.fetch.call(index).init.body as string)
  }

  key(index: number): string | undefined {
    return this.fetch.header(index, 'Idempotency-Key')
  }

  path(index: number): URL {
    return new URL(this.fetch.call(index).url)
  }
}
