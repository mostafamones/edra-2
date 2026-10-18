import Foundation
import Observation

/// `POST /api/v1/academies/{id}/sessions` acknowledgment.
struct StartSessionResponse: Decodable, Sendable {
    struct Session: Decodable, Sendable {
        let id: String
        let academyId: String
        let scheduleTitle: String
        let groupName: String?
        let levelName: String?
        let trackName: String?
        let location: String?
        let state: String
        let startedAt: Date
        let startedByName: String?
        let autoEndAt: Date
        let rosterCount: Int
        let sessionArchivedAt: Date?
    }

    /// "started", "existing" (the schedule was already live) or "replayed" (a retry of this start).
    let outcome: String
    let replayed: Bool
    let session: Session
}

/// Starts a session from a chosen schedule and hands the server-returned session to navigation.
/// One logical start keeps one Idempotency-Key until it is acknowledged, including across retries
/// of an uncertain result and picker refreshes.
@MainActor
@Observable
final class StartSessionModel {
    struct Attempt: Equatable {
        let context: AcademyContext
        let academyName: String
        let scheduleID: String
        let scheduleTitle: String
        let key: String
    }

    enum Phase: Equatable {
        case idle
        case starting
        /// No acknowledgment arrived; the session may or may not have started. Retry reuses the key.
        case uncertain(String)
        case failed(String)
    }

    private(set) var phase: Phase = .idle
    /// The unacknowledged start; kept for retries of the same schedule in the same academy.
    private(set) var attempt: Attempt?
    /// Bound to the picker sheet. A start acknowledged after the picker closed does not navigate.
    var isPickerPresented = false
    /// The session to open next. The main screen pushes it and clears it.
    var destination: LiveSession?

    var isStarting: Bool { phase == .starting }

    private let api: APIClient
    private let isCurrent: @MainActor (AcademyContext) -> Bool
    private let onStarted: @MainActor (AcademyContext) async -> Void
    private let onUnauthenticated: @MainActor () async -> Void
    private let onForbidden: @MainActor () async -> Void

    init(
        api: APIClient,
        isCurrent: @escaping @MainActor (AcademyContext) -> Bool,
        onStarted: @escaping @MainActor (AcademyContext) async -> Void,
        onUnauthenticated: @escaping @MainActor () async -> Void,
        onForbidden: @escaping @MainActor () async -> Void
    ) {
        self.api = api
        self.isCurrent = isCurrent
        self.onStarted = onStarted
        self.onUnauthenticated = onUnauthenticated
        self.onForbidden = onForbidden
    }

    /// Opens the picker for a new choice; an uncertain attempt stays available for retry.
    func presentPicker() {
        if case .failed = phase { phase = .idle }
        isPickerPresented = true
    }

    /// Forgets everything tied to the previous account or academy.
    func reset() {
        attempt = nil
        phase = .idle
        isPickerPresented = false
        destination = nil
    }

    /// Starts `schedule`, or retries the unacknowledged start of the same schedule with its key.
    func start(_ schedule: StartableSchedule, academyName: String, in context: AcademyContext) async {
        guard phase != .starting, isCurrent(context) else { return }
        let current: Attempt
        if let attempt, attempt.context == context, attempt.scheduleID == schedule.id {
            current = attempt
        } else {
            // A different schedule (or academy) is a separate logical start.
            current = Attempt(context: context, academyName: academyName, scheduleID: schedule.id,
                              scheduleTitle: schedule.title, key: UUID().uuidString)
        }
        attempt = current
        phase = .starting

        struct Body: Encodable {
            let scheduleId: String
            enum CodingKeys: String, CodingKey { case scheduleId = "schedule_id" }
        }
        let result: Result<StartSessionResponse, APIError>
        do {
            result = .success(try await api.post(
                "api/v1/academies/\(context.academyID)/sessions", body: Body(scheduleId: schedule.id), idempotencyKey: current.key
            ))
        } catch {
            result = .failure(error)
        }
        // Account or academy changed meanwhile: its retry state was already cleared; touch nothing.
        guard isCurrent(context), attempt == current else { return }

        switch result {
        case .success(let response):
            attempt = nil
            phase = .idle
            await onStarted(context)
            guard isCurrent(context), response.session.academyId == context.academyID else { return }
            // Only a picker still on screen navigates; a late acknowledgment just refreshes the list.
            if isPickerPresented {
                isPickerPresented = false
                destination = LiveSession(response.session, academyName: current.academyName)
            }
        case .failure(.unauthenticated):
            await onUnauthenticated()
        case .failure(.forbidden):
            attempt = nil
            phase = .idle
            isPickerPresented = false
            await onForbidden()
        case .failure(.network):
            phase = .uncertain("Couldn't confirm whether “\(current.scheduleTitle)” started. Retry: it won't start a second session.")
        case .failure(.server(let message)):
            // The key stays with this schedule, so trying it again cannot start twice.
            phase = .failed(message)
        case .failure(.rejected(let failure)):
            phase = .failed(failure.message)
        case .failure(.cancelled):
            phase = .uncertain("The start of “\(current.scheduleTitle)” was interrupted. Retry: it won't start a second session.")
        }
    }
}

extension LiveSession {
    /// The session screen's entry from a start acknowledgment; the screen loads its current state.
    init(_ started: StartSessionResponse.Session, academyName: String) {
        self.init(
            id: started.id, academyId: started.academyId, academyName: academyName, scheduleTitle: started.scheduleTitle,
            groupName: started.groupName, levelName: started.levelName, trackName: started.trackName,
            location: started.location, startedAt: started.startedAt, startedByName: started.startedByName,
            autoEndAt: started.autoEndAt, rosterCount: started.rosterCount
        )
    }
}
