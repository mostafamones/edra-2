import Foundation

/// A schedule a session can be started from (`GET /api/v1/academies/{id}/schedules`).
/// Planned times are academy-local wall-clock values and never restrict starting.
struct StartableSchedule: Decodable, Identifiable, Equatable, Sendable {
    struct Slot: Decodable, Equatable, Sendable {
        /// ISO weekday: 1 = Monday … 7 = Sunday.
        let weekday: Int
        let startsAt: String
        let endsAt: String
    }

    struct Meeting: Decodable, Equatable, Sendable {
        /// "YYYY-MM-DD" in academy time.
        let occursOn: String
        let startsAt: String
        let endsAt: String
    }

    let id: String
    let title: String
    let kind: String
    let audience: String
    let mandatory: Bool
    let location: String?
    let groupName: String?
    let levelName: String?
    let trackName: String?
    let slots: [Slot]
    let meetings: [Meeting]
    let meetsToday: Bool
    /// Starting opens this live session instead of creating another.
    let liveSessionId: String?
    /// Server hint for the UI; the start command re-checks authority.
    let canStart: Bool

    /// "Nine A · Grade 9 · Science", or "Grade 9 · Whole level".
    var audienceLabel: String {
        [groupName, levelName, audience == "level" ? "Whole level" : trackName].compactMap { $0 }.joined(separator: " · ")
    }

    /// Planned slots or meetings, e.g. "Sat 4:00 PM–5:30 PM" or "Thu, Oct 16 10:00 AM–11:00 AM".
    var planLines: [String] {
        if kind == "recurring" {
            return slots.map { "\(Self.weekdayName($0.weekday)) \(Self.time($0.startsAt))–\(Self.time($0.endsAt))" }
        }
        return meetings.map { "\(Self.date($0.occursOn)) \(Self.time($0.startsAt))–\(Self.time($0.endsAt))" }
    }

    private static func weekdayName(_ weekday: Int) -> String {
        ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][safe: weekday - 1] ?? "?"
    }

    /// "16:05" or "16:05:00" → "4:05 PM", without any time-zone conversion.
    static func time(_ value: String) -> String {
        let parts = value.split(separator: ":").compactMap { Int($0) }
        guard parts.count >= 2 else { return value }
        let hours = parts[0], minutes = parts[1]
        return "\(hours % 12 == 0 ? 12 : hours % 12):\(String(format: "%02d", minutes)) \(hours < 12 ? "AM" : "PM")"
    }

    /// "2026-10-16" → "Fri, Oct 16, 2026", kept on the same calendar day.
    static func date(_ value: String) -> String {
        guard let day = try? Date(value, strategy: Date.ISO8601FormatStyle().year().month().day()),
              let utc = TimeZone(identifier: "UTC") else { return value }
        let style = Date.FormatStyle(locale: Locale(identifier: "en_US"), calendar: Calendar(identifier: .gregorian), timeZone: utc)
        return day.formatted(style.weekday(.abbreviated).month(.abbreviated).day().year())
    }
}

struct SchedulesPage: Decodable, Sendable {
    struct Year: Decodable, Sendable {
        let id: String
        let startYear: Int
    }

    let timeZone: String
    let today: String
    let academicYear: Year?
    let schedules: [StartableSchedule]
    let nextOffset: Int?
}

private extension Array {
    subscript(safe index: Int) -> Element? { indices.contains(index) ? self[index] : nil }
}
