import SwiftUI

struct SessionCard: View {
    let session: LiveSession

    private var details: String {
        [session.groupName, session.levelName, session.trackName, session.location]
            .compactMap { $0 }
            .joined(separator: " · ")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(session.scheduleTitle).font(.headline)
            if !details.isEmpty {
                Text(details).font(.subheadline).foregroundStyle(.secondary)
            }
            HStack {
                Text("Started \(session.startedAt, style: .time)")
                Spacer()
                Text("\(session.rosterCount) students")
            }
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(.fill.tertiary)
        .overlay(alignment: .leading) {
            Rectangle().fill(Color.accentColor).frame(width: 3)
        }
        .clipShape(.rect(cornerRadius: 16))
        .accessibilityElement(children: .combine)
    }
}
