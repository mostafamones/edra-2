import Foundation

/// Mirrors web/src/lib/phone.ts: Egyptian mobile numbers normalized to +201XXXXXXXXX.
enum PhoneNumber {
    static func normalizedEgyptian(_ value: String) -> String? {
        var national = value
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .filter { !" ().-".contains($0) }

        if national.hasPrefix("0020") { national.removeFirst(4) }
        else if national.hasPrefix("+20") { national.removeFirst(3) }
        else if national.hasPrefix("20") { national.removeFirst(2) }

        if national.hasPrefix("0") { national.removeFirst() }

        let normalized = "+20" + national
        let pattern = /^\+201[0125]\d{8}$/
        return normalized.wholeMatch(of: pattern) != nil ? normalized : nil
    }
}
