import SwiftUI
import UIKit

struct SessionView: View {
    /// The model is created once per presentation, not on every parent re-render.
    @State private var model: SessionDetailModel

    @State private var showLateSheet = false
    @State private var showScanner = false
    @State private var showFinalize = false
    @State private var confirmMarkAbsent = false
    @State private var attendeeModel: AddAttendeeModel?

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
                    Button { showFinalize = true } label: { Image("tabler-check") }
                        .disabled(!model.canPublish)
                        .accessibilityLabel("Finalize attendance")
                }
            }
            .sheet(isPresented: $showFinalize) { FinalizeReviewSheet(model: model) }
            .alert("Attendance", isPresented: Binding(
                get: { model.publishMessage != nil && !showFinalize },
                set: { if !$0 { model.publishMessage = nil } }
            )) {
                Button("OK") {}
            } message: {
                Text(model.publishMessage ?? "")
            }
            .confirmationDialog(
                model.absenceCommand != nil ? "Retry marking the rest absent?" : "Mark \(model.unrecordedCount) absent?",
                isPresented: $confirmMarkAbsent, titleVisibility: .visible
            ) {
                Button(model.absenceCommand != nil ? "Retry" : "Mark \(model.unrecordedCount) absent", role: .destructive) {
                    Task { await model.markRestAbsent() }
                }
                if model.absenceCommand != nil {
                    Button("Discard") { model.discardAbsenceCommand() }
                }
            } message: {
                Text("Nothing is official until you finalize attendance.")
            }
            .task { await model.refreshWhileVisible() }
            .alert("Couldn't change attendance", isPresented: Binding(
                get: { model.statusError != nil }, set: { if !$0 { model.statusError = nil } }
            )) {
                if let pending = model.uncertainStatus {
                    Button("Retry") { Task { await model.retryStatus(pending) } }
                    Button("Discard", role: .destructive) { model.discardStatus(pending) }
                } else {
                    Button("OK", role: .cancel) {}
                }
            } message: { Text(model.statusError ?? "") }
            .alert("Attendance", isPresented: Binding(
                get: { model.notice != nil }, set: { if !$0 { model.notice = nil } }
            )) { Button("OK", role: .cancel) {} } message: { Text(model.notice ?? "") }
            .sheet(item: $attendeeModel) { attendee in
                AddAttendeeView(model: attendee)
            }
            .sheet(isPresented: $showLateSheet) {
                LateDeadlineSheet(initialMinutes: model.lateAfterMinutes) { model.setLateAfter(minutes: $0) }
            }
            .fullScreenCover(isPresented: $showScanner) {
                ScannerView(model: model.makeScannerModel(), academyName: model.session.academyName,
                            sessionTitle: model.session.scheduleTitle,
                            makeAttendeeModel: { model.makeAttendeeModel(query: $0) })
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
                banner("Archived · not counted",
                       "A manager archived this session. Its attendance is kept for reference, is read-only and doesn't count.")
            } else if sheet.session.state != "live" {
                // e.g. a retried start whose original session has ended since.
                banner("Ended", "This session has ended, so check-ins are closed.")
            }
            if let problem = model.refreshProblem {
                refreshBanner(problem)
            }
            stats(sheet).padding(.top, 24)
            Text(officialLabel(sheet))
                .font(.footnote)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 16)
                .padding(.top, 8)

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
                            } label: { StudentCard(entry: entry, saving: model.savingEntries.contains(entry.id)) }
                                .buttonStyle(.plain)
                                .disabled(!model.canEdit || model.savingEntries.contains(entry.id))
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 96) // clear of the + button
                }
                .refreshable { await model.load() }
            }
        }
    }

    private func officialLabel(_ sheet: AttendanceSheet) -> String {
        let official = switch sheet.official {
        case .notFinalized: "Not finalized"
        case .finalized: "Finalized"
        case .correctionsPending: "Corrections pending"
        }
        return "Draft counts · \(official)"
    }

    private func refreshBanner(_ problem: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Couldn't refresh").font(.headline)
                Text(problem).font(.subheadline).foregroundStyle(.secondary)
                if let at = model.lastRefreshed {
                    Text("Last updated \(at.formatted(date: .omitted, time: .shortened))")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
            Button("Retry") { Task { await model.load() } }.buttonStyle(.bordered)
        }
        .padding(12)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal, 16)
        .padding(.top, 16)
        .accessibilityElement(children: .combine)
    }

    private func banner(_ title: String, _ message: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.headline)
            Text(message)
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

    /// Compact tiles: three fit the screen width, the rest scroll sideways.
    private func stats(_ sheet: AttendanceSheet) -> some View {
        let counts = sheet.counts
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                StatTile(label: "Students", count: counts.total)
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
            if model.sheet?.session.mandatory == true {
                Button(role: .destructive) {
                    model.beginAbsenceReview()
                    confirmMarkAbsent = true
                } label: { Label { Text("Mark rest absent") } icon: { Image("tabler-user-x") } }
                    .disabled(!model.canMarkRestAbsent)
            }
            Button { attendeeModel = model.makeAttendeeModel() } label: {
                Label { Text("Add attendee") } icon: { Image("tabler-user-plus") }
            }
            .disabled(!model.canEdit)
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
    var saving = false

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.fullName).font(.headline)
                let details = [entry.studentCode, entry.origin == .unexpected ? "Added" : nil].compactMap { $0 }
                if !details.isEmpty {
                    Text(details.joined(separator: " · ")).font(.subheadline).foregroundStyle(.secondary)
                }
                if entry.differsFromOfficial {
                    Text("Finalized: \(entry.publishedStatus?.label ?? AttendanceStatus.unknown.label)")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            Spacer()
            if saving { ProgressView() }
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
