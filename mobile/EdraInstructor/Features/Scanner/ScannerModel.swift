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

    enum State: Equatable {
        case scanning
        case awaitingDecision(Card)
        case submitting(Card)
        /// Server outcome was not received; Confirm retries with the same Idempotency-Key.
        case uncertain(Card, String)
        case rejected(Card, String)
    }

    private(set) var state: State = .scanning
    /// Short-lived feedback shown while scanning (success or unknown code).
    private(set) var notice: Notice?

    struct Notice: Equatable {
        let text: String
        let isError: Bool
    }

    /// Why scanning can't start at all, if so.
    var blockedReason: String? {
        guard let sheet = sheet() else { return "Attendance isn't loaded yet." }
        if sheet.session.archivedAt != nil { return "This session was archived. Its attendance is read-only." }
        if sheet.session.state != "live" { return "This session has ended." }
        if !sheet.permittedActions.checkIn { return "You can't record attendance for this session." }
        if !sheet.studentCodesEnabled { return "Student codes are off for this academy." }
        return nil
    }

    private let api: APIClient
    private let sessionID: String
    private let sheet: () -> AttendanceSheet?
    private let lateAfterMinutes: () -> Int
    private let refresh: () async -> Void
    private let onUnauthenticated: @MainActor () async -> Void
    private let onForbidden: @MainActor () async -> Void

    /// Codes currently ignored because they haven't left the camera view since last handled.
    private var suppressed: Set<String> = []
    private var idempotencyKey: String?
    private var noticeTask: Task<Void, Never>?

    init(
        api: APIClient,
        sessionID: String,
        sheet: @escaping () -> AttendanceSheet?,
        lateAfterMinutes: @escaping () -> Int,
        refresh: @escaping () async -> Void,
        onUnauthenticated: @escaping @MainActor () async -> Void,
        onForbidden: @escaping @MainActor () async -> Void
    ) {
        self.api = api
        self.sessionID = sessionID
        self.sheet = sheet
        self.lateAfterMinutes = lateAfterMinutes
        self.refresh = refresh
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
            showNotice("Code \(code) isn't on this session's roster.", isError: true)
            return
        }
        Feedback.recognized.play()
        state = .awaitingDecision(Card(code: code, entry: entry))
    }

    func dismiss() {
        switch state {
        case .awaitingDecision, .uncertain, .rejected:
            idempotencyKey = nil
            state = .scanning
        default: break
        }
    }

    func confirm() async {
        let card: Card
        switch state {
        case .awaitingDecision(let c), .uncertain(let c, _): card = c
        default: return // blocks duplicate taps and any submission of a different student
        }
        guard blockedReason == nil else { return }

        // New key per confirmation action; reused unchanged when retrying an uncertain request.
        let key = idempotencyKey ?? UUID().uuidString
        idempotencyKey = key
        state = .submitting(card)

        let late = lateAfterMinutes()
        let body = CheckInBody(studentId: card.code, lateAfterMinutes: late > 0 ? late : nil)
        do {
            let result: CheckInResult = try await api.post(
                "api/v1/sessions/\(sessionID)/check-ins", body: body, idempotencyKey: key
            )
            idempotencyKey = nil
            state = .scanning
            let name = result.entry.fullName
            Feedback.success.play()
            showNotice(result.outcome == "already_recorded" ? "\(name) was already checked in." : "\(name) checked in.", isError: false)
            await refresh() // a receipt may describe an earlier state
        } catch APIError.unauthenticated {
            await onUnauthenticated()
        } catch APIError.network {
            Feedback.warning.play()
            state = .uncertain(card, "Couldn't confirm with the server. Retry to be sure.")
        } catch APIError.forbidden {
            idempotencyKey = nil
            Feedback.failure.play()
            state = .rejected(card, "You no longer have access to record attendance here.")
            await onForbidden()
        } catch APIError.server(let message) {
            idempotencyKey = nil
            Feedback.failure.play()
            state = .rejected(card, message)
        } catch {
            state = .awaitingDecision(card)
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

    private struct CheckInBody: Encodable {
        let studentId: String
        let lateAfterMinutes: Int?

        enum CodingKeys: String, CodingKey {
            case studentId = "student_id", lateAfterMinutes = "late_after_minutes"
        }
    }
}
