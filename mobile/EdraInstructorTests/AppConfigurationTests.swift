import Testing
@testable import EdraInstructor

struct AppConfigurationTests {
    private let valid: [String: Any] = [
        "EdraSupabaseURL": "https://abc.supabase.co",
        "EdraSupabasePublishableKey": "sb_publishable_x",
        "EdraAPIOrigin": "https://edra.example.com",
    ]

    @Test func loadsValidValues() throws {
        let config = try AppConfiguration.load(from: valid).get()
        #expect(config.apiOrigin.host == "edra.example.com")
    }

    @Test func reportsUnsubstitutedAndEmptyValues() {
        var info = valid
        info["EdraAPIOrigin"] = "$(EDRA_API_ORIGIN)"
        info["EdraSupabasePublishableKey"] = ""
        guard case .failure(let error) = AppConfiguration.load(from: info) else {
            Issue.record("expected failure"); return
        }
        #expect(error.issues.contains(.missing("EdraAPIOrigin")))
        #expect(error.issues.contains(.missing("EdraSupabasePublishableKey")))
    }

    @Test func rejectsNonHTTPSSupabaseURL() {
        var info = valid
        info["EdraSupabaseURL"] = "http://abc.supabase.co"
        guard case .failure(let error) = AppConfiguration.load(from: info) else {
            Issue.record("expected failure"); return
        }
        #expect(error.issues == [.invalid("EdraSupabaseURL")])
    }

    @Test func allowsHTTPAPIOrigin() throws {
        var info = valid
        info["EdraAPIOrigin"] = "http://mones.ddns.net:3000"
        #expect(try AppConfiguration.load(from: info).get().apiOrigin.port == 3000)
    }
}
