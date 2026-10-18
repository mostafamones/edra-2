import Foundation
import Observation

/// The Assessments root: the academy's active and closed assignments, newest first, in offset pages.
@MainActor
@Observable
final class AssignmentsModel {
    enum State: Equatable {
        case idle
        case loading
        case loaded
        case failed(String)
    }

    private(set) var state: State = .idle
    private(set) var assignments: [AssignmentSummary] = []
    private(set) var total = 0
    private(set) var isLoadingMore = false
    private(set) var loadMoreError: String?
    private(set) var context: AcademyContext?
    /// The open marking draft, so a voluntary academy switch can offer Save / Discard first.
    var activeMarking: MarkingModel?
    private var generation = 0

    static let pageSize = 50

    let api: APIClient
    let isCurrent: @MainActor (AcademyContext) -> Bool
    let onUnauthenticated: @MainActor () async -> Void
    let onForbidden: @MainActor () async -> Void

    init(
        api: APIClient,
        isCurrent: @escaping @MainActor (AcademyContext) -> Bool,
        onUnauthenticated: @escaping @MainActor () async -> Void,
        onForbidden: @escaping @MainActor () async -> Void
    ) {
        self.api = api
        self.isCurrent = isCurrent
        self.onUnauthenticated = onUnauthenticated
        self.onForbidden = onForbidden
    }

    var hasMore: Bool { assignments.count < total }

    func load(context new: AcademyContext?) async {
        if new != context {
            assignments = []
            total = 0
            activeMarking = nil
        }
        context = new
        generation += 1
        let owner = generation
        isLoadingMore = false
        loadMoreError = nil
        guard let new else { state = .idle; return }
        state = .loading
        let result = await fetch(new, offset: 0)
        guard owner == generation, context == new, isCurrent(new) else { return }
        switch result {
        case .success(let page):
            assignments = page.assignments
            total = page.total
            state = .loaded
        case .failure(let error):
            await handle(error) { self.state = .failed($0) }
        }
    }

    /// Appends the next page; a partial list is never presented as the whole academy.
    func loadMore() async {
        guard let context, hasMore, !isLoadingMore, state == .loaded else { return }
        let owner = generation
        isLoadingMore = true
        loadMoreError = nil
        let result = await fetch(context, offset: assignments.count)
        guard owner == generation, isCurrent(context) else { return }
        isLoadingMore = false
        switch result {
        case .success(let page):
            let known = Set(assignments.map(\.id))
            assignments += page.assignments.filter { !known.contains($0.id) }
            total = page.total
        case .failure(let error):
            await handle(error) { self.loadMoreError = $0 }
        }
    }

    private func fetch(_ context: AcademyContext, offset: Int) async -> Result<AssignmentsPage, APIError> {
        let path = "api/v1/academies/\(context.academyID)/assignments?limit=\(Self.pageSize)&offset=\(offset)"
        do { return .success(try await api.get(path)) } catch { return .failure(error) }
    }

    private func handle(_ error: APIError, show: (String) -> Void) async {
        switch error {
        case .unauthenticated:
            await onUnauthenticated()
        case .forbidden:
            assignments = []
            total = 0
            state = .idle
            await onForbidden()
        case .network:
            show("Can't reach the server. Check your connection and try again.")
        case .server(let message):
            show(message)
        case .rejected(let failure):
            show(failure.message)
        case .cancelled:
            if state == .loading { state = assignments.isEmpty ? .idle : .loaded }
            isLoadingMore = false
        }
    }
}
