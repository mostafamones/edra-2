import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { errorJSON } from '../../core/testing.ts'
import { choiceLetter, decodeDetail, decodeStudent, markFor, studentStatus, takesAnswers, takesTotal } from './api.ts'
import { AssignmentsModel } from './assignments.ts'
import { MarkingModel, type Mode } from './marking.ts'
import { ScanFilter } from './scan.ts'
import { displayScore, formatScore, hundredths } from './score.ts'
import { DETAIL, Harness, page, saved, student, summary } from './testing.ts'
import { WorkspaceModel } from './workspace.ts'

describe('score', () => {
  test('parses exact hundredths', () => {
    assert.equal(hundredths('7.5'), 750)
    assert.equal(hundredths('0'), 0)
    assert.equal(hundredths('10.25'), 1025)
    assert.equal(hundredths('.5'), 50)
    assert.equal(hundredths('7.'), 700)
    assert.equal(hundredths(' 3 '), 300)
    assert.equal(hundredths('٧٫٥'), 750) // Arabic-Indic keypad
    assert.equal(hundredths('۷.۲۵'), 725) // Extended Arabic-Indic
    assert.equal(hundredths('7,5'), 750)
    for (const bad of ['', '.', '1.234', '-1', '1e2', '1.2.3', '12345678', '0x1', 'Infinity']) assert.equal(hundredths(bad), null, bad)
  })

  test('formats without binary rounding', () => {
    assert.equal(formatScore(750), '7.5')
    assert.equal(formatScore(1000), '10')
    assert.equal(formatScore(705), '7.05')
    assert.equal(formatScore(hundredths('0.1')! + hundredths('0.2')!), '0.3')
    assert.equal(displayScore('10.00'), '10')
    assert.equal(displayScore('n/a'), 'n/a')
    assert.equal(displayScore(null), '–')
  })
})

describe('decoding', () => {
  test('orders structure and unknown capabilities grant nothing', () => {
    const detail = decodeDetail(JSON.parse(DETAIL))
    assert.deepEqual(detail.parts.map((p) => p.kind), ['answer_sheet', 'file_upload', null])
    assert.deepEqual(detail.parts[1]!.questions.map((q) => q.id).slice(0, 2), ['w1', 'w2'])
    assert.deepEqual(detail.parts[0]!.questions[1]!.choices.map(choiceLetter), ['A', 'B'])
    assert.equal(takesAnswers(detail.parts[2]!), false)
    assert.equal(takesTotal(detail.parts[2]!), true)

    const old = decodeDetail({ id: 'a', title: 't', state: 'active', max_score: '1', parts: [{ id: 'p', position: 1, title: 'x', max_score: '1', kind: 'photo_upload', questions: [] }] })
    assert.deepEqual(old.actions, { mark: false, recordWork: false, announce: false })
    assert.equal(old.studentCodesEnabled, false)
    assert.equal(takesTotal(old.parts[0]!), false) // an unknown kind is never editable
    assert.deepEqual(decodeDetail({ ...JSON.parse(DETAIL), actions: {} }).actions, { mark: false, recordWork: false, announce: false })
  })

  test('keeps Blank, zero and missing answers distinct; older payloads default', () => {
    const s = decodeStudent(student('s1', {
      marks: [{ part_id: 'p2', kind: 'mark', score: '0.00', reason: null }],
      answers: [{ question_id: 'q1', part_id: 'p1', choice_id: null, score: '0' }],
    }))
    assert.equal(s.answers[0]!.choiceId, null)
    assert.equal(markFor(s, 'p2')?.score, '0.00')
    assert.equal(markFor(s, 'p2')?.fromAnswers, false)
    const legacy = decodeStudent({ annual_student_record_id: 'x', full_name: 'N', work_status: 'expected', version: 1, marking: 'unmarked', publication_state: 'unpublished' })
    assert.deepEqual([legacy.answers, legacy.marks, legacy.feedback], [[], [], ''])
    assert.equal(studentStatus(legacy), 'Not received')
    assert.throws(() => decodeStudent({ ...student(), version: '2' }))
  })

  test('status follows work, marking and publication', () => {
    const status = (o: Parameters<typeof student>[1]) => studentStatus(decodeStudent(student('s', o)))
    assert.equal(status({ marking: 'complete', publication: 'published' }), 'Announced')
    assert.equal(status({ marking: 'complete', publication: 'pending_correction' }), 'Correction pending')
    assert.equal(status({ marking: 'partial', publication: 'pending_correction' }), 'Partial · correction pending')
    assert.equal(status({}), 'Needs marking')
  })
})

function marking(h: Harness, o: { student?: object; part?: string | null; mode?: Mode } = {}) {
  const savedStudents: unknown[] = []
  const defaults: Array<[string, Mode]> = []
  const model = new MarkingModel(
    h.env,
    { onDefaults: (p, m) => void defaults.push([p, m]), onSaved: (s) => void savedStudents.push(s) },
    decodeDetail(JSON.parse(DETAIL)),
    decodeStudent(o.student ?? student()),
    h.context,
    o.part ?? null,
    o.mode ?? 'byQuestion',
  )
  return { model, saved: savedStudents, defaults }
}

describe('marking draft', () => {
  test('Blank and clear are different edits, sent by permanent record id', async () => {
    const h = new Harness()
    const { model, saved: acks } = marking(h, { student: student('s1', { answers: [{ question_id: 'q2', part_id: 'p1', choice_id: 'c2a', score: '0' }] }) })
    model.setEntry('q1', { kind: 'choice', choiceId: null })
    model.setEntry('q2', { kind: 'notEntered' })
    const save = model.save()
    await h.fetch.waitFor(1)
    assert.deepEqual(h.body(0), {
      annual_student_record_id: 's1',
      expected_version: 1,
      answers: [{ question_id: 'q1', choice_id: null }, { question_id: 'q2', clear: true }],
    })
    assert.equal(h.fetch.call(0).init.method, 'PATCH')
    assert.equal(h.path(0).pathname, '/api/v1/assignments/asg/marks')
    h.fetch.respond(0, 200, saved(student('s1', { version: 2 })))
    assert.equal(await save, true)
    assert.equal(acks.length, 1)
    assert.equal(model.hasChanges, false)
    assert.deepEqual(h.feedback, ['success'])
  })

  test('Written Work shortcuts stay on the question and page by five', () => {
    const { model } = marking(new Harness(), { part: 'p2' })
    assert.deepEqual(model.pageQuestions.map((q) => q.id), ['w1', 'w2', 'w3', 'w4', 'w5'])
    model.goToQuestion(4)
    model.applyQuick('full')
    assert.deepEqual(model.entry('w5'), { kind: 'score', text: '2' })
    assert.equal(model.questionIndex, 4) // no auto-advance
    model.goToQuestion(5)
    assert.equal(model.page, 1)
    assert.deepEqual(model.pageQuestions.map((q) => q.id), ['w6', 'w7'])
    model.applyQuick('half')
    assert.deepEqual(model.entry('w6'), { kind: 'score', text: '1' })
    model.applyQuick('zero')
    assert.deepEqual(model.entry('w6'), { kind: 'score', text: '0' })
    model.clearCurrent()
    assert.deepEqual(model.entry('w6'), { kind: 'notEntered' })
    model.goToQuestion(7) // past the end does not wrap
    assert.equal(model.questionIndex, 5)
    assert.equal(model.draftWrittenTotal, '2')
    assert.equal(model.enteredCount, 1)
  })

  test('half needs an exact hundredth', () => {
    const { model } = marking(new Harness(), { part: 'p3', mode: 'fast' })
    assert.equal(model.quickValue('half'), '5')
    const odd = new Harness()
    const detail = JSON.parse(DETAIL)
    detail.parts[2].max_score = '0.05'
    const m = new MarkingModel(odd.env, { onDefaults() {}, onSaved() {} }, decodeDetail(detail), decodeStudent(student()), odd.context, 'p3', 'fast')
    assert.equal(m.quickValue('half'), null)
    assert.equal(m.quickValue('full'), '0.05')
  })

  test('over the maximum, too many decimals or excused without a reason cannot save', () => {
    const { model } = marking(new Harness(), { part: 'p2' })
    model.setEntry('w1', { kind: 'score', text: '2.5' })
    assert.equal(model.canSave, false)
    assert.deepEqual(model.problems, ['Written, question 1: enter a mark from 0 to 2.'])
    model.setEntry('w1', { kind: 'score', text: '1.755' })
    assert.equal(model.canSave, false)
    model.setEntry('w1', { kind: 'score', text: '1.75' })
    assert.equal(model.canSave, true)

    model.selectPart('p3')
    model.setTotal({ text: '4', excused: true, reason: ' ' })
    assert.equal(model.canSave, false)
    assert.ok(model.problems.includes('Legacy: enter the excused reason.'))
  })

  test('an equal value in another spelling is not a change', () => {
    const { model } = marking(new Harness(), {
      part: 'p3',
      mode: 'fast',
      student: student('s1', { marks: [{ part_id: 'p3', kind: 'mark', score: '7.50', reason: null }] }),
    })
    assert.equal(model.total.text, '7.5')
    model.setTotal({ ...model.total, text: '٧٫٥٠' })
    assert.equal(model.hasChanges, false)
    model.setTotal({ ...model.total, text: '' })
    assert.equal(model.hasChanges, true)
  })

  test('fast mark over question work needs replacement; a mode change alone changes nothing', () => {
    const { model } = marking(new Harness(), {
      part: 'p2',
      mode: 'fast',
      student: student('s1', {
        marks: [{ part_id: 'p2', kind: 'mark', score: '3', reason: null, from_answers: true }],
        answers: [{ question_id: 'w1', part_id: 'p2', choice_id: null, score: '1' }, { question_id: 'w2', part_id: 'p2', choice_id: null, score: '2' }],
      }),
    })
    assert.equal(model.mode, 'byQuestion') // the saved representation is shown, not the run default
    model.selectMode('fast')
    assert.equal(model.hasChanges, false)
    model.setTotal({ text: '5', excused: false, reason: '' })
    assert.deepEqual(model.replacements, ['Written'])
    assert.equal(model.needsReplaceConfirmation, true)
    model.selectMode('byQuestion')
    model.setEntry('w1', { kind: 'score', text: '2' })
    // Editing by question returns the fast draft to its saved state: one representation per part.
    assert.deepEqual(model.total, { text: '', excused: false, reason: '' })
    assert.deepEqual(model.replacements, [])
  })

  test('fast mark sends an exact decimal string and an excused reason', async () => {
    const h = new Harness()
    const { model } = marking(h, { part: 'p3' })
    model.setTotal({ text: '٧,٢٥', excused: true, reason: ' sick ' })
    model.setFeedback('Well done')
    const save = model.save()
    await h.fetch.waitFor(1)
    assert.deepEqual(h.body(0), {
      annual_student_record_id: 's1',
      expected_version: 1,
      marks: [{ part_id: 'p3', score: '7.25', excused_reason: 'sick' }],
      feedback: 'Well done',
    })
    h.fetch.respond(0, 200, saved(student('s1', { version: 2 })))
    assert.equal(await save, true)
  })

  test('an uncertain save retries the same key and payload and locks editing', async () => {
    const h = new Harness()
    const { model, saved: acks } = marking(h, { part: 'p3' })
    model.setTotal({ text: '7.5', excused: false, reason: '' })
    const first = model.save()
    await h.fetch.waitFor(1)
    h.fetch.fail(0)
    assert.equal(await first, false)
    assert.equal(model.isUncertain, true)
    assert.equal(model.canEdit, false)
    assert.equal(model.needsLeaveConfirmation, true)
    assert.equal(model.canDismiss, false)
    model.setTotal({ text: '9', excused: false, reason: '' }) // ignored while unresolved
    assert.equal(model.total.text, '7.5')

    const retry = model.resumed() // foreground retry
    await h.fetch.waitFor(2)
    assert.equal(h.key(1), h.key(0))
    assert.equal(h.fetch.call(1).init.body, h.fetch.call(0).init.body)
    h.fetch.respond(1, 200, saved(student('s1', { version: 2 }), true))
    await retry
    assert.equal(acks.length, 1)
    assert.deepEqual(h.feedback, ['warning', 'success'])
  })

  test('throttling, 5xx and an unreadable 2xx keep the command; a definitive rejection ends it', async () => {
    const h = new Harness()
    const { model } = marking(h, { part: 'p3' })
    model.setTotal({ text: '1', excused: false, reason: '' })
    const outcomes: Array<[number, string, string]> = [
      [429, errorJSON('THROTTLED'), 'Too many saves. Retry in a moment.'],
      [503, errorJSON('INTERNAL'), "The server couldn't confirm the save. Retry."],
      [200, 'not json', "The server couldn't confirm the save. Retry."],
    ]
    for (const [i, [status, body, message]] of outcomes.entries()) {
      const save = model.save()
      await h.fetch.waitFor(i + 1)
      h.fetch.respond(i, status, body)
      await save
      assert.deepEqual(model.saveState, { status: 'uncertain', message })
      assert.equal(h.key(i), 'key-1')
    }
    const save = model.save()
    await h.fetch.waitFor(4)
    h.fetch.respond(3, 409, errorJSON('YEAR_CLOSED'))
    await save
    assert.deepEqual(model.saveState, { status: 'failed', message: 'This academic year is closed. Marks are read-only.' })
    assert.equal(model.canEdit, true) // the draft stays editable; the next Save is a new action
    model.setTotal({ text: '2', excused: false, reason: '' })
    assert.equal(model.saveState.status, 'idle')
    const next = model.save()
    await h.fetch.waitFor(5)
    assert.equal(h.key(4), 'key-2')
    h.fetch.respond(4, 200, saved(student('s1', { version: 2 })))
    assert.equal(await next, true)
  })

  test('a conflict keeps attempts, shows current work and needs a new action', async () => {
    const h = new Harness()
    const { model } = marking(h, { part: 'p3' })
    model.setTotal({ text: '6', excused: false, reason: '' })
    const save = model.save()
    await h.fetch.waitFor(1)
    const current = student('s1', { version: 3, marks: [{ part_id: 'p3', kind: 'mark', score: '9', reason: null }], total: '9' })
    h.fetch.respond(0, 409, errorJSON('MARKS_CONFLICT', { current }))
    assert.equal(await save, false)
    assert.equal(model.saveState.status === 'conflict' && model.saveState.current.version, 3)
    assert.equal(model.total.text, '6') // attempted input kept
    assert.equal(model.canSave, false)
    assert.equal(await model.save(), false) // no save while reviewing

    model.reapply()
    assert.equal(model.student.version, 3)
    assert.equal(model.total.text, '6')
    assert.equal(model.canSave, true)
    const again = model.save()
    await h.fetch.waitFor(2)
    assert.notEqual(h.key(1), h.key(0))
    assert.equal(h.body(1).expected_version, 3)
    h.fetch.respond(1, 200, saved(student('s1', { version: 4 })))
    assert.equal(await again, true)
  })

  test('use current work drops the attempt', async () => {
    const h = new Harness()
    const { model } = marking(h, { part: 'p3' })
    model.setTotal({ text: '6', excused: false, reason: '' })
    const save = model.save()
    await h.fetch.waitFor(1)
    h.fetch.respond(0, 409, errorJSON('MARKS_CONFLICT', { current: student('s1', { version: 3, marks: [{ part_id: 'p3', kind: 'mark', score: '9', reason: null }] }) }))
    await save
    model.useLatest()
    assert.equal(model.total.text, '9')
    assert.equal(model.hasChanges, false)
  })

  test('a late acknowledgment for another academy or account is ignored', async () => {
    for (const leave of ['academy', 'account'] as const) {
      const h = new Harness()
      const { model, saved: acks } = marking(h, { part: 'p3' })
      model.setTotal({ text: '1', excused: false, reason: '' })
      const save = model.save()
      await h.fetch.waitFor(1)
      if (leave === 'academy') {
        h.selection.select('B')
        h.selection.select('A') // A → B → A is a new context
      } else h.scope.end()
      h.fetch.respond(0, 200, saved(student('s1', { version: 2 })))
      assert.equal(await save, false)
      assert.deepEqual(acks, [])
      assert.equal(model.saveState.status, 'saving')
    }
  })

  test('a stale 401 or 403 neither signs out nor revalidates', async () => {
    const h = new Harness()
    const { model } = marking(h, { part: 'p3' })
    model.setTotal({ text: '1', excused: false, reason: '' })
    const save = model.save()
    await h.fetch.waitFor(1)
    h.selection.select('B')
    h.fetch.respond(0, 403, errorJSON('FORBIDDEN'))
    await save
    assert.deepEqual([h.signedOut, h.forbidden], [[], []])
  })

  test('401 keeps the command for after sign-in; 403 ends it', async () => {
    const h = new Harness()
    const { model } = marking(h, { part: 'p3' })
    model.setTotal({ text: '1', excused: false, reason: '' })
    const save = model.save()
    await h.fetch.waitFor(1)
    h.fetch.respond(0, 401, '')
    await h.fetch.waitFor(2)
    h.fetch.respond(1, 401, '') // after the forced refresh
    await save
    assert.deepEqual(model.saveState, { status: 'uncertain', message: 'Sign in again to finish saving.' })
    assert.equal(h.signedOut.length, 1)
    const retry = model.save()
    await h.fetch.waitFor(3)
    assert.equal(h.key(2), h.key(0))
    h.fetch.respond(2, 403, errorJSON('FORBIDDEN'))
    await retry
    assert.equal(model.saveState.status, 'failed')
    assert.equal(h.forbidden.length, 1)
    assert.equal(model.canEdit, true)
  })

  test('run defaults follow the instructor’s choice, not the shown representation', () => {
    const { model, defaults } = marking(new Harness(), { part: 'p2', mode: 'fast' })
    model.selectMode('byQuestion')
    model.selectPart('p1')
    assert.deepEqual(defaults.at(-1), ['p1', 'byQuestion'])
    assert.equal(model.questionIndex, 0)
  })

  test('without the mark action nothing is editable or saved', async () => {
    const h = new Harness()
    const detail = { ...JSON.parse(DETAIL), actions: { mark: false, announce: true } }
    const model = new MarkingModel(h.env, { onDefaults() {}, onSaved() {} }, decodeDetail(detail), decodeStudent(student()), h.context, 'p3', 'fast')
    model.setTotal({ text: '1', excused: false, reason: '' })
    assert.equal(model.hasChanges, false)
    assert.equal(await model.save(), false)
    assert.equal(h.fetch.calls.length, 0)
  })
})

async function loadedWorkspace(students: object[], total?: number) {
  const h = new Harness()
  const parent = new AssignmentsModel(h.env)
  const model = new WorkspaceModel(summary, h.context, parent)
  const load = model.load()
  await h.fetch.waitFor(1)
  h.fetch.respond(0, 200, DETAIL)
  await h.fetch.waitFor(2)
  h.fetch.respond(1, 200, page(students, total))
  await load
  return { h, parent, model }
}

describe('assignment list', () => {
  test('pages deliberately and a different academy drops the list and any late page', async () => {
    const h = new Harness()
    const model = new AssignmentsModel(h.env)
    const item = (id: string) => ({ id, title: id, due_at: null, state: 'closed', max_score: '10', recipient_count: 2, version: 1 })
    const load = model.load(h.context)
    await h.fetch.waitFor(1)
    assert.equal(h.path(0).search, '?state=active&limit=50&offset=0')
    h.fetch.respond(0, 200, JSON.stringify({ total: 3, assignments: [item('a1'), item('a2')] }))
    await load
    assert.equal(model.hasMore, true)
    const more = model.loadMore()
    await h.fetch.waitFor(2)
    assert.equal(h.path(1).searchParams.get('offset'), '2')
    const b = h.selection.select('B')!
    const reload = model.load(b)
    assert.equal(model.assignments.length, 0)
    await h.fetch.waitFor(3)
    h.fetch.respond(1, 200, JSON.stringify({ total: 3, assignments: [item('a3')] })) // A's late page
    await more
    h.fetch.respond(2, 200, JSON.stringify({ total: 1, assignments: [item('b1')] }))
    await reload
    assert.deepEqual(model.assignments.map((a) => a.id), ['b1'])
    assert.equal(model.isLoadingMore, false)
  })

  test('a failed next page keeps the loaded part; 403 clears and revalidates', async () => {
    const h = new Harness()
    const model = new AssignmentsModel(h.env)
    const load = model.load(h.context)
    await h.fetch.waitFor(1)
    h.fetch.respond(0, 200, JSON.stringify({ total: 9, assignments: [{ id: 'a1', title: 't', due_at: null, state: 'active', max_score: '1', recipient_count: 0 }] }))
    await load
    const more = model.loadMore()
    await h.fetch.waitFor(2)
    h.fetch.fail(1)
    await more
    assert.equal(model.loadMoreError, "Can't reach the server. Check your connection and try again.")
    assert.equal(model.assignments.length, 1)
    const again = model.load(h.context)
    await h.fetch.waitFor(3)
    h.fetch.respond(2, 403, errorJSON('FORBIDDEN'))
    await again
    assert.deepEqual([model.assignments, model.state, h.forbidden.length], [[], { status: 'idle' }, 1])
  })

  test('a status filter restarts from the first page and keeps its state across pages', async () => {
    const h = new Harness()
    const model = new AssignmentsModel(h.env)
    const item = (id: string, state: string) => ({ id, title: id, due_at: null, state, max_score: '1', recipient_count: 0 })
    const load = model.load(h.context)
    await h.fetch.waitFor(1)
    h.fetch.respond(0, 200, JSON.stringify({ total: 2, assignments: [item('a1', 'active')] }))
    await load
    const late = model.loadMore()
    await h.fetch.waitFor(2)
    const closed = model.setFilter('closed')
    assert.deepEqual([model.filter, model.assignments], ['closed', []])
    await h.fetch.waitFor(3)
    assert.equal(h.path(2).search, '?state=closed&limit=50&offset=0')
    h.fetch.respond(1, 200, JSON.stringify({ total: 2, assignments: [item('a2', 'active')] })) // late page of the old filter
    await late
    h.fetch.respond(2, 200, JSON.stringify({ total: 2, assignments: [item('c1', 'closed')] }))
    await closed
    assert.deepEqual(model.assignments.map((a) => a.id), ['c1'])
    const more = model.loadMore()
    await h.fetch.waitFor(4)
    assert.equal(h.path(3).search, '?state=closed&limit=50&offset=1')
    h.fetch.respond(3, 200, JSON.stringify({ total: 2, assignments: [item('c2', 'closed')] }))
    await more
    const all = model.setFilter('all')
    await h.fetch.waitFor(5)
    assert.equal(h.path(4).search, '?limit=50&offset=0')
    h.fetch.respond(4, 200, '{"total":0,"assignments":[]}')
    await all
    assert.deepEqual([model.assignments, model.state], [[], { status: 'loaded' }])
  })

  test('notifies subscribers on every committed change', async () => {
    const h = new Harness()
    const model = new AssignmentsModel(h.env)
    let calls = 0
    const stop = model.subscribe(() => calls++)
    const load = model.load(h.context)
    await h.fetch.waitFor(1)
    h.fetch.respond(0, 200, '{"total":0,"assignments":[]}')
    await load
    stop()
    assert.equal(calls, 2)
    assert.equal(model.getVersion(), 2)
  })
})

describe('workspace', () => {
  test('search goes to the server and an older page cannot overwrite it', async () => {
    const { h, model } = await loadedWorkspace([student('s1')], 80)
    assert.equal(model.hasMore, true)
    const older = model.loadMore()
    await h.fetch.waitFor(3)
    const search = model.setSearch('  a&b+c#d ')
    await h.fetch.waitFor(4)
    assert.equal(h.fetch.call(3).url.split('?')[1], 'filter=all&limit=50&offset=0&search=a%26b%2Bc%23d')
    assert.equal(h.path(3).searchParams.get('search'), 'a&b+c#d')
    h.fetch.respond(3, 200, page([student('s9', { name: 'Adam' })], 1))
    await search
    h.fetch.respond(2, 200, page([student('s2')], 80))
    await older
    assert.deepEqual(model.students.map((s) => s.id), ['s9'])
    assert.equal(model.total, 1)
  })

  test('selection clears when the list changes; cached chips skip the refetch', async () => {
    const { h, model } = await loadedWorkspace([student('s1', { marking: 'complete', total: '20' })])
    model.setSelecting(true)
    model.toggleSelected(model.students[0]!)
    assert.deepEqual([...model.selection], ['s1'])
    const filter = model.setFilter('unpublished')
    await h.fetch.waitFor(3)
    assert.equal(model.selection.size, 0)
    assert.equal(h.path(2).searchParams.get('filter'), 'unpublished')
    h.fetch.respond(2, 200, page([]))
    await filter
    await model.setFilter('all')
    assert.equal(h.fetch.calls.length, 3)
    assert.deepEqual(model.students.map((s) => s.id), ['s1'])
  })

  test('group sort loads the whole cohort in one page and keeps name order within each group', async () => {
    const one = (id: string, name: string, group: string | null) => ({ ...student(id, { name }), group_name: group })
    const { h, model } = await loadedWorkspace([one('s1', 'Amal', 'Nine B'), one('s2', 'Badr', null), one('s3', 'Dina', 'Nine A')], 3)
    assert.equal(h.path(1).searchParams.get('limit'), '50')
    const sort = model.setSort('group')
    await h.fetch.waitFor(3)
    assert.equal(h.path(2).searchParams.get('limit'), '1000')
    assert.equal(h.path(2).searchParams.get('offset'), '0')
    h.fetch.respond(2, 200, page([one('s1', 'Amal', 'Nine B'), one('s4', 'Cyra', 'Nine A'), one('s2', 'Badr', null), one('s3', 'Dina', 'Nine A')], 4))
    await sort
    assert.deepEqual(model.students.map((s) => s.id), ['s4', 's3', 's1', 's2'])
    assert.equal(model.hasMore, false)
  })

  test('a cohort larger than one full page keeps the server name order', async () => {
    const { h, model } = await loadedWorkspace([student('s1')], 1001)
    assert.equal(model.canSortFully, false)
    await model.setSort('group')
    assert.equal(model.sort, 'name')
    assert.equal(h.fetch.calls.length, 2)
  })

  test('a row tap opens the marking workflow, read-only too', async () => {
    const { model } = await loadedWorkspace([student('s1')])
    model.open(model.students[0]!, 'row')
    assert.equal(model.marking?.student.id, 's1')
    assert.equal(model.marking?.canEdit, true)
    model.closeMarking()

    const h = new Harness()
    const readOnly = new WorkspaceModel(summary, h.context, new AssignmentsModel(h.env))
    const load = readOnly.load()
    await h.fetch.waitFor(1)
    h.fetch.respond(0, 200, JSON.stringify({ ...JSON.parse(DETAIL), state: 'archived', actions: { mark: false, record_work: false, announce: false } }))
    await h.fetch.waitFor(2)
    h.fetch.respond(1, 200, page([student('s1')]))
    await load
    readOnly.open(readOnly.students[0]!, 'row')
    assert.equal(readOnly.marking?.student.id, 's1')
    assert.equal(readOnly.marking?.canEdit, false)
  })

  test('incomplete or announced work cannot be selected', async () => {
    const { model } = await loadedWorkspace([student('s1', { marking: 'partial' }), student('s2', { marking: 'complete', publication: 'published' })])
    assert.equal(model.announceBlocker(model.students[0]!), 'Not fully marked')
    assert.equal(model.announceBlocker(model.students[1]!), 'Already announced')
    model.startSelecting(model.students[0]!)
    model.toggleSelected(model.students[1]!)
    assert.equal(model.isSelecting, true)
    assert.equal(model.selection.size, 0)
    model.setSelecting(false)
    assert.equal(model.isSelecting, false)
  })

  test('an open sheet with unsaved changes blocks announcing that student and guards the academy switch', async () => {
    const { parent, model } = await loadedWorkspace([student('s1', { marking: 'complete', total: '20' })])
    model.open(model.students[0]!, 'row')
    assert.equal(parent.activeMarking, model.marking)
    assert.equal(parent.switchNeedsConfirmation, false)
    model.marking!.setFeedback('x')
    assert.equal(parent.switchNeedsConfirmation, true)
    assert.equal(model.announceBlocker(model.students[0]!), 'Has unsaved changes')
    parent.discardActiveMarking()
    assert.equal(parent.activeMarking, null)
    model.closeMarking()
    assert.equal(model.marking, null)
  })

  test('an acknowledged save updates the row and keeps the sheet open', async () => {
    const { h, model } = await loadedWorkspace([student('s1')])
    model.open(model.students[0]!, 'row')
    const sheet = model.marking!
    sheet.selectPart('p3')
    sheet.setTotal({ text: '10', excused: false, reason: '' })
    const save = sheet.save()
    await h.fetch.waitFor(3)
    h.fetch.respond(2, 200, saved(student('s1', { version: 2, marking: 'partial', total: '10' })))
    assert.equal(await save, true)
    assert.equal(model.students[0]!.version, 2)
    assert.equal(model.marking, sheet)
    sheet.selectMode('fast')
    model.closeMarking()
    model.open(model.students[0]!, 'row')
    assert.equal(model.marking!.partId, 'p3') // run defaults carry to the next student
  })

  test('a rejected announcement announces nobody and explains each student', async () => {
    const { h, model } = await loadedWorkspace([student('s1', { marking: 'complete', total: '20' }), student('s2', { marking: 'complete', total: '18' })])
    model.reviewAnnouncement(model.students)
    const send = model.announce()
    await h.fetch.waitFor(3)
    assert.deepEqual(h.body(2), { items: [{ annual_student_record_id: 's1', expected_version: 1 }, { annual_student_record_id: 's2', expected_version: 1 }] })
    assert.equal(h.path(2).pathname, '/api/v1/assignments/asg/results/publications')
    h.fetch.respond(2, 409, errorJSON('PUBLICATION_REJECTED', { failures: [{ annual_student_record_id: 's2', reason: 'stale' }] }))
    await h.fetch.waitFor(4) // the list refreshes for review
    h.fetch.respond(3, 200, page([]))
    await send
    assert.deepEqual(model.announcement?.state, {
      status: 'rejected',
      message: 'Nothing was announced. Review the refreshed list and try again.',
      reasons: { s2: 'Changed since you reviewed it' },
    })
  })

  test('one selected student is announced at once; an uncertain send retries with the same key and versions', async () => {
    const { h, model } = await loadedWorkspace([student('s1', { marking: 'complete', total: '20' }), student('s2', { marking: 'partial' })])
    model.startSelecting(model.students[0]!)
    const first = model.reviewSelection()
    assert.equal(model.announcement?.direct, true)
    assert.equal(model.announcement?.state.status, 'sending') // no review: the request is already out
    await h.fetch.waitFor(3)
    assert.deepEqual(h.body(2), { items: [{ annual_student_record_id: 's1', expected_version: 1 }] })
    model.toggleSelected(model.students[0]!) // the selection is fixed while sending
    assert.equal(model.selection.size, 1)
    await model.reviewSelection() // a repeat tap starts nothing new
    await model.announce()
    assert.equal(h.fetch.calls.length, 3)
    h.fetch.fail(2)
    await first
    assert.equal(model.announcement?.state.status, 'uncertain')
    assert.equal(model.notice, null)
    await model.reviewSelection() // still one command: the shown outcome owns the retry
    assert.equal(h.fetch.calls.length, 3)
    const retry = model.announce()
    await h.fetch.waitFor(4)
    assert.equal(h.key(3), h.key(2))
    assert.ok(h.key(2))
    assert.equal(h.fetch.call(3).init.body, h.fetch.call(2).init.body)
    h.fetch.respond(3, 200, '{"outcome":"published","replayed":true,"results":[{"annual_student_record_id":"s1","outcome":"published","revision":1}]}')
    await h.fetch.waitFor(5)
    h.fetch.respond(4, 200, page([]))
    await retry
    assert.equal(model.announcement, null)
    assert.equal(model.isSelecting, false)
    assert.equal(model.notice, 'Result announced.')
  })

  test('several selected students are reviewed before anything is sent', async () => {
    const { h, model } = await loadedWorkspace([student('s1', { marking: 'complete', total: '20' }), student('s2', { marking: 'complete', total: '18' })])
    model.startSelecting(model.students[0]!)
    model.toggleSelected(model.students[1]!)
    await model.reviewSelection()
    assert.equal(model.announcement?.direct, false)
    assert.equal(model.announcement?.state.status, 'reviewing')
    assert.equal(h.fetch.calls.length, 2) // detail and list only
    await model.reviewSelection()
    const key = model.announcement?.id
    const send = model.announce()
    void model.announce() // a double tap on the confirmation sends once
    await h.fetch.waitFor(3)
    assert.equal(h.key(2), key)
    h.fetch.respond(2, 200, '{"outcome":"published","replayed":false,"results":[]}')
    await h.fetch.waitFor(4)
    h.fetch.respond(3, 200, page([]))
    await send
    assert.equal(h.fetch.calls.length, 4)
    assert.equal(model.notice, '2 results announced.')
  })

  test('a long press on an ineligible student selects nothing and never announces', async () => {
    const { h, model } = await loadedWorkspace([student('s1', { marking: 'partial' })])
    model.startSelecting(model.students[0]!)
    assert.equal(model.isSelecting, true)
    assert.equal(model.selection.size, 0)
    assert.equal(model.announcement, null)
    assert.equal(h.fetch.calls.length, 2)
  })

  test('a code lookup is read-only and opens the same sheet', async () => {
    const { h, parent, model } = await loadedWorkspace([])
    const lookup = model.lookUp(' 0001 ', 'camera')
    assert.equal(model.isLookingUp, true)
    assert.equal(model.scanPaused, true)
    await h.fetch.waitFor(3)
    assert.equal(h.key(2), undefined)
    assert.equal(h.fetch.call(2).init.method, 'POST')
    assert.equal(h.path(2).pathname, '/api/v1/assignments/asg/student-resolution')
    assert.deepEqual(h.body(2), { student_id: '0001' })
    h.fetch.respond(2, 200, JSON.stringify({ student: student() }))
    assert.equal(await lookup, true)
    assert.equal(model.marking?.student.id, 's1')
    assert.equal(model.origin, 'camera')
    assert.equal(parent.activeMarking, model.marking)
  })

  test('a refused code writes nothing and a code run is ready for the next student', async () => {
    const { h, model } = await loadedWorkspace([])
    const lookup = model.lookUp('9999', 'code')
    await h.fetch.waitFor(3)
    h.fetch.respond(2, 404, errorJSON('STUDENT_CODE_NOT_FOUND'))
    assert.equal(await lookup, false)
    assert.equal(model.lookupError, 'No student has code 9999.')
    assert.equal(model.marking, null)
    assert.equal(model.isLookingUp, false)

    const next = model.lookUp('0001', 'code')
    await h.fetch.waitFor(4)
    h.fetch.respond(3, 200, JSON.stringify({ student: student() }))
    await next
    model.closeMarking()
    assert.equal(model.nextStudentRequest, 1)
  })

  test('a late lookup for another academy opens nothing', async () => {
    const { h, model } = await loadedWorkspace([])
    const lookup = model.lookUp('0001', 'code')
    await h.fetch.waitFor(3)
    h.selection.select('B')
    h.fetch.respond(2, 200, JSON.stringify({ student: student() }))
    assert.equal(await lookup, false)
    assert.equal(model.marking, null)
  })

  test('the camera looks up a newly visible code once and pauses while the sheet is open', async () => {
    const { h, model } = await loadedWorkspace([])
    const opened = model.scanned(['0001'])!
    assert.equal(model.scanned(['0001', '0002']), null) // paused during the lookup
    await h.fetch.waitFor(3)
    h.fetch.respond(2, 200, JSON.stringify({ student: student() }))
    assert.equal(await opened, true)
    assert.equal(model.scanned(['0002']), null) // paused while marking
    assert.deepEqual(h.feedback, ['recognized'])
  })
})

describe('scan filter', () => {
  test('a handled code is suppressed until it leaves view', () => {
    const scan = new ScanFilter()
    assert.equal(scan.recognized(['0001'], false), '0001')
    assert.equal(scan.recognized(['0001'], false), null) // same book still in view
    assert.equal(scan.recognized(['0001', '0002'], true), null) // paused while the sheet is open
    assert.equal(scan.recognized(['0001'], false), null)
    assert.equal(scan.recognized([], false), null) // the book left the view
    assert.equal(scan.recognized(['0001'], false), '0001')
    assert.equal(scan.recognized(['00012'], false), '00012') // leading zeros and length kept
    assert.equal(scan.recognized([' ', 'x'.repeat(41)], false), null)
  })
})
