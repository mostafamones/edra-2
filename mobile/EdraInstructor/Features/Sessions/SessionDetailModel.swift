import Foundation
import Observation

@MainActor
@Observable
final class SessionDetailModel {
    enum State: Equatable {
        case loading
        case loaded
        case failed(String)
    }

    /// A status change exactly as first sent, kept until acknowledged or discarded.
    struct StatusCommand: Equatable {
        let entryID: String
        let fullName: String
        let status: AttendanceStatus
        let expectedVersion: Int
        let key: String
    }

    /// A reviewed command (finalize, mark rest absent): the revision staff reviewed and its key.
    struct ReviewedCommand: Equatable {
        let revision: Int
        let key: String
    }

    let session: LiveSession
    private(set) var state: State = .loading
    private(set) var sheet: AttendanceSheet?
    /// When the shown sheet was last loaded successfully.
    private(set) var lastRefreshed: Date?
    /// A background refresh failed: the shown sheet may be out of date. Writes still recheck the server.
    private(set) var refreshProblem: String?

    /// Only the newest load may commit. Older answers (success or failure) are dropped.
    private var generation = 0

    // MARK: Finalization

    private(set) var isPublishing = false
    /// Outcome of the last finalize attempt, shown once in an alert.
    var publishMessage: String?
    /// The revision captured when the finalize review opened; nil when no review is open.
    private(set) var finalizeReview: Int?
    /// Unacknowledged finalize: retried with the same revision and key.
    private(set) var publishCommand: ReviewedCommand?

    var canPublish: Bool { sheet?.permittedActions.publish == true && !isPublishing }

    /// A save landed after the review opened: finalizing needs a deliberate review of the latest values.
    var finalizeReviewIsStale: Bool {
        guard publishCommand == nil, let finalizeReview, let sheet else { return false }
        return finalizeReview != sheet.revision
    }

    /// A manager archived the session: attendance is read-only and doesn't count until it is restored.
    /// The server's permitted actions already turn every action off; this drives the banner.
    var isArchived: Bool { sheet?.session.archivedAt != nil }

    /// Students who have checked in (Present or Late), newest first.
    var checkedIn: [AttendanceEntry] {
        (sheet?.entries ?? [])
            .filter { $0.status == .present || $0.status == .late }
            .sorted { ($0.checkedInAt ?? .distantPast) > ($1.checkedInAt ?? .distantPast) }
    }

    /// Minutes after the session start past which a first check-in counts as Late (0 = never Late).
    /// Sent with check-ins by the scanner flow; kept per session on this device.
    private(set) var lateAfterMinutes: Int

    private let api: APIClient
    private let defaults = UserDefaults.standard
    /// False once the account scope or academy selection this screen was opened in has ended.
    private let isCurrent: @MainActor () -> Bool
    private let onUnauthenticated: @MainActor () async -> Void
    /// Revalidates academy access after a 403. A suspended or removed membership drops the academy
    /// from the list, which returns the app to academy selection and discards this screen.
    private let onForbidden: @MainActor () async -> Void

    init(
        session: LiveSession,
        api: APIClient,
        isCurrent: @escaping @MainActor () -> Bool = { true },
        onUnauthenticated: @escaping @MainActor () async -> Void,
        onForbidden: @escaping @MainActor () async -> Void
    ) {
        self.session = session
        lateAfterMinutes = UserDefaults.standard.integer(forKey: "lateAfterMinutes.\(session.id)")
        self.api = api
        self.isCurrent = isCurrent
        self.onUnauthenticated = onUnauthenticated
        self.onForbidden = onForbidden
    }

    /// Access may be gone: no retry key survives into a later, separately authorized action.
    private func forbidden() async {
        publishCommand = nil
        absenceCommand = nil
        statusCommands = [:]
        finalizeReview = nil
        absenceReview = nil
        await onForbidden()
    }

    private func signOut() async {
        guard isCurrent() else { return }
        await onUnauthenticated()
    }

    func makeScannerModel() -> ScannerModel {
        ScannerModel(
            api: api,
            sessionID: session.id,
            sheet: { [weak self] in self?.sheet },
            lateAfterMinutes: { [weak self] in self?.lateAfterMinutes ?? 0 },
            refresh: { [weak self] in await self?.load() },
            isCurrent: isCurrent,
            onUnauthenticated: onUnauthenticated,
            onForbidden: { [weak self] in await self?.forbidden() }
        )
    }

    func makeAttendeeModel(query: String = "") -> AddAttendeeModel {
        AddAttendeeModel(
            api: api,
            sessionID: session.id,
            query: query,
            revision: { [weak self] in self?.sheet?.revision },
            isCurrent: isCurrent,
            onAdded: { [weak self] in
                // An append changes the revision: any open review must be redone.
                await self?.load()
            },
            onUnauthenticated: onUnauthenticated,
            onForbidden: { [weak self] in await self?.forbidden() }
        )
    }

    /// Opens the finalize review at the current revision (or the unacknowledged command's revision).
    func beginFinalizeReview() {
        finalizeReview = publishCommand?.revision ?? sheet?.revision
    }

    func endFinalizeReview() {
        if publishCommand == nil { finalizeReview = nil }
    }

    func publish() async {
        guard canPublish, let reviewed = publishCommand?.revision ?? finalizeReview else { return }
        // A newer revision is never finalized silently: the review must be redone first.
        guard publishCommand != nil || reviewed == sheet?.revision else { return }
        let command = publishCommand ?? ReviewedCommand(revision: reviewed, key: UUID().uuidString)
        publishCommand = command
        isPublishing = true
        defer { isPublishing = false }
        do {
            let result: PublishResult = try await api.post(
                "api/v1/sessions/\(session.id)/attendance/publications",
                body: ["expected_revision": command.revision], idempotencyKey: command.key, structuredErrors: true
            )
            guard isCurrent() else { return }
            publishCommand = nil
            finalizeReview = nil
            switch result.outcome {
            case "published": Feedback.success.play(); publishMessage = "Attendance finalized (\(result.itemCount) records)."
            case "unchanged": publishMessage = "Nothing to finalize. Attendance already matches the official record."
            default: publishMessage = "This attendance was already finalized."
            }
            await load()
        } catch {
            guard isCurrent() else { return }
            switch AttendanceWriteOutcome(error) {
            case .unauthenticated: await signOut()
            case .forbidden:
                publishMessage = "You can't finalize attendance for this session."
                await forbidden()
            case .cancelled: break
            case .uncertain(let message):
                publishMessage = message
            case .rejected(let failure):
                publishCommand = nil
                finalizeReview = nil
                publishMessage = AttendanceWriteOutcome.message(for: failure)
                await load() // e.g. the sheet changed since it was reviewed
            }
        }
    }

    /// Show every student on the roster instead of only those checked in.
    var showAll = false

    /// Roster rows for the list: checked-in students, or everyone when `showAll` is on.
    var visibleEntries: [AttendanceEntry] {
        guard showAll else { return checkedIn }
        let rest = (sheet?.entries ?? []).filter { $0.status != .present && $0.status != .late }
            .sorted { $0.fullName.localizedCaseInsensitiveCompare($1.fullName) == .orderedAscending }
        return checkedIn + rest
    }

    // MARK: Mark rest absent

    /// Expected students still Unknown in a mandatory session (never eligible or added students).
    var unrecordedCount: Int { sheet?.session.mandatory == true ? sheet?.unrecordedExpected ?? 0 : 0 }
    var canMarkRestAbsent: Bool {
        canEdit && (unrecordedCount > 0 || absenceCommand != nil) && !isBulkSaving
    }
    private(set) var isBulkSaving = false
    /// The revision captured when the confirmation opened.
    private(set) var absenceReview: Int?
    /// Unacknowledged command: retried with the same reviewed revision and key.
    private(set) var absenceCommand: ReviewedCommand?

    func beginAbsenceReview() {
        absenceReview = absenceCommand?.revision ?? sheet?.revision
    }

    /// Marks every expected student still Unknown Absent, all or nothing at any roster size, against
    /// the reviewed revision. A newer save requires a fresh review; nothing is sent.
    func markRestAbsent() async {
        guard !isBulkSaving, canEdit, let reviewed = absenceCommand?.revision ?? absenceReview else { return }
        guard absenceCommand != nil || reviewed == sheet?.revision else {
            absenceReview = nil
            statusError = "Attendance changed while you were reviewing. Review the latest values and try again."
            return
        }
        let command = absenceCommand ?? ReviewedCommand(revision: reviewed, key: UUID().uuidString)
        absenceCommand = command
        isBulkSaving = true
        defer { isBulkSaving = false }
        do {
            let result: UnrecordedAbsenceResult = try await api.post(
                "api/v1/sessions/\(session.id)/attendance/unrecorded-absences",
                body: ["expected_revision": command.revision], idempotencyKey: command.key, structuredErrors: true
            )
            guard isCurrent() else { return }
            absenceCommand = nil
            absenceReview = nil
            Feedback.success.play()
            notice = result.changed == 0
                ? "No unrecorded students were left."
                : "\(result.changed) \(result.changed == 1 ? "student" : "students") marked absent."
            await load()
        } catch {
            guard isCurrent() else { return }
            switch AttendanceWriteOutcome(error) {
            case .unauthenticated: await signOut()
            case .forbidden:
                statusError = "You can't change attendance for this session."
                await forbidden()
            case .cancelled: break
            case .uncertain(let message):
                statusError = message
            case .rejected(let failure):
                absenceCommand = nil
                absenceReview = nil
                statusError = AttendanceWriteOutcome.message(for: failure)
                await load()
            }
        }
    }

    /// Abandons an unacknowledged mark-rest-absent command (staff checked the sheet themselves).
    func discardAbsenceCommand() {
        guard !isBulkSaving else { return }
        absenceCommand = nil
        absenceReview = nil
    }

    // MARK: Status changes

    /// Failure of the last status change, shown once in an alert.
    var statusError: String?
    /// Success feedback shown once.
    var notice: String?

    /// Unacknowledged status changes by entry; one per student, so students never share a key.
    private(set) var statusCommands: [String: StatusCommand] = [:]
    /// Entries with a request in flight.
    private(set) var savingEntries: Set<String> = []

    var canEdit: Bool { sheet?.permittedActions.edit == true }

    /// The status change awaiting Retry, if any (shown with the error).
    var uncertainStatus: StatusCommand? { statusCommands.values.first { !savingEntries.contains($0.entryID) } }

    func changeStatus(_ status: AttendanceStatus, for entry: AttendanceEntry) async {
        guard !savingEntries.contains(entry.id) else { return }
        if let pending = statusCommands[entry.id] {
            // Only the exact unacknowledged change may be resent; never a new one on an invented version.
            guard pending.status == status else {
                statusError = "The earlier change for \(entry.fullName) isn't confirmed yet. Retry or discard it first."
                return
            }
            await send(pending)
            return
        }
        guard status != entry.status, canEdit else { return }
        await send(StatusCommand(
            entryID: entry.id, fullName: entry.fullName, status: status, expectedVersion: entry.version, key: UUID().uuidString
        ))
    }

    func retryStatus(_ command: StatusCommand) async {
        guard statusCommands[command.entryID] == command else { return }
        await send(command)
    }

    func discardStatus(_ command: StatusCommand) {
        guard !savingEntries.contains(command.entryID) else { return }
        statusCommands[command.entryID] = nil
    }

    private func send(_ command: StatusCommand) async {
        struct Body: Encodable {
            let status: AttendanceStatus
            let expectedVersion: Int
            enum CodingKeys: String, CodingKey { case status, expectedVersion = "expected_version" }
        }
        struct Saved: Decodable, Sendable { let outcome: String }
        statusCommands[command.entryID] = command
        savingEntries.insert(command.entryID)
        defer { savingEntries.remove(command.entryID) }
        do {
            let _: Saved = try await api.patch(
                "api/v1/sessions/\(session.id)/attendance/\(command.entryID)",
                body: Body(status: command.status, expectedVersion: command.expectedVersion), idempotencyKey: command.key,
                structuredErrors: true
            )
            guard isCurrent() else { return }
            statusCommands[command.entryID] = nil
            Feedback.success.play()
            await load()
        } catch {
            guard isCurrent() else { return }
            switch AttendanceWriteOutcome(error) {
            case .unauthenticated:
                await signOut()
            case .forbidden:
                statusError = "You can't change attendance for this session."
                await forbidden()
            case .cancelled: break
            case .uncertain(let message):
                statusError = message
            case .rejected(let failure):
                statusCommands[command.entryID] = nil
                statusError = AttendanceWriteOutcome.message(for: failure)
                await load() // e.g. someone else changed it first: review the current value
            }
        }
    }

    func setLateAfter(minutes: Int) {
        lateAfterMinutes = min(max(minutes, 0), 1440)
        defaults.set(lateAfterMinutes, forKey: "lateAfterMinutes.\(session.id)")
    }

    // MARK: Loading

    func load() async {
        generation += 1
        let owner = generation
        if sheet == nil { state = .loading }
        let result: Result<AttendanceSheet, APIError>
        do {
            result = .success(try await api.get("api/v1/sessions/\(session.id)/attendance"))
        } catch {
            result = .failure(error)
        }
        // Only the newest load for this screen's account and academy commits, success or failure.
        guard owner == generation, isCurrent() else { return }

        switch result {
        case .success(let next):
            apply(next)
        case .failure(.unauthenticated):
            await onUnauthenticated()
        case .failure(.forbidden):
            sheet = nil
            state = .failed("You no longer have access to this session.")
            await forbidden()
        case .failure(.network):
            failRefresh("Can't reach the server. Check your connection and try again.")
        case .failure(.server(let message)):
            failRefresh(message)
        case .failure(.rejected(let failure)):
            failRefresh(failure.message)
        case .failure(.cancelled):
            // The screen went away or a newer refresh replaced this one.
            if sheet == nil, state == .loading { state = .failed("Attendance didn't load. Try again.") }
        }
    }

    private func apply(_ next: AttendanceSheet) {
        // A lower attendance revision for the same lifecycle state is older data; lifecycle and archive
        // changes can arrive at the same attendance revision and always apply.
        if let current = sheet, next.revision < current.revision, next.session == current.session { return }
        sheet = next
        state = .loaded
        lastRefreshed = Date()
        refreshProblem = nil
    }

    /// Keeps the last good data when a background refresh fails, with visible stale feedback.
    private func failRefresh(_ message: String) {
        if sheet == nil { state = .failed(message) } else { refreshProblem = message }
    }

    /// Refreshes while the screen is visible so check-ins by other staff appear.
    func refreshWhileVisible() async {
        await load()
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(10))
            if Task.isCancelled { return }
            await load()
        }
    }
}
