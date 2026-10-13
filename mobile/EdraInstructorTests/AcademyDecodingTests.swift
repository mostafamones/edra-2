import Foundation
import Testing
@testable import EdraInstructor

struct AcademyDecodingTests {
    @Test func decodesEveryStaffRoleIncludingHeadAdmin() throws {
        let json = """
        {"academies":[
          {"id":"a","name":"A","slug":"a","icon":"book","role":"owner"},
          {"id":"b","name":"B","slug":"b","icon":"book","role":"head_admin"},
          {"id":"c","name":"C","slug":"c","icon":"book","role":"admin"},
          {"id":"d","name":"D","slug":"d","icon":"book","role":"instructor"}
        ]}
        """
        let response = try JSONDecoder().decode(AcademiesResponse.self, from: Data(json.utf8))
        #expect(response.academies.map(\.role) == ["owner", "head_admin", "admin", "instructor"])
    }
}
