import Foundation
import Observation

/// Schedules the selected academy can start a session from, searched and paged by the server.
@MainActor
@Observable
final class SchedulesModel {
    enum State: Equatable {
        case idle
        case loading
        case loaded
        case failed(String)
    }

    private(set) var state: State = .idle
    private(set) var schedules: [StartableSchedule] = []
    /// False when the academy has no open academic year, so nothing can start.
    private(set) var hasOpenYear = true
    /// The academy's time zone; planned times are shown in it.
    private(set) var timeZone: TimeZone?
    private(set) var isLoadingMore = false
    private(set) var loadMoreError: String?
    private var nextOffset: Int?
    var hasMore: Bool { nextOffset != nil }

    private(set) var context: AcademyContext?
    private(set) var query = ""
    /// Only the newest first-page load, and the page loads that follow it, may commit.
    private var generation = 0

    static let pageSize = 50

    private let api: APIClient
    private let isCurrent: @MainActor (AcademyContext) -> Bool
    private let onUnauthenticated: @MainActor () async -> Void
    private let onForbidden: @MainActor () async -> Void

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

    /// Loads the first page for `context` and `query`, superseding any load in flight.
    func load(context new: AcademyContext, query text: String = "") async {
        if new != context { schedules = []; nextOffset = nil }
        context = new
        query = text
        generation += 1
        let owner = generation
        isLoadingMore = false
        loadMoreError = nil
        state = .loading
        let result = await fetch(new, query: text, offset: 0)
        guard owner == generation, isCurrent(new) else { return }
        switch result {
        case .success(let page):
            schedules = page.schedules
            nextOffset = page.nextOffset
            hasOpenYear = page.academicYear != nil
            timeZone = TimeZone(identifier: page.timeZone)
            state = .loaded
        case .failure(let error):
            await handle(error) { self.state = .failed($0) }
        }
    }

    /// Appends the next page of the current results.
    func loadMore() async {
        guard let context, let offset = nextOffset, !isLoadingMore, state == .loaded else { return }
        let owner = generation
        isLoadingMore = true
        loadMoreError = nil
        let result = await fetch(context, query: query, offset: offset)
        // A newer search or academy owns the list now, including its loading flag.
        guard owner == generation, isCurrent(context) else { return }
        isLoadingMore = false
        switch result {
        case .success(let page):
            let known = Set(schedules.map(\.id))
            schedules += page.schedules.filter { !known.contains($0.id) }
            nextOffset = page.nextOffset
        case .failure(let error):
            await handle(error) { self.loadMoreError = $0 }
        }
    }

    private func fetch(_ context: AcademyContext, query: String, offset: Int) async -> Result<SchedulesPage, APIError> {
        var path = "api/v1/academies/\(context.academyID)/schedules?limit=\(Self.pageSize)&offset=\(offset)"
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty, let encoded = trimmed.prefix(100).addingPercentEncoding(withAllowedCharacters: Self.queryValue) {
            path += "&q=\(encoded)"
        }
        do { return .success(try await api.get(path)) } catch { return .failure(error) }
    }

    private func handle(_ error: APIError, show: (String) -> Void) async {
        switch error {
        case .unauthenticated:
            await onUnauthenticated()
        case .forbidden:
            schedules = []
            nextOffset = nil
            show("You no longer have access to this academy.")
            await onForbidden()
        case .network:
            show("Can't reach the server. Check your connection and try again.")
        case .server(let message):
            show(message)
        case .rejected(let failure):
            show(failure.message)
        case .cancelled:
            // A newer search or the picker closing cancelled this load; nothing to report.
            if state == .loading { state = schedules.isEmpty ? .idle : .loaded }
        }
    }

    /// Unreserved characters only, so `&`, `=`, `+` and `#` in search text stay literal.
    private static let queryValue = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
}
