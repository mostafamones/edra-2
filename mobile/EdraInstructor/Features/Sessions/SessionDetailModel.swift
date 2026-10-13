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

    let session: LiveSession
    private(set) var state: State = .loading
    private(set) var sheet: AttendanceSheet?
    private(set) var isPublishing = false
    /// Outcome of the last publish attempt, shown once in an alert.
    var publishMessage: String?
    /// Reused when retrying an uncertain publish of the same revision.
    private var publishKey: (revision: Int, key: String)?

    var canPublish: Bool { sheet?.permittedActions.publish == true && !isPublishing }

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
    private let onUnauthenticated: @MainActor () async -> Void
    /// Revalidates academy access after a 403. A suspended or removed membership drops the academy
    /// from the list, which returns the app to academy selection and discards this screen.
    private let onForbidden: @MainActor () async -> Void

    init(
        session: LiveSession,
        api: APIClient,
        onUnauthenticated: @escaping @MainActor () async -> Void,
        onForbidden: @escaping @MainActor () async -> Void
    ) {
        self.session = session
        lateAfterMinutes = UserDefaults.standard.integer(forKey: "lateAfterMinutes.\(session.id)")
        self.api = api
        self.onUnauthenticated = onUnauthenticated
        self.onForbidden = onForbidden
    }

    /// Access may be gone: no retry key survives into a later, separately authorized action.
    private func forbidden() async {
        publishKey = nil
        bulkKey = nil
        statusKey = nil
        await onForbidden()
    }

    func makeScannerModel() -> ScannerModel {
        ScannerModel(
            api: api,
            sessionID: session.id,
            sheet: { [weak self] in self?.sheet },
            lateAfterMinutes: { [weak self] in self?.lateAfterMinutes ?? 0 },
            refresh: { [weak self] in await self?.load() },
            onUnauthenticated: onUnauthenticated,
            onForbidden: onForbidden
        )
    }

    func publish() async {
        guard let sheet, canPublish else { return }
        let revision = sheet.revision
        let key = publishKey?.revision == revision ? publishKey!.key : UUID().uuidString
        publishKey = (revision, key)
        isPublishing = true
        defer { isPublishing = false }
        do {
            let result: PublishResult = try await api.post(
                "api/v1/sessions/\(session.id)/attendance/publications",
                body: ["expected_revision": revision], idempotencyKey: key
            )
            publishKey = nil
            switch result.outcome {
            case "published": Feedback.success.play(); publishMessage = "Attendance finalized (\(result.itemCount) records)."
            case "unchanged": publishMessage = "Nothing to finalize. Attendance already matches the official record."
            default: publishMessage = "This attendance was already finalized."
            }
            await load()
        } catch APIError.unauthenticated {
            await onUnauthenticated()
        } catch APIError.network {
            publishMessage = "Couldn't reach the server. Tap Confirm again to retry; it won't finalize twice."
        } catch APIError.forbidden {
            publishMessage = "You can't finalize attendance for this session."
            await forbidden()
        } catch APIError.server(let message) {
            publishKey = nil
            publishMessage = message
            await load() // e.g. the sheet changed since it was reviewed
        } catch {}
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

    private var unrecorded: [AttendanceEntry] { (sheet?.entries ?? []).filter { $0.status == .unknown } }
    var canMarkRestAbsent: Bool { canEdit && !unrecorded.isEmpty && !isBulkSaving }
    private(set) var isBulkSaving = false
    private var bulkKey: (signature: String, key: String)?

    /// Marks every student still Unknown as Absent, all or nothing.
    func markRestAbsent() async {
        let targets = unrecorded
        guard !targets.isEmpty, !isBulkSaving else { return }
        struct Change: Encodable {
            let annualStudentRecordId: String
            let status: AttendanceStatus
            let expectedVersion: Int
            enum CodingKeys: String, CodingKey {
                case annualStudentRecordId = "annual_student_record_id", status, expectedVersion = "expected_version"
            }
        }
        struct Body: Encodable { let changes: [Change] }
        struct Saved: Decodable, Sendable { let outcome: String }
        let changes = targets.prefix(500).map { Change(annualStudentRecordId: $0.id, status: .absent, expectedVersion: $0.version) }
        let signature = changes.map { "\($0.annualStudentRecordId):\($0.expectedVersion)" }.joined(separator: ",")
        let key = bulkKey?.signature == signature ? bulkKey!.key : UUID().uuidString
        bulkKey = (signature, key)
        isBulkSaving = true
        defer { isBulkSaving = false }
        do {
            let _: Saved = try await api.post(
                "api/v1/sessions/\(session.id)/attendance/bulk", body: Body(changes: changes), idempotencyKey: key
            )
            bulkKey = nil
            Feedback.success.play()
            await load()
        } catch APIError.unauthenticated {
            await onUnauthenticated()
        } catch APIError.network {
            statusError = "Couldn't reach the server. Try again."
        } catch APIError.forbidden {
            statusError = "You can't change attendance for this session."
            await forbidden()
        } catch APIError.server(let message) {
            bulkKey = nil
            statusError = message
            await load()
        } catch {
            statusError = "Something went wrong."
        }
    }

    /// Failure of the last status change, shown once in an alert.
    var statusError: String?

    func changeStatus(_ status: AttendanceStatus, for entry: AttendanceEntry) async {
        guard status != entry.status else { return }
        statusError = await setStatus(status, for: entry)
    }

    var canEdit: Bool { sheet?.permittedActions.edit == true }

    /// Reused when retrying the same status change (same entry version and target).
    private var statusKey: (signature: String, key: String)?

    /// Saves a manual status change. Returns an error message, or nil on success.
    func setStatus(_ status: AttendanceStatus, for entry: AttendanceEntry) async -> String? {
        let signature = "\(entry.id):\(entry.version):\(status.rawValue)"
        let key = statusKey?.signature == signature ? statusKey!.key : UUID().uuidString
        statusKey = (signature, key)
        struct Body: Encodable {
            let status: AttendanceStatus
            let expectedVersion: Int
            enum CodingKeys: String, CodingKey { case status, expectedVersion = "expected_version" }
        }
        struct Saved: Decodable, Sendable { let outcome: String }
        do {
            let _: Saved = try await api.patch(
                "api/v1/sessions/\(session.id)/attendance/\(entry.id)",
                body: Body(status: status, expectedVersion: entry.version), idempotencyKey: key
            )
            statusKey = nil
            Feedback.success.play()
            await load()
            return nil
        } catch APIError.unauthenticated {
            await onUnauthenticated()
            return "Please sign in again."
        } catch APIError.network {
            return "Couldn't reach the server. Try again."
        } catch APIError.forbidden {
            await forbidden()
            return "You can't change attendance for this session."
        } catch APIError.server(let message) {
            statusKey = nil
            await load() // e.g. someone else changed it first
            return message
        } catch {
            return "Something went wrong."
        }
    }

    func setLateAfter(minutes: Int) {
        lateAfterMinutes = min(max(minutes, 0), 1440)
        defaults.set(lateAfterMinutes, forKey: "lateAfterMinutes.\(session.id)")
    }

    func load() async {
        if sheet == nil { state = .loading }
        do {
            sheet = try await api.get("api/v1/sessions/\(session.id)/attendance")
            state = .loaded
            if isArchived {
                // Pending retries belong to actions the server now rejects; start fresh after a restore.
                publishKey = nil
                bulkKey = nil
                statusKey = nil
            }
        } catch APIError.unauthenticated {
            await onUnauthenticated()
        } catch APIError.forbidden {
            sheet = nil
            state = .failed("You no longer have access to this session.")
            await forbidden()
        } catch APIError.network {
            // Keep showing the last good data when a background refresh fails.
            if sheet == nil { state = .failed("Can't reach the server. Check your connection and try again.") }
        } catch APIError.server(let message) {
            if sheet == nil { state = .failed(message) }
        } catch {
            // Cancelled: the screen went away.
        }
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
