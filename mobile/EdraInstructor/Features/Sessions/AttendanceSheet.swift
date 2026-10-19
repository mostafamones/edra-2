import Foundation
import SwiftUI

enum AttendanceStatus: String, Codable, CaseIterable, Sendable {
    case unknown, present, late, absent, excused

    var label: String { self == .unknown ? "—" : rawValue.capitalized }
}

struct AttendanceCounts: Decodable, Equatable, Sendable {
    let unknown: Int
    let present: Int
    let late: Int
    let absent: Int
    let excused: Int
    let total: Int
}

/// How a student entered the session roster. Only `expected` students of a mandatory session can be
/// marked absent by "Mark rest absent"; `unexpected` students were added explicitly by staff.
enum RosterOrigin: Equatable, Sendable, Decodable {
    case expected, eligible, unexpected
    /// A value from a newer server; treated like an added student (never expected).
    case other(String)

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        switch raw {
        case "expected": self = .expected
        case "eligible": self = .eligible
        case "unexpected": self = .unexpected
        default: self = .other(raw)
        }
    }
}

struct AttendanceEntry: Decodable, Identifiable, Equatable, Sendable {
    let annualStudentRecordId: String
    let fullName: String
    let studentCode: String?
    let origin: RosterOrigin
    /// The current draft value.
    let status: AttendanceStatus
    let checkedInAt: Date?
    /// Send back as `expected_version` when changing the status.
    let version: Int
    /// Latest finalized value; nil until a finalization included this student.
    let publishedStatus: AttendanceStatus?
    let publishedAt: Date?
    /// Finalized and the draft differs from the official value. Sheet reads only.
    let correctionPending: Bool?

    var id: String { annualStudentRecordId }

    /// The official value differs from the current draft.
    var differsFromOfficial: Bool { correctionPending == true }
}

/// Only the fields the session screen uses; the full contract lives in the OpenAPI document.
struct AttendanceSheet: Decodable, Equatable, Sendable {
    struct SessionInfo: Decodable, Equatable, Sendable {
        let mandatory: Bool
        let state: String
        /// Set while the session itself is archived: read-only and not counted. Unrelated to a
        /// student's `archived` flag. Absent from older servers, so optional.
        let archivedAt: Date?
        let yearOpen: Bool?
        /// Changes with lifecycle/archive transitions, independently of the attendance revision.
        let metadataVersion: Int?
    }

    struct Permissions: Decodable, Equatable, Sendable {
        let checkIn: Bool
        let edit: Bool
        let publish: Bool
    }

    let session: SessionInfo
    let studentCodesEnabled: Bool
    /// Monotonic draft revision; finalization names the revision that was reviewed.
    let revision: Int
    let publishedRevision: Int?
    let publicationCount: Int
    let lastPublishedAt: Date?
    let lastPublishedByName: String?
    /// "unpublished", "published" or "pending_corrections".
    let publication: String
    let permittedActions: Permissions
    /// Current draft values (not official until finalized).
    let counts: AttendanceCounts
    let entries: [AttendanceEntry]

    /// Expected students still Unknown: the target of "Mark rest absent" (mandatory sessions only).
    var unrecordedExpected: Int { entries.filter { $0.origin == .expected && $0.status == .unknown }.count }
}

extension AttendanceSheet {
    enum Official: Equatable { case notFinalized, finalized, correctionsPending }

    var official: Official {
        switch publication {
        case "published": .finalized
        case "pending_corrections": .correctionsPending
        default: .notFinalized
        }
    }
}

struct CheckInResult: Decodable, Sendable {
    let outcome: String
    let entry: AttendanceEntry
    let revision: Int
    let replayed: Bool
}

/// `POST .../attendance/unrecorded-absences`.
struct UnrecordedAbsenceResult: Decodable, Sendable {
    let outcome: String
    let changed: Int
    let revision: Int
    let replayed: Bool
}

/// `409 ATTENDANCE_REVIEW_STALE` details.
struct ReviewStaleDetails: Decodable, Sendable {
    let revision: Int
}

/// A record that can be added to the roster as an unexpected attendee.
struct AttendeeCandidate: Decodable, Identifiable, Equatable, Sendable {
    let annualStudentRecordId: String
    let fullName: String
    let levelName: String?
    let groupName: String?
    let participationType: String
    let studentCode: String?

    var id: String { annualStudentRecordId }
}

struct AttendeeCandidates: Decodable, Sendable {
    let items: [AttendeeCandidate]
    let hasMore: Bool
}

struct AddAttendeeResult: Decodable, Sendable {
    let outcome: String
    let entry: AttendanceEntry
    let revision: Int
    let replayed: Bool
}

struct PublishResult: Decodable, Sendable {
    let outcome: String
    let itemCount: Int
}

extension AttendanceStatus {
    var tint: Color {
        switch self {
        case .late: .orange
        case .absent: .red
        case .excused: .blue
        case .present: Color.accentColor
        case .unknown: .secondary
        }
    }
}
