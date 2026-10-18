import Foundation

// Staff assignment contract (web/docs/api/assignments.openapi.yaml). Scores stay decimal strings.

struct AssignmentSummary: Decodable, Identifiable, Hashable, Sendable {
    let id: String
    let title: String
    let dueAt: Date?
    let state: String
    let maxScore: String
    let recipientCount: Int
}

struct AssignmentsPage: Decodable, Sendable {
    let total: Int
    let assignments: [AssignmentSummary]
}

struct AssignmentDetail: Decodable, Equatable, Sendable {
    struct Actions: Decodable, Equatable, Sendable {
        let mark: Bool
        let recordWork: Bool
        let announce: Bool

        static let none = Actions(mark: false, recordWork: false, announce: false)

        init(mark: Bool, recordWork: Bool, announce: Bool) {
            self.mark = mark
            self.recordWork = recordWork
            self.announce = announce
        }

        /// A missing capability grants nothing.
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            mark = try c.decodeIfPresent(Bool.self, forKey: .mark) ?? false
            recordWork = try c.decodeIfPresent(Bool.self, forKey: .recordWork) ?? false
            announce = try c.decodeIfPresent(Bool.self, forKey: .announce) ?? false
        }

        private enum CodingKeys: String, CodingKey { case mark, recordWork, announce }
    }

    enum Kind: Equatable, Sendable {
        case questionSheet, answerSheet, writtenWork
        /// A source kind this app doesn't know: shown, never edited.
        case unknown(String)

        init(_ raw: String) {
            switch raw {
            case "online_questions": self = .questionSheet
            case "answer_sheet": self = .answerSheet
            case "file_upload": self = .writtenWork
            default: self = .unknown(raw)
            }
        }

        var isChoice: Bool { self == .questionSheet || self == .answerSheet }
    }

    struct Choice: Decodable, Equatable, Identifiable, Sendable {
        let id: String
        let position: Int
        /// The staff answer key; nil when the server doesn't send it.
        let isCorrect: Bool?
        /// A, B, C… from the position.
        var letter: String { String(UnicodeScalar(UInt8(64 + min(max(position, 1), 26)))) }
    }

    struct Question: Decodable, Equatable, Identifiable, Sendable {
        let id: String
        let position: Int
        let maxScore: String
        let choices: [Choice]
    }

    struct Part: Decodable, Equatable, Identifiable, Sendable {
        let id: String
        let position: Int
        let title: String
        let maxScore: String
        /// nil: a legacy part that only takes a total.
        let kind: Kind?
        let questions: [Question]

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            id = try c.decode(String.self, forKey: .id)
            position = try c.decode(Int.self, forKey: .position)
            title = try c.decode(String.self, forKey: .title)
            maxScore = try c.decode(String.self, forKey: .maxScore)
            kind = try c.decodeIfPresent(String.self, forKey: .kind).map(Kind.init)
            questions = (try c.decodeIfPresent([Question].self, forKey: .questions) ?? []).sorted { $0.position < $1.position }
        }

        private enum CodingKeys: String, CodingKey { case id, position, title, maxScore, kind, questions }

        var takesAnswers: Bool {
            switch kind {
            case .questionSheet, .answerSheet, .writtenWork: !questions.isEmpty
            default: false
            }
        }

        var takesTotal: Bool {
            if case .unknown = kind { return false }
            return true
        }
    }

    let id: String
    let title: String
    let state: String
    let maxScore: String
    let parts: [Part]
    let studentCodesEnabled: Bool
    let actions: Actions

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        title = try c.decode(String.self, forKey: .title)
        state = try c.decode(String.self, forKey: .state)
        maxScore = try c.decode(String.self, forKey: .maxScore)
        parts = try c.decode([Part].self, forKey: .parts).sorted { $0.position < $1.position }
        studentCodesEnabled = try c.decodeIfPresent(Bool.self, forKey: .studentCodesEnabled) ?? false
        actions = try c.decodeIfPresent(Actions.self, forKey: .actions) ?? .none
    }

    private enum CodingKeys: String, CodingKey { case id, title, state, maxScore, parts, studentCodesEnabled, actions }
}

/// One recipient's work, answers, marks and result state.
struct StudentWork: Decodable, Identifiable, Equatable, Sendable {
    struct Mark: Decodable, Equatable, Sendable {
        let partId: String
        /// "mark" or "excused".
        let kind: String
        let score: String
        let reason: String?
        let fromAnswers: Bool

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            partId = try c.decode(String.self, forKey: .partId)
            kind = try c.decode(String.self, forKey: .kind)
            score = try c.decode(String.self, forKey: .score)
            reason = try c.decodeIfPresent(String.self, forKey: .reason)
            fromAnswers = try c.decodeIfPresent(Bool.self, forKey: .fromAnswers) ?? false
        }

        private enum CodingKeys: String, CodingKey { case partId, kind, score, reason, fromAnswers }
    }

    struct Answer: Decodable, Equatable, Sendable {
        let questionId: String
        let partId: String
        /// nil: recorded as unanswered (Blank).
        let choiceId: String?
        let score: String
    }

    struct Publication: Decodable, Equatable, Sendable {
        let revision: Int
        let total: String
    }

    let annualStudentRecordId: String
    let fullName: String
    let groupName: String?
    let studentCode: String?
    let workStatus: String
    let feedback: String
    let version: Int
    let marks: [Mark]
    let answers: [Answer]
    let total: String?
    /// unmarked, partial or complete.
    let marking: String
    let publication: Publication?
    /// unpublished, published or pending_correction.
    let publicationState: String

    var id: String { annualStudentRecordId }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        annualStudentRecordId = try c.decode(String.self, forKey: .annualStudentRecordId)
        fullName = try c.decode(String.self, forKey: .fullName)
        groupName = try c.decodeIfPresent(String.self, forKey: .groupName)
        studentCode = try c.decodeIfPresent(String.self, forKey: .studentCode)
        workStatus = try c.decode(String.self, forKey: .workStatus)
        feedback = try c.decodeIfPresent(String.self, forKey: .feedback) ?? ""
        version = try c.decode(Int.self, forKey: .version)
        marks = try c.decodeIfPresent([Mark].self, forKey: .marks) ?? []
        answers = try c.decodeIfPresent([Answer].self, forKey: .answers) ?? []
        total = try c.decodeIfPresent(String.self, forKey: .total)
        marking = try c.decode(String.self, forKey: .marking)
        publication = try c.decodeIfPresent(Publication.self, forKey: .publication)
        publicationState = try c.decode(String.self, forKey: .publicationState)
    }

    private enum CodingKeys: String, CodingKey {
        case annualStudentRecordId, fullName, groupName, studentCode, workStatus, feedback, version, marks, answers, total
        case marking, publication, publicationState
    }

    func mark(for partID: String) -> Mark? { marks.first { $0.partId == partID } }

    /// Complete private work that differs from (or has no) official result.
    var isAnnounceable: Bool { marking == "complete" && publicationState != "published" }

    var status: String {
        switch (workStatus, marking, publicationState) {
        case ("excused", _, _): "Excused"
        case (_, "complete", "published"): "Announced"
        case (_, "complete", "pending_correction"): "Correction pending"
        case (_, "complete", _): "Marked"
        case (_, "partial", "pending_correction"): "Partial · correction pending"
        case (_, "partial", _): "Partial"
        case ("submitted", _, _), ("late", _, _): "Needs marking"
        default: "Not received"
        }
    }
}

struct StudentsPage: Decodable, Sendable {
    let total: Int
    let students: [StudentWork]
}

struct StudentResolution: Decodable, Sendable {
    let student: StudentWork
}

/// PATCH .../marks body. Every save names the permanent record, so a code lookup stays bound to it.
struct SaveMarksBody: Encodable, Equatable, Sendable {
    struct MarkEdit: Encodable, Equatable, Sendable {
        let partID: String
        /// nil clears the part.
        let score: String?
        let excusedReason: String?

        func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: Keys.self)
            try c.encode(partID, forKey: .partID)
            if let score { try c.encode(score, forKey: .score) } else { try c.encodeNil(forKey: .score) }
            try c.encodeIfPresent(excusedReason, forKey: .excusedReason)
        }

        private enum Keys: String, CodingKey { case partID = "part_id", score, excusedReason = "excused_reason" }
    }

    enum AnswerEdit: Encodable, Equatable, Sendable {
        /// nil choice: explicitly unanswered (Blank).
        case choice(questionID: String, choiceID: String?)
        case score(questionID: String, score: String)
        /// Back to not entered.
        case clear(questionID: String)

        func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: Keys.self)
            switch self {
            case .choice(let question, let choice):
                try c.encode(question, forKey: .questionID)
                if let choice { try c.encode(choice, forKey: .choiceID) } else { try c.encodeNil(forKey: .choiceID) }
            case .score(let question, let score):
                try c.encode(question, forKey: .questionID)
                try c.encode(score, forKey: .score)
            case .clear(let question):
                try c.encode(question, forKey: .questionID)
                try c.encode(true, forKey: .clear)
            }
        }

        private enum Keys: String, CodingKey { case questionID = "question_id", choiceID = "choice_id", score, clear }
    }

    let recordID: String
    let expectedVersion: Int
    let marks: [MarkEdit]
    let answers: [AnswerEdit]
    let feedback: String?

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(recordID, forKey: .recordID)
        try c.encode(expectedVersion, forKey: .expectedVersion)
        if !marks.isEmpty { try c.encode(marks, forKey: .marks) }
        if !answers.isEmpty { try c.encode(answers, forKey: .answers) }
        try c.encodeIfPresent(feedback, forKey: .feedback)
    }

    private enum Keys: String, CodingKey {
        case recordID = "annual_student_record_id", expectedVersion = "expected_version", marks, answers, feedback
    }
}

struct SaveMarksResult: Decodable, Sendable {
    let outcome: String
    let student: StudentWork
    let replayed: Bool
}

/// `error.details` of 409 MARKS_CONFLICT.
struct MarksConflictDetails: Decodable, Sendable {
    let current: StudentWork
}

struct AnnounceBody: Encodable, Equatable, Sendable {
    struct Item: Encodable, Equatable, Sendable {
        let annualStudentRecordId: String
        let expectedVersion: Int
        private enum CodingKeys: String, CodingKey {
            case annualStudentRecordId = "annual_student_record_id", expectedVersion = "expected_version"
        }
    }
    let items: [Item]
}

struct AnnounceResult: Decodable, Sendable {
    struct Item: Decodable, Sendable {
        let annualStudentRecordId: String
        let outcome: String
    }
    let results: [Item]
    let replayed: Bool
}

/// `error.details` of 409 PUBLICATION_REJECTED.
struct AnnounceRejection: Decodable, Sendable {
    struct Failure: Decodable, Sendable {
        let annualStudentRecordId: String
        /// stale, incomplete or not_recipient.
        let reason: String
    }
    let failures: [Failure]
}

/// Exact two-decimal scores as integer hundredths; never binary floating point.
enum Score {
    /// "7.5" → 750. Accepts Arabic-Indic digits and a comma or Arabic decimal separator from the keypad.
    static func hundredths(_ text: String) -> Int? {
        var ascii = ""
        for scalar in text.trimmingCharacters(in: .whitespaces).unicodeScalars {
            switch scalar.value {
            case 0x30...0x39: ascii.unicodeScalars.append(scalar)
            case 0x660...0x669: ascii.unicodeScalars.append(UnicodeScalar(scalar.value - 0x660 + 0x30)!)
            case 0x6F0...0x6F9: ascii.unicodeScalars.append(UnicodeScalar(scalar.value - 0x6F0 + 0x30)!)
            case 0x2E, 0x2C, 0x66B: ascii.append(".")
            default: return nil
            }
        }
        let pieces = ascii.split(separator: ".", omittingEmptySubsequences: false)
        guard (1...2).contains(pieces.count), let whole = pieces.first, !whole.isEmpty || pieces.count == 2,
              whole.count <= 7 else { return nil }
        let fraction = pieces.count == 2 ? pieces[1] : ""
        guard fraction.count <= 2, !(pieces.count == 2 && fraction.isEmpty && whole.isEmpty) else { return nil }
        let padded = fraction + String(repeating: "0", count: 2 - fraction.count)
        guard let w = Int(whole.isEmpty ? "0" : whole), let f = Int(padded) else { return nil }
        return w * 100 + f
    }

    /// 750 → "7.5", 1000 → "10", 725 → "7.25".
    static func format(_ hundredths: Int) -> String {
        let whole = hundredths / 100, fraction = hundredths % 100
        if fraction == 0 { return "\(whole)" }
        return fraction % 10 == 0 ? "\(whole).\(fraction / 10)" : "\(whole).\(fraction < 10 ? "0" : "")\(fraction)"
    }

    /// A server decimal for display ("10.00" → "10").
    static func display(_ text: String?) -> String {
        guard let text else { return "–" }
        return hundredths(text).map(format) ?? text
    }
}
