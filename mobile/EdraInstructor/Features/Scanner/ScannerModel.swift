import Foundation
import Observation

/// Drives one scanning session: recognize → preview card → Confirm/Dismiss. One student at a time.
@MainActor
@Observable
final class ScannerModel {
    struct Card: Equatable {
        let code: String
        let entry: AttendanceEntry
    }

    /// One check-in exactly as first sent: previewed student, code, Late-after and key. Retried
    /// unchanged until the server acknowledges it or staff dismiss it.
    struct Attempt: Equatable {
        let card: Card
        let lateAfterMinutes: Int
        let key: String
    }

    enum State: Equatable {
        case scanning
        case awaitingDecision(Card)
        case submitting(Attempt)
        /// The outcome is unknown (no response, 5xx, 429, unreadable reply). Retry resends the attempt.
        case uncertain(Attempt, String)
        /// The server answered definitively; nothing was recorded by this attempt.
        case rejected(Card, String)
        /// A code that isn't on the loaded roster. Nothing was written; staff may add the student.
        case notOnRoster(String)
    }

    private(set) var state: State = .scanning
    /// Short-lived feedback shown while scanning (success or unknown code).
    private(set) var notice: Notice?

    struct Notice: Equatable {
        let text: String
        let isError: Bool
    }

    /// Why a new check-in can't start, if so. An uncertain attempt can still be retried: its receipt
    /// replays even after the session ended or was archived.
    var blockedReason: String? {
        guard let sheet = sheet() else { return "Attendance isn't loaded yet." }
        if sheet.session.archivedAt != nil { return "This session was archived. Its attendance is read-only." }
        if sheet.session.state != "live" { return "This session has ended." }
        if !sheet.permittedActions.checkIn { return "You can't record attendance for this session." }
        if !sheet.studentCodesEnabled { return "Student codes are off for this academy." }
        return nil
    }

    /// Staff may add a student who isn't on the roster.
    var canAddAttendee: Bool { sheet()?.permittedActions.edit == true }

    private let api: APIClient
    private let sessionID: String
    private let sheet: () -> AttendanceSheet?
    private let lateAfterMinutes: () -> Int
    private let refresh: () async -> Void
    private let isCurrent: @MainActor () -> Bool
    private let onUnauthenticated: @MainActor () async -> Void
    private let onForbidden: @MainActor () async -> Void

    /// Codes currently ignored because they haven't left the camera view since last handled.
    private var suppressed: Set<String> = []
    private var noticeTask: Task<Void, Never>?

    init(
        api: APIClient,
        sessionID: String,
        sheet: @escaping () -> AttendanceSheet?,
        lateAfterMinutes: @escaping () -> Int,
        refresh: @escaping () async -> Void,
        isCurrent: @escaping @MainActor () -> Bool = { true },
        onUnauthenticated: @escaping @MainActor () async -> Void,
        onForbidden: @escaping @MainActor () async -> Void
    ) {
        self.api = api
        self.sessionID = sessionID
        self.sheet = sheet
        self.lateAfterMinutes = lateAfterMinutes
        self.refresh = refresh
        self.isCurrent = isCurrent
        self.onUnauthenticated = onUnauthenticated
        self.onForbidden = onForbidden
    }

    /// Called with every code currently visible to the camera (empty when none).
    func recognized(_ codes: [String]) {
        let normalized = Set(codes.compactMap(Self.normalize))
        suppressed.formIntersection(normalized) // a code that left the view may be scanned again
        guard state == .scanning, blockedReason == nil else { return }
        guard let code = normalized.subtracting(suppressed).sorted().first else { return }

        suppressed.insert(code)
        // Preview only: resolved against the loaded roster, nothing is written.
        // The server revalidates the code and session on Confirm.
        guard let entry = sheet()?.entries.first(where: { $0.studentCode?.uppercased() == code }) else {
            Feedback.failure.play()
            state = .notOnRoster(code)
            return
        }
        Feedback.recognized.play()
        state = .awaitingDecision(Card(code: code, entry: entry))
    }

    /// Ends the current card or attempt. An uncertain attempt is abandoned deliberately.
    func dismiss() {
        switch state {
        case .awaitingDecision, .uncertain, .rejected, .notOnRoster:
            state = .scanning
        default: break
        }
    }

    /// After staff added a student from `.notOnRoster`, the same card may be scanned again.
    func returnFromAdd(code: String) {
        suppressed.remove(code)
        if state == .notOnRoster(code) { state = .scanning }
    }

    func confirm() async {
        let attempt: Attempt
        switch state {
        case .awaitingDecision(let card):
            guard blockedReason == nil else { return }
            // Late-after is captured now; Retry never re-reads it.
            attempt = Attempt(card: card, lateAfterMinutes: lateAfterMinutes(), key: UUID().uuidString)
        case .uncertain(let pending, _):
            attempt = pending
        default: return // blocks duplicate taps and any submission of a different student
        }
        state = .submitting(attempt)

        let body = CheckInBody(studentId: attempt.card.code, lateAfterMinutes: attempt.lateAfterMinutes > 0 ? attempt.lateAfterMinutes : nil)
        do {
            let result: CheckInResult = try await api.post(
                "api/v1/sessions/\(sessionID)/check-ins", body: body, idempotencyKey: attempt.key, structuredErrors: true
            )
            guard isCurrent(), state == .submitting(attempt) else { return }
            state = .scanning
            let name = result.entry.fullName
            Feedback.success.play()
            let text = switch (result.outcome, result.entry.status) {
            case ("already_recorded", _): "\(name) was already checked in."
            case (_, .late): "\(name) checked in late."
            default: "\(name) checked in."
            }
            showNotice(text, isError: false)
            await refresh() // a receipt may describe an earlier state
        } catch {
            guard isCurrent(), state == .submitting(attempt) else { return }
            switch AttendanceWriteOutcome(error) {
            case .unauthenticated:
                state = .uncertain(attempt, "Sign in again, then retry.")
                await onUnauthenticated()
            case .forbidden:
                Feedback.failure.play()
                state = .rejected(attempt.card, "You no longer have access to record attendance here.")
                await onForbidden()
            case .cancelled:
                // Not proof either way: keep the attempt for Retry.
                state = .uncertain(attempt, "Couldn't confirm with the server. Retry to be sure.")
            case .uncertain(let message):
                Feedback.warning.play()
                state = .uncertain(attempt, message)
            case .rejected(let failure):
                Feedback.failure.play()
                if failure.code == "REVIEW_REQUIRED", let details = failure.decodeDetails(ReviewDetails.self) {
                    // Absent or Excused: never overwritten by a scan. Show the server's current entry.
                    let current = details.entry
                    state = .rejected(Card(code: attempt.card.code, entry: current),
                                      "\(current.fullName) is marked \(current.status.label). Change it on the session screen if they arrived.")
                } else {
                    state = .rejected(attempt.card, AttendanceWriteOutcome.message(for: failure))
                }
                await refresh()
            }
        }
    }

    private func showNotice(_ text: String, isError: Bool) {
        notice = Notice(text: text, isError: isError)
        noticeTask?.cancel()
        noticeTask = Task {
            try? await Task.sleep(for: .seconds(2.5))
            if !Task.isCancelled { notice = nil }
        }
    }

    /// Same normalization the server applies: trim, uppercase, 1–20 of A-Z 0-9 -. Leading zeroes kept.
    static func normalize(_ raw: String) -> String? {
        let code = raw.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        return code.wholeMatch(of: /[A-Z0-9-]{1,20}/) != nil ? code : nil
    }

    private struct ReviewDetails: Decodable {
        let entry: AttendanceEntry
    }

    private struct CheckInBody: Encodable {
        let studentId: String
        let lateAfterMinutes: Int?

        enum CodingKeys: String, CodingKey {
            case studentId = "student_id", lateAfterMinutes = "late_after_minutes"
        }
    }
}
