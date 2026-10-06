import SwiftUI

/// Main screen: academy switcher on top, live sessions below (list UI comes later).
struct MainView: View {
    let model: AcademiesModel
    let sessions: SessionsModel
    let makeSessionModel: (LiveSession) -> SessionDetailModel
    let onSignOut: () -> Void

    var body: some View {
        NavigationStack {
            main
                .navigationDestination(for: LiveSession.self) { SessionView(session: $0, makeModel: makeSessionModel) }
                .toolbar(.hidden, for: .navigationBar)
        }
    }

    private var main: some View {
        VStack(spacing: 0) {
            Text("Edra")
                .font(.headline)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
            if model.selected != nil {
                Text("Live sessions")
                    .font(.title2.bold())
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16)
                    .padding(.top, 28)
                    .padding(.bottom, 12)
                    .accessibilityAddTraits(.isHeader)
            }
            content
        }
        .safeAreaInset(edge: .bottom) {
            AcademySwitcher(model: model, onSignOut: onSignOut)
                .padding(.horizontal, 16)
                .padding(.bottom, 4)
        }
        .task { await model.load() }
        .task(id: model.selectedID) { await sessions.load(academyID: model.selectedID) }
    }

    @ViewBuilder private var content: some View {
        switch model.state {
        case .loading where model.academies.isEmpty:
            ProgressView("Loading academies…").frame(maxWidth: .infinity, maxHeight: .infinity)
        case .failed(let message):
            unavailable("Couldn't load academies", message) { await model.load() }
        default:
            if model.selected == nil {
                unavailable("No staff access", "Your account isn't a staff member of any academy.")
            } else {
                switch sessions.state {
                case .failed(let message):
                    unavailable("Couldn't load live sessions", message) {
                        await sessions.load(academyID: model.selectedID)
                    }
                case .loaded where sessions.sessions.isEmpty:
                    unavailable("No live sessions", "Sessions appear here when staff start them.") {
                        await sessions.load(academyID: model.selectedID)
                    }
                case .loaded:
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            ForEach(sessions.sessions) { session in
                                NavigationLink(value: session) { SessionCard(session: session) }
                                    .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                    .refreshable { await sessions.load(academyID: model.selectedID) }
                default:
                    ProgressView("Loading live sessions…").frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
        }
    }

    private func unavailable(_ title: String, _ message: String, retry: (@MainActor () async -> Void)? = nil) -> some View {
        ContentUnavailableView {
            Label { Text(title) } icon: { EmptyView() }
        } description: {
            Text(message)
        } actions: {
            if let retry {
                Button(title.hasPrefix("No live") ? "Refresh" : "Retry") { Task { await retry() } }.buttonStyle(.borderedProminent)
            }
        }
    }
}
