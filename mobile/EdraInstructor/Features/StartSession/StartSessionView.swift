import SwiftUI

/// Picks a schedule of the selected academy and starts (or opens) its session.
struct StartSessionView: View {
    let academy: Academy
    let context: AcademyContext
    let schedules: SchedulesModel
    let start: StartSessionModel

    @Environment(\.dismiss) private var dismiss
    @State private var search = ""
    @State private var confirming: StartableSchedule?

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Start session")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Close") { dismiss() }
                    }
                }
                .searchable(text: $search, prompt: "Search schedules")
                .task(id: search) {
                    // Debounce typing; the first page loads at once.
                    if !search.isEmpty { try? await Task.sleep(for: .milliseconds(300)) }
                    guard !Task.isCancelled else { return }
                    await schedules.load(context: context, query: search)
                }
                .confirmationDialog(
                    confirming.map { $0.liveSessionId == nil ? "Start “\($0.title)”?" : "“\($0.title)” is live" } ?? "",
                    isPresented: Binding(get: { confirming != nil }, set: { if !$0 { confirming = nil } }),
                    titleVisibility: .visible,
                    presenting: confirming
                ) { schedule in
                    Button(schedule.liveSessionId == nil ? "Start session" : "Open live session") {
                        Task { await start.start(schedule, academyName: academy.name, in: context) }
                    }
                } message: { schedule in
                    Text(schedule.liveSessionId == nil
                         ? "Starts a live session for \(academy.name) and captures its roster now. Planned times don't restrict starting."
                         : "Staff already started this session. You'll join the same live session.")
                }
                .overlay {
                    if start.isStarting {
                        ProgressView("Starting…")
                            .padding(20)
                            .background(.regularMaterial, in: .rect(cornerRadius: 16))
                    }
                }
        }
    }

    @ViewBuilder private var content: some View {
        List {
            Section {
                Label { Text(academy.name) } icon: { Image(academy.iconAsset) }
                    .accessibilityLabel("Academy: \(academy.name)")
                if let notice {
                    Text(notice)
                        .font(.subheadline)
                        .foregroundStyle(.red)
                    // Retrying reuses the unacknowledged start's key, so it can't start twice.
                    if let retry = retrySchedule {
                        Button("Retry starting “\(retry.title)”") {
                            Task { await start.start(retry, academyName: academy.name, in: context) }
                        }
                    }
                }
            }
            switch schedules.state {
            case .failed(let message):
                unavailable("Couldn't load schedules", message) { await schedules.load(context: context, query: search) }
            case .loaded where !schedules.hasOpenYear:
                unavailable("No open academic year", "Sessions can only start in an open academic year.")
            case .loaded where schedules.schedules.isEmpty:
                if search.isEmpty {
                    unavailable("No schedules", "Schedules are created on the Edra website.")
                } else {
                    unavailable("No matching schedules", "No schedule title matches “\(search)”.")
                }
            case .loaded:
                rows
            default:
                HStack { Spacer(); ProgressView("Loading schedules…"); Spacer() }
                    .listRowBackground(Color.clear)
            }
        }
        .disabled(start.isStarting)
        .refreshable { await schedules.load(context: context, query: search) }
    }

    @ViewBuilder private var rows: some View {
        let today = schedules.schedules.filter(\.meetsToday)
        let others = schedules.schedules.filter { !$0.meetsToday }
        if !today.isEmpty {
            Section("Planned today") { ForEach(today) { row($0) } }
        }
        if !others.isEmpty {
            Section(today.isEmpty ? "Schedules" : "Other schedules") { ForEach(others) { row($0) } }
        }
        Section {
            if schedules.isLoadingMore {
                HStack { Spacer(); ProgressView(); Spacer() }
            } else if let error = schedules.loadMoreError {
                Button("Couldn't load more. Retry") { Task { await schedules.loadMore() } }
                    .accessibilityHint(error)
            } else if schedules.hasMore {
                // Reaching the end of the list loads the next page.
                Color.clear.frame(height: 1).task { await schedules.loadMore() }
            }
        } footer: {
            if let zone = schedules.timeZone, zone.identifier != TimeZone.current.identifier {
                Text("Times are in academy time (\(zone.identifier)).")
            }
        }
    }

    private func row(_ schedule: StartableSchedule) -> some View {
        Button { confirming = schedule } label: {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(schedule.title).font(.headline)
                    Spacer()
                    if schedule.liveSessionId != nil {
                        Text("Live")
                            .font(.caption.weight(.semibold))
                            .padding(.horizontal, 8).padding(.vertical, 2)
                            .foregroundStyle(Color.accentColor)
                            .background(Color.accentColor.opacity(0.15), in: .capsule)
                    }
                }
                let details = [schedule.audienceLabel, schedule.location].compactMap { $0 }.filter { !$0.isEmpty }
                if !details.isEmpty {
                    Text(details.joined(separator: " · ")).font(.subheadline).foregroundStyle(.secondary)
                }
                ForEach(schedule.planLines, id: \.self) { line in
                    Text(line).font(.footnote).foregroundStyle(.secondary)
                }
                if !schedule.mandatory {
                    Text("Optional").font(.footnote).foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .disabled(!schedule.canStart)
        .accessibilityElement(children: .combine)
        .accessibilityHint(schedule.liveSessionId == nil ? "Starts a session" : "Opens the live session")
    }

    private var notice: String? {
        switch start.phase {
        case .uncertain(let message), .failed(let message): message
        default: nil
        }
    }

    private var retrySchedule: StartableSchedule? {
        guard case .uncertain = start.phase, let attempt = start.attempt, attempt.context == context else { return nil }
        return schedules.schedules.first { $0.id == attempt.scheduleID }
    }

    private func unavailable(_ title: String, _ message: String, retry: (@MainActor () async -> Void)? = nil) -> some View {
        ContentUnavailableView {
            Label { Text(title) } icon: { EmptyView() }
        } description: {
            Text(message)
        } actions: {
            if let retry {
                Button("Retry") { Task { await retry() } }.buttonStyle(.borderedProminent)
            }
        }
        .listRowBackground(Color.clear)
    }
}
