import Foundation
import Observation

/// One assignment's workspace: structure, the server-searched student list, the marking sheet and
/// announcement. Owned by one academy context; anything answering for another is dropped.
@MainActor
@Observable
final class WorkspaceModel {
    enum Filter: String, CaseIterable, Identifiable {
        case all
        case notReceived = "not_received"
        case needsMarking = "needs_marking"
        case marked
        case unannounced = "unpublished"

        var id: String { rawValue }
        var title: String {
            switch self {
            case .all: "All"
            case .notReceived: "Not received"
            case .needsMarking: "Needs marking"
            case .marked: "Marked"
            case .unannounced: "Unannounced"
            }
        }
    }

    enum State: Equatable {
        case loading
        case loaded
        case failed(String)
    }

    /// Where the marking sheet was opened from, which decides what follows an acknowledged save.
    enum Origin { case row, code, camera }

    enum AnnounceState: Equatable {
        case reviewing
        case sending
        case uncertain(String)
        /// Nothing was announced; `reasons` explains each rejected student.
        case rejected(String, reasons: [String: String])
        case failed(String)
    }

    struct Announcement: Identifiable {
        let id = UUID()
        let students: [StudentWork]
        var state: AnnounceState = .reviewing
        /// Created once for this confirmation and reused on retry with the same versions.
        let key = UUID().uuidString
        var body: AnnounceBody {
            AnnounceBody(items: students.map { .init(annualStudentRecordId: $0.id, expectedVersion: $0.version) })
        }
    }

    let summary: AssignmentSummary
    let context: AcademyContext
    private(set) var detail: AssignmentDetail?
    private(set) var state: State = .loading
    private(set) var students: [StudentWork] = []
    private(set) var total = 0
    private(set) var listState: State = .loading
    private(set) var isLoadingMore = false
    private(set) var loadMoreError: String?
    private(set) var filter = Filter.all
    private(set) var search = ""

    var isSelecting = false { didSet { if !isSelecting { selection = [] } } }
    var selection: Set<String> = []

    private(set) var marking: MarkingModel?
    private(set) var origin = Origin.row
    /// Increases after an acknowledged code-entry save so the code field can take focus again.
    private(set) var nextStudentRequest = 0
    private(set) var isLookingUp = false
    var lookupError: String?
    var announcement: Announcement?
    var notice: String?

    /// Run defaults kept within this assignment: part and entry mode.
    private var runPartID: String?
    private var runMode = MarkingModel.Mode.byQuestion
    private var generation = 0
    /// Loaded chips (without search), so switching back doesn't refetch.
    private var chips: [Filter: (students: [StudentWork], total: Int)] = [:]
    private var lookupGeneration = 0

    static let pageSize = 50

    private let parent: AssignmentsModel
    private var api: APIClient { parent.api }

    init(summary: AssignmentSummary, context: AcademyContext, parent: AssignmentsModel) {
        self.summary = summary
        self.context = context
        self.parent = parent
    }

    private var isCurrent: Bool { parent.isCurrent(context) }
    var actions: AssignmentDetail.Actions { detail?.actions ?? .none }
    var hasMore: Bool { students.count < total }

    // MARK: - Loading

    func load() async {
        state = detail == nil ? .loading : state
        let result: Result<AssignmentDetail, APIError>
        do { result = .success(try await api.get("api/v1/assignments/\(summary.id)", structuredErrors: true)) }
        catch { result = .failure(error) }
        guard isCurrent else { return }
        switch result {
        case .success(let detail):
            self.detail = detail
            state = .loaded
            await reloadStudents()
        case .failure(let error):
            if detail == nil { await handle(error) { self.state = .failed($0) } } else { await handle(error) { self.notice = $0 } }
        }
    }

    /// Each chip is fetched the first time it's chosen, then reused until the data changes.
    func setFilter(_ new: Filter) async {
        guard new != filter else { return }
        if search.isEmpty, listState == .loaded { chips[filter] = (students, total) }
        filter = new
        if search.isEmpty, let cached = chips[new] {
            generation += 1 // drops any page still loading for the previous chip
            selection = []
            isLoadingMore = false
            loadMoreError = nil
            students = cached.students
            total = cached.total
            listState = .loaded
            return
        }
        await fetchFirstPage()
    }

    func setSearch(_ text: String) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed != search else { return }
        search = trimmed
        await fetchFirstPage()
    }

    /// Fresh data: forget every cached chip, then load the current one.
    func reloadStudents() async {
        chips = [:]
        await fetchFirstPage()
    }

    /// First page for the current filter and search. Selection never survives a different list.
    private func fetchFirstPage() async {
        generation += 1
        let owner = generation
        selection = []
        isLoadingMore = false
        loadMoreError = nil
        listState = .loading
        let result = await fetch(offset: 0)
        guard owner == generation, isCurrent else { return }
        switch result {
        case .success(let page):
            students = page.students
            total = page.total
            listState = .loaded
        case .failure(let error):
            await handle(error) { self.listState = .failed($0) }
        }
    }

    func loadMore() async {
        guard hasMore, !isLoadingMore, listState == .loaded else { return }
        let owner = generation
        isLoadingMore = true
        loadMoreError = nil
        let result = await fetch(offset: students.count)
        guard owner == generation, isCurrent else { return }
        isLoadingMore = false
        switch result {
        case .success(let page):
            let known = Set(students.map(\.id))
            students += page.students.filter { !known.contains($0.id) }
            total = page.total
        case .failure(let error):
            await handle(error) { self.loadMoreError = $0 }
        }
    }

    private func fetch(offset: Int) async -> Result<StudentsPage, APIError> {
        var path = "api/v1/assignments/\(summary.id)/marks?filter=\(filter.rawValue)&limit=\(Self.pageSize)&offset=\(offset)"
        if !search.isEmpty, let encoded = String(search.prefix(100)).addingPercentEncoding(withAllowedCharacters: Self.queryValue) {
            path += "&search=\(encoded)"
        }
        do { return .success(try await api.get(path, structuredErrors: true)) } catch { return .failure(error) }
    }

    private func handle(_ error: APIError, show: (String) -> Void) async {
        switch error {
        case .unauthenticated:
            await parent.onUnauthenticated()
        case .forbidden:
            show("You no longer have access to this academy.")
            await parent.onForbidden()
        case .network:
            show("Can't reach the server. Check your connection and try again.")
        case .server(let message):
            show(message)
        case .rejected(let failure):
            show(failure.code == "NOT_FOUND" ? "This assignment is no longer available." : failure.message)
        case .cancelled:
            if listState == .loading { listState = .loaded }
            if state == .loading && detail != nil { state = .loaded }
            isLoadingMore = false
        }
    }

    // MARK: - Marking

    func open(_ student: StudentWork, from origin: Origin) {
        guard let detail, marking == nil, isCurrent else { return }
        self.origin = origin
        let model = MarkingModel(
            assignment: detail, student: student, context: context, api: api, partID: runPartID, mode: runMode,
            isCurrent: parent.isCurrent,
            onDefaults: { [weak self] part, mode in
                self?.runPartID = part
                self?.runMode = mode
            },
            onSaved: { [weak self] saved in self?.saved(saved) },
            onUnauthenticated: parent.onUnauthenticated,
            onForbidden: parent.onForbidden
        )
        marking = model
        parent.activeMarking = model
    }

    /// Closes the sheet without saving (the guard already asked).
    func closeMarking() {
        marking = nil
        parent.activeMarking = nil
        // A code run is ready for the next student once the sheet is gone.
        if origin == .code { nextStudentRequest += 1 }
    }

    /// Acknowledged save: update the row. The sheet stays open; closing it ends the student.
    private func saved(_ student: StudentWork) {
        if let index = students.firstIndex(where: { $0.id == student.id }) { students[index] = student }
        // The save may move the student between chips; other chips reload when next chosen.
        chips = [:]
    }

    /// Typed or scanned code: the server resolves it among this assignment's students. Writes nothing.
    /// Returns false when the code was refused (the reason is in `lookupError`).
    @discardableResult
    func lookUp(code raw: String, from origin: Origin) async -> Bool {
        let code = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !code.isEmpty, detail?.studentCodesEnabled == true, marking == nil, !isLookingUp else { return false }
        lookupGeneration += 1
        let owner = lookupGeneration
        isLookingUp = true
        lookupError = nil
        defer { if owner == lookupGeneration { isLookingUp = false } }
        do {
            let result: StudentResolution = try await api.post(
                "api/v1/assignments/\(summary.id)/student-resolution", body: ["student_id": String(code.prefix(40))],
                idempotencyKey: nil, structuredErrors: true
            )
            guard owner == lookupGeneration, isCurrent else { return false }
            open(result.student, from: origin)
            return true
        } catch APIError.unauthenticated {
            await parent.onUnauthenticated()
        } catch APIError.forbidden {
            lookupError = "You no longer have access to this academy."
            await parent.onForbidden()
        } catch APIError.rejected(let failure) {
            guard owner == lookupGeneration else { return false }
            lookupError = Self.lookupMessage(failure, code: code)
        } catch APIError.server(let message) {
            if owner == lookupGeneration { lookupError = message }
        } catch APIError.network {
            if owner == lookupGeneration { lookupError = "Can't reach the server. Try the code again." }
        } catch {}
        return false
    }

    private static func lookupMessage(_ failure: APIFailure, code: String) -> String {
        switch failure.code {
        case "STUDENT_CODE_NOT_FOUND": "No student has code \(code)."
        case "STUDENT_CODE_RETIRED": "Code \(code) is no longer active."
        case "STUDENT_CODE_AMBIGUOUS": "Code \(code) belongs to more than one student. Choose the student by name."
        case "NOT_A_RECIPIENT": "This student isn't on this assignment."
        case "STUDENT_CODES_DISABLED": "Student codes are off for this academy."
        case "INVALID_REQUEST": "\(code) isn't a valid student code."
        default: failure.message
        }
    }

    // MARK: - Announcement

    /// Why a loaded student's result can't be announced now, or nil when it can.
    func announceBlocker(_ student: StudentWork) -> String? {
        guard actions.announce else { return "Announcing isn't available for this assignment." }
        if student.marking != "complete" { return "Not fully marked" }
        if student.publicationState == "published" { return "Already announced" }
        if marking?.student.id == student.id, marking?.hasChanges == true { return "Has unsaved changes" }
        return nil
    }

    func reviewAnnouncement(_ students: [StudentWork]) {
        guard !students.isEmpty else { return }
        announcement = Announcement(students: students)
    }

    func reviewSelection() {
        reviewAnnouncement(students.filter { selection.contains($0.id) })
    }

    /// Announces every reviewed student or none. Retries reuse the confirmation's key and versions.
    func announce() async {
        guard var current = announcement, current.state != .sending,
              current.students.allSatisfy({ announceBlocker($0) == nil }) else { return }
        current.state = .sending
        announcement = current
        let id = current.id
        func update(_ state: AnnounceState) {
            guard announcement?.id == id else { return }
            announcement?.state = state
        }
        do {
            let _: AnnounceResult = try await api.post(
                "api/v1/assignments/\(summary.id)/results/publications", body: current.body,
                idempotencyKey: current.key, structuredErrors: true
            )
            guard isCurrent, announcement?.id == id else { return }
            Feedback.success.play()
            announcement = nil
            isSelecting = false
            notice = current.students.count == 1 ? "Result announced." : "\(current.students.count) results announced."
            await reloadStudents()
        } catch APIError.unauthenticated {
            await parent.onUnauthenticated()
        } catch APIError.forbidden {
            update(.failed("You no longer have access to this academy."))
            await parent.onForbidden()
        } catch APIError.rejected(let failure) {
            guard isCurrent else { return }
            if failure.code == "PUBLICATION_REJECTED" {
                let failures = failure.decodeDetails(AnnounceRejection.self)?.failures ?? []
                var reasons: [String: String] = [:]
                for item in failures {
                    reasons[item.annualStudentRecordId] = switch item.reason {
                    case "stale": "Changed since you reviewed it"
                    case "incomplete": "Not fully marked"
                    case "not_recipient": "No longer on this assignment"
                    default: "Can't be announced"
                    }
                }
                Feedback.failure.play()
                update(.rejected("Nothing was announced. Review the refreshed list and try again.", reasons: reasons))
                await reloadStudents()
            } else if failure.code == "THROTTLED" || failure.status >= 500 {
                update(.uncertain("The server couldn't confirm the announcement. Retry: it won't announce twice."))
            } else {
                update(.failed(failure.message))
            }
        } catch APIError.server(let message) {
            update(.failed(message))
        } catch {
            guard isCurrent else { return }
            Feedback.warning.play()
            update(.uncertain("Couldn't confirm the announcement. Retry: it won't announce twice."))
        }
    }

    /// Unreserved characters only, so `&`, `=`, `+` and `#` in search text stay literal.
    private static let queryValue = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
}
