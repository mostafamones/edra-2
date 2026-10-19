import Foundation
import Observation

/// Finds a student of the session's academy and year who isn't on the roster and explicitly adds
/// them as an unexpected attendee. Searching writes nothing; adding never checks the student in.
@MainActor
@Observable
final class AddAttendeeModel {
    enum Phase: Equatable {
        case idle
        case loading
        case loaded
        case failed(String)
    }

    /// The chosen student, the revision shown when chosen, and the key for this add.
    struct Choice: Equatable {
        let candidate: AttendeeCandidate
        let revision: Int
        let key: String
    }

    var query: String
    private(set) var phase: Phase = .idle
    private(set) var items: [AttendeeCandidate] = []
    private(set) var hasMore = false
    private(set) var isLoadingMore = false
    private(set) var chosen: Choice?
    private(set) var isAdding = false
    /// Error or status for the add, shown beside the action.
    private(set) var message: String?
    /// Set once the server acknowledged the add (or that the student was already on the roster).
    private(set) var added: AttendanceEntry?
    private(set) var alreadyOnRoster = false

    private static let pageSize = 20
    /// Only the newest search commits.
    private var generation = 0

    private let api: APIClient
    private let sessionID: String
    private let revision: () -> Int?
    private let isCurrent: @MainActor () -> Bool
    private let onAdded: @MainActor () async -> Void
    private let onUnauthenticated: @MainActor () async -> Void
    private let onForbidden: @MainActor () async -> Void

    init(
        api: APIClient,
        sessionID: String,
        query: String = "",
        revision: @escaping () -> Int?,
        isCurrent: @escaping @MainActor () -> Bool = { true },
        onAdded: @escaping @MainActor () async -> Void,
        onUnauthenticated: @escaping @MainActor () async -> Void,
        onForbidden: @escaping @MainActor () async -> Void
    ) {
        self.api = api
        self.sessionID = sessionID
        self.query = query
        self.revision = revision
        self.isCurrent = isCurrent
        self.onAdded = onAdded
        self.onUnauthenticated = onUnauthenticated
        self.onForbidden = onForbidden
    }

    private func path(offset: Int) -> String {
        var components = URLComponents()
        components.path = "api/v1/sessions/\(sessionID)/attendance/attendees"
        components.queryItems = [
            URLQueryItem(name: "q", value: String(query.trimmingCharacters(in: .whitespacesAndNewlines).prefix(100))),
            URLQueryItem(name: "limit", value: String(Self.pageSize)),
            URLQueryItem(name: "offset", value: String(offset)),
        ]
        return components.string ?? components.path
    }

    /// Runs the current query from the first page.
    func search() async {
        generation += 1
        let owner = generation
        phase = .loading
        let result: Result<AttendeeCandidates, APIError>
        do { result = .success(try await api.get(path(offset: 0), structuredErrors: true)) } catch { result = .failure(error) }
        guard owner == generation, isCurrent() else { return }
        switch result {
        case .success(let page):
            items = page.items
            hasMore = page.hasMore
            phase = .loaded
            if let chosen, !items.contains(chosen.candidate) { self.chosen = nil }
        case .failure(let error):
            await fail(error)
        }
    }

    func loadMore() async {
        guard hasMore, !isLoadingMore, phase == .loaded else { return }
        let owner = generation
        isLoadingMore = true
        defer { isLoadingMore = false }
        let result: Result<AttendeeCandidates, APIError>
        do { result = .success(try await api.get(path(offset: items.count), structuredErrors: true)) } catch { result = .failure(error) }
        guard owner == generation, isCurrent() else { return }
        switch result {
        case .success(let page):
            items += page.items.filter { next in !items.contains { $0.id == next.id } }
            hasMore = page.hasMore
        case .failure(let error):
            await fail(error)
        }
    }

    private func fail(_ error: APIError) async {
        switch error {
        case .unauthenticated: await onUnauthenticated()
        case .forbidden:
            items = []
            phase = .failed("You no longer have access to this session.")
            await onForbidden()
        case .cancelled: if phase == .loading { phase = .idle }
        case .network: phase = .failed("Can't reach the server. Check your connection and try again.")
        case .server(let message): phase = .failed(message)
        case .rejected(let failure): phase = .failed(AttendanceWriteOutcome.message(for: failure))
        }
    }

    func choose(_ candidate: AttendeeCandidate) {
        guard !isAdding, let revision = revision() else { return }
        message = nil
        chosen = Choice(candidate: candidate, revision: revision, key: UUID().uuidString)
    }

    /// The sheet changed after the student was chosen: Add needs a deliberate review first.
    var choiceIsStale: Bool {
        guard let chosen, let current = revision() else { return false }
        return chosen.revision != current
    }

    /// Adds the chosen student, or retries the unacknowledged add unchanged.
    func add() async {
        guard let choice = chosen, !isAdding, added == nil else { return }
        struct Body: Encodable {
            let annualStudentRecordId: String
            let expectedRevision: Int
            enum CodingKeys: String, CodingKey {
                case annualStudentRecordId = "annual_student_record_id", expectedRevision = "expected_revision"
            }
        }
        isAdding = true
        message = nil
        defer { isAdding = false }
        do {
            let result: AddAttendeeResult = try await api.post(
                "api/v1/sessions/\(sessionID)/attendance/attendees",
                body: Body(annualStudentRecordId: choice.candidate.id, expectedRevision: choice.revision),
                idempotencyKey: choice.key, structuredErrors: true
            )
            guard isCurrent(), chosen == choice else { return }
            Feedback.success.play()
            added = result.entry
            alreadyOnRoster = result.outcome == "already_on_roster"
            await onAdded()
        } catch {
            guard isCurrent(), chosen == choice else { return }
            switch AttendanceWriteOutcome(error) {
            case .unauthenticated: await onUnauthenticated()
            case .forbidden:
                chosen = nil
                message = "You no longer have access to this session."
                await onForbidden()
            case .cancelled: break
            case .uncertain(let text):
                message = text // the same choice and key are retried
            case .rejected(let failure):
                if failure.code == "ATTENDANCE_REVIEW_STALE" {
                    chosen = nil
                    message = "Attendance changed meanwhile. Choose the student again to add them."
                    await onAdded() // refresh the sheet so the new revision is reviewed
                } else {
                    chosen = nil
                    message = AttendanceWriteOutcome.message(for: failure)
                }
                await search()
            }
        }
    }
}

extension AddAttendeeModel: Identifiable {}
