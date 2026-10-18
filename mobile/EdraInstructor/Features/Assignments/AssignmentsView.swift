import SwiftUI

/// Assessments root: active and closed assignments, including overdue ones.
struct AssignmentsView: View {
    let model: AssignmentsModel

    var body: some View {
        switch model.state {
        case .idle, .loading where model.assignments.isEmpty:
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        case .failed(let message) where model.assignments.isEmpty:
            UnavailableView(title: "Couldn't load assignments", message: message, action: "Retry") {
                await model.load(context: model.context)
            }
        default:
            if model.assignments.isEmpty {
                ContentUnavailableView("No assignments", image: "tabler-file-pencil")
            } else {
                list
            }
        }
    }

    private var list: some View {
        List {
            ForEach(model.assignments) { assignment in
                NavigationLink(value: assignment) { AssignmentRow(assignment: assignment) }
            }
            if model.hasMore {
                HStack {
                    if model.isLoadingMore {
                        ProgressView()
                    } else {
                        Button(model.loadMoreError == nil ? "Load more" : "Retry loading more") { Task { await model.loadMore() } }
                    }
                    Spacer()
                    Text("\(model.assignments.count) of \(model.total)").foregroundStyle(.secondary)
                }
                if let error = model.loadMoreError { Text(error).font(.footnote).foregroundStyle(.red) }
            }
        }
        .listStyle(.insetGrouped)
        .refreshable { await model.load(context: model.context) }
    }
}

private struct AssignmentRow: View {
    let assignment: AssignmentSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(assignment.title).font(.headline)
            HStack(spacing: 8) {
                if assignment.state == "closed" { Text("Closed").foregroundStyle(.orange) }
                if let due = assignment.dueAt {
                    Text("Due \(due.formatted(date: .abbreviated, time: .omitted))")
                        .foregroundStyle(due < .now && assignment.state == "active" ? .red : .secondary)
                }
                Text("\(assignment.recipientCount) students").foregroundStyle(.secondary)
            }
            .font(.subheadline)
        }
        .padding(.vertical, 2)
    }
}
