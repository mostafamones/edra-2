import SwiftUI

/// One assignment: server-searched students with filters, marking entry points and announcement.
struct WorkspaceView: View {
    @State private var model: WorkspaceModel
    @Environment(\.scenePhase) private var scenePhase
    enum Tab { case students, scan }

    @State private var searchText = ""
    @State private var searching = false
    @FocusState private var searchFocused: Bool
    @State private var showCodeEntry = false
    @State private var codeText = ""
    @State private var tab = Tab.students
    @State private var scan = AssignmentScanModel()

    init(summary: AssignmentSummary, context: AcademyContext, parent: AssignmentsModel) {
        _model = State(initialValue: WorkspaceModel(summary: summary, context: context, parent: parent))
    }

    var body: some View {
        content
            .navigationTitle(model.detail?.title ?? model.summary.title)
            .navigationBarTitleDisplayMode(.inline)
            // This screen has its own bottom navigation instead of the app's tab bar.
            .toolbar(.hidden, for: .tabBar)
            .navigationBarBackButtonHidden(model.isSelecting)
            .toolbar { toolbar }
            .safeAreaInset(edge: .bottom, spacing: 0) { bottomControls }
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
            .onChange(of: model.nextStudentRequest) { codeText = ""; showCodeEntry = true }
            .alert("Student code", isPresented: $showCodeEntry) {
                TextField("Code", text: $codeText).textInputAutocapitalization(.characters).autocorrectionDisabled()
                Button("Open") { Task { await model.lookUp(code: codeText, from: .code) } }
                Button("Cancel", role: .cancel) {}
            }
            .alert("Code not accepted", isPresented: Binding(
                get: { model.lookupError != nil && tab == .students }, set: { if !$0 { model.lookupError = nil } }
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
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        case .failed(let message):
            UnavailableView(title: "Couldn't load this assignment", message: message, action: "Retry") { await model.load() }
        case .loaded:
            if tab == .scan {
                AssignmentScanView(workspace: model, scan: scan)
            } else {
                VStack(spacing: 0) {
                    filters
                    if let status = accessStatus {
                        Text(status).font(.subheadline.weight(.medium)).foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 20).padding(.bottom, 6)
                    }
                    students
                }
            }
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
                    Text("\(Score.display(student.total)) / \(Score.display(model.detail?.maxScore))").font(.subheadline.monospacedDigit())
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
        if model.isSelecting {
            ToolbarItem(placement: .topBarLeading) {
                Button { model.isSelecting = false } label: { Image("tabler-x") }.accessibilityLabel("Cancel selection")
            }
        } else if tab == .students, model.actions.mark, model.detail?.studentCodesEnabled == true {
            ToolbarItem(placement: .topBarTrailing) {
                Button { codeText = ""; showCodeEntry = true } label: { Image("tabler-code") }.accessibilityLabel("Enter student code")
            }
        }
    }

    private var scanAvailable: Bool { model.actions.mark && model.detail?.studentCodesEnabled == true }

    /// Bottom navigation (Students / Scan) with the search or confirm button at the right.
    @ViewBuilder private var bottomControls: some View {
        if model.state == .loaded {
            VStack(spacing: 8) {
                if searching, tab == .students, !model.isSelecting { searchField }
                HStack(alignment: .bottom) {
                    if scanAvailable && !model.isSelecting { nav }
                    Spacer()
                    if tab == .students { roundButton }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
        }
    }

    private var nav: some View {
        HStack(spacing: 4) {
            navItem("Students", "tabler-users", .students)
            navItem("Scan", "tabler-scan", .scan)
        }
        .padding(4)
        .background(.regularMaterial, in: .capsule)
    }

    private func navItem(_ title: String, _ icon: String, _ target: Tab) -> some View {
        let selected = tab == target
        return Button {
            tab = target
            if target == .scan { searching = false }
        } label: {
            VStack(spacing: 2) {
                Image(icon).resizable().scaledToFit().frame(width: 24, height: 24)
                Text(title).font(.caption2.weight(.semibold))
            }
            .frame(width: 96, height: 52)
            .foregroundStyle(selected ? Color.accentColor : Color.primary)
            .background(selected ? Color.accentColor.opacity(0.18) : .clear, in: .capsule)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    /// Search while browsing; announce the selection while selecting.
    @ViewBuilder private var roundButton: some View {
        if model.isSelecting {
            Button { model.reviewSelection() } label: {
                Image("tabler-check").resizable().scaledToFit().frame(width: 26, height: 26)
                    .frame(width: 56, height: 56)
                    .foregroundStyle(.white)
                    .background(Color.accentColor, in: .circle)
                    .overlay(alignment: .topTrailing) {
                        if !model.selection.isEmpty {
                            Text("\(model.selection.count)").font(.caption2.weight(.bold).monospacedDigit())
                                .padding(.horizontal, 6).padding(.vertical, 2)
                                .background(.red, in: .capsule).foregroundStyle(.white)
                                .offset(x: 4, y: -4)
                        }
                    }
            }
            .buttonStyle(.plain)
            .disabled(model.selection.isEmpty)
            .opacity(model.selection.isEmpty ? 0.5 : 1)
            .accessibilityLabel(model.selection.isEmpty ? "Announce selected results" : "Announce \(model.selection.count) selected results")
        } else {
            Button {
                searching.toggle()
                if searching { searchFocused = true } else { searchFocused = false; searchText = "" }
            } label: {
                Image(searching ? "tabler-x" : "tabler-search").resizable().scaledToFit().frame(width: 24, height: 24)
                    .frame(width: 56, height: 56)
                    .background(.regularMaterial, in: .circle)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(searching ? "Close search" : "Search students")
        }
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image("tabler-search").resizable().scaledToFit().frame(width: 20, height: 20).foregroundStyle(.secondary)
            TextField("Name or code", text: $searchText)
                .focused($searchFocused)
                .autocorrectionDisabled()
                .submitLabel(.search)
        }
        .padding(.horizontal, 14).frame(height: 48)
        .background(.regularMaterial, in: .capsule)
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
                                Text("\(Score.display(student.total)) / \(Score.display(model.detail?.maxScore))").monospacedDigit()
                            }
                        }
                    } header: {
                        Text(announcement.students.count == 1 ? "1 student" : "\(announcement.students.count) students")
                    }
                    if let status = status(announcement.state) {
                        Section { Text(status).foregroundStyle(.red) }
                    }
                }
                .navigationTitle("Announce results")
                .navigationBarTitleDisplayMode(.inline)
                .interactiveDismissDisabled(announcement.state == .sending)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button(isDone(announcement.state) ? "Close" : "Cancel") { model.announcement = nil }
                            .disabled(announcement.state == .sending)
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
