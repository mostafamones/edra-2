import SwiftUI
import UIKit

struct SessionView: View {
    /// The model is created once per presentation, not on every parent re-render.
    @State private var model: SessionDetailModel

    @State private var showLateSheet = false
    @State private var showScanner = false
    @State private var confirmPublish = false
    @State private var confirmMarkAbsent = false

    init(session: LiveSession, makeModel: (LiveSession) -> SessionDetailModel) {
        _model = State(initialValue: makeModel(session))
    }

    var body: some View {
        content
            .navigationTitle(model.session.scheduleTitle)
            .navigationBarTitleDisplayMode(.inline)
            .overlay(alignment: .bottomTrailing) { addButton }
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button { confirmPublish = true } label: { Image("tabler-check") }
                        .disabled(!model.canPublish)
                        .accessibilityLabel("Finalize attendance")
                }
            }
            .confirmationDialog("Finalize attendance?", isPresented: $confirmPublish, titleVisibility: .visible) {
                Button("Finalize") { Task { await model.publish() } }
            } message: {
                Text("This makes the current attendance official. Later changes become pending corrections.")
            }
            .alert("Attendance", isPresented: Binding(
                get: { model.publishMessage != nil },
                set: { if !$0 { model.publishMessage = nil } }
            )) {
                Button("OK") {}
            } message: {
                Text(model.publishMessage ?? "")
            }
            .confirmationDialog("Mark the rest absent?", isPresented: $confirmMarkAbsent, titleVisibility: .visible) {
                Button("Mark rest absent", role: .destructive) { Task { await model.markRestAbsent() } }
            } message: {
                Text("Every student without a status will be marked Absent. You can still change them afterwards.")
            }
            .task { await model.refreshWhileVisible() }
            .alert("Couldn't change status", isPresented: Binding(
                get: { model.statusError != nil }, set: { if !$0 { model.statusError = nil } }
            )) { Button("OK", role: .cancel) {} } message: { Text(model.statusError ?? "") }
            .sheet(isPresented: $showLateSheet) {
                LateDeadlineSheet(initialMinutes: model.lateAfterMinutes) { model.setLateAfter(minutes: $0) }
            }
            .fullScreenCover(isPresented: $showScanner) {
                ScannerView(model: model.makeScannerModel(), academyName: model.session.academyName,
                            sessionTitle: model.session.scheduleTitle)
            }
    }

    @ViewBuilder private var content: some View {
        switch model.state {
        case .loading:
            ProgressView("Loading attendance…").frame(maxWidth: .infinity, maxHeight: .infinity)
        case .failed(let message):
            ContentUnavailableView {
                Label { Text("Couldn't load attendance") } icon: { EmptyView() }
            } description: {
                Text(message)
            } actions: {
                Button("Retry") { Task { await model.load() } }.buttonStyle(.borderedProminent)
            }
        case .loaded:
            if let sheet = model.sheet { loaded(sheet) }
        }
    }

    private func loaded(_ sheet: AttendanceSheet) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            if model.isArchived {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Archived · not counted").font(.headline)
                    Text("A manager archived this session. Its attendance is kept for reference, is read-only and doesn't count.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal, 16)
                .padding(.top, 16)
                .accessibilityElement(children: .combine)
            }
            stats(sheet).padding(.top, 24)

            Text(model.showAll ? "All students" : "Checked in students")
                .font(.title2.bold())
                .padding(.horizontal, 16)
                .padding(.top, 32)
                .padding(.bottom, 12)
                .accessibilityAddTraits(.isHeader)

            if model.visibleEntries.isEmpty {
                Text(model.showAll ? "No students on this roster" : "No students checked in yet")
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .padding(.bottom, 96)
            } else {
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(model.visibleEntries) { entry in
                            Menu {
                                Picker("Status", selection: Binding(
                                    get: { entry.status },
                                    set: { status in Task { await model.changeStatus(status, for: entry) } }
                                )) {
                                    ForEach(AttendanceStatus.allCases, id: \.self) { Text($0.label).tag($0) }
                                }
                            } label: { StudentCard(entry: entry) }
                                .buttonStyle(.plain)
                                .disabled(!model.canEdit)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 96) // clear of the + button
                }
                .refreshable { await model.load() }
            }
        }
    }

    /// Compact tiles: three fit the screen width, the rest scroll sideways.
    private func stats(_ sheet: AttendanceSheet) -> some View {
        let counts = sheet.counts
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                StatTile(label: sheet.session.mandatory ? "Expected" : "Eligible", count: counts.total)
                StatTile(label: "Present", count: counts.present, color: .green)
                StatTile(label: "Late", count: counts.late, color: .orange)
                StatTile(label: "Absent", count: counts.absent, color: .red)
                StatTile(label: "Excused", count: counts.excused, color: .cyan)
            }
            .scrollTargetLayout()
        }
        .contentMargins(.horizontal, 16, for: .scrollContent)
        .scrollTargetBehavior(.viewAligned)
        .fixedSize(horizontal: false, vertical: true)
    }

    private var addButton: some View {
        Menu {
            Toggle(isOn: $model.showAll) {
                Label { Text("Show all") } icon: { Image("tabler-users") }
            }
            Button(role: .destructive) { confirmMarkAbsent = true } label: { Label { Text("Mark rest absent") } icon: { Image("tabler-user-x") } }
                .disabled(!model.canMarkRestAbsent)
            Divider()
            Button { showLateSheet = true } label: { Label { Text("Set late deadline") } icon: { Image("tabler-clock") } }
            Button { showScanner = true } label: { Label { Text("Open scanner") } icon: { Image("tabler-scan") } }
        } label: {
            Image("tabler-dots")
                .resizable().scaledToFit()
                .frame(width: 26, height: 26)
                .frame(width: 44, height: 44)
        }
        .menuOrder(.fixed)
        .nativeGlassProminent()
        .padding(20)
        .accessibilityLabel("Menu")
    }
}

private extension View {
    /// System Liquid Glass button on iOS 26+, standard prominent circle before that.
    @ViewBuilder func nativeGlassProminent() -> some View {
        if #available(iOS 26, *) {
            buttonStyle(.glassProminent).buttonBorderShape(.circle)
        } else {
            buttonStyle(.borderedProminent).buttonBorderShape(.circle)
        }
    }
}

private struct StatTile: View {
    let label: String
    let count: Int
    var color: Color?

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 5) {
                if let color { Circle().fill(color).frame(width: 6, height: 6) }
                Text(label).font(.footnote).foregroundStyle(.secondary).lineLimit(1)
            }
            Text("\(count)").font(.title.bold())
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 14))
        // Three tiles fit the container width (minus margins and gaps); the rest scroll.
        .containerRelativeFrame(.horizontal) { width, _ in (width - 32 - 20) / 3 }
        .accessibilityElement(children: .combine)
    }
}

struct StudentCard: View {
    let entry: AttendanceEntry

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.fullName).font(.headline)
                if let code = entry.studentCode {
                    Text(code).font(.subheadline).foregroundStyle(.secondary)
                }
            }
            Spacer()
            Text(entry.status.label)
                .font(.footnote.weight(.semibold))
                .padding(.horizontal, 10).padding(.vertical, 4)
                .foregroundStyle(entry.status.tint)
                .background(entry.status.tint.opacity(0.15), in: .capsule)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.fill.tertiary, in: .rect(cornerRadius: 16))
        .accessibilityElement(children: .combine)
    }
}
