import Foundation
import Testing
@testable import EdraInstructor

@MainActor
struct StartSessionTests {
    @MainActor private final class Harness {
        let transport = ControlledTransport()
        var current: AcademyContext? = AcademyContext(academyID: "A", epoch: 1)
        var refreshed: [AcademyContext] = []
        var signOuts = 0
        var revalidations = 0
        lazy var model = StartSessionModel(
            api: transport.client(),
            isCurrent: { [unowned self] in $0 == self.current },
            onStarted: { [unowned self] in self.refreshed.append($0) },
            onUnauthenticated: { [unowned self] in self.signOuts += 1 },
            onForbidden: { [unowned self] in self.revalidations += 1 }
        )
        var context: AcademyContext { current! }

        func key(_ index: Int) -> String? { transport.requests[index].value(forHTTPHeaderField: "Idempotency-Key") }
        func body(_ index: Int) -> String? { transport.requests[index].httpBody.map { String(decoding: $0, as: UTF8.self) } }
    }

    private static func schedule(_ id: String) throws -> StartableSchedule {
        let page = try JSONDecoder.snake.decode(SchedulesPage.self, from: Data(Fixture.schedules([id]).utf8))
        return page.schedules[0]
    }

    @Test func startsOpensAttendanceAndRefreshesTheLiveList() async throws {
        let h = Harness()
        h.model.presentPicker()
        let start = Task { await h.model.start(try! Self.schedule("s1"), academyName: "Academy A", in: h.context) }
        await h.transport.waitForRequests(1)
        #expect(h.transport.requests[0].url?.path == "/api/v1/academies/A/sessions")
        #expect(h.body(0) == #"{"schedule_id":"s1"}"#)
        #expect(UUID(uuidString: h.key(0) ?? "") != nil)
        h.transport.respond(0, status: 201, json: Fixture.started("sess-1", outcome: "started"))
        await start.value

        #expect(h.model.destination?.id == "sess-1")
        #expect(h.model.destination?.academyName == "Academy A")
        #expect(h.model.isPickerPresented == false)
        #expect(h.model.attempt == nil)
        #expect(h.refreshed == [h.context])
    }

    @Test func lostResponseIsUncertainAndRetryReusesTheKey() async throws {
        let h = Harness()
        h.model.presentPicker()
        let schedule = try Self.schedule("s1")
        let first = Task { await h.model.start(schedule, academyName: "A", in: h.context) }
        await h.transport.waitForRequests(1)
        h.transport.fail(0, with: URLError(.networkConnectionLost))
        await first.value
        guard case .uncertain = h.model.phase else { Issue.record("Expected uncertain, got \(h.model.phase)"); return }
        #expect(h.model.destination == nil)

        let retry = Task { await h.model.start(schedule, academyName: "A", in: h.context) }
        await h.transport.waitForRequests(2)
        #expect(h.key(1) == h.key(0))
        h.transport.respond(1, json: Fixture.started("sess-1", outcome: "replayed"))
        await retry.value
        #expect(h.model.destination?.id == "sess-1")
    }

    @Test func doubleTapSendsOneRequest() async throws {
        let h = Harness()
        let schedule = try Self.schedule("s1")
        let first = Task { await h.model.start(schedule, academyName: "A", in: h.context) }
        await h.transport.waitForRequests(1)
        await h.model.start(schedule, academyName: "A", in: h.context) // ignored while in flight
        #expect(h.transport.requests.count == 1)
        h.transport.respond(0, status: 201, json: Fixture.started("sess-1", outcome: "started"))
        await first.value
    }

    @Test func aDifferentScheduleIsANewLogicalStart() async throws {
        let h = Harness()
        let first = Task { await h.model.start(try! Self.schedule("s1"), academyName: "A", in: h.context) }
        await h.transport.waitForRequests(1)
        h.transport.fail(0, with: URLError(.timedOut))
        await first.value

        let other = Task { await h.model.start(try! Self.schedule("s2"), academyName: "A", in: h.context) }
        await h.transport.waitForRequests(2)
        #expect(h.key(1) != h.key(0))
        h.transport.respond(1, status: 409, json: Fixture.error("SCHEDULE_UNAVAILABLE"))
        await other.value
        #expect(h.model.phase == .failed("SCHEDULE_UNAVAILABLE message"))
    }

    @Test func concurrentStartElsewhereOpensTheSameLiveSession() async throws {
        let h = Harness()
        h.model.presentPicker()
        let start = Task { await h.model.start(try! Self.schedule("s1"), academyName: "A", in: h.context) }
        await h.transport.waitForRequests(1)
        h.transport.respond(0, json: Fixture.started("web-started", outcome: "existing"))
        await start.value
        #expect(h.model.destination?.id == "web-started")
    }

    @Test func replayOfAnEndedArchivedOriginalOpensItsReviewState() async throws {
        let h = Harness()
        h.model.presentPicker()
        let start = Task { await h.model.start(try! Self.schedule("s1"), academyName: "A", in: h.context) }
        await h.transport.waitForRequests(1)
        h.transport.respond(0, json: Fixture.started("original", outcome: "replayed", state: "ended", archivedAt: "2030-01-02T09:00:00Z"))
        await start.value
        // The session screen loads its current (archived, read-only) state from the server.
        #expect(h.model.destination?.id == "original")
    }

    @Test func lateSuccessAfterPickerDismissalDoesNotNavigate() async throws {
        let h = Harness()
        h.model.presentPicker()
        let start = Task { await h.model.start(try! Self.schedule("s1"), academyName: "A", in: h.context) }
        await h.transport.waitForRequests(1)
        h.model.isPickerPresented = false
        h.transport.respond(0, status: 201, json: Fixture.started("sess-1", outcome: "started"))
        await start.value
        #expect(h.model.destination == nil)
        #expect(h.refreshed.count == 1) // the live list still shows it
    }

    @Test func lateResultAfterAcademyChangeTouchesNothing() async throws {
        let h = Harness()
        h.model.presentPicker()
        let start = Task { await h.model.start(try! Self.schedule("s1"), academyName: "A", in: h.context) }
        await h.transport.waitForRequests(1)
        h.current = AcademyContext(academyID: "B", epoch: 2)
        h.model.reset()
        h.transport.respond(0, status: 201, json: Fixture.started("sess-1", outcome: "started"))
        await start.value
        #expect(h.model.destination == nil)
        #expect(h.model.attempt == nil)
        #expect(h.refreshed.isEmpty)
    }

    @Test func lateUnauthorizedAfterAccountChangeDoesNotSignOut() async throws {
        let h = Harness()
        let start = Task { await h.model.start(try! Self.schedule("s1"), academyName: "A", in: h.context) }
        await h.transport.waitForRequests(1)
        h.current = nil // signed out: no context is current any more
        h.transport.respond(0, status: 401, json: Fixture.error("UNAUTHENTICATED"))
        await h.transport.waitForRequests(2)
        h.transport.respond(1, status: 401, json: Fixture.error("UNAUTHENTICATED"))
        await start.value
        #expect(h.signOuts == 0)
    }

    @Test func forbiddenClearsRetryStateAndRevalidates() async throws {
        let h = Harness()
        h.model.presentPicker()
        let start = Task { await h.model.start(try! Self.schedule("s1"), academyName: "A", in: h.context) }
        await h.transport.waitForRequests(1)
        h.transport.respond(0, status: 403, json: Fixture.error("FORBIDDEN"))
        await start.value
        #expect(h.model.attempt == nil)
        #expect(h.model.isPickerPresented == false)
        #expect(h.revalidations == 1)
    }
}

extension JSONDecoder {
    static var snake: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }
}
