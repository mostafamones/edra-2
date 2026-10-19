import Foundation
import Testing
@testable import EdraInstructor

/// Attendance fixtures: sheets, entries and command responses in the HTTP (snake_case) shape.
enum AttendanceFixture {
    static func entry(
        _ id: String, status: String = "unknown", version: Int = 0, origin: String = "expected", code: String? = nil,
        published: String? = nil, correction: Bool = false
    ) -> String {
        let code = code.map { "\"\($0)\"" } ?? "null"
        let published = published.map { "\"\($0)\"" } ?? "null"
        let publishedAt = published == "null" ? "null" : "\"2030-01-01T11:00:00Z\""
        return #"{"annual_student_record_id":"\#(id)","full_name":"Student \#(id)","student_code":\#(code),"archived":false,"origin":"\#(origin)","group_name":null,"status":"\#(status)","version":\#(version),"source":null,"updated_at":null,"updated_by":null,"updated_by_name":null,"checked_in_at":null,"published_status":\#(published),"published_at":\#(publishedAt),"correction_pending":\#(correction)}"#
    }

    static func sheet(
        revision: Int, entries: [String] = [], mandatory: Bool = true, state: String = "live", archived: Bool = false,
        metadataVersion: Int = 1, publication: String = "unpublished", publicationCount: Int = 0, codes: Bool = true
    ) -> String {
        let archivedAt = archived ? "\"2030-01-01T12:00:00Z\"" : "null"
        let open = !archived
        return #"{"session":{"id":"sess","academy_id":"A","academic_year_id":"y","schedule_title":"Class","group_name":null,"mandatory":\#(mandatory),"location":null,"started_at":"2030-01-01T10:00:00Z","auto_end_at":"2030-01-01T12:00:00Z","state":"\#(state)","ended_at":null,"year_open":true,"archived_at":\#(archivedAt),"metadata_version":\#(metadataVersion)},"student_codes_enabled":\#(codes),"revision":\#(revision),"published_revision":null,"publication_count":\#(publicationCount),"last_published_at":null,"last_published_by_name":null,"publication":"\#(publication)","counts":{"unknown":0,"present":0,"late":0,"absent":0,"excused":0,"total":\#(entries.count)},"permitted_actions":{"check_in":\#(open && state == "live"),"edit":\#(open),"publish":\#(open)},"entries":[\#(entries.joined(separator: ","))]}"#
    }

    static func checkIn(_ id: String, status: String = "present", code: String = "0042") -> String {
        #"{"outcome":"recorded","entry":\#(entry(id, status: status, version: 1, code: code)),"revision":2,"correction_pending":false,"replayed":false}"#
    }

    static func error(_ code: String, details: String? = nil) -> String {
        let details = details.map { #","details":\#($0)"# } ?? ""
        return #"{"error":{"code":"\#(code)","message":"\#(code) message","request_id":"r"\#(details)}}"#
    }
}

@MainActor
struct SessionDetailTests {
    @MainActor final class Harness {
        let transport = ControlledTransport()
        var current = true
        var signOuts = 0
        var revalidations = 0
        lazy var model = SessionDetailModel(
            session: Self.session, api: transport.client(),
            isCurrent: { [unowned self] in self.current },
            onUnauthenticated: { [unowned self] in self.signOuts += 1 },
            onForbidden: { [unowned self] in self.revalidations += 1 }
        )

        static let session: LiveSession = {
            let page = try! APIClient.decoder.decode(LiveSessionsResponse.self, from: Data(Fixture.liveSessions(["sess"]).utf8))
            return page.sessions[0]
        }()

        func key(_ index: Int) -> String? { transport.requests[index].value(forHTTPHeaderField: "Idempotency-Key") }
        func body(_ index: Int) -> String? { transport.requests[index].httpBody.map { String(decoding: $0, as: UTF8.self) } }
        func path(_ index: Int) -> String? { transport.requests[index].url?.path }

        /// Loads `json` as request `index`.
        func load(_ json: String, index: Int) async {
            let task = Task { await model.load() }
            await transport.waitForRequests(index + 1)
            transport.respond(index, json: json)
            await task.value
        }
    }

    @Test func decodesOfficialStateOriginAndCorrections() async {
        let h = Harness()
        await h.load(AttendanceFixture.sheet(revision: 4, entries: [
            AttendanceFixture.entry("a", status: "absent", version: 2, published: "present", correction: true),
            AttendanceFixture.entry("b", origin: "unexpected"),
        ], publication: "pending_corrections", publicationCount: 1), index: 0)
        let sheet = try! #require(h.model.sheet)
        #expect(sheet.official == .correctionsPending)
        #expect(sheet.entries[0].publishedStatus == .present)
        #expect(sheet.entries[0].differsFromOfficial)
        #expect(sheet.entries[1].origin == .unexpected)
        #expect(sheet.unrecordedExpected == 0) // an added student is never expected
    }

    @Test func outOfOrderLoadsKeepTheNewest() async {
        let h = Harness()
        let older = Task { await h.model.load() }
        await h.transport.waitForRequests(1)
        let newer = Task { await h.model.load() }
        await h.transport.waitForRequests(2)
        h.transport.respond(1, json: AttendanceFixture.sheet(revision: 5))
        await newer.value
        h.transport.respond(0, json: AttendanceFixture.sheet(revision: 3))
        await older.value
        #expect(h.model.sheet?.revision == 5)

        // A late older failure doesn't mark the newer data stale either.
        let failing = Task { await h.model.load() }
        await h.transport.waitForRequests(3)
        let latest = Task { await h.model.load() }
        await h.transport.waitForRequests(4)
        h.transport.respond(3, json: AttendanceFixture.sheet(revision: 6))
        await latest.value
        h.transport.fail(2, with: URLError(.notConnectedToInternet))
        await failing.value
        #expect(h.model.sheet?.revision == 6)
        #expect(h.model.refreshProblem == nil)
    }

    @Test func lowerRevisionIsIgnoredButSameRevisionLifecycleChangeApplies() async {
        let h = Harness()
        await h.load(AttendanceFixture.sheet(revision: 5), index: 0)
        await h.load(AttendanceFixture.sheet(revision: 4), index: 1)
        #expect(h.model.sheet?.revision == 5)
        await h.load(AttendanceFixture.sheet(revision: 5, state: "ended", archived: true, metadataVersion: 3), index: 2)
        #expect(h.model.isArchived)
        #expect(h.model.canEdit == false)
    }

    @Test func backgroundFailureKeepsDataWithStaleFeedback() async {
        let h = Harness()
        await h.load(AttendanceFixture.sheet(revision: 2), index: 0)
        let refresh = Task { await h.model.load() }
        await h.transport.waitForRequests(2)
        h.transport.fail(1, with: URLError(.timedOut))
        await refresh.value
        #expect(h.model.sheet?.revision == 2)
        #expect(h.model.state == .loaded)
        #expect(h.model.refreshProblem != nil)
        await h.load(AttendanceFixture.sheet(revision: 2), index: 2)
        #expect(h.model.refreshProblem == nil)
    }

    @Test func staleAuthorityFailuresAfterContextChangeDoNothing() async {
        let h = Harness()
        let unauthorized = Task { await h.model.load() }
        await h.transport.waitForRequests(1)
        h.current = false // account or academy changed while the request was in flight
        h.transport.respond(0, status: 403, json: Fixture.error("FORBIDDEN"))
        await unauthorized.value
        #expect(h.revalidations == 0)
        #expect(h.signOuts == 0)
        #expect(h.model.sheet == nil)
    }

    @Test func restAbsentIsGatedOnMandatoryExpectedUnknownStudents() async {
        let optional = Harness()
        await optional.load(AttendanceFixture.sheet(revision: 1, entries: [AttendanceFixture.entry("a", origin: "eligible")], mandatory: false), index: 0)
        #expect(optional.model.canMarkRestAbsent == false)

        let onlyAdded = Harness()
        await onlyAdded.load(AttendanceFixture.sheet(revision: 1, entries: [
            AttendanceFixture.entry("a", origin: "unexpected"), AttendanceFixture.entry("b", status: "present", version: 1),
        ]), index: 0)
        #expect(onlyAdded.model.canMarkRestAbsent == false)
    }

    @Test func restAbsentSendsTheReviewedRevisionWithoutTruncation() async {
        let h = Harness()
        let entries = (0..<1001).map { AttendanceFixture.entry("s\($0)") }
        await h.load(AttendanceFixture.sheet(revision: 7, entries: entries), index: 0)
        #expect(h.model.unrecordedCount == 1001)
        #expect(h.model.canMarkRestAbsent)
        h.model.beginAbsenceReview()

        let first = Task { await h.model.markRestAbsent() }
        await h.transport.waitForRequests(2)
        #expect(h.path(1) == "/api/v1/sessions/sess/attendance/unrecorded-absences")
        #expect(h.body(1) == #"{"expected_revision":7}"#)
        h.transport.respond(1, status: 503, json: AttendanceFixture.error("INTERNAL"))
        await first.value
        #expect(h.model.absenceCommand?.revision == 7)

        // Uncertain: Retry is the identical command even though the sheet moved on (it may have applied).
        await h.load(AttendanceFixture.sheet(revision: 8, entries: entries), index: 2)
        let retry = Task { await h.model.markRestAbsent() }
        await h.transport.waitForRequests(4)
        #expect(h.key(3) == h.key(1))
        #expect(h.body(3) == #"{"expected_revision":7}"#)
        h.transport.respond(3, json: #"{"outcome":"updated","changed":1001,"revision":8,"replayed":true}"#)
        await h.transport.waitForRequests(5)
        h.transport.respond(4, json: AttendanceFixture.sheet(revision: 8, entries: entries))
        await retry.value
        #expect(h.model.absenceCommand == nil)
        #expect(h.model.notice?.contains("1001") == true)
    }

    @Test func restAbsentRequiresAFreshReviewAfterANewerSave() async {
        let h = Harness()
        await h.load(AttendanceFixture.sheet(revision: 3, entries: [AttendanceFixture.entry("a")]), index: 0)
        h.model.beginAbsenceReview()
        await h.load(AttendanceFixture.sheet(revision: 4, entries: [AttendanceFixture.entry("a")]), index: 1)
        await h.model.markRestAbsent()
        #expect(h.transport.requests.count == 2) // nothing sent
        #expect(h.model.statusError != nil)

        // A definitive stale answer from the server also ends the command.
        h.model.beginAbsenceReview()
        let stale = Task { await h.model.markRestAbsent() }
        await h.transport.waitForRequests(3)
        h.transport.respond(2, status: 409, json: AttendanceFixture.error("ATTENDANCE_REVIEW_STALE", details: #"{"revision":5}"#))
        await h.transport.waitForRequests(4)
        h.transport.respond(3, json: AttendanceFixture.sheet(revision: 5, entries: [AttendanceFixture.entry("a")]))
        await stale.value
        #expect(h.model.absenceCommand == nil)
        #expect(h.model.absenceReview == nil)
    }

    @Test func finalizeNeverSendsANewerRevisionThanReviewed() async {
        let h = Harness()
        await h.load(AttendanceFixture.sheet(revision: 3), index: 0)
        h.model.beginFinalizeReview()
        await h.load(AttendanceFixture.sheet(revision: 4), index: 1)
        #expect(h.model.finalizeReviewIsStale)
        await h.model.publish()
        #expect(h.transport.requests.count == 2)

        h.model.beginFinalizeReview()
        #expect(h.model.finalizeReviewIsStale == false)
        let publish = Task { await h.model.publish() }
        await h.transport.waitForRequests(3)
        #expect(h.body(2) == #"{"expected_revision":4}"#)
        h.transport.fail(2, with: URLError(.networkConnectionLost))
        await publish.value
        #expect(h.model.publishCommand?.revision == 4)

        // A refresh showing a newer revision doesn't change the unacknowledged command.
        await h.load(AttendanceFixture.sheet(revision: 6), index: 3)
        let retry = Task { await h.model.publish() }
        await h.transport.waitForRequests(5)
        #expect(h.key(4) == h.key(2))
        #expect(h.body(4) == #"{"expected_revision":4}"#)
        h.transport.respond(4, status: 409, json: AttendanceFixture.error("PUBLICATION_STALE"))
        await h.transport.waitForRequests(6)
        h.transport.respond(5, json: AttendanceFixture.sheet(revision: 6))
        await retry.value
        #expect(h.model.publishCommand == nil)
    }

    @Test func statusCommandsAreKeptPerStudent() async {
        let h = Harness()
        let a = AttendanceFixture.entry("a")
        let b = AttendanceFixture.entry("b")
        await h.load(AttendanceFixture.sheet(revision: 1, entries: [a, b]), index: 0)
        let entries = h.model.sheet!.entries

        let first = Task { await h.model.changeStatus(.present, for: entries[0]) }
        await h.transport.waitForRequests(2)
        let second = Task { await h.model.changeStatus(.absent, for: entries[1]) }
        await h.transport.waitForRequests(3)
        #expect(h.key(1) != h.key(2))

        h.transport.respond(1, status: 500, json: AttendanceFixture.error("INTERNAL"))
        await first.value
        h.transport.respond(2, status: 409, json: AttendanceFixture.error("ATTENDANCE_CONFLICT"))
        await h.transport.waitForRequests(4)
        h.transport.respond(3, json: AttendanceFixture.sheet(revision: 2, entries: [a, b]))
        await second.value

        // Student a's uncertain change survives student b's definitive conflict.
        #expect(h.model.statusCommands["a"]?.status == .present)
        #expect(h.model.statusCommands["b"] == nil)
        // A different change for a is refused until the pending one is resolved.
        await h.model.changeStatus(.late, for: entries[0])
        #expect(h.transport.requests.count == 4)

        let retry = Task { await h.model.retryStatus(h.model.statusCommands["a"]!) }
        await h.transport.waitForRequests(5)
        #expect(h.key(4) == h.key(1))
        #expect(h.body(4) == h.body(1))
        h.transport.respond(4, json: #"{"outcome":"updated","changed":1,"entry":\#(AttendanceFixture.entry("a", status: "present", version: 1)),"revision":3,"replayed":true}"#)
        await h.transport.waitForRequests(6)
        h.transport.respond(5, json: AttendanceFixture.sheet(revision: 3, entries: [a, b]))
        await retry.value
        #expect(h.model.statusCommands.isEmpty)
    }
}

@MainActor
struct ScannerTests {
    @MainActor final class Harness {
        let transport = ControlledTransport()
        var sheet: AttendanceSheet?
        var late = 10
        var current = true
        var refreshes = 0
        lazy var model = ScannerModel(
            api: transport.client(), sessionID: "sess",
            sheet: { [unowned self] in self.sheet },
            lateAfterMinutes: { [unowned self] in self.late },
            refresh: { [unowned self] in self.refreshes += 1 },
            isCurrent: { [unowned self] in self.current },
            onUnauthenticated: {}, onForbidden: {}
        )

        init(_ json: String = AttendanceFixture.sheet(revision: 1, entries: [AttendanceFixture.entry("a", code: "0042")])) {
            sheet = try! APIClient.decoder.decode(AttendanceSheet.self, from: Data(json.utf8))
        }

        func key(_ index: Int) -> String? { transport.requests[index].value(forHTTPHeaderField: "Idempotency-Key") }
        func body(_ index: Int) -> String? { transport.requests[index].httpBody.map { String(decoding: $0, as: UTF8.self) } }

        func confirm(respond: (Int) -> Void, index: Int) async {
            let task = Task { await model.confirm() }
            await transport.waitForRequests(index + 1)
            respond(index)
            await task.value
        }
    }

    @Test func uncertainOutcomesKeepTheExactAttempt() async {
        for failure in ["network", "500", "429", "malformed"] {
            let h = Harness()
            h.model.recognized(["0042"])
            await h.confirm(respond: { index in
                switch failure {
                case "network": h.transport.fail(index, with: URLError(.networkConnectionLost))
                case "500": h.transport.respond(index, status: 500, json: AttendanceFixture.error("INTERNAL"))
                case "429": h.transport.respond(index, status: 429, json: AttendanceFixture.error("THROTTLED"))
                default: h.transport.respond(index, json: #"{"unexpected":true}"#) // a 2xx that may follow a commit
                }
            }, index: 0)
            guard case .uncertain(let attempt, _) = h.model.state else {
                Issue.record("\(failure): expected uncertain, got \(h.model.state)"); continue
            }
            #expect(attempt.lateAfterMinutes == 10)

            // Late-after changes meanwhile; Retry still resends the original body and key.
            h.late = 0
            await h.confirm(respond: { h.transport.respond($0, json: AttendanceFixture.checkIn("a", status: "late")) }, index: 1)
            #expect(h.key(1) == h.key(0), "\(failure)")
            #expect(h.body(1) == h.body(0), "\(failure)")
            #expect(h.body(0) == #"{"late_after_minutes":10,"student_id":"0042"}"# || h.body(0) == #"{"student_id":"0042","late_after_minutes":10}"#)
            #expect(h.model.state == .scanning)
            #expect(h.model.notice?.text.contains("late") == true)
        }
    }

    @Test func endedSessionStillAllowsRetryingAnUncertainAttempt() async {
        let h = Harness()
        h.model.recognized(["0042"])
        await h.confirm(respond: { h.transport.fail($0, with: URLError(.timedOut)) }, index: 0)
        h.sheet = try! APIClient.decoder.decode(AttendanceSheet.self, from: Data(AttendanceFixture.sheet(
            revision: 2, entries: [AttendanceFixture.entry("a", code: "0042")], state: "ended").utf8))
        #expect(h.model.blockedReason != nil)
        await h.confirm(respond: { h.transport.respond($0, json: AttendanceFixture.checkIn("a")) }, index: 1)
        #expect(h.key(1) == h.key(0))
        #expect(h.model.state == .scanning)
    }

    @Test func definitiveAnswersEndTheAttempt() async {
        let h = Harness()
        h.model.recognized(["0042"])
        let current = AttendanceFixture.entry("a", status: "absent", version: 3, code: "0042")
        await h.confirm(respond: {
            h.transport.respond($0, status: 409, json: AttendanceFixture.error("REVIEW_REQUIRED", details: #"{"outcome":"review_required","entry":\#(current),"revision":4,"correction_pending":false,"replayed":false}"#))
        }, index: 0)
        guard case .rejected(let card, _) = h.model.state else { Issue.record("Expected rejected, got \(h.model.state)"); return }
        #expect(card.entry.status == .absent) // the server's current entry, for manual review
        h.model.dismiss()

        h.model.recognized([])
        h.model.recognized(["0042"])
        await h.confirm(respond: { h.transport.respond($0, status: 409, json: AttendanceFixture.error("SESSION_ENDED")) }, index: 1)
        guard case .rejected = h.model.state else { Issue.record("Expected rejected, got \(h.model.state)"); return }
        #expect(h.key(1) != h.key(0))
    }

    @Test func staleCompletionAfterContextChangeIsIgnored() async {
        let h = Harness()
        h.model.recognized(["0042"])
        let task = Task { await h.model.confirm() }
        await h.transport.waitForRequests(1)
        h.current = false
        h.transport.respond(0, json: AttendanceFixture.checkIn("a"))
        await task.value
        #expect(h.refreshes == 0)
        #expect(h.model.notice == nil)
    }

    @Test func unknownCodeOffersAnExplicitAddAndWritesNothing() async {
        let h = Harness()
        h.model.recognized(["9999"])
        #expect(h.model.state == .notOnRoster("9999"))
        #expect(h.model.canAddAttendee)
        #expect(h.transport.requests.isEmpty)
        h.model.returnFromAdd(code: "9999")
        #expect(h.model.state == .scanning)
        h.model.recognized(["9999"]) // may be scanned again after the add
        #expect(h.model.state == .notOnRoster("9999"))
    }
}

@MainActor
struct AddAttendeeTests {
    @MainActor final class Harness {
        let transport = ControlledTransport()
        var revision: Int? = 4
        var added = 0
        lazy var model = AddAttendeeModel(
            api: transport.client(), sessionID: "sess", query: "0042",
            revision: { [unowned self] in self.revision },
            onAdded: { [unowned self] in self.added += 1 },
            onUnauthenticated: {}, onForbidden: {}
        )
        static let candidate = #"{"annual_student_record_id":"x","full_name":"Omar","level_name":"Grade 9","group_name":null,"participation_type":"online_only","student_code":"0042"}"#
    }

    @Test func searchesThenAddsOnlyOnExplicitConfirmation() async {
        let h = Harness()
        let search = Task { await h.model.search() }
        await h.transport.waitForRequests(1)
        #expect(h.transport.requests[0].url?.query?.contains("q=0042") == true)
        h.transport.respond(0, json: #"{"items":[\#(Harness.candidate)],"has_more":false}"#)
        await search.value
        #expect(h.model.items.map(\.id) == ["x"])
        #expect(h.transport.requests.count == 1) // searching writes nothing

        h.model.choose(h.model.items[0])
        let add = Task { await h.model.add() }
        await h.transport.waitForRequests(2)
        #expect(h.transport.requests[1].httpBody.map { String(decoding: $0, as: UTF8.self) }?.contains(#""expected_revision":4"#) == true)
        h.transport.fail(1, with: URLError(.networkConnectionLost))
        await add.value
        #expect(h.model.chosen != nil) // uncertain: same choice and key

        let retry = Task { await h.model.add() }
        await h.transport.waitForRequests(3)
        #expect(h.transport.requests[2].value(forHTTPHeaderField: "Idempotency-Key") == h.transport.requests[1].value(forHTTPHeaderField: "Idempotency-Key"))
        h.transport.respond(2, json: #"{"outcome":"added","entry":\#(AttendanceFixture.entry("x", origin: "unexpected")),"revision":5,"replayed":true}"#)
        await retry.value
        #expect(h.model.added?.origin == .unexpected)
        #expect(h.added == 1)
    }

    @Test func staleReviewRequiresChoosingAgain() async {
        let h = Harness()
        let search = Task { await h.model.search() }
        await h.transport.waitForRequests(1)
        h.transport.respond(0, json: #"{"items":[\#(Harness.candidate)],"has_more":false}"#)
        await search.value
        h.model.choose(h.model.items[0])
        h.revision = 5
        #expect(h.model.choiceIsStale)

        let add = Task { await h.model.add() }
        await h.transport.waitForRequests(2)
        h.transport.respond(1, status: 409, json: AttendanceFixture.error("ATTENDANCE_REVIEW_STALE", details: #"{"revision":5}"#))
        await h.transport.waitForRequests(3)
        h.transport.respond(2, json: #"{"items":[\#(Harness.candidate)],"has_more":false}"#)
        await add.value
        #expect(h.model.chosen == nil)
        #expect(h.model.added == nil)
        #expect(h.model.message != nil)
    }
}
