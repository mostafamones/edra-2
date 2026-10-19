import SwiftUI

/// One assignment: server-searched students with filters, marking entry points and announcement.
struct WorkspaceView: View {
    @State private var model: WorkspaceModel
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.dismiss) private var dismiss
    enum Pane: Hashable { case students, scan, search }

    @State private var searchText = ""
    @State private var pane = Pane.students
    @State private var scan = AssignmentScanModel()

    init(summary: AssignmentSummary, context: AcademyContext, parent: AssignmentsModel) {
        _model = State(initialValue: WorkspaceModel(summary: summary, context: context, parent: parent))
    }

    var body: some View {
        content
            // Loaded once; returning from another tab keeps the list, its paging and any selection.
            .task { if model.detail == nil { await model.load() } }
            // Search runs on the server across every student; debounce typing.
            .task(id: searchText) {
                try? await Task.sleep(for: .milliseconds(300))
                guard !Task.isCancelled else { return }
                await model.setSearch(searchText)
            }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active, model.marking == nil { Task { await model.reloadStudents() } }
            }
            // Leaving search shows every student again.
            .onChange(of: pane) { _, new in if new != .search { searchText = "" } }
            .alert("Code not accepted", isPresented: Binding(
                get: { model.lookupError != nil && pane != .scan }, set: { if !$0 { model.lookupError = nil } }
            )) {
                Button("OK", role: .cancel) {}
            } message: { Text(model.lookupError ?? "") }
            .alert(model.notice ?? "", isPresented: Binding(get: { model.notice != nil }, set: { if !$0 { model.notice = nil } })) {
                Button("OK", role: .cancel) {}
            }
            .sheet(isPresented: Binding(
                get: { model.marking != nil }, set: { if !$0 { model.closeMarking() } }
            )) {
                if let marking = model.marking { MarkingSheet(model: marking) { model.closeMarking() } }
            }
            .sheet(item: $model.announcement) { _ in AnnounceSheet(model: model) }
    }

    @ViewBuilder private var content: some View {
        switch model.state {
        case .loading:
            page(ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity))
        case .failed(let message):
            page(UnavailableView(title: "Couldn't load this assignment", message: message, action: "Retry") { await model.load() })
        case .loaded:
            tabs
        }
    }

    /// One tab's navigation: the assignment title, Back (or Cancel while selecting).
    /// Each tab owns its stack so the search tab can morph into the native search field.
    private func page<Content: View>(_ content: Content) -> some View {
        NavigationStack {
            content
                .navigationTitle(model.detail?.title ?? model.summary.title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { toolbar }
        }
    }

    /// Native tab bar: Students, Scan (when codes can be used) and the system search tab. While
    /// selecting, the search tab becomes the confirm button that announces the selection.
    @ViewBuilder private var tabs: some View {
        let selection = Binding(get: { pane }, set: { new in
            if new == .search && model.isSelecting { model.reviewSelection() } else { pane = new }
        })
        if #available(iOS 26, *) {
            TabView(selection: selection) {
                Tab("Students", image: "tabler-users", value: Pane.students) { page(studentsPage) }
                if scanAvailable && !model.isSelecting {
                    Tab("Scan", image: "tabler-scan", value: Pane.scan) { page(AssignmentScanView(workspace: model, scan: scan)) }
                }
                // Search belongs to the search tab only, so other tabs get no pinned search bar.
                Tab(value: Pane.search, role: .search) {
                    page(studentsPage).searchable(text: $searchText, prompt: "Search students in this assessment...")
                } label: {
                    if model.isSelecting { Label("Announce selected", image: "tabler-check") } else { Label("Search", image: "tabler-search") }
                }
            }
        } else {
            TabView(selection: selection) {
                page(studentsPage.searchable(text: $searchText, prompt: "Search students in this assessment..."))
                    .tabItem { Label("Students", image: "tabler-users") }.tag(Pane.students)
                if scanAvailable && !model.isSelecting {
                    page(AssignmentScanView(workspace: model, scan: scan)).tabItem { Label("Scan", image: "tabler-scan") }.tag(Pane.scan)
                }
            }
        }
    }

    private var studentsPage: some View {
        VStack(spacing: 0) {
            filters
            if let status = accessStatus {
                Text(status).font(.subheadline.weight(.medium)).foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 20).padding(.bottom, 6)
            }
            students
        }
    }

    private var accessStatus: String? {
        let actions = model.actions
        if !actions.mark { return model.detail?.state == "archived" ? "Archived · read-only" : "Read-only" }
        if !actions.recordWork { return "Closed · received work only" }
        return nil
    }

    private var filters: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(WorkspaceModel.Filter.allCases) { filter in
                    let selected = model.filter == filter
                    Button { Task { await model.setFilter(filter) } } label: {
                        Text(filter.title).font(.subheadline.weight(.medium))
                            .padding(.horizontal, 14).padding(.vertical, 8)
                            .background(selected ? Color.accentColor : Color(.secondarySystemFill), in: .capsule)
                            .foregroundStyle(selected ? Color.white : Color.primary)
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(selected ? .isSelected : [])
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 10)
        }
    }

    /// The empty state replaces the list; filters and search stay available above it.
    @ViewBuilder private var students: some View {
        switch model.listState {
        case .loading where model.students.isEmpty:
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        case .failed(let message):
            UnavailableView(title: "Couldn't load students", message: message, action: "Retry") { await model.reloadStudents() }
        default:
            if model.students.isEmpty {
                ContentUnavailableView(model.search.isEmpty && model.filter == .all ? "No students" : "No matching students",
                                       image: "tabler-users")
                    .frame(maxHeight: .infinity)
            } else {
                list
            }
        }
    }

    private var list: some View {
        List {
            Section {
                ForEach(model.students) { student in row(student) }
                if model.hasMore {
                    HStack {
                        if model.isLoadingMore {
                            ProgressView()
                        } else {
                            Button(model.loadMoreError == nil ? "Load more" : "Retry loading more") { Task { await model.loadMore() } }
                        }
                        Spacer()
                        Text("\(model.students.count) of \(model.total)").foregroundStyle(.secondary)
                    }
                }
            } header: {
                Text("\(model.total) students")
            }
        }
        .listStyle(.insetGrouped)
        .refreshable { await model.reloadStudents() }
    }

    private func row(_ student: StudentWork) -> some View {
        let selected = model.selection.contains(student.id)
        return Button {
            if model.isSelecting {
                if selected { model.selection.remove(student.id) } else if model.announceBlocker(student) == nil { model.selection.insert(student.id) }
            } else {
                model.open(student, from: .row)
            }
        } label: {
            HStack(spacing: 12) {
                if model.isSelecting {
                    Image(selected ? "tabler-circle-check" : "tabler-circle").resizable().scaledToFit().frame(width: 20, height: 20)
                        .opacity(model.announceBlocker(student) == nil ? 1 : 0.3)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(student.fullName).font(.body.weight(.medium)).foregroundStyle(.primary)
                    Text([student.studentCode, student.groupName].compactMap { $0 }.joined(separator: " · "))
                        .font(.footnote).foregroundStyle(.secondary)
                }
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 2) {
                    scoreText(student.total, model.detail?.maxScore).font(.subheadline.monospacedDigit())
                    Text(student.status).font(.footnote).foregroundStyle(statusColor(student))
                }
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
        .contextMenu {
            if model.actions.announce, !model.isSelecting {
                Button("Announce result") { model.reviewAnnouncement([student]) }.disabled(model.announceBlocker(student) != nil)
                Button("Select") {
                    model.isSelecting = true
                    if model.announceBlocker(student) == nil { model.selection.insert(student.id) }
                }
            }
        }
    }

    private func statusColor(_ student: StudentWork) -> Color {
        switch student.status {
        case "Announced": .green
        case "Marked", "Correction pending": .orange
        default: .secondary
        }
    }

    /// No action bar while selecting; a close button replaces Back so the mode can be left.
    @ToolbarContentBuilder private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            if model.isSelecting {
                Button { model.isSelecting = false } label: { Image("tabler-x") }.accessibilityLabel("Cancel selection")
            } else {
                Button { dismiss() } label: { Image("tabler-chevron-left") }.accessibilityLabel("Back")
            }
        }
        // Before iOS 26 there is no search tab to turn into the confirm button.
        if model.isSelecting && Self.needsToolbarConfirm {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Announce \(model.selection.count)") { model.reviewSelection() }.disabled(model.selection.isEmpty)
            }
        }
    }

    private var scanAvailable: Bool { model.actions.mark && model.detail?.studentCodesEnabled == true }

    private static var needsToolbarConfirm: Bool {
        if #available(iOS 26, *) { false } else { true }
    }
}

/// Confirms an announcement: names, count, saved totals and corrections. All or nothing.
struct AnnounceSheet: View {
    let model: WorkspaceModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            if let announcement = model.announcement {
                List {
                    Section {
                        ForEach(announcement.students) { student in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(student.fullName)
                                    if let reason = rejection(announcement, student) ?? model.announceBlocker(student) {
                                        Text(reason).font(.footnote).foregroundStyle(.red)
                                    } else if student.publicationState == "pending_correction" {
                                        Text("Correction · official \(Score.display(student.publication?.total))").font(.footnote).foregroundStyle(.orange)
                                    }
                                }
                                Spacer()
                                scoreText(student.total, model.detail?.maxScore).monospacedDigit()
                            }
                        }
                    } header: {
                        Text(announcement.students.count == 1 ? "1 student" : "\(announcement.students.count) students")
                    }
                    if let status = status(announcement.state) {
                        Section { Text(status).foregroundStyle(.red) }
                    }
                }
                .navigationTitle("Announce?")
                .navigationBarTitleDisplayMode(.inline)
                .interactiveDismissDisabled(announcement.state == .sending)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button { model.announcement = nil } label: { Image("tabler-x") }
                            .disabled(announcement.state == .sending)
                            .accessibilityLabel(isDone(announcement.state) ? "Close" : "Cancel")
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        if announcement.state == .sending {
                            ProgressView()
                        } else if !isDone(announcement.state) {
                            Button(isUncertain(announcement.state) ? "Retry" : "Announce") { Task { await model.announce() } }
                                .disabled(announcement.students.contains { model.announceBlocker($0) != nil })
                        }
                    }
                }
            }
        }
    }

    private func rejection(_ announcement: WorkspaceModel.Announcement, _ student: StudentWork) -> String? {
        if case .rejected(_, let reasons) = announcement.state { return reasons[student.id] }
        return nil
    }

    private func status(_ state: WorkspaceModel.AnnounceState) -> String? {
        switch state {
        case .reviewing, .sending: nil
        case .uncertain(let text), .failed(let text), .rejected(let text, _): text
        }
    }

    private func isDone(_ state: WorkspaceModel.AnnounceState) -> Bool {
        switch state {
        case .rejected, .failed: true
        default: false
        }
    }

    private func isUncertain(_ state: WorkspaceModel.AnnounceState) -> Bool {
        if case .uncertain = state { return true }
        return false
    }
}

/// "8.5 / 10": the mark bold, the maximum muted.
func scoreText(_ total: String?, _ max: String?) -> Text {
    Text("\(Text(Score.display(total)).bold())\(Text(" / \(Score.display(max))").foregroundStyle(.secondary))")
}
