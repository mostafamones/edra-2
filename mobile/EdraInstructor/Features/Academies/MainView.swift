import SwiftUI

/// Main screen: live sessions of the selected academy, a start action, and the academy switcher.
struct MainView: View {
    let model: AcademiesModel
    let sessions: SessionsModel
    let schedules: SchedulesModel
    let start: StartSessionModel
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
                HStack {
                    Text("Live sessions")
                        .font(.title2.bold())
                        .accessibilityAddTraits(.isHeader)
                    Spacer()
                    Button { start.presentPicker() } label: {
                        Label { Text("Start session") } icon: { Image("tabler-plus") }
                    }
                    .buttonStyle(.bordered)
                }
                .padding(.horizontal, 16)
                .padding(.top, 28)
                .padding(.bottom, 12)
            }
            content
        }
        .safeAreaInset(edge: .bottom) {
            AcademySwitcher(model: model, onSignOut: onSignOut)
                .padding(.horizontal, 16)
                .padding(.bottom, 4)
        }
        .task { await model.load() }
        .task(id: model.context) { await sessions.load(context: model.context) }
        // Switching or losing an academy (suspension, removal) changes the context: leave its
        // screens, which cancels their tasks and discards pending edits, scan confirmations and
        // any unacknowledged start.
        .onChange(of: model.context) {
            path.removeAll()
            start.reset()
        }
        // Back from a session: it may have ended or been archived meanwhile, so refresh the live list.
        .onChange(of: path.isEmpty) { _, isEmpty in
            if isEmpty { Task { await sessions.load(context: model.context) } }
        }
        // A started (or opened) session: its identity comes from the server acknowledgment.
        .onChange(of: start.destination) { _, destination in
            guard let destination else { return }
            start.destination = nil
            path = [destination]
        }
        .sheet(isPresented: Bindable(start).isPickerPresented) {
            if let academy = model.selected, let context = model.context {
                StartSessionView(academy: academy, context: context, schedules: schedules, start: start)
            }
        }
        // Revalidate access when returning to the app; missed changes surface here or as a 403.
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task {
                let context = model.context
                await model.load()
                if model.context == context { await sessions.load(context: context) }
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
                        await sessions.load(context: model.context)
                    }
                case .loaded where sessions.sessions.isEmpty:
                    unavailable("No live sessions", "Start a session from a schedule, or pull to refresh when staff start one.") {
                        await sessions.load(context: model.context)
                    }
                case .loaded, .loading where !sessions.sessions.isEmpty:
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            ForEach(sessions.sessions) { session in
                                NavigationLink(value: session) { SessionCard(session: session) }
                                    .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                    .refreshable { await sessions.load(context: model.context) }
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
