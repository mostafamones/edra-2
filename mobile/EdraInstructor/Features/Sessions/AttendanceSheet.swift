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

struct AttendanceEntry: Decodable, Identifiable, Equatable, Sendable {
    let annualStudentRecordId: String
    let fullName: String
    let studentCode: String?
    let status: AttendanceStatus
    let checkedInAt: Date?
    /// Send back as `expected_version` when changing the status.
    let version: Int

    var id: String { annualStudentRecordId }
}

/// Only the fields the session screen uses; the full contract lives in the OpenAPI document.
struct AttendanceSheet: Decodable, Equatable, Sendable {
    struct SessionInfo: Decodable, Equatable, Sendable {
        let mandatory: Bool
        let state: String
    }

    struct Permissions: Decodable, Equatable, Sendable {
        let checkIn: Bool
        let edit: Bool
        let publish: Bool
    }

    let session: SessionInfo
    let studentCodesEnabled: Bool
    let revision: Int
    let publication: String
    let permittedActions: Permissions
    let counts: AttendanceCounts
    let entries: [AttendanceEntry]
}

struct CheckInResult: Decodable, Sendable {
    let outcome: String
    let entry: AttendanceEntry
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
