import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react'
import { AppState, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, useColorScheme } from 'react-native'
import { choiceLetter, isWrittenWork, markFor, studentStatus, takesAnswers, takesTotal, type Question } from './api.ts'
import { MarkingModel, MODE_TITLES, NOT_ENTERED, type Entry, type Quick } from './marking.ts'
import { systemConfirm, type AssessmentPlatform, type BarItem, type IconName } from './platform.ts'
import { displayScore } from './score.ts'
import { digits, font, useColors } from './theme.ts'
import { BorderedButton, ProminentButton, TextButton, useModel } from './ui.tsx'
import { enteredText, leaveTitle, questionRange, replaceMessage, showsQuickBar, studentDetails } from './views.ts'

const FAST_FIELD = 'fast'

/**
 * Full-height marking sheet for one student (MarkingSheet.swift): part, By question / Fast mark, entry,
 * feedback, Save. The shortcut chips sit in a bottom bar that stays above the keyboard.
 */
export function MarkingSheet({ model, platform, onClose }: { model: MarkingModel; platform: AssessmentPlatform; onClose: () => void }) {
  useModel(model)
  const colors = useColors()
  const confirm = platform.confirm ?? systemConfirm
  const [focus, setFocus] = useState<string | null>(null)
  // Feedback stays out of the way until asked for, or when the student already has some.
  const [showFeedback, setShowFeedback] = useState(() => model.feedback !== '')
  const inputs = useRef(new Map<string, ComponentRef<typeof TextInput>>())

  const requestSave = () => {
    if (model.needsReplaceConfirmation) {
      confirm({
        title: 'Replace saved marks?',
        message: replaceMessage(model.replacements),
        actions: [{ title: 'Replace and save', onPress: () => void model.save() }, { title: 'Keep editing', role: 'cancel' }],
      })
    } else void model.save()
  }
  const close = () => {
    if (!model.needsLeaveConfirmation) return onClose()
    confirm({
      title: leaveTitle(model.student.fullName),
      actions: [
        { title: 'Save', disabled: !model.canRequestSave, onPress: requestSave },
        {
          title: 'Discard',
          role: 'destructive',
          onPress: () => {
            model.discard()
            onClose()
          },
        },
        { title: 'Keep editing', role: 'cancel' },
      ],
    })
  }

  // Back in the foreground: settle an unacknowledged save before anything else.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void model.resumed()
    })
    return () => sub.remove()
  }, [model])
  // A shortcut that moves the current Written Work question moves the keyboard with it.
  const current = model.currentQuestion?.id
  const written = isWrittenWork(model.part)
  useEffect(() => {
    if (focus !== null && focus !== FAST_FIELD && written && current !== undefined && focus !== current) inputs.current.get(current)?.focus()
    // Only a question change moves focus; typing into another field must not.
  }, [current])

  const focusProps = (id: string) => ({
    onFocus: () => setFocus(id),
    onBlur: () => setFocus((f) => (f === id ? null : f)),
  })

  const leading: BarItem = { kind: 'icon', icon: 'cancel-01', label: 'Close', disabled: model.isSaving, onPress: close }
  const trailing: BarItem = model.isSaving
    ? { kind: 'progress' }
    : model.needsLeaveConfirmation
      ? { kind: 'text', title: model.isUncertain ? 'Retry' : 'Save', prominent: true, disabled: !model.canRequestSave, onPress: requestSave }
      : // Nothing unsaved: finish with this student.
        { kind: 'text', title: 'Done', prominent: true, onPress: onClose }

  const part = model.part
  const quickBar = showsQuickBar(focus !== null, model.mode, part)
  return (
    <platform.NavigationBar title={model.assignment.title} leading={leading} trailing={trailing}>
      <KeyboardAvoidingView style={[styles.fill, { backgroundColor: colors.groupedBackground }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.fill} contentContainerStyle={[styles.content, quickBar && styles.underQuickBar]} keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} keyboardShouldPersistTaps="handled">
          <Header model={model} />
          {model.saveState.status === 'conflict' && <Conflict model={model} />}
          {model.assignment.parts.length > 1 && <PartChips model={model} />}
          {model.modes.length > 1 && (
            <platform.Segmented
              accessibilityLabel="Entry"
              values={model.modes.map((m) => MODE_TITLES[m])}
              selectedIndex={model.modes.indexOf(model.mode)}
              onChange={(i) => {
                const mode = model.modes[i]
                if (mode) model.selectMode(mode)
              }}
            />
          )}
          {model.mode === 'byQuestion' && part && takesAnswers(part) ? (
            <Questions model={model} inputs={inputs.current} focusProps={focusProps} />
          ) : part && takesTotal(part) ? (
            <FastMark model={model} focusProps={focusProps} />
          ) : null}
          {showFeedback ? (
            <Card>
              <View style={styles.between}>
                <Text style={[font.footnoteSemibold, { color: colors.secondaryLabel }]}>Feedback</Text>
                {model.canEdit && (
                  // Removing clears the text; a saved feedback is removed on the next Save.
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Remove feedback"
                    hitSlop={12}
                    onPress={() => {
                      model.setFeedback('')
                      setShowFeedback(false)
                    }}
                  >
                    <platform.Icon name="cancel-01" size={16} color={colors.secondaryLabel} />
                  </Pressable>
                )}
              </View>
              <TextInput
                style={[font.body, styles.feedback, { color: colors.label }]}
                placeholder="Feedback"
                placeholderTextColor={colors.secondaryLabel}
                value={model.feedback}
                onChangeText={(t) => model.setFeedback(t)}
                editable={model.canEdit}
                multiline
                accessibilityLabel="Feedback"
              />
            </Card>
          ) : model.canEdit ? (
            <View style={styles.leading}>
              <TextButton title="Add feedback" style={font.subheadline} onPress={() => setShowFeedback(true)} />
            </View>
          ) : null}
          <Status model={model} />
        </ScrollView>
        {quickBar && <QuickBar model={model} platform={platform} />}
      </KeyboardAvoidingView>
    </platform.NavigationBar>
  )
}

type FocusProps = (id: string) => { onFocus: () => void; onBlur: () => void }

function Card({ title, children }: { title?: string; children: ReactNode }) {
  const colors = useColors()
  return (
    <View style={[styles.card, { backgroundColor: colors.secondaryGroupedBackground }]}>
      {title !== undefined && <Text style={[font.footnoteSemibold, { color: colors.secondaryLabel }]}>{title}</Text>}
      {children}
    </View>
  )
}

function Header({ model }: { model: MarkingModel }) {
  const colors = useColors()
  const { student, assignment } = model
  const details = studentDetails(student)
  return (
    <View style={styles.header}>
      <Text style={[font.title2Bold, { color: colors.label }]} accessibilityRole="header">
        {student.fullName}
      </Text>
      {details !== '' && <Text style={[font.subheadline, { color: colors.secondaryLabel }]}>{details}</Text>}
      <View style={styles.between}>
        <View style={styles.badge}>
          <View style={[StyleSheet.absoluteFill, styles.badgeTint, { backgroundColor: colors.accent }]} />
          <Text style={[font.captionSemibold, { color: colors.label }]}>{studentStatus(student)}</Text>
        </View>
        <Text style={[font.title3Semibold, digits, { color: colors.label }]}>{`${displayScore(student.total)} / ${displayScore(assignment.maxScore)}`}</Text>
      </View>
      {student.publication !== null && student.publicationState === 'pending_correction' && (
        <Text style={[font.footnote, { color: colors.orange }]}>{`Official result ${displayScore(student.publication.total)} until the correction is announced`}</Text>
      )}
    </View>
  )
}

function Conflict({ model }: { model: MarkingModel }) {
  const colors = useColors()
  if (model.saveState.status !== 'conflict') return null
  const { current } = model.saveState
  const max = model.assignment.maxScore
  const labeled = (label: string, value: string, key?: string) => (
    <View key={key} style={styles.between} accessible accessibilityLabel={`${label}, ${value}`}>
      <Text style={[font.body, { color: colors.label }]}>{label}</Text>
      <Text style={[font.body, { color: colors.secondaryLabel }]}>{value}</Text>
    </View>
  )
  return (
    <Card title="Changed on another device">
      {labeled('Current total', `${displayScore(current.total)} / ${displayScore(max)}`)}
      {labeled('Current status', studentStatus(current))}
      {model.assignment.parts.map((p) => {
        const mark = markFor(current, p.id)
        return labeled(p.title, mark ? displayScore(mark.score) : 'Not marked', p.id)
      })}
      <View style={styles.conflictButtons}>
        <BorderedButton title="Use current work" onPress={() => model.useLatest()} />
        <ProminentButton title="Keep my changes" onPress={() => model.reapply()} />
      </View>
      <Text style={[font.footnote, { color: colors.secondaryLabel }]}>Your entries are kept until you choose.</Text>
    </Card>
  )
}

function PartChips({ model }: { model: MarkingModel }) {
  const colors = useColors()
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {model.assignment.parts.map((p) => {
        const selected = p.id === model.partId
        const mark = markFor(model.student, p.id)
        const text = { color: selected ? colors.white : colors.label }
        return (
          <Pressable
            key={p.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => model.selectPart(p.id)}
            style={[styles.partChip, { backgroundColor: selected ? colors.accent : colors.secondaryGroupedBackground }]}
          >
            <Text style={[font.subheadlineSemibold, text]} numberOfLines={1}>
              {p.title}
            </Text>
            <Text style={[font.caption, digits, text, styles.dim]}>{`${mark ? displayScore(mark.score) : '–'} / ${displayScore(p.maxScore)}`}</Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

function Questions({ model, inputs, focusProps }: { model: MarkingModel; inputs: Map<string, ComponentRef<typeof TextInput>>; focusProps: FocusProps }) {
  const colors = useColors()
  const written = isWrittenWork(model.part)
  return (
    <Card>
      <View style={styles.between}>
        <Text style={[font.footnoteSemibold, { color: colors.secondaryLabel }]}>
          {questionRange(model.page, MarkingModel.pageSize, model.pageQuestions.length, model.questions.length)}
        </Text>
        <Text style={[font.footnote, digits, { color: colors.secondaryLabel }]}>
          {enteredText(model.enteredCount, model.questions.length, model.draftWrittenTotal, model.part?.maxScore)}
        </Text>
      </View>
      {model.pageQuestions.map((q, i) => (
        <View key={q.id}>
          {i > 0 && <View style={[styles.divider, { backgroundColor: colors.separator }]} />}
          {written ? <WrittenRow model={model} question={q} inputs={inputs} focusProps={focusProps} /> : <ChoiceRow model={model} question={q} />}
        </View>
      ))}
      {model.pageCount > 1 && (
        <View style={styles.between}>
          <BorderedButton small title="Previous page" disabled={model.page === 0} onPress={() => model.goToPage(model.page - 1)} />
          <Text style={[font.footnote, { color: colors.secondaryLabel }]}>{`Page ${model.page + 1} of ${model.pageCount}`}</Text>
          <BorderedButton small title="Next page" disabled={model.page >= model.pageCount - 1} onPress={() => model.goToPage(model.page + 1)} />
        </View>
      )}
    </Card>
  )
}

/** `verdict`: true/false colours a selected chip accent/red from the answer key; null is neutral grey. */
function AnswerChip(props: { title: string; selected: boolean; verdict: boolean | null; label: string; disabled: boolean; onPress: () => void }) {
  const colors = useColors()
  // No answer key sent: a neutral selection that doesn't imply right or wrong.
  const fill = !props.selected ? colors.tertiaryFill : props.verdict === null ? colors.gray : props.verdict ? colors.accent : colors.red
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ selected: props.selected, disabled: props.disabled }}
      disabled={props.disabled}
      onPress={props.onPress}
      style={[styles.answerChip, props.title.length > 1 && styles.answerChipWide, { backgroundColor: fill }]}
    >
      <Text style={[font.bodySemibold, { color: props.selected ? colors.white : colors.label }]}>{props.title}</Text>
    </Pressable>
  )
}

function ChoiceRow({ model, question }: { model: MarkingModel; question: Question }) {
  const colors = useColors()
  const entry = model.entry(question.id)
  // Only a key the server sent can mark an answer right or wrong.
  const hasKey = question.choices.some((c) => c.isCorrect === true)
  const isChoice = (id: string | null) => entry.kind === 'choice' && entry.choiceId === id
  // Tapping the selected chip again returns the question to not entered.
  const pick = (id: string | null) => model.setEntry(question.id, isChoice(id) ? NOT_ENTERED : { kind: 'choice', choiceId: id })
  const disabled = !model.canEdit
  return (
    <View style={styles.choiceRow}>
      <Text style={[font.headline, digits, styles.choicePosition, { color: colors.label }]}>{question.position}</Text>
      {/* Wraps only when the choices don't fit one line (many letters, large text). */}
      <View style={styles.wrap}>
        {question.choices.map((c) => (
          <AnswerChip
            key={c.id}
            title={choiceLetter(c)}
            selected={isChoice(c.id)}
            verdict={hasKey ? c.isCorrect === true : null}
            label={`Question ${question.position}, choice ${choiceLetter(c)}`}
            disabled={disabled}
            onPress={() => pick(c.id)}
          />
        ))}
        <AnswerChip title="—" selected={isChoice(null)} verdict={null} label={`Question ${question.position}, blank`} disabled={disabled} onPress={() => pick(null)} />
      </View>
    </View>
  )
}

function WrittenRow({ model, question, inputs, focusProps }: { model: MarkingModel; question: Question; inputs: Map<string, ComponentRef<typeof TextInput>>; focusProps: FocusProps }) {
  const colors = useColors()
  const index = model.questions.findIndex((q) => q.id === question.id)
  const entry: Entry = model.entry(question.id)
  const focus = focusProps(question.id)
  return (
    <View style={styles.writtenRow}>
      <Text style={[font.headline, digits, styles.writtenPosition, { color: colors.label }]}>{question.position}</Text>
      <TextInput
        ref={(r) => {
          if (r) inputs.set(question.id, r)
          else inputs.delete(question.id)
        }}
        style={[font.body, styles.input, styles.right, { color: colors.label, backgroundColor: colors.tertiaryFill, borderColor: colors.accent, borderWidth: model.questionIndex === index ? 2 : 0 }]}
        placeholder="Mark"
        placeholderTextColor={colors.secondaryLabel}
        keyboardType="decimal-pad"
        value={entry.kind === 'score' ? entry.text : ''}
        onChangeText={(t) => model.setEntry(question.id, t === '' ? NOT_ENTERED : { kind: 'score', text: t })}
        editable={model.canEdit}
        accessibilityLabel={`Question ${question.position} mark`}
        onFocus={() => {
          focus.onFocus()
          model.goToQuestion(index)
        }}
        onBlur={focus.onBlur}
      />
      <Text style={[font.body, digits, styles.max, { color: colors.secondaryLabel }]}>{`/ ${displayScore(question.maxScore)}`}</Text>
    </View>
  )
}

function FastMark({ model, focusProps }: { model: MarkingModel; focusProps: FocusProps }) {
  const colors = useColors()
  const total = model.total
  const field = [styles.input, { color: colors.label, backgroundColor: colors.tertiaryFill }]
  return (
    <Card title="Part mark">
      <View style={styles.fastRow}>
        <TextInput
          style={[font.title3, digits, field, styles.fastInput]}
          placeholder="Mark"
          placeholderTextColor={colors.secondaryLabel}
          keyboardType="decimal-pad"
          value={total.text}
          onChangeText={(text) => model.setTotal({ ...model.total, text })}
          editable={model.canEdit}
          accessibilityLabel={`${model.part?.title ?? 'Part'} mark`}
          {...focusProps(FAST_FIELD)}
        />
        <Text style={[font.body, digits, { color: colors.secondaryLabel }]}>{`/ ${displayScore(model.part?.maxScore)}`}</Text>
      </View>
      <View style={styles.between}>
        <Text style={[font.body, { color: colors.label, opacity: model.canEdit ? 1 : 0.4 }]}>Excused</Text>
        <Switch
          accessibilityLabel="Excused"
          value={total.excused}
          disabled={!model.canEdit}
          onValueChange={(excused) => model.setTotal({ ...model.total, excused })}
        />
      </View>
      {total.excused && (
        <TextInput
          style={[font.body, field, styles.fastInput]}
          placeholder="Reason"
          placeholderTextColor={colors.secondaryLabel}
          value={total.reason}
          onChangeText={(reason) => model.setTotal({ ...model.total, reason })}
          editable={model.canEdit}
          multiline
          accessibilityLabel="Reason"
        />
      )}
    </Card>
  )
}

function Status({ model }: { model: MarkingModel }) {
  const colors = useColors()
  const { problems, saveState } = model
  const message = saveState.status === 'uncertain' || saveState.status === 'failed' ? saveState.message : null
  if (problems.length === 0 && message === null) return null
  return (
    <View style={styles.status} accessibilityLiveRegion="polite">
      {problems.map((p) => (
        <Text key={p} style={[font.footnote, { color: colors.red }]}>
          {p}
        </Text>
      ))}
      {message !== null && <Text style={[font.footnote, { color: colors.red }]}>{message}</Text>}
    </View>
  )
}

/**
 * ‹ › | ✕ ½ ✓ — floating chips above the keyboard. They change the current question (or the total)
 * and never move on their own.
 */
function QuickBar({ model, platform }: { model: MarkingModel; platform: AssessmentPlatform }) {
  const colors = useColors()
  const dark = useColorScheme() === 'dark'
  const quick = (key: string, label: string, content: IconName | { text: string }, disabled: boolean, action: () => void) => {
    const off = disabled || !model.canEdit
    return (
      <Pressable key={key} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: off }} disabled={off} onPress={action}>
        <platform.GlassCapsule interactive style={[styles.quick, { opacity: off ? 0.4 : 1 }]}>
          {typeof content === 'string' ? <platform.Icon name={content} size={18} color={colors.label} /> : <Text style={[font.bodySemibold, { color: colors.label }]}>{content.text}</Text>}
        </platform.GlassCapsule>
      </Pressable>
    )
  }
  const value = (q: Quick) => model.quickValue(q) === null
  return (
    // Soft fade so the chips read over scrolling content.
    <View style={[styles.quickBar, { experimental_backgroundImage: `linear-gradient(to bottom, transparent, ${dark ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)'})` }]}>
      {model.mode === 'byQuestion' && (
        <>
          {quick('prev', 'Previous question', 'chevron-left', model.questionIndex === 0, () => model.goToQuestion(model.questionIndex - 1))}
          {quick('next', 'Next question', 'chevron-right', model.questionIndex >= model.questions.length - 1, () => model.goToQuestion(model.questionIndex + 1))}
          <View style={[styles.quickDivider, { backgroundColor: colors.separator }]} />
        </>
      )}
      {quick('zero', 'Zero', 'cancel-01', value('zero'), () => model.applyQuick('zero'))}
      {quick('half', 'Half marks', { text: '½' }, value('half'), () => model.applyQuick('half'))}
      {quick('full', 'Full marks', 'tick-02', value('full'), () => model.applyQuick('full'))}
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: 16, paddingVertical: 12, gap: 14 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  leading: { alignItems: 'flex-start' },
  card: { padding: 14, borderRadius: 14, gap: 8 },
  header: { gap: 6 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  badgeTint: { opacity: 0.15 },
  conflictButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chips: { gap: 8 },
  partChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, alignItems: 'center', gap: 1 },
  dim: { opacity: 0.8 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
  choiceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  choicePosition: { width: 26, height: 40, lineHeight: 40, textAlign: 'right' },
  wrap: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  answerChip: { minWidth: 40, minHeight: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  answerChipWide: { paddingHorizontal: 8 },
  writtenRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  writtenPosition: { width: 30, textAlign: 'right' },
  input: { flex: 1, paddingHorizontal: 12, minHeight: 40, borderRadius: 10 },
  right: { textAlign: 'right' },
  max: { minWidth: 44 },
  fastRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fastInput: { minHeight: 44 },
  feedback: { minHeight: 44, maxHeight: 132, paddingVertical: 0, textAlignVertical: 'top' },
  status: { gap: 4 },
  // Content scrolls under the bar (SwiftUI safeAreaInset), so the fade reads over it.
  underQuickBar: { paddingBottom: 78 },
  quickBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 24, paddingBottom: 6 },
  quick: { width: 52, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  quickDivider: { width: StyleSheet.hairlineWidth, height: 20 },
})
