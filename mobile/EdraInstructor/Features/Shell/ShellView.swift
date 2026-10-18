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

    /// The system tab bar (floating Liquid Glass on iOS 26) with the academy menu as a separate glass
    /// circle beside it. Before iOS 26 the academy is a tab item that opens a dialog.
    @ViewBuilder private var tabs: some View {
        let selection = Binding(get: { tab }, set: { if $0 == .academy { showAcademies = true } else { tab = $0 } })
        if #available(iOS 26, *) {
            TabView(selection: $tab) {
                Tab("Sessions", image: "tabler-calendar-clock", value: Destination.sessions) { sessionsStack }
                Tab("Assessments", image: "tabler-file-pencil", value: Destination.assessments) { assessmentsStack }
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

    /// The academy menu circle. The system glass button style (not a custom glass label) keeps the
    /// menu's morph animation from flashing a square.
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
                // The glass style adds ~6.5 pt per side: 47 + 13 matches the 60 pt tab bar pill.
                .frame(width: 47, height: 47)
        }
        .nativeGlass()
        .accessibilityLabel(model.selected.map { "Switch academy, current: \($0.name)" } ?? "Switch academy")
        // Measured on device: the pill sits 21 pt from the screen edge and 12 pt below the bottom
        // safe-area line; the circle mirrors it on the trailing side.
        .padding(.trailing, 21)
        .offset(y: 12)
    }

    private var academyLabel: some View {
        Label("Academy", image: model.selected?.iconAsset ?? "tabler-building-community")
            .accessibilityLabel(model.selected.map { "Switch academy, current: \($0.name)" } ?? "Switch academy")
    }

    private var sessionsStack: some View {
        NavigationStack(path: $sessionsPath) {
            page("Sessions", trailing: { startButton(diameter: $0) }) { SessionsHomeView(context: model.context, sessions: sessions) }
                .navigationDestination(for: LiveSession.self) { SessionView(session: $0, makeModel: makeSessionModel) }
        }
    }

    private func startButton(diameter: CGFloat) -> some View {
        // `diameter` is the visible circle; the glass style adds ~13 pt around the label.
        Button { start.presentPicker() } label: {
            Image("tabler-plus").resizable().scaledToFit()
                .frame(width: diameter * 0.45, height: diameter * 0.45)
                .frame(width: diameter - 13, height: diameter - 13)
        }
        .nativeGlass()
        .accessibilityLabel("Start session")
    }

    private var assessmentsStack: some View {
        NavigationStack(path: $assessmentsPath) { page("Assessments", trailing: { _ in EmptyView() }) { AssessmentsPlaceholderView() } }
    }

    /// A destination's root: its content only while an academy is selected, never a stale one.
    /// Large system title with the academy name beneath, as Photos does.
    private func page<Content: View, Trailing: View>(
        _ title: String, @ViewBuilder trailing: @escaping (CGFloat) -> Trailing, @ViewBuilder _ content: () -> Content
    ) -> some View {
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
        .toolbar(.hidden, for: .navigationBar)
        .safeAreaInset(edge: .top, spacing: 0) {
            if let academy = model.selected { PageHeader(academy: academy, title: title, trailing: trailing) }
        }
    }
}

/// Large page title with the academy name small beneath it; `trailing` shares the title's row.
private struct PageHeader<Trailing: View>: View {
    let academy: Academy
    let title: String
    /// Builds the title-row button for a given diameter.
    let trailing: (CGFloat) -> Trailing
    @State var width: CGFloat = 393

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            // The button shares the title's row, centered on it; the academy sits beneath.
            HStack {
                Text(title).font(.system(size: width * 29 / 393, weight: .bold)).accessibilityAddTraits(.isHeader)
                Spacer()
                trailing(width * 43 / 393)
            }
            Text(academy.name).font(.subheadline.weight(.semibold)).foregroundStyle(.secondary).lineLimit(1)
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .padding(.bottom, 14)
        // Sizes measured from Photos on a 393 pt wide iPhone, scaled to this width.
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
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
