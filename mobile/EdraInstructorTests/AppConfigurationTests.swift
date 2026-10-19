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
        guard case .failure(let error) = AppConfiguration.load(from: info, policy: .developmentHTTP(hosts: ["abc.supabase.co"])) else {
            Issue.record("expected failure"); return
        }
        #expect(error.issues == [.insecure("EdraSupabaseURL")])
    }

    @Test func developmentPolicyAllowsHTTPToTheExceptedHostOnly() throws {
        var info = valid
        info["EdraAPIOrigin"] = "http://mones.ddns.net:3000"
        let policy = AppConfiguration.TransportPolicy.developmentHTTP(hosts: ["mones.ddns.net"])
        #expect(try AppConfiguration.load(from: info, policy: policy).get().apiOrigin.port == 3000)

        info["EdraAPIOrigin"] = "http://mones.ddns.net.evil.example:3000"
        guard case .failure(let error) = AppConfiguration.load(from: info, policy: policy) else {
            Issue.record("expected failure"); return
        }
        #expect(error.issues == [.insecure("EdraAPIOrigin")])
    }

    @Test func releasePolicyRejectsEveryHTTPOrigin() {
        var info = valid
        info["EdraAPIOrigin"] = "http://mones.ddns.net:3000"
        info["NSAppTransportSecurity"] = ["NSExceptionDomains": ["mones.ddns.net": ["NSExceptionAllowsInsecureHTTPLoads": true]]]
        guard case .failure(let error) = AppConfiguration.load(from: info, policy: .httpsOnly) else {
            Issue.record("expected failure"); return
        }
        #expect(error.issues == [.insecure("EdraAPIOrigin")])
    }

    @Test func releasePolicyAcceptsHTTPS() throws {
        #expect(try AppConfiguration.load(from: valid, policy: .httpsOnly).get().apiOrigin.scheme == "https")
    }

    @Test func readsInsecureHostsFromTheATSExceptions() {
        let domains: [String: Any] = [
            "Mones.DDNS.net": ["NSExceptionAllowsInsecureHTTPLoads": true],
            "tls-only.example": ["NSExceptionMinimumTLSVersion": "TLSv1.2"],
        ]
        let info: [String: Any] = ["NSAppTransportSecurity": ["NSExceptionDomains": domains]]
        #expect(AppConfiguration.TransportPolicy.insecureHosts(in: info) == ["mones.ddns.net"])
        #expect(AppConfiguration.TransportPolicy.insecureHosts(in: [:]).isEmpty)
    }

    /// Tests run the Debug build; the Release default is checked on the built Release plist and binary.
    @Test func debugBuildUsesTheBundleExceptions() {
        let info: [String: Any] = ["NSAppTransportSecurity": ["NSExceptionDomains": [
            "mones.ddns.net": ["NSExceptionAllowsInsecureHTTPLoads": true],
        ]]]
        #if DEBUG
        #expect(AppConfiguration.TransportPolicy.current(info: info) == .developmentHTTP(hosts: ["mones.ddns.net"]))
        #else
        #expect(AppConfiguration.TransportPolicy.current(info: info) == .httpsOnly)
        #endif
    }
}
