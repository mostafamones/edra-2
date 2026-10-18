import SwiftUI

/// Signed-in shell: one navigation stack per destination under the system tab bar, with an academy
/// action tab. Academy loading, access states and academy-change resets live here, above both stacks.
struct ShellView: View {
    enum Destination: Hashable { case sessions, assessments, academy }

    let model: AcademiesModel
    let sessions: SessionsModel
    let schedules: SchedulesModel
    let start: StartSessionModel
    let makeSessionModel: (LiveSession) -> SessionDetailModel
    let onSignOut: () -> Void

    @Environment(\.scenePhase) private var scenePhase
    @State private var tab = Destination.sessions
    @State private var showAcademies = false
    /// Session screens belong to the selected academy; they close when the selection changes.
    @State private var sessionsPath: [LiveSession] = []
    /// Assessments content (EDRA-79) pushes onto this stack.
    @State private var assessmentsPath = NavigationPath()

    var body: some View {
        tabs
        .task { await model.load() }
        .task(id: model.context) { await sessions.load(context: model.context) }
        // Prefetch the start picker's schedules so it opens already populated.
        .task(id: model.context) { if let context = model.context { await schedules.load(context: context) } }
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
        // Before iOS 26 the academy tab opens a dialog; from 26 a Menu overlays its circle instead.
        let selection = Binding(get: { tab }, set: { if $0 == .academy { showAcademies = true } else { tab = $0 } })
        if #available(iOS 26, *) {
            // Taps that slip past the menu overlay (while it dismisses) must not select the action tab.
            TabView(selection: Binding(get: { tab }, set: { if $0 != .academy { tab = $0 } })) {
                Tab("Sessions", image: "tabler-calendar-clock", value: Destination.sessions) { sessionsStack }
                Tab("Assessments", image: "tabler-file-pencil", value: Destination.assessments) { assessmentsStack }
                Tab(value: Destination.academy, role: .search) { Color.clear } label: { academyLabel }
            }
            .overlay(alignment: .bottomTrailing) { academyMenu }
        } else {
            TabView(selection: selection) {
                sessionsStack.tabItem { Label("Sessions", image: "tabler-calendar-clock") }.tag(Destination.sessions)
                assessmentsStack.tabItem { Label("Assessments", image: "tabler-file-pencil") }.tag(Destination.assessments)
                Color.clear.tabItem { academyLabel }.tag(Destination.academy)
            }
        }
    }

    /// A system glass Menu over the tab bar's trailing circle. The system button style (not a custom
    /// glass label) is what keeps the menu's morph animation from flashing a square.
    private var academyMenu: some View {
        Menu {
            Section("Your academies") {
                ForEach(model.academies) { academy in
                    Button { model.select(academy) } label: {
                        Label { Text(academy.name) } icon: {
                            Image(academy.id == model.selectedID ? "tabler-check" : academy.iconAsset)
                        }
                    }
                }
            }
            Section {
                Button(role: .destructive, action: onSignOut) {
                    Label { Text("Sign out") } icon: { Image("tabler-logout") }
                }
            }
        } label: {
            Image(model.selected?.iconAsset ?? "tabler-building-community")
                .resizable().scaledToFit().frame(width: 26, height: 26)
                .frame(width: 62, height: 62)
        }
        .nativeGlass()
        .accessibilityLabel(model.selected.map { "Switch academy, current: \($0.name)" } ?? "Switch academy")
        .padding(.trailing, 20)
        .padding(.bottom, 22)
        .ignoresSafeArea(.container, edges: .bottom)
    }

    private var academyLabel: some View {
        Label("Academy", image: model.selected?.iconAsset ?? "tabler-building-community")
            .accessibilityLabel(model.selected.map { "Switch academy, current: \($0.name)" } ?? "Switch academy")
    }

    private var sessionsStack: some View {
        NavigationStack(path: $sessionsPath) {
            page("Sessions", trailing: { startButton }) { SessionsHomeView(context: model.context, sessions: sessions) }
                .navigationDestination(for: LiveSession.self) { SessionView(session: $0, makeModel: makeSessionModel) }
        }
    }

    private var startButton: some View {
        Button { start.presentPicker() } label: {
            Image("tabler-plus").frame(width: 24, height: 24).frame(width: 44, height: 44)
        }
        .nativeGlass()
        .accessibilityLabel("Start session")
    }

    private var assessmentsStack: some View {
        NavigationStack(path: $assessmentsPath) { page("Assessments", trailing: { EmptyView() }) { AssessmentsPlaceholderView() } }
    }

    /// A destination's root: its content only while an academy is selected, never a stale one.
    /// Large system title with the academy name beneath, as Photos does.
    private func page<Content: View, Trailing: View>(
        _ title: String, @ViewBuilder trailing: () -> Trailing, @ViewBuilder _ content: () -> Content
    ) -> some View {
        let trailingView = trailing()
        return Group {
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
        .toolbar(.hidden, for: .navigationBar)
        .safeAreaInset(edge: .top, spacing: 0) {
            if let academy = model.selected { PageHeader(academy: academy, title: title, trailing: trailingView) }
        }
    }
}

/// Large page title with the academy name small beneath it; `trailing` shares the title's row.
private struct PageHeader<Trailing: View>: View {
    let academy: Academy
    let title: String
    let trailing: Trailing

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            // The button shares the title's row, centered on it; the academy sits beneath.
            HStack {
                Text(title).font(.largeTitle.bold()).accessibilityAddTraits(.isHeader)
                Spacer()
                trailing
            }
            Text(academy.name).font(.subheadline.weight(.semibold)).foregroundStyle(.secondary).lineLimit(1)
        }
        .padding(.horizontal, 20)
        .padding(.top, 32)
        .padding(.bottom, 14)
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

private extension View {
    /// System Liquid Glass circle button on iOS 26+, a standard bordered circle before.
    @ViewBuilder func nativeGlass() -> some View {
        if #available(iOS 26, *) {
            buttonStyle(.glass).buttonBorderShape(.circle)
        } else {
            buttonStyle(.bordered).buttonBorderShape(.circle)
        }
    }
}
