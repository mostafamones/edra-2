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
    /// The academy the current `sessions` belong to; late responses for another academy are dropped.
    private(set) var academyID: String?

    private let api: APIClient
    private let onUnauthenticated: @MainActor () async -> Void
    private let onForbidden: @MainActor () async -> Void

    init(
        api: APIClient,
        onUnauthenticated: @escaping @MainActor () async -> Void,
        onForbidden: @escaping @MainActor () async -> Void
    ) {
        self.api = api
        self.onUnauthenticated = onUnauthenticated
        self.onForbidden = onForbidden
    }

    func load(academyID id: String?) async {
        if id != academyID { sessions = [] }
        academyID = id
        guard let id else { state = .idle; return }
        state = .loading
        do {
            let response: LiveSessionsResponse = try await api.get("api/v1/academies/\(id)/sessions?state=live")
            guard academyID == id else { return }
            sessions = response.sessions
            state = .loaded
        } catch APIError.unauthenticated {
            await onUnauthenticated()
        } catch APIError.forbidden {
            guard academyID == id else { return }
            sessions = []
            state = .idle
            await onForbidden()
        } catch APIError.network {
            guard academyID == id else { return }
            state = .failed("Can't reach the server. Check your connection and try again.")
        } catch APIError.server(let message) {
            guard academyID == id else { return }
            state = .failed(message)
        } catch {
            // Cancelled by a newer load.
        }
    }
}
