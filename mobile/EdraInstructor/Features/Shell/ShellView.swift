import SwiftUI

/// Signed-in shell: one navigation stack per destination, the floating tab pill and the academy
/// menu. Academy loading, access states and academy-change resets live here, above both stacks.
struct ShellView: View {
    enum Tab: Hashable { case sessions, assessments }

    let model: AcademiesModel
    let sessions: SessionsModel
    let schedules: SchedulesModel
    let start: StartSessionModel
    let makeSessionModel: (LiveSession) -> SessionDetailModel
    let onSignOut: () -> Void

    @Environment(\.scenePhase) private var scenePhase
    @State private var tab = Tab.sessions
    /// Session screens belong to the selected academy; they close when the selection changes.
    @State private var sessionsPath: [LiveSession] = []
    /// Assessments content (EDRA-79) pushes onto this stack.
    @State private var assessmentsPath = NavigationPath()

    var body: some View {
        // Both stacks stay alive so switching tabs keeps each one's history and view state.
        ZStack {
            NavigationStack(path: $sessionsPath) {
                page { SessionsHomeView(academy: $0, context: model.context, sessions: sessions, start: start) }
                    .navigationDestination(for: LiveSession.self) { SessionView(session: $0, makeModel: makeSessionModel) }
            }
            .activeTab(tab == .sessions)
            NavigationStack(path: $assessmentsPath) {
                page { AssessmentsPlaceholderView(academy: $0) }
            }
            .activeTab(tab == .assessments)
        }
        .safeAreaInset(edge: .bottom) { ShellDock(tab: $tab, academies: model, onSignOut: onSignOut) }
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

    /// A destination's root: its content only while an academy is selected, never a stale one.
    private func page<Content: View>(@ViewBuilder _ content: (Academy) -> Content) -> some View {
        Group {
            switch model.state {
            case .loading where model.academies.isEmpty:
                ProgressView("Loading academies…").frame(maxWidth: .infinity, maxHeight: .infinity)
            case .failed(let message):
                UnavailableView(title: "Couldn't load academies", message: message, action: "Retry") { await model.load() }
            default:
                if let academy = model.selected {
                    content(academy)
                } else {
                    UnavailableView(title: "No staff access",
                                    message: "Your account doesn't have active staff access to an academy.")
                }
            }
        }
        .toolbar(.hidden, for: .navigationBar)
    }
}

/// Large page title with the academy name above it, so shared academy icons stay distinguishable.
struct PageHeader<Trailing: View>: View {
    let academy: Academy
    let title: String
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(alignment: .lastTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(academy.name)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Text(title)
                    .font(.largeTitle.bold())
                    .accessibilityAddTraits(.isHeader)
            }
            Spacer()
            trailing
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 12)
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

extension EnvironmentValues {
    /// False while the view sits in the hidden tab; screens pause polling there.
    @Entry var isActiveTab = true
}

private extension View {
    func activeTab(_ active: Bool) -> some View {
        opacity(active ? 1 : 0)
            .allowsHitTesting(active)
            .accessibilityHidden(!active)
            .environment(\.isActiveTab, active)
    }
}
