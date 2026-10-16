import Foundation
import Observation

@MainActor
@Observable
final class AcademiesModel {
    enum State: Equatable {
        case loading
        case loaded
        case failed(String)
    }

    private(set) var state: State = .loading
    private(set) var academies: [Academy] = []
    private(set) var selectedID: String?
    /// Increases whenever the selection changes, including back to an earlier academy.
    private var selectionEpoch = 0
    /// Only the newest load may commit; an older response completing later is dropped.
    private var generation = 0

    var selected: Academy? { academies.first { $0.id == selectedID } }

    /// The selected academy as an ownership token for academy-scoped work.
    var context: AcademyContext? { selectedID.map { AcademyContext(academyID: $0, epoch: selectionEpoch) } }

    /// True while `context` is still the selection of the signed-in account that started the work.
    func isCurrent(_ context: AcademyContext) -> Bool { scope.isActive && self.context == context }

    private let api: APIClient
    private let scope: AccountScope
    private let defaults: UserDefaults
    private let onUnauthenticated: @MainActor () async -> Void
    private static let selectionKey = "selectedAcademyID"

    init(
        api: APIClient, scope: AccountScope, defaults: UserDefaults = .standard,
        onUnauthenticated: @escaping @MainActor () async -> Void
    ) {
        self.api = api
        self.scope = scope
        self.defaults = defaults
        self.onUnauthenticated = onUnauthenticated
    }

    /// Loads, or revalidates, the academies the server currently grants. A newer call supersedes
    /// any load still in flight.
    func load() async {
        generation += 1
        let owner = generation
        state = .loading
        let result: Result<AcademiesResponse, APIError>
        do { result = .success(try await api.get("api/v1/academies")) } catch { result = .failure(error) }
        guard scope.isActive, owner == generation else { return }

        switch result {
        case .success(let response):
            academies = response.academies
            // Keep the current selection if the server still grants it, else the remembered one
            // (read now, not when the request started), else the first. Never restore from cache.
            let remembered = defaults.string(forKey: Self.selectionKey)
            let preferred = [selectedID, remembered].compactMap { $0 }
                .first { id in academies.contains { $0.id == id } }
            setSelection(preferred ?? academies.first?.id)
            state = .loaded
        case .failure(.unauthenticated):
            await onUnauthenticated()
        case .failure(.forbidden):
            academies = []
            setSelection(nil)
            state = .loaded
        case .failure(.network):
            // Not evidence of revocation: keep the granted list; the next request revalidates.
            state = academies.isEmpty ? .failed("Can't reach the server. Check your connection and try again.") : .loaded
        case .failure(.server(let message)):
            state = academies.isEmpty ? .failed(message) : .loaded
        case .failure(.cancelled):
            // The owner went away mid-load; leave the last good state without reporting an error.
            if !academies.isEmpty { state = .loaded }
        }
    }

    func select(_ academy: Academy) {
        guard scope.isActive, academies.contains(academy) else { return }
        setSelection(academy.id)
    }

    private func setSelection(_ id: String?) {
        if id != selectedID {
            selectedID = id
            selectionEpoch += 1
        }
        if id != nil { defaults.set(id, forKey: Self.selectionKey) }
    }

    static func clearRememberedSelection(defaults: UserDefaults = .standard) {
        defaults.removeObject(forKey: selectionKey)
    }
}
