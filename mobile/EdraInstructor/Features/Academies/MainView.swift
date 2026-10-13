import SwiftUI

/// Main screen: academy switcher on top, live sessions below (list UI comes later).
struct MainView: View {
    let model: AcademiesModel
    let sessions: SessionsModel
    let makeSessionModel: (LiveSession) -> SessionDetailModel
    let onSignOut: () -> Void

    @Environment(\.scenePhase) private var scenePhase
    /// Session screens belong to the selected academy; they close when the selection changes.
    @State private var path: [LiveSession] = []

    var body: some View {
        NavigationStack(path: $path) {
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
        // Losing an academy (suspension, removal) changes the selection: leave its screens, which
        // cancels their tasks and discards pending edits and scan confirmations.
        .onChange(of: model.selectedID) { path.removeAll() }
        // Back from a session: it may have ended or been archived meanwhile, so refresh the live list.
        .onChange(of: path.isEmpty) { _, isEmpty in
            if isEmpty { Task { await sessions.load(academyID: model.selectedID) } }
        }
        // Revalidate access when returning to the app; missed changes surface here or as a 403.
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task {
                let selected = model.selectedID
                await model.load()
                if model.selectedID == selected { await sessions.load(academyID: selected) }
            }
        }
    }

    @ViewBuilder private var content: some View {
        switch model.state {
        case .loading where model.academies.isEmpty:
            ProgressView("Loading academies…").frame(maxWidth: .infinity, maxHeight: .infinity)
        case .failed(let message):
            unavailable("Couldn't load academies", message) { await model.load() }
        default:
            if model.selected == nil {
                unavailable("No staff access", "Your account doesn't have active staff access to an academy.")
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
