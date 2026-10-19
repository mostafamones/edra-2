import Observation

@MainActor
@Observable
final class SessionsModel {
    enum State: Equatable {
        case idle
        case loading
        case loaded
        case failed(String)
    }

    private(set) var state: State = .idle
    private(set) var sessions: [LiveSession] = []
    /// The academy context the current `sessions` belong to; responses for any other are dropped.
    private(set) var context: AcademyContext?
    /// Only the newest load may commit, including overlapping loads for the same academy.
    private var generation = 0

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

    func load(context new: AcademyContext?) async {
        if new != context { sessions = [] }
        context = new
        generation += 1
        let owner = generation
        guard let new else { state = .idle; return }
        state = .loading
        let result: Result<LiveSessionsResponse, APIError>
        do {
            result = .success(try await api.get("api/v1/academies/\(new.academyID)/sessions?state=live"))
        } catch {
            result = .failure(error)
        }
        guard owner == generation, context == new, isCurrent(new) else { return }

        switch result {
        case .success(let response):
            sessions = response.sessions
            state = .loaded
        case .failure(.unauthenticated):
            await onUnauthenticated()
        case .failure(.forbidden):
            sessions = []
            state = .idle
            await onForbidden()
        case .failure(.network):
            state = .failed("Can't reach the server. Check your connection and try again.")
        case .failure(.server(let message)):
            state = .failed(message)
        case .failure(.rejected(let failure)):
            state = .failed(failure.message)
        case .failure(.cancelled):
            // The screen went away mid-load; no error to report.
            state = sessions.isEmpty ? .idle : .loaded
        }
    }
}
