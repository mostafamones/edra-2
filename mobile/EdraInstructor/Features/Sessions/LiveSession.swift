import Foundation

struct LiveSession: Decodable, Identifiable, Hashable, Sendable {
    let id: String
    let academyId: String
    let academyName: String
    let scheduleTitle: String
    let groupName: String?
    let levelName: String?
    let trackName: String?
    let location: String?
    let startedAt: Date
    let startedByName: String?
    let autoEndAt: Date
    let rosterCount: Int
}

struct LiveSessionsResponse: Decodable, Sendable {
    let sessions: [LiveSession]
    let nextCursor: String?
}
