import Foundation
import Observation

/// One student's marking draft: per-question entries or fast part totals, feedback, and the save.
/// Scoring stays on the server; this only shapes inputs, validates format/maxima and owns the request.
@MainActor
@Observable
final class MarkingModel {
    enum Mode: String, CaseIterable, Identifiable {
        case byQuestion = "By question"
        case fast = "Fast mark"
        var id: String { rawValue }
    }

    enum Entry: Equatable {
        case notEntered
        /// nil: Blank (recorded as unanswered).
        case choice(String?)
        case score(String)
    }

    struct Total: Equatable {
        var text = ""
        var excused = false
        var reason = ""
    }

    enum SaveState: Equatable {
        case idle
        case saving
        /// The outcome is unknown; Retry resends the same key and payload.
        case uncertain(String)
        /// Someone else saved first. Attempted inputs stay in the draft; `current` is the server's work.
        case conflict(current: StudentWork)
        case failed(String)
    }

    static let pageSize = 5

    let assignment: AssignmentDetail
    let context: AcademyContext
    /// The server work this draft is based on (its version is the save's expected version).
    private(set) var student: StudentWork
    private(set) var partID: String
    private(set) var mode: Mode
    /// The mode the instructor chose for this run; a part's saved representation may be shown instead.
    private var runMode: Mode
    /// Position within the selected part's questions.
    private(set) var questionIndex = 0
    private(set) var entries: [String: Entry] = [:]
    private(set) var totals: [String: Total] = [:]
    var feedback: String { didSet { if feedback != oldValue { clearFailure() } } }
    private(set) var saveState: SaveState = .idle

    /// The part representation the instructor edited; parts not listed are left as saved.
    private var edited: [String: Mode] = [:]
    private var baseEntries: [String: Entry] = [:]
    private var baseTotals: [String: Total] = [:]
    private var baseFeedback = ""
    /// The unacknowledged request, retried unchanged until the server answers.
    private var pending: (key: String, body: SaveMarksBody)?

    private let api: APIClient
    private let isCurrent: @MainActor (AcademyContext) -> Bool
    private let onDefaults: @MainActor (String, Mode) -> Void
    private let onSaved: @MainActor (StudentWork) -> Void
    private let onUnauthenticated: @MainActor () async -> Void
    private let onForbidden: @MainActor () async -> Void

    init(
        assignment: AssignmentDetail, student: StudentWork, context: AcademyContext, api: APIClient,
        partID: String?, mode: Mode,
        isCurrent: @escaping @MainActor (AcademyContext) -> Bool,
        onDefaults: @escaping @MainActor (String, Mode) -> Void,
        onSaved: @escaping @MainActor (StudentWork) -> Void,
        onUnauthenticated: @escaping @MainActor () async -> Void,
        onForbidden: @escaping @MainActor () async -> Void
    ) {
        self.assignment = assignment
        self.context = context
        self.student = student
        self.api = api
        self.isCurrent = isCurrent
        self.onDefaults = onDefaults
        self.onSaved = onSaved
        self.onUnauthenticated = onUnauthenticated
        self.onForbidden = onForbidden
        let first = assignment.parts.first?.id ?? ""
        self.partID = assignment.parts.contains(where: { $0.id == partID }) ? partID ?? first : first
        self.mode = mode
        self.runMode = mode
        self.feedback = student.feedback
        rebase(on: student, keepDraft: false)
        self.mode = shownMode(for: self.partID, preferred: mode)
    }

    // MARK: - Structure

    var part: AssignmentDetail.Part? { assignment.parts.first { $0.id == partID } }
    var canEdit: Bool { assignment.actions.mark && pending == nil && !isConflict }
    var isConflict: Bool { if case .conflict = saveState { true } else { false } }
    var isSaving: Bool { saveState == .saving }
    var isUncertain: Bool { if case .uncertain = saveState { true } else { false } }

    /// Modes the selected part supports.
    var modes: [Mode] {
        guard let part else { return [] }
        return (part.takesAnswers ? [Mode.byQuestion] : []) + (part.takesTotal ? [Mode.fast] : [])
    }

    var questions: [AssignmentDetail.Question] { part?.questions ?? [] }
    var page: Int { questionIndex / Self.pageSize }
    var pageCount: Int { max(1, (questions.count + Self.pageSize - 1) / Self.pageSize) }
    var pageQuestions: [AssignmentDetail.Question] {
        Array(questions.dropFirst(page * Self.pageSize).prefix(Self.pageSize))
    }
    var currentQuestion: AssignmentDetail.Question? { questions.indices.contains(questionIndex) ? questions[questionIndex] : nil }

    func selectPart(_ id: String) {
        guard id != partID, assignment.parts.contains(where: { $0.id == id }) else { return }
        partID = id
        questionIndex = 0
        mode = shownMode(for: id, preferred: runMode)
        onDefaults(partID, runMode)
    }

    /// Changing modes never changes saved work; only edits in a mode do.
    func selectMode(_ new: Mode) {
        guard modes.contains(new) else { return }
        mode = new
        runMode = new
        onDefaults(partID, runMode)
    }

    func goToQuestion(_ index: Int) {
        guard questions.indices.contains(index) else { return }
        questionIndex = index
    }

    func goToPage(_ page: Int) { goToQuestion(page * Self.pageSize) }

    /// The saved representation wins over the run default, so existing work is shown as saved.
    private func shownMode(for partID: String, preferred: Mode) -> Mode {
        guard let part = assignment.parts.first(where: { $0.id == partID }) else { return preferred }
        let available = (part.takesAnswers ? [Mode.byQuestion] : []) + (part.takesTotal ? [Mode.fast] : [])
        if let saved = student.mark(for: partID), available.contains(saved.fromAnswers ? .byQuestion : .fast) {
            return saved.fromAnswers ? .byQuestion : .fast
        }
        return available.contains(preferred) ? preferred : available.first ?? preferred
    }

    // MARK: - Entry

    func entry(_ questionID: String) -> Entry { entries[questionID] ?? .notEntered }

    func setEntry(_ questionID: String, _ value: Entry) {
        guard canEdit, questions.contains(where: { $0.id == questionID }) else { return }
        entries[questionID] = value
        startEditing(partID, as: .byQuestion)
    }

    enum Quick { case zero, half, full }

    /// What a shortcut would enter: the current Written Work question, or the part total in Fast mark.
    /// Half is nil when the maximum doesn't divide exactly into hundredths.
    func quickValue(_ quick: Quick) -> String? {
        guard let limit = Score.hundredths(mode == .fast ? part?.maxScore ?? "" : currentQuestion?.maxScore ?? "") else { return nil }
        switch quick {
        case .zero: return "0"
        case .full: return Score.format(limit)
        case .half: return limit % 2 == 0 ? Score.format(limit / 2) : nil
        }
    }

    /// Shortcut entry: it changes the current question (or total) and never moves.
    func applyQuick(_ quick: Quick) {
        guard let value = quickValue(quick) else { return }
        if mode == .fast {
            var draft = total
            draft.text = value
            setTotal(draft)
        } else if let question = currentQuestion {
            setEntry(question.id, .score(value))
        }
    }

    func clearCurrent() {
        guard let question = currentQuestion else { return }
        setEntry(question.id, .notEntered)
    }

    var total: Total { totals[partID] ?? Total() }

    func setTotal(_ value: Total) {
        guard canEdit else { return }
        totals[partID] = value
        startEditing(partID, as: .fast)
    }

    /// One representation per part: editing one returns the other's draft to its saved state.
    private func startEditing(_ partID: String, as mode: Mode) {
        clearFailure()
        edited[partID] = mode
        guard let part = assignment.parts.first(where: { $0.id == partID }) else { return }
        if mode == .byQuestion {
            totals[partID] = baseTotals[partID]
        } else {
            for question in part.questions { entries[question.id] = baseEntries[question.id] }
        }
    }

    private func clearFailure() {
        if case .failed = saveState { saveState = .idle }
    }

    // MARK: - Progress

    var enteredCount: Int { questions.filter { entry($0.id) != .notEntered }.count }

    /// Draft Written Work total of the selected part; choice parts are scored by the server.
    var draftWrittenTotal: String? {
        guard part?.kind == .writtenWork else { return nil }
        var sum = 0
        for question in questions {
            guard case .score(let text) = entry(question.id) else { continue }
            guard let value = Score.hundredths(text) else { return nil }
            sum += value
        }
        return Score.format(sum)
    }

    var savedPartScore: String? { student.mark(for: partID).map { Score.display($0.score) } }

    // MARK: - Changes and validation

    var hasChanges: Bool {
        feedback != baseFeedback || assignment.parts.contains { !(edits(for: $0)?.isEmpty ?? false) }
    }

    /// Parts whose saved representation this save replaces (fast ↔ question entry).
    var replacements: [String] {
        assignment.parts.compactMap { part in
            guard let mode = edited[part.id], !(edits(for: part)?.isEmpty ?? true) else { return nil }
            let saved = student.mark(for: part.id)
            let hasAnswers = student.answers.contains { $0.partId == part.id }
            let replaces = mode == .byQuestion ? (saved != nil && saved?.fromAnswers == false) : hasAnswers
            return replaces ? part.title : nil
        }
    }

    /// Format/maximum problems shown before saving; the server checks everything again.
    var problems: [String] {
        var problems: [String] = []
        for part in assignment.parts where edited[part.id] != nil {
            if edits(for: part) == nil { problems.append(problem(in: part)) }
        }
        return problems
    }

    var canSave: Bool { canEdit && hasChanges && problems.isEmpty && !isSaving }

    private func problem(in part: AssignmentDetail.Part) -> String {
        if edited[part.id] == .fast {
            let total = totals[part.id] ?? Total()
            if total.excused && total.reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return "\(part.title): enter the excused reason."
            }
            return "\(part.title): enter a mark from 0 to \(Score.display(part.maxScore))."
        }
        let bad = part.questions.first { question in
            guard case .score(let text) = entry(question.id) else { return false }
            return valid(text, max: question.maxScore) == nil
        }
        return "\(part.title), question \(bad?.position ?? 0): enter a mark from 0 to \(Score.display(bad?.maxScore))."
    }

    private func valid(_ text: String, max: String) -> String? {
        guard let value = Score.hundredths(text), let limit = Score.hundredths(max), value <= limit else { return nil }
        return Score.format(value)
    }

    /// The part's edits, [] when unchanged, or nil when an input is invalid.
    private func edits(for part: AssignmentDetail.Part) -> [Edit]? {
        switch edited[part.id] {
        case nil:
            return []
        case .byQuestion:
            var result: [Edit] = []
            for question in part.questions {
                let draft = entry(question.id), base = baseEntries[question.id] ?? .notEntered
                guard !Self.same(draft, base) else { continue }
                switch draft {
                case .notEntered: result.append(.answer(.clear(questionID: question.id)))
                case .choice(let choice): result.append(.answer(.choice(questionID: question.id, choiceID: choice)))
                case .score(let text):
                    guard let score = valid(text, max: question.maxScore) else { return nil }
                    result.append(.answer(.score(questionID: question.id, score: score)))
                }
            }
            return result
        case .fast:
            let draft = totals[part.id] ?? Total(), base = baseTotals[part.id] ?? Total()
            guard !Self.same(draft, base) else { return [] }
            let text = draft.text.trimmingCharacters(in: .whitespaces)
            if text.isEmpty && !draft.excused { return [.mark(.init(partID: part.id, score: nil, excusedReason: nil))] }
            guard let score = valid(text, max: part.maxScore) else { return nil }
            let reason = draft.reason.trimmingCharacters(in: .whitespacesAndNewlines)
            if draft.excused && reason.isEmpty { return nil }
            return [.mark(.init(partID: part.id, score: score, excusedReason: draft.excused ? String(reason.prefix(500)) : nil))]
        }
    }

    private enum Edit {
        case mark(SaveMarksBody.MarkEdit)
        case answer(SaveMarksBody.AnswerEdit)
    }

    private static func same(_ a: Entry, _ b: Entry) -> Bool {
        if case .score(let x) = a, case .score(let y) = b { return Score.hundredths(x) == Score.hundredths(y) && Score.hundredths(x) != nil }
        return a == b
    }

    private static func same(_ a: Total, _ b: Total) -> Bool {
        let x = a.text.trimmingCharacters(in: .whitespaces), y = b.text.trimmingCharacters(in: .whitespaces)
        let sameScore = x == y || (Score.hundredths(x) != nil && Score.hundredths(x) == Score.hundredths(y))
        return sameScore && a.excused == b.excused && (!a.excused || a.reason.trimmingCharacters(in: .whitespacesAndNewlines) == b.reason)
    }

    private func body() -> SaveMarksBody? {
        var marks: [SaveMarksBody.MarkEdit] = [], answers: [SaveMarksBody.AnswerEdit] = []
        for part in assignment.parts {
            guard let edits = edits(for: part) else { return nil }
            for edit in edits {
                switch edit {
                case .mark(let mark): marks.append(mark)
                case .answer(let answer): answers.append(answer)
                }
            }
        }
        let note = feedback != baseFeedback ? String(feedback.prefix(5000)) : nil
        guard !marks.isEmpty || !answers.isEmpty || note != nil else { return nil }
        return SaveMarksBody(recordID: student.id, expectedVersion: student.version, marks: marks, answers: answers, feedback: note)
    }

    // MARK: - Save

    /// Saves the draft (or retries the unacknowledged request unchanged). True only on acknowledgment.
    @discardableResult
    func save() async -> Bool {
        guard !isSaving, assignment.actions.mark, !isConflict else { return false }
        let request: (key: String, body: SaveMarksBody)
        if let pending {
            request = pending
        } else {
            guard canSave, let body = body() else { return false }
            request = (UUID().uuidString, body)
            pending = request
        }
        saveState = .saving
        do {
            let result: SaveMarksResult = try await api.patch(
                "api/v1/assignments/\(assignment.id)/marks", body: request.body, idempotencyKey: request.key, structuredErrors: true
            )
            guard isCurrent(context) else { return false }
            pending = nil
            saveState = .idle
            rebase(on: result.student, keepDraft: false)
            Feedback.success.play()
            onSaved(result.student)
            return true
        } catch APIError.unauthenticated {
            if isCurrent(context) { saveState = .uncertain("Sign in again to finish saving.") }
            await onUnauthenticated()
        } catch APIError.forbidden {
            pending = nil
            saveState = .failed("You no longer have access to mark in this academy.")
            await onForbidden()
        } catch APIError.rejected(let failure) {
            guard isCurrent(context) else { return false }
            if failure.code == "THROTTLED" || failure.status >= 500 {
                // Not applied or unknown: the same key reconciles it.
                saveState = .uncertain(failure.code == "THROTTLED" ? "Too many saves. Retry in a moment." : "The server couldn't confirm the save. Retry.")
                return false
            }
            pending = nil
            if failure.code == "MARKS_CONFLICT", let details = failure.decodeDetails(MarksConflictDetails.self) {
                Feedback.warning.play()
                saveState = .conflict(current: details.current)
            } else {
                Feedback.failure.play()
                saveState = .failed(Self.message(for: failure))
            }
        } catch APIError.server(let message) {
            pending = nil
            saveState = .failed(message)
        } catch {
            // Network loss, timeout or cancellation after sending: the outcome is unknown.
            guard isCurrent(context) else { return false }
            Feedback.warning.play()
            saveState = .uncertain("Couldn't confirm the save. Retry: it won't save twice.")
        }
        return false
    }

    /// Conflict review: start again from the latest server work.
    func useLatest() {
        guard case .conflict(let current) = saveState else { return }
        saveState = .idle
        rebase(on: current, keepDraft: false)
    }

    /// Conflict review: keep the attempted inputs, now against the latest version. Saving is a new action.
    func reapply() {
        guard case .conflict(let current) = saveState else { return }
        saveState = .idle
        rebase(on: current, keepDraft: true)
    }

    func discard() {
        pending = nil
        saveState = .idle
        rebase(on: student, keepDraft: false)
    }

    private func rebase(on work: StudentWork, keepDraft: Bool) {
        student = work
        var entries: [String: Entry] = [:]
        for answer in work.answers {
            let kind = assignment.parts.first { $0.id == answer.partId }?.kind
            entries[answer.questionId] = kind?.isChoice == true ? .choice(answer.choiceId) : .score(Score.display(answer.score))
        }
        var totals: [String: Total] = [:]
        for mark in work.marks where !mark.fromAnswers {
            totals[mark.partId] = Total(text: Score.display(mark.score), excused: mark.kind == "excused", reason: mark.reason ?? "")
        }
        baseEntries = entries
        baseTotals = totals
        baseFeedback = work.feedback
        guard !keepDraft else { return }
        self.entries = entries
        self.totals = totals
        self.feedback = work.feedback
        edited = [:]
    }

    private static func message(for failure: APIFailure) -> String {
        switch failure.code {
        case "ASSIGNMENT_CLOSED": "This assignment is closed. Only work already received can be marked."
        case "ASSIGNMENT_NOT_OPEN": "This assignment can't be marked now."
        case "YEAR_CLOSED": "This academic year is closed. Marks are read-only."
        case "INVALID_SCORE": "A mark is above its maximum or has more than two decimals."
        case "UNKNOWN_PART": "The assignment changed. Close and open it again."
        case "NOT_A_RECIPIENT": "This student isn't on this assignment."
        case "IDEMPOTENCY_CONFLICT": "This save didn't match its earlier attempt. Save again."
        default: failure.message
        }
    }
}
