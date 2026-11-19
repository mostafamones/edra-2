import Foundation

struct Academy: Decodable, Identifiable, Equatable, Sendable {
    let id: String
    let name: String
    let slug: String
    let icon: String
    let role: String

    /// Maps the API's icon id to the bundled Hugeicons asset (same glyphs as web/src/components/shared/icons.tsx).
    var iconAsset: String {
        switch icon {
        case "book": "hugeicons-book-open-01"
        case "graduate": "hugeicons-graduation-cap"
        case "science": "hugeicons-microscope"
        case "code": "hugeicons-code"
        case "art": "hugeicons-paint-board"
        case "music": "hugeicons-music-note-01"
        case "trophy": "hugeicons-trophy"
        case "world": "hugeicons-globe-02"
        default: "hugeicons-school-01"
        }
    }
}

struct AcademiesResponse: Decodable, Sendable {
    let academies: [Academy]
}

/// The selected academy at one point in time. Leaving and returning to the same academy
/// (A → B → A) creates a new context, so work from the earlier visit is stale.
struct AcademyContext: Hashable, Sendable {
    let academyID: String
    let epoch: Int
}
