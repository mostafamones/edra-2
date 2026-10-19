import Foundation

/// How an attendance write ended, for callers that keep a command until it is acknowledged.
/// Attendance writes request `structuredErrors`, so a definitive answer always carries a status/code.
enum AttendanceWriteOutcome: Equatable {
    /// The server may or may not have applied it (no response, 5xx, 429, unreadable 2xx). Keep the
    /// command, body and Idempotency-Key unchanged for Retry.
    case uncertain(String)
    /// Definitively not applied, or a typed outcome to review (conflict, review required, lifecycle).
    case rejected(APIFailure)
    case unauthenticated
    case forbidden
    /// The work's owner went away. Not proof of success or rejection.
    case cancelled

    init(_ error: any Error) {
        guard let error = error as? APIError else {
            self = .uncertain("Couldn't confirm the change. Retry to be sure; it won't be saved twice.")
            return
        }
        switch error {
        case .unauthenticated: self = .unauthenticated
        case .forbidden: self = .forbidden
        case .cancelled: self = .cancelled
        case .network: self = .uncertain("Couldn't reach the server. Retry to be sure; it won't be saved twice.")
        case .server(let message): self = .uncertain(message)
        case .rejected(let failure):
            if failure.code == "THROTTLED" {
                self = .uncertain("Too many changes in a short time. Retry in a moment.")
            } else if failure.status >= 500 || failure.code == APIFailure.unreadableResponse {
                self = .uncertain("The server couldn't confirm the change. Retry to be sure; it won't be saved twice.")
            } else {
                self = .rejected(failure)
            }
        }
    }

    /// Message for a definitive failure.
    static func message(for failure: APIFailure) -> String {
        switch failure.code {
        case "SESSION_ENDED": "This session has ended. Check-ins are closed; staff can still review attendance."
        case "SESSION_ARCHIVED": "This session is archived. Its attendance is read-only."
        case "YEAR_CLOSED": "This academic year is closed. Attendance is read-only."
        case "NOT_ON_ROSTER": "This student isn't on this session's roster."
        case "STUDENT_NOT_FOUND": "This student isn't in this session's academy and year."
        case "STUDENT_ARCHIVED": "This student is archived. Restore them on the web before adding them."
        case "STUDENT_CODES_DISABLED": "Student codes are off for this academy. Check the student in by name."
        case "STUDENT_CODE_RETIRED": "This code is no longer active. Use the student's current code."
        case "STUDENT_CODE_NOT_FOUND": "No student in this academy has this code."
        case "STUDENT_CODE_AMBIGUOUS": "This code was issued to more than one student. Check the student in by name."
        case "ATTENDANCE_CONFLICT": "Someone else changed this student first. Review the current value and try again."
        case "ATTENDANCE_REVIEW_STALE", "PUBLICATION_STALE": "Attendance changed after you reviewed it. Nothing was saved; review the latest values."
        case "IDEMPOTENCY_CONFLICT": "This request didn't match its earlier attempt. Start the action again."
        case APIFailure.uncodedError where failure.status == 404 || failure.status == 405:
            "This server doesn't support this action yet. It needs an update."
        default: failure.message
        }
    }
}
