import SwiftUI

/// Sessions root: the selected academy's live sessions and the start action.
struct SessionsHomeView: View {
    let context: AcademyContext?
    let sessions: SessionsModel
    let start: StartSessionModel

    var body: some View {
        content.toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { start.presentPicker() } label: {
                    Label { Text("Start session") } icon: { Image("tabler-plus") }
                }
            }
        }
    }

    @ViewBuilder private var content: some View {
        switch sessions.state {
        case .failed(let message):
            UnavailableView(title: "Couldn't load live sessions", message: message, action: "Retry") {
                await sessions.load(context: context)
            }
        case .loaded where sessions.sessions.isEmpty:
            UnavailableView(title: "No live sessions",
                            message: "Start a session from a schedule, or pull to refresh when staff start one.",
                            action: "Refresh") {
                await sessions.load(context: context)
            }
        case .loaded, .loading where !sessions.sessions.isEmpty:
            ScrollView {
                LazyVStack(spacing: 12) {
                    ForEach(sessions.sessions) { session in
                        NavigationLink(value: session) { SessionCard(session: session) }
                            .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 16)
            }
            .refreshable { await sessions.load(context: context) }
        default:
            ProgressView("Loading live sessions…").frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}
