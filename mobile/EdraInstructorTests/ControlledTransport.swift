import Foundation
import Testing
@testable import EdraInstructor

/// An `APIClient` transport whose requests stay pending until a test completes them, in any order.
final class ControlledTransport: @unchecked Sendable {
    private struct Pending {
        let request: URLRequest
        let continuation: CheckedContinuation<(Data, URLResponse), Error>
    }

    private let lock = NSLock()
    private var pending: [Pending] = []
    private var all: [URLRequest] = []

    /// Every request received so far, in arrival order.
    var requests: [URLRequest] { lock.withLock { all } }

    func client() -> APIClient {
        APIClient(origin: URL(string: "https://api.example.test")!, token: { _ in "token" }, transport: { request in
            try await withCheckedThrowingContinuation { continuation in
                self.lock.withLock {
                    self.all.append(request)
                    self.pending.append(Pending(request: request, continuation: continuation))
                }
            }
        })
    }

    /// Waits until `count` requests have arrived in total.
    func waitForRequests(_ count: Int, sourceLocation: SourceLocation = #_sourceLocation) async {
        for _ in 0..<2000 {
            if lock.withLock({ all.count }) >= count { return }
            try? await Task.sleep(for: .milliseconds(1))
        }
        Issue.record("Expected \(count) requests, got \(requests.count)", sourceLocation: sourceLocation)
    }

    /// Completes the `index`th request received (arrival order) with a JSON body.
    func respond(_ index: Int, status: Int = 200, json: String) {
        let request = take(index)
        let response = HTTPURLResponse(url: request.request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
        request.continuation.resume(returning: (Data(json.utf8), response))
    }

    /// Fails the `index`th request at the transport level (dropped connection, cancellation, …).
    func fail(_ index: Int, with error: Error) {
        take(index).continuation.resume(throwing: error)
    }

    private func take(_ index: Int) -> Pending {
        lock.withLock {
            let target = all[index]
            let position = pending.firstIndex { $0.request == target }!
            return pending.remove(at: position)
        }
    }
}

enum Fixture {
    static func academies(_ ids: [String]) -> String {
        let rows = ids.map { #"{"id":"\#($0)","name":"Academy \#($0)","slug":"\#($0)","icon":"book","role":"instructor"}"# }
        return #"{"academies":[\#(rows.joined(separator: ","))]}"#
    }

    static func liveSessions(_ ids: [String], academy: String = "A") -> String {
        let rows = ids.map {
            #"{"id":"\#($0)","academy_id":"\#(academy)","academy_name":"Academy","schedule_title":"Class \#($0)","group_name":null,"level_name":null,"track_name":null,"location":null,"started_at":"2030-01-01T10:00:00Z","started_by_name":null,"auto_end_at":"2030-01-01T12:00:00Z","roster_count":3}"#
        }
        return #"{"sessions":[\#(rows.joined(separator: ","))],"next_cursor":null}"#
    }

    static func schedules(_ ids: [String], nextOffset: Int? = nil) -> String {
        let rows = ids.map {
            #"{"id":"\#($0)","title":"Schedule \#($0)","kind":"recurring","audience":"level","mandatory":true,"location":null,"group_id":null,"group_name":null,"level_id":"g9","level_name":"Grade 9","track_id":null,"track_name":null,"slots":[{"weekday":6,"starts_at":"16:00:00","ends_at":"17:30:00"}],"meetings":[],"meets_today":false,"live_session_id":null,"can_start":true}"#
        }
        let next = nextOffset.map(String.init) ?? "null"
        return #"{"time_zone":"Africa/Cairo","today":"2030-01-01","academic_year":{"id":"y","start_year":2030},"schedules":[\#(rows.joined(separator: ","))],"next_offset":\#(next)}"#
    }

    static func started(_ id: String, outcome: String, academy: String = "A", state: String = "live", archivedAt: String? = nil) -> String {
        let archived = archivedAt.map { "\"\($0)\"" } ?? "null"
        return #"{"outcome":"\#(outcome)","replayed":\#(outcome == "replayed"),"session":{"id":"\#(id)","academy_id":"\#(academy)","academic_year_id":"y","schedule_id":"s1","schedule_title":"Schedule s1","schedule_kind":"recurring","audience":"level","group_id":null,"group_name":null,"level_id":"g9","level_name":"Grade 9","track_id":null,"track_name":null,"mandatory":true,"location":null,"state":"\#(state)","started_at":"2030-01-01T10:00:00Z","started_by":"u","started_by_name":"U","auto_end_at":"2030-01-01T12:00:00Z","metadata_version":1,"ended_at":null,"ended_by":null,"ended_by_name":null,"end_reason":null,"session_archived_at":\#(archived),"session_archived_by_name":null,"archive_note":null,"roster_count":3}}"#
    }

    static func error(_ code: String) -> String {
        #"{"error":{"code":"\#(code)","message":"\#(code) message","request_id":"r"}}"#
    }
}
