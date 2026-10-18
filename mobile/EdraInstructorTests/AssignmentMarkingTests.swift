import Foundation
import Testing
@testable import EdraInstructor

enum AssignmentFixture {
    // Part P1: Answer Sheet, two choice questions (A/B). Part P2: Written Work, seven questions max 2.
    // Part P3: legacy total-only part, max 10.
    static let detail = """
    {"id":"asg","title":"Homework 1","state":"active","max_score":"26","year_open":true,"ready":true,
     "student_codes_enabled":true,"actions":{"mark":true,"record_work":true,"announce":true},
     "parts":[
      {"id":"p1","position":1,"title":"Choices","instructions":"","max_score":"2","kind":"answer_sheet","issues":[],
       "questions":[{"id":"q1","position":1,"prompt":"","max_score":"1","choices":[{"id":"c1a","position":1,"label":"","is_correct":true},{"id":"c1b","position":2,"label":"","is_correct":false}]},
                    {"id":"q2","position":2,"prompt":"","max_score":"1","choices":[{"id":"c2a","position":1,"label":"","is_correct":false},{"id":"c2b","position":2,"label":"","is_correct":true}]}]},
      {"id":"p2","position":2,"title":"Written","instructions":"","max_score":"14","kind":"file_upload","issues":[],
       "questions":[\((1...7).map { #"{"id":"w\#($0)","position":\#($0),"prompt":"","max_score":"2","choices":[]}"# }.joined(separator: ","))]},
      {"id":"p3","position":3,"title":"Legacy","instructions":"","max_score":"10","kind":null,"issues":[],"questions":[]}
     ]}
    """

    static func student(_ id: String = "s1", name: String = "Amal", version: Int = 1, marks: String = "[]", answers: String = "[]",
                        marking: String = "unmarked", publication: String = "unpublished", total: String? = nil) -> String {
        let totalJSON = total.map { "\"\($0)\"" } ?? "null"
        return #"{"annual_student_record_id":"\#(id)","full_name":"\#(name)","archived":false,"group_name":"Nine A","student_code":"0001","work_status":"submitted","received_at":null,"work_note":"","feedback":"","version":\#(version),"marks":\#(marks),"answers":\#(answers),"marked_parts":0,"updated_at":null,"total":\#(totalJSON),"marking":"\#(marking)","publication":null,"publication_state":"\#(publication)"}"#
    }

    static func page(_ students: [String], total: Int? = nil) -> String {
        #"{"total":\#(total ?? students.count),"students":[\#(students.joined(separator: ","))]}"#
    }

    static func saved(_ student: String, replayed: Bool = false) -> String {
        #"{"outcome":"saved","student":\#(student),"work_recorded":true,"replayed":\#(replayed)}"#
    }

    static func error(_ code: String, details: String? = nil) -> String {
        let extra = details.map { #","details":\#($0)"# } ?? ""
        return #"{"error":{"code":"\#(code)","message":"\#(code) message","request_id":"r"\#(extra)}}"#
    }

    static func decodeDetail() throws -> AssignmentDetail { try APIClient.decoder.decode(AssignmentDetail.self, from: Data(detail.utf8)) }
    static func decodeStudent(_ json: String) throws -> StudentWork { try APIClient.decoder.decode(StudentWork.self, from: Data(json.utf8)) }
}

struct ScoreTests {
    @Test func parsesExactHundredths() {
        #expect(Score.hundredths("7.5") == 750)
        #expect(Score.hundredths("0") == 0)
        #expect(Score.hundredths("10.25") == 1025)
        #expect(Score.hundredths(".5") == 50)
        #expect(Score.hundredths("٧٫٥") == 750) // Arabic-Indic keypad
        #expect(Score.hundredths("7,5") == 750)
        #expect(Score.hundredths("") == nil)
        #expect(Score.hundredths("1.234") == nil)
        #expect(Score.hundredths("-1") == nil)
        #expect(Score.hundredths("1e2") == nil)
    }

    @Test func formatsWithoutBinaryRounding() {
        #expect(Score.format(750) == "7.5")
        #expect(Score.format(1000) == "10")
        #expect(Score.format(705) == "7.05")
        #expect(Score.display("10.00") == "10")
        #expect(Score.display(nil) == "–")
    }
}

struct AssignmentDecodingTests {
    @Test func decodesStructureAndUnknownCapabilitiesGrantNothing() throws {
        let detail = try AssignmentFixture.decodeDetail()
        #expect(detail.parts.map(\.kind) == [.answerSheet, .writtenWork, nil])
        #expect(detail.parts[0].questions[1].choices.map(\.letter) == ["A", "B"])
        #expect(detail.parts[2].takesAnswers == false && detail.parts[2].takesTotal)

        let bare = #"{"id":"a","title":"t","state":"active","max_score":"1","parts":[{"id":"p","position":1,"title":"x","max_score":"1","kind":"photo_upload","questions":[]}]}"#
        let old = try APIClient.decoder.decode(AssignmentDetail.self, from: Data(bare.utf8))
        #expect(old.actions == .none)
        #expect(old.studentCodesEnabled == false)
        #expect(old.parts[0].takesTotal == false) // an unknown kind is never editable
    }

    @Test func keepsBlankZeroAndMissingAnswersDistinct() throws {
        let student = try AssignmentFixture.decodeStudent(AssignmentFixture.student(
            marks: #"[{"part_id":"p2","kind":"mark","score":"0.00","reason":null}]"#,
            answers: #"[{"question_id":"q1","part_id":"p1","choice_id":null,"score":"0"}]"#
        ))
        #expect(student.answers[0].choiceId == nil)
        #expect(student.mark(for: "p2")?.score == "0.00")
        #expect(student.mark(for: "p2")?.fromAnswers == false) // absent from older payloads
        let legacy = try AssignmentFixture.decodeStudent(#"{"annual_student_record_id":"x","full_name":"N","work_status":"expected","version":1,"marking":"unmarked","publication_state":"unpublished"}"#)
        #expect(legacy.answers.isEmpty && legacy.marks.isEmpty)
    }
}

@MainActor
struct MarkingModelTests {
    @MainActor final class Harness {
        let transport = ControlledTransport()
        var current = AcademyContext(academyID: "A", epoch: 1)
        var saved: [StudentWork] = []
        var defaults: [(String, MarkingModel.Mode)] = []
        private let student: StudentWork
        private let detail: AssignmentDetail
        private let part: String?
        private let mode: MarkingModel.Mode

        init(student: String = AssignmentFixture.student(), part: String? = nil, mode: MarkingModel.Mode = .byQuestion) throws {
            self.student = try AssignmentFixture.decodeStudent(student)
            self.detail = try AssignmentFixture.decodeDetail()
            self.part = part
            self.mode = mode
        }

        lazy var model = MarkingModel(
            assignment: detail, student: student, context: current, api: transport.client(), partID: part, mode: mode,
            isCurrent: { [unowned self] in self.current == $0 },
            onDefaults: { [unowned self] in self.defaults.append(($0, $1)) },
            onSaved: { [unowned self] in self.saved.append($0) },
            onUnauthenticated: {}, onForbidden: {}
        )

        func body(_ index: Int) -> [String: Any] {
            (try? JSONSerialization.jsonObject(with: transport.requests[index].httpBody ?? Data())) as? [String: Any] ?? [:]
        }
        func key(_ index: Int) -> String? { transport.requests[index].value(forHTTPHeaderField: "Idempotency-Key") }
    }

    @Test func blankAndClearAreDifferentEdits() async throws {
        let h = try Harness(student: AssignmentFixture.student(answers: #"[{"question_id":"q2","part_id":"p1","choice_id":"c2a","score":"0"}]"#))
        h.model.setEntry("q1", .choice(nil))
        h.model.setEntry("q2", .notEntered)
        let save = Task { await h.model.save() }
        await h.transport.waitForRequests(1)
        let answers = h.body(0)["answers"] as? [[String: Any]] ?? []
        #expect(answers.count == 2)
        #expect(answers[0]["question_id"] as? String == "q1" && answers[0].keys.contains("choice_id") && answers[0]["choice_id"] is NSNull)
        #expect(answers[1]["clear"] as? Bool == true)
        #expect(h.body(0)["annual_student_record_id"] as? String == "s1")
        #expect(h.body(0)["marks"] == nil)
        h.transport.respond(0, json: AssignmentFixture.saved(AssignmentFixture.student(version: 2)))
        #expect(await save.value)
        #expect(h.saved.map(\.version) == [2])
        #expect(!h.model.hasChanges)
    }

    @Test func writtenWorkToolbarStaysOnTheQuestionAndPagesByFive() throws {
        let h = try Harness(part: "p2")
        #expect(h.model.pageQuestions.map(\.id) == ["w1", "w2", "w3", "w4", "w5"])
        h.model.goToQuestion(4)
        h.model.setCurrentScore(zero: false)
        #expect(h.model.entry("w5") == .score("2"))
        #expect(h.model.questionIndex == 4) // no auto-advance
        h.model.goToQuestion(5)
        #expect(h.model.page == 1 && h.model.pageQuestions.map(\.id) == ["w6", "w7"])
        h.model.setCurrentScore(zero: true)
        #expect(h.model.entry("w6") == .score("0"))
        h.model.clearCurrent()
        #expect(h.model.entry("w6") == .notEntered)
        h.model.goToQuestion(7) // past the end does not wrap
        #expect(h.model.questionIndex == 5)
        #expect(h.model.draftWrittenTotal == "2")
    }

    @Test func overMaximumAndExcusedWithoutReasonCannotSave() throws {
        let h = try Harness(part: "p2")
        h.model.setEntry("w1", .score("2.5"))
        #expect(!h.model.canSave && h.model.problems.count == 1)
        h.model.setEntry("w1", .score("1.75"))
        #expect(h.model.canSave)

        h.model.selectPart("p3")
        h.model.setTotal(.init(text: "4", excused: true, reason: " "))
        #expect(!h.model.canSave)
    }

    @Test func fastMarkOverQuestionWorkNeedsReplacementAndModeChangeAloneChangesNothing() throws {
        let h = try Harness(student: AssignmentFixture.student(
            marks: #"[{"part_id":"p2","kind":"mark","score":"3","reason":null,"from_answers":true}]"#,
            answers: #"[{"question_id":"w1","part_id":"p2","choice_id":null,"score":"1"},{"question_id":"w2","part_id":"p2","choice_id":null,"score":"2"}]"#
        ), part: "p2", mode: .fast)
        #expect(h.model.mode == .byQuestion) // the saved representation is shown, not the run default
        h.model.selectMode(.fast)
        #expect(!h.model.hasChanges)
        h.model.setTotal(.init(text: "5"))
        #expect(h.model.replacements == ["Written"])
        h.model.selectMode(.byQuestion)
        h.model.setEntry("w1", .score("2"))
        // Editing by question returns the fast draft to its saved state: one representation per part.
        #expect(h.model.total == MarkingModel.Total())
        #expect(h.model.replacements.isEmpty)
    }

    @Test func uncertainSaveRetriesTheSameKeyAndPayloadAndLocksEditing() async throws {
        let h = try Harness(part: "p3")
        h.model.setTotal(.init(text: "7.5"))
        let first = Task { await h.model.save() }
        await h.transport.waitForRequests(1)
        h.transport.fail(0, with: URLError(.networkConnectionLost))
        #expect(await first.value == false)
        #expect(h.model.isUncertain && !h.model.canEdit)
        h.model.setTotal(.init(text: "9")) // ignored while unresolved
        #expect(h.model.total.text == "7.5")

        let retry = Task { await h.model.save() }
        await h.transport.waitForRequests(2)
        #expect(h.key(1) == h.key(0))
        #expect(h.transport.requests[1].httpBody == h.transport.requests[0].httpBody)
        h.transport.respond(1, json: AssignmentFixture.saved(AssignmentFixture.student(version: 2), replayed: true))
        #expect(await retry.value)
        #expect(h.saved.count == 1)
    }

    @Test func conflictKeepsAttemptsShowsCurrentAndNeedsANewAction() async throws {
        let h = try Harness(part: "p3")
        h.model.setTotal(.init(text: "6"))
        let save = Task { await h.model.save() }
        await h.transport.waitForRequests(1)
        let current = AssignmentFixture.student(version: 3, marks: #"[{"part_id":"p3","kind":"mark","score":"9","reason":null}]"#, total: "9")
        h.transport.respond(0, status: 409, json: AssignmentFixture.error("MARKS_CONFLICT", details: #"{"current":\#(current)}"#))
        #expect(await save.value == false)
        guard case .conflict(let server) = h.model.saveState else { Issue.record("expected conflict"); return }
        #expect(server.version == 3)
        #expect(h.model.total.text == "6") // attempted input kept
        #expect(!h.model.canSave)

        h.model.reapply()
        #expect(h.model.student.version == 3 && h.model.total.text == "6" && h.model.canSave)
        let again = Task { await h.model.save() }
        await h.transport.waitForRequests(2)
        #expect(h.key(1) != h.key(0))
        #expect(h.body(1)["expected_version"] as? Int == 3)
        h.transport.respond(1, json: AssignmentFixture.saved(AssignmentFixture.student(version: 4)))
        #expect(await again.value)
    }

    @Test func lateAcknowledgmentForAnotherAcademyIsIgnored() async throws {
        let h = try Harness(part: "p3")
        h.model.setTotal(.init(text: "1"))
        let save = Task { await h.model.save() }
        await h.transport.waitForRequests(1)
        h.current = AcademyContext(academyID: "B", epoch: 2)
        h.transport.respond(0, json: AssignmentFixture.saved(AssignmentFixture.student(version: 2)))
        #expect(await save.value == false)
        #expect(h.saved.isEmpty)
    }

    @Test func runDefaultsFollowTheInstructorsChoiceNotTheShownRepresentation() throws {
        let h = try Harness(part: "p2", mode: .fast)
        h.model.selectMode(.byQuestion)
        h.model.selectPart("p1")
        #expect(h.defaults.last?.0 == "p1" && h.defaults.last?.1 == .byQuestion)
        #expect(h.model.questionIndex == 0)
    }
}

@MainActor
struct WorkspaceModelTests {
    @MainActor final class Harness {
        let transport = ControlledTransport()
        var current: AcademyContext? = AcademyContext(academyID: "A", epoch: 1)
        lazy var parent = AssignmentsModel(
            api: transport.client(), isCurrent: { [unowned self] in $0 == self.current }, onUnauthenticated: {}, onForbidden: {}
        )
        lazy var model = WorkspaceModel(
            summary: AssignmentSummary(id: "asg", title: "Homework 1", dueAt: nil, state: "active", maxScore: "26", recipientCount: 3),
            context: current!, parent: parent
        )

        func loaded(_ students: [String], total: Int? = nil) async {
            let load = Task { await model.load() }
            await transport.waitForRequests(1)
            transport.respond(0, json: AssignmentFixture.detail)
            await transport.waitForRequests(2)
            transport.respond(1, json: AssignmentFixture.page(students, total: total))
            await load.value
        }
    }

    @Test func searchGoesToTheServerAndAnOlderPageCannotOverwriteIt() async throws {
        let h = Harness()
        await h.loaded([AssignmentFixture.student("s1")], total: 80)
        #expect(h.model.hasMore)
        let older = Task { await h.model.loadMore() }
        await h.transport.waitForRequests(3)
        let search = Task { await h.model.setSearch("am") }
        await h.transport.waitForRequests(4)
        #expect(h.transport.requests[3].url?.query?.contains("search=am") == true)
        #expect(h.transport.requests[3].url?.query?.contains("offset=0") == true)
        h.transport.respond(3, json: AssignmentFixture.page([AssignmentFixture.student("s9", name: "Adam")], total: 1))
        await search.value
        h.transport.respond(2, json: AssignmentFixture.page([AssignmentFixture.student("s2")], total: 80))
        await older.value
        #expect(h.model.students.map(\.id) == ["s9"])
        #expect(h.model.total == 1)
    }

    @Test func selectionClearsWhenTheListChanges() async throws {
        let h = Harness()
        await h.loaded([AssignmentFixture.student("s1", marking: "complete", total: "20")])
        h.model.isSelecting = true
        h.model.selection = ["s1"]
        let filter = Task { await h.model.setFilter(.unannounced) }
        await h.transport.waitForRequests(3)
        #expect(h.model.selection.isEmpty)
        h.transport.respond(2, json: AssignmentFixture.page([]))
        await filter.value
    }

    @Test func rejectedAnnouncementAnnouncesNobodyAndExplainsEachStudent() async throws {
        let h = Harness()
        await h.loaded([AssignmentFixture.student("s1", marking: "complete", total: "20"),
                        AssignmentFixture.student("s2", marking: "complete", total: "18")])
        h.model.reviewAnnouncement(h.model.students)
        let send = Task { await h.model.announce() }
        await h.transport.waitForRequests(3)
        let items = ((try? JSONSerialization.jsonObject(with: h.transport.requests[2].httpBody!)) as? [String: Any])?["items"] as? [[String: Any]]
        #expect(items?.count == 2 && items?[0]["expected_version"] as? Int == 1)
        h.transport.respond(2, status: 409, json: AssignmentFixture.error(
            "PUBLICATION_REJECTED", details: #"{"failures":[{"annual_student_record_id":"s2","reason":"stale"}]}"#
        ))
        await h.transport.waitForRequests(4) // the list refreshes for review
        h.transport.respond(3, json: AssignmentFixture.page([]))
        await send.value
        guard case .rejected(_, let reasons) = h.model.announcement?.state else { Issue.record("expected rejection"); return }
        #expect(reasons == ["s2": "Changed since you reviewed it"])
    }

    @Test func uncertainAnnouncementRetriesWithTheSameKey() async throws {
        let h = Harness()
        await h.loaded([AssignmentFixture.student("s1", marking: "complete", total: "20")])
        h.model.reviewAnnouncement(h.model.students)
        let first = Task { await h.model.announce() }
        await h.transport.waitForRequests(3)
        h.transport.fail(2, with: URLError(.timedOut))
        await first.value
        let retry = Task { await h.model.announce() }
        await h.transport.waitForRequests(4)
        let key = { (i: Int) in h.transport.requests[i].value(forHTTPHeaderField: "Idempotency-Key") }
        #expect(key(3) == key(2) && key(2) != nil)
        h.transport.respond(3, json: #"{"outcome":"published","replayed":true,"results":[{"annual_student_record_id":"s1","outcome":"published","revision":1}]}"#)
        await h.transport.waitForRequests(5)
        h.transport.respond(4, json: AssignmentFixture.page([]))
        await retry.value
        #expect(h.model.announcement == nil)
    }

    @Test func incompleteOrAnnouncedWorkCannotBeSelected() async throws {
        let h = Harness()
        await h.loaded([AssignmentFixture.student("s1", marking: "partial"),
                        AssignmentFixture.student("s2", marking: "complete", publication: "published")])
        #expect(h.model.announceBlocker(h.model.students[0]) == "Not fully marked")
        #expect(h.model.announceBlocker(h.model.students[1]) == "Already announced")
    }

    @Test func codeLookupIsReadOnlyAndOpensTheSameSheet() async throws {
        let h = Harness()
        await h.loaded([])
        let lookup = Task { await h.model.lookUp(code: " 0001 ", from: .camera) }
        await h.transport.waitForRequests(3)
        #expect(h.transport.requests[2].value(forHTTPHeaderField: "Idempotency-Key") == nil)
        #expect(h.transport.requests[2].url?.path == "/api/v1/assignments/asg/student-resolution")
        h.transport.respond(2, json: #"{"student":\#(AssignmentFixture.student())}"#)
        #expect(await lookup.value)
        #expect(h.model.marking?.student.id == "s1" && h.model.origin == .camera)
        #expect(h.parent.activeMarking === h.model.marking)
    }

    @Test func refusedCodeWritesNothing() async throws {
        let h = Harness()
        await h.loaded([])
        let lookup = Task { await h.model.lookUp(code: "9999", from: .code) }
        await h.transport.waitForRequests(3)
        h.transport.respond(2, status: 404, json: AssignmentFixture.error("STUDENT_CODE_NOT_FOUND"))
        #expect(await lookup.value == false)
        #expect(h.model.lookupError == "No student has code 9999.")
        #expect(h.model.marking == nil)
    }
}

@MainActor
struct AssignmentScanTests {
    @Test func handledCodeIsSuppressedUntilItLeavesView() {
        let scan = AssignmentScanModel()
        #expect(scan.recognized(["0001"], paused: false) == "0001")
        #expect(scan.recognized(["0001"], paused: false) == nil) // same book still in view
        #expect(scan.recognized(["0001", "0002"], paused: true) == nil) // paused while the sheet is open
        #expect(scan.recognized(["0001"], paused: false) == nil)
        #expect(scan.recognized([], paused: false) == nil) // the book left the view
        #expect(scan.recognized(["0001"], paused: false) == "0001")
        #expect(scan.recognized(["00012"], paused: false) == "00012") // leading zeros and length kept
    }
}
