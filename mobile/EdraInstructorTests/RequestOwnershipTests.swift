import Foundation
import Testing
@testable import EdraInstructor

/// Out-of-order and stale completions must never commit over newer state or another account.
@MainActor
struct AcademiesOwnershipTests {
    private func makeModel(_ transport: ControlledTransport, scope: AccountScope = AccountScope(), signOuts: Counter = Counter())
        -> (AcademiesModel, UserDefaults) {
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        let model = AcademiesModel(api: transport.client(), scope: scope, defaults: defaults) { signOuts.count += 1 }
        return (model, defaults)
    }

    @Test func olderAuthorizedResponseCannotRestoreRemovedAcademy() async {
        let transport = ControlledTransport()
        let (model, _) = makeModel(transport)
        let older = Task { await model.load() }
        await transport.waitForRequests(1)
        let newer = Task { await model.load() }
        await transport.waitForRequests(2)

        transport.respond(1, json: Fixture.academies(["A"])) // B was removed
        await newer.value
        transport.respond(0, json: Fixture.academies(["A", "B"]))
        await older.value

        #expect(model.academies.map(\.id) == ["A"])
        #expect(model.state == .loaded)
    }

    @Test func loadsFinishingInReverseOrderKeepTheNewest() async {
        let transport = ControlledTransport()
        let (model, _) = makeModel(transport)
        let older = Task { await model.load() }
        await transport.waitForRequests(1)
        let newer = Task { await model.load() }
        await transport.waitForRequests(2)

        transport.respond(0, json: Fixture.academies(["A", "B"]))
        await older.value
        #expect(model.state == .loading) // the older answer is not committed
        transport.respond(1, json: Fixture.academies(["B"]))
        await newer.value
        #expect(model.academies.map(\.id) == ["B"])
        #expect(model.selectedID == "B")
    }

    @Test func selectionMadeDuringLoadIsKeptAndPersisted() async {
        let transport = ControlledTransport()
        let (model, defaults) = makeModel(transport)
        let first = Task { await model.load() }
        await transport.waitForRequests(1)
        transport.respond(0, json: Fixture.academies(["A", "B"]))
        await first.value
        #expect(model.selectedID == "A")

        let revalidation = Task { await model.load() }
        await transport.waitForRequests(2)
        model.select(model.academies[1]) // the user picks B while the request is in flight
        transport.respond(1, json: Fixture.academies(["A", "B"]))
        await revalidation.value

        #expect(model.selectedID == "B")
        #expect(defaults.string(forKey: "selectedAcademyID") == "B")
    }

    @Test func revokedSelectionFallsBackToAnAuthorizedAcademy() async {
        let transport = ControlledTransport()
        let (model, _) = makeModel(transport)
        let first = Task { await model.load() }
        await transport.waitForRequests(1)
        transport.respond(0, json: Fixture.academies(["A", "B"]))
        await first.value
        model.select(model.academies[1])
        let before = model.context

        let revalidation = Task { await model.load() }
        await transport.waitForRequests(2)
        transport.respond(1, json: Fixture.academies(["A"]))
        await revalidation.value

        #expect(model.selectedID == "A")
        #expect(model.context != before)
        #expect(before.map { model.isCurrent($0) } == false)
    }

    @Test func networkFailureKeepsGrantedAcademies() async {
        let transport = ControlledTransport()
        let (model, _) = makeModel(transport)
        let first = Task { await model.load() }
        await transport.waitForRequests(1)
        transport.respond(0, json: Fixture.academies(["A"]))
        await first.value

        let revalidation = Task { await model.load() }
        await transport.waitForRequests(2)
        transport.fail(1, with: URLError(.notConnectedToInternet))
        await revalidation.value

        #expect(model.academies.map(\.id) == ["A"])
        #expect(model.selectedID == "A")
        #expect(model.state == .loaded)
    }

    @Test func endedScopeIgnoresLateSuccessAndLateUnauthorized() async {
        let transport = ControlledTransport()
        let scope = AccountScope()
        let signOuts = Counter()
        let (model, defaults) = makeModel(transport, scope: scope, signOuts: signOuts)
        let success = Task { await model.load() }
        await transport.waitForRequests(1)
        let unauthorized = Task { await model.load() }
        await transport.waitForRequests(2)

        scope.end() // signed out (or another account signed in) before either answered
        transport.respond(1, status: 401, json: Fixture.error("UNAUTHENTICATED"))
        await transport.waitForRequests(3) // the client's single forced-refresh retry
        transport.respond(2, status: 401, json: Fixture.error("UNAUTHENTICATED"))
        await unauthorized.value
        transport.respond(0, json: Fixture.academies(["A"]))
        await success.value

        #expect(model.academies.isEmpty)
        #expect(defaults.string(forKey: "selectedAcademyID") == nil)
        #expect(signOuts.count == 0)
    }

    @Test func cancellationIsNotReportedAsANetworkFailure() async {
        let transport = ControlledTransport()
        let (model, _) = makeModel(transport)
        let load = Task { await model.load() }
        await transport.waitForRequests(1)
        transport.fail(0, with: URLError(.cancelled))
        await load.value
        if case .failed = model.state { Issue.record("Cancellation surfaced as \(model.state)") }
    }

    @Test func clientMapsCancellationDistinctly() async {
        let transport = ControlledTransport()
        let api = transport.client()
        let request = Task { () -> APIError? in
            do { let _: AcademiesResponse = try await api.get("api/v1/academies"); return nil } catch { return error }
        }
        await transport.waitForRequests(1)
        transport.fail(0, with: CancellationError())
        #expect(await request.value == .cancelled)
    }
}

@MainActor
struct SessionsOwnershipTests {
    private func setUp() async -> (ControlledTransport, AcademiesModel, SessionsModel, Counter) {
        let transport = ControlledTransport()
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        let academies = AcademiesModel(api: transport.client(), scope: AccountScope(), defaults: defaults) {}
        let forbidden = Counter()
        let sessions = SessionsModel(
            api: transport.client(), isCurrent: { academies.isCurrent($0) },
            onUnauthenticated: {}, onForbidden: { forbidden.count += 1 }
        )
        let load = Task { await academies.load() }
        await transport.waitForRequests(1)
        transport.respond(0, json: Fixture.academies(["A", "B"]))
        await load.value
        return (transport, academies, sessions, forbidden)
    }

    @Test func overlappingLoadsForTheSameAcademyKeepTheNewest() async {
        let (transport, academies, sessions, _) = await setUp()
        let context = academies.context
        let older = Task { await sessions.load(context: context) }
        await transport.waitForRequests(2)
        let newer = Task { await sessions.load(context: context) }
        await transport.waitForRequests(3)

        transport.respond(2, json: Fixture.liveSessions(["new"]))
        await newer.value
        transport.respond(1, json: Fixture.liveSessions(["old"]))
        await older.value

        #expect(sessions.sessions.map(\.id) == ["new"])
    }

    @Test func returningToAnAcademyDropsTheEarlierVisitsResponse() async {
        let (transport, academies, sessions, forbidden) = await setUp()
        let firstVisit = academies.context!
        let stale = Task { await sessions.load(context: firstVisit) }
        await transport.waitForRequests(2)

        academies.select(academies.academies[1]) // A → B
        academies.select(academies.academies[0]) // B → A
        let secondVisit = academies.context!
        #expect(secondVisit.academyID == firstVisit.academyID && secondVisit != firstVisit)
        let current = Task { await sessions.load(context: secondVisit) }
        await transport.waitForRequests(3)

        transport.respond(1, status: 403, json: Fixture.error("FORBIDDEN"))
        await stale.value
        #expect(forbidden.count == 0) // a stale 403 neither clears nor revalidates the new visit
        transport.respond(2, json: Fixture.liveSessions(["current"]))
        await current.value
        #expect(sessions.sessions.map(\.id) == ["current"])
        #expect(sessions.state == .loaded)
    }

    @Test func currentForbiddenRevalidatesMembership() async {
        let (transport, academies, sessions, forbidden) = await setUp()
        let load = Task { await sessions.load(context: academies.context) }
        await transport.waitForRequests(2)
        transport.respond(1, status: 403, json: Fixture.error("FORBIDDEN"))
        await load.value
        #expect(forbidden.count == 1)
        #expect(sessions.sessions.isEmpty)
    }
}

@MainActor
struct SchedulesOwnershipTests {
    @Test func pagesAppendAndAnOlderSearchCannotOverwriteANewerOne() async {
        let transport = ControlledTransport()
        let context = AcademyContext(academyID: "A", epoch: 1)
        let model = SchedulesModel(api: transport.client(), isCurrent: { $0 == context }, onUnauthenticated: {}, onForbidden: {})

        let first = Task { await model.load(context: context) }
        await transport.waitForRequests(1)
        transport.respond(0, json: Fixture.schedules(["s1", "s2"], nextOffset: 2))
        await first.value
        #expect(model.hasMore)

        let more = Task { await model.loadMore() }
        await transport.waitForRequests(2)
        #expect(transport.requests[1].url?.query?.contains("offset=2") == true)
        transport.respond(1, json: Fixture.schedules(["s3"]))
        await more.value
        #expect(model.schedules.map(\.id) == ["s1", "s2", "s3"])
        #expect(!model.hasMore)

        let older = Task { await model.load(context: context, query: "alg") }
        await transport.waitForRequests(3)
        let newer = Task { await model.load(context: context, query: "a&b") }
        await transport.waitForRequests(4)
        #expect(transport.requests[3].url?.absoluteString.contains("q=a%26b") == true)
        transport.respond(3, json: Fixture.schedules(["s9"]))
        await newer.value
        transport.respond(2, json: Fixture.schedules(["s1"]))
        await older.value
        #expect(model.schedules.map(\.id) == ["s9"])
    }

    @Test func staleLoadMoreCannotResetANewerLoad() async {
        let transport = ControlledTransport()
        let context = AcademyContext(academyID: "A", epoch: 1)
        let model = SchedulesModel(api: transport.client(), isCurrent: { $0 == context }, onUnauthenticated: {}, onForbidden: {})
        let first = Task { await model.load(context: context) }
        await transport.waitForRequests(1)
        transport.respond(0, json: Fixture.schedules(["s1"], nextOffset: 1))
        await first.value

        let more = Task { await model.loadMore() }
        await transport.waitForRequests(2)
        let reload = Task { await model.load(context: context, query: "x") }
        await transport.waitForRequests(3)
        transport.respond(1, json: Fixture.schedules(["s2"]))
        await more.value
        #expect(model.state == .loading)
        #expect(model.schedules.map(\.id) == ["s1"]) // the old page was not appended
        transport.respond(2, json: Fixture.schedules(["x1"]))
        await reload.value
        #expect(model.schedules.map(\.id) == ["x1"])
    }
}

@MainActor
final class Counter {
    var count = 0
}
