import SwiftUI

/// Search for a student not on the roster and add them explicitly. Nothing is written until Add.
struct AddAttendeeView: View {
    @State var model: AddAttendeeModel
    /// Called after the sheet closes following a successful add.
    var onFinished: () -> Void = {}

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Add attendee")
                .navigationBarTitleDisplayMode(.inline)
                .searchable(text: $model.query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Name or code")
                .onSubmit(of: .search) { Task { await model.search() } }
                .task(id: model.query) {
                    // Debounced: a newer query cancels this wait, and only the newest search commits.
                    try? await Task.sleep(for: .milliseconds(300))
                    if !Task.isCancelled { await model.search() }
                }
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
                }
                .safeAreaInset(edge: .bottom) { footer }
                .onChange(of: model.added) { _, entry in
                    if entry != nil { onFinished(); dismiss() }
                }
        }
    }

    @ViewBuilder private var content: some View {
        switch model.phase {
        case .idle, .loading where model.items.isEmpty:
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        case .failed(let message) where model.items.isEmpty:
            ContentUnavailableView {
                Label { Text("Couldn't search") } icon: { EmptyView() }
            } description: {
                Text(message)
            } actions: {
                Button("Retry") { Task { await model.search() } }.buttonStyle(.borderedProminent)
            }
        default:
            if model.items.isEmpty {
                ContentUnavailableView {
                    Label { Text(model.query.isEmpty ? "No students to add" : "No student matches") } icon: { Image("tabler-user-plus") }
                }
            } else {
                List {
                    ForEach(model.items) { candidate in
                        Button { model.choose(candidate) } label: { row(candidate) }
                            .disabled(model.isAdding)
                            .accessibilityAddTraits(model.chosen?.candidate == candidate ? .isSelected : [])
                    }
                    if model.hasMore {
                        Button(model.isLoadingMore ? "Loading…" : "Show more") { Task { await model.loadMore() } }
                            .disabled(model.isLoadingMore)
                    }
                }
                .listStyle(.plain)
            }
        }
    }

    private func row(_ candidate: AttendeeCandidate) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(candidate.fullName).font(.headline)
                let placement = [candidate.levelName, candidate.groupName, candidate.participationType == "online_only" ? "Online" : nil]
                    .compactMap { $0 }.joined(separator: " · ")
                if !placement.isEmpty { Text(placement).font(.subheadline).foregroundStyle(.secondary) }
            }
            Spacer()
            if let code = candidate.studentCode { Text(code).font(.subheadline.monospaced()).foregroundStyle(.secondary) }
            if model.chosen?.candidate == candidate { Image("tabler-check").foregroundStyle(Color.accentColor) }
        }
        .contentShape(.rect)
    }

    private var footer: some View {
        VStack(spacing: 8) {
            if let message = model.message {
                Text(message).font(.footnote).foregroundStyle(.red).frame(maxWidth: .infinity, alignment: .leading)
            } else if model.choiceIsStale {
                Text("Attendance changed after you chose this student.").font(.footnote).foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            if let choice = model.chosen, model.choiceIsStale, model.message == nil {
                Button { model.choose(choice.candidate) } label: {
                    Text("I've reviewed the latest").frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.bordered)
            } else {
                Button { Task { await model.add() } } label: {
                    Group {
                        if model.isAdding { ProgressView() } else { Text(model.chosen.map { "Add \($0.candidate.fullName)" } ?? "Add") }
                    }
                    .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .disabled(model.chosen == nil || model.isAdding)
            }
        }
        .padding(16)
        .background(.bar)
    }
}
