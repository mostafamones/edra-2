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

    var selected: Academy? { academies.first { $0.id == selectedID } }

    private let api: APIClient
    private let defaults: UserDefaults
    private let onUnauthenticated: @MainActor () async -> Void
    private static let selectionKey = "selectedAcademyID"

    init(api: APIClient, defaults: UserDefaults = .standard, onUnauthenticated: @escaping @MainActor () async -> Void) {
        self.api = api
        self.defaults = defaults
        self.onUnauthenticated = onUnauthenticated
    }

    func load() async {
        state = .loading
        do {
            let response: AcademiesResponse = try await api.get("api/v1/academies")
            academies = response.academies
            // Keep the remembered academy if the server still grants it; otherwise default to the first.
            let remembered = defaults.string(forKey: Self.selectionKey)
            selectedID = academies.first { $0.id == remembered }?.id ?? academies.first?.id
            persistSelection()
            state = .loaded
        } catch APIError.unauthenticated {
            await onUnauthenticated()
        } catch APIError.forbidden {
            academies = []; selectedID = nil
            state = .loaded
        } catch APIError.network {
            state = .failed("Can't reach the server. Check your connection and try again.")
        } catch APIError.server(let message) {
            state = .failed(message)
        } catch {
            // Cancelled: a newer load or sign-out owns the state.
        }
    }

    func select(_ academy: Academy) {
        guard academies.contains(academy) else { return }
        selectedID = academy.id
        persistSelection()
    }

    private func persistSelection() {
        defaults.set(selectedID, forKey: Self.selectionKey)
    }

    static func clearRememberedSelection(defaults: UserDefaults = .standard) {
        defaults.removeObject(forKey: selectionKey)
    }
}
