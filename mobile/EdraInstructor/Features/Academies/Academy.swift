import Foundation

struct Academy: Decodable, Identifiable, Equatable, Sendable {
    let id: String
    let name: String
    let slug: String
    let icon: String
    let role: String

    /// Maps the API's icon id to the bundled Tabler asset (same mapping as the web switcher).
    var iconAsset: String {
        switch icon {
        case "book": "tabler-book"
        case "graduate": "tabler-school"
        case "science": "tabler-microscope"
        case "code": "tabler-code"
        case "art": "tabler-palette"
        case "music": "tabler-music"
        case "trophy": "tabler-trophy"
        case "world": "tabler-world"
        default: "tabler-building-community"
        }
    }
}

struct AcademiesResponse: Decodable, Sendable {
    let academies: [Academy]
}
