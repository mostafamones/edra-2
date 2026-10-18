import SwiftUI

/// Signed-in shell: one navigation stack per destination under the system tab bar, with an academy
/// action tab. Academy loading, access states and academy-change resets live here, above both stacks.
struct ShellView: View {
    enum Tab: Hashable { case sessions, assessments, academy }

    let model: AcademiesModel
    let sessions: SessionsModel
    let schedules: SchedulesModel
    let start: StartSessionModel
    let makeSessionModel: (LiveSession) -> SessionDetailModel
    let onSignOut: () -> Void

    @Environment(\.scenePhase) private var scenePhase
    @State private var tab = Tab.sessions
    @State private var showAcademies = false
    /// Session screens belong to the selected academy; they close when the selection changes.
    @State private var sessionsPath: [LiveSession] = []
    /// Assessments content (EDRA-79) pushes onto this stack.
    @State private var assessmentsPath = NavigationPath()

    var body: some View {
        tabs
        .task { await model.load() }
        .task(id: model.context) { await sessions.load(context: model.context) }
        // Switching or losing an academy (suspension, removal) changes the context: leave its
        // screens, which cancels their tasks and discards pending edits, scan confirmations and
        // any unacknowledged start. Reselecting the current academy keeps the context.
        .onChange(of: model.context) {
            tab = .sessions
            sessionsPath.removeAll()
            assessmentsPath = NavigationPath()
            start.reset()
        }
        // Back from a session: it may have ended or been archived meanwhile, so refresh the live list.
        .onChange(of: sessionsPath.isEmpty) { _, isEmpty in
            if isEmpty { Task { await sessions.load(context: model.context) } }
        }
        // A started (or opened) session: its identity comes from the server acknowledgment.
        .onChange(of: start.destination) { _, destination in
            guard let destination else { return }
            start.destination = nil
            tab = .sessions
            sessionsPath = [destination]
        }
        .sheet(isPresented: Bindable(start).isPickerPresented) {
            if let academy = model.selected, let context = model.context {
                StartSessionView(academy: academy, context: context, schedules: schedules, start: start)
            }
        }
        .confirmationDialog("Your academies", isPresented: $showAcademies, titleVisibility: .visible) {
            ForEach(model.academies) { academy in
                Button(academy.id == model.selectedID ? "✓ \(academy.name)" : academy.name) { model.select(academy) }
            }
            Button("Sign out", role: .destructive, action: onSignOut)
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

    /// The system tab bar (floating Liquid Glass on iOS 26). Academy is a trailing action tab, like
    /// Photos' search: it never stays selected, it opens the academy list.
    @ViewBuilder private var tabs: some View {
        let selection = Binding(get: { tab }, set: { if $0 == .academy { showAcademies = true } else { tab = $0 } })
        if #available(iOS 26, *) {
            TabView(selection: selection) {
                Tab("Sessions", image: "tabler-calendar-clock", value: Tab.sessions) { sessionsStack }
                Tab("Assessments", image: "tabler-file-pencil", value: Tab.assessments) { assessmentsStack }
                Tab(value: Tab.academy, role: .search) { Color.clear } label: { academyLabel }
            }
        } else {
            TabView(selection: selection) {
                sessionsStack.tabItem { Label("Sessions", image: "tabler-calendar-clock") }.tag(Tab.sessions)
                assessmentsStack.tabItem { Label("Assessments", image: "tabler-file-pencil") }.tag(Tab.assessments)
                Color.clear.tabItem { academyLabel }.tag(Tab.academy)
            }
        }
    }

    private var academyLabel: some View {
        Label("Academy", image: model.selected?.iconAsset ?? "tabler-building-community")
            .accessibilityLabel(model.selected.map { "Switch academy, current: \($0.name)" } ?? "Switch academy")
    }

    private var sessionsStack: some View {
        NavigationStack(path: $sessionsPath) {
            page("Sessions") { SessionsHomeView(context: model.context, sessions: sessions, start: start) }
                .navigationDestination(for: LiveSession.self) { SessionView(session: $0, makeModel: makeSessionModel) }
        }
    }

    private var assessmentsStack: some View {
        NavigationStack(path: $assessmentsPath) { page("Assessments") { AssessmentsPlaceholderView() } }
    }

    /// A destination's root: its content only while an academy is selected, never a stale one.
    /// Large system title with the academy name beneath, as Photos does.
    private func page<Content: View>(_ title: String, @ViewBuilder _ content: () -> Content) -> some View {
        Group {
            switch model.state {
            case .loading where model.academies.isEmpty:
                ProgressView("Loading academies…").frame(maxWidth: .infinity, maxHeight: .infinity)
            case .failed(let message):
                UnavailableView(title: "Couldn't load academies", message: message, action: "Retry") { await model.load() }
            default:
                if model.selected != nil {
                    content()
                } else {
                    UnavailableView(title: "No staff access",
                                    message: "Your account doesn't have active staff access to an academy.")
                }
            }
        }
        .navigationTitle(title)
        .academySubtitle(model.selected?.name)
    }
}

private extension View {
    @ViewBuilder func academySubtitle(_ name: String?) -> some View {
        if #available(iOS 26, *) {
            navigationSubtitle(name ?? "")
        } else {
            safeAreaInset(edge: .top, spacing: 0) {
                if let name {
                    Text(name).font(.subheadline).foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 16)
                }
            }
        }
    }
}

struct UnavailableView: View {
    let title: String
    let message: String
    var action: String?
    var perform: (@MainActor () async -> Void)?

    var body: some View {
        ContentUnavailableView {
            Label { Text(title) } icon: { EmptyView() }
        } description: {
            Text(message)
        } actions: {
            if let action, let perform {
                Button(action) { Task { await perform() } }.buttonStyle(.borderedProminent)
            }
        }
    }
}
