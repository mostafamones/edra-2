import Testing
@testable import EdraInstructor

private final class FakeAuth: AuthService, @unchecked Sendable {
    var hasSession = false
    var failure: SignInFailure?
    var signedInPhone: String?
    var signOutCalls = 0

    func restoreSession() async -> Bool { hasSession }
    func signIn(phone: String, password: String) async throws(SignInFailure) {
        if let failure { throw failure }
        signedInPhone = phone
    }
    func accessToken(forceRefresh: Bool) async throws -> String { "token" }
    func signOut() async { signOutCalls += 1 }
}

@MainActor
struct AuthModelTests {
    @Test func restoreWithoutSessionIsSignedOut() async {
        let model = AuthModel(service: FakeAuth())
        await model.restore()
        #expect(model.state == .signedOut)
    }

    @Test func restoreWithSessionIsAuthenticated() async {
        let fake = FakeAuth(); fake.hasSession = true
        let model = AuthModel(service: fake)
        await model.restore()
        #expect(model.state == .authenticated)
    }

    @Test func signInNormalizesPhone() async {
        let fake = FakeAuth()
        let model = AuthModel(service: fake)
        await model.restore()
        await model.signIn(phone: "0100 123 4567", password: "x")
        #expect(fake.signedInPhone == "+201001234567")
        #expect(model.state == .authenticated)
    }

    @Test func invalidPhoneNeverCallsService() async {
        let fake = FakeAuth()
        let model = AuthModel(service: fake)
        await model.restore()
        await model.signIn(phone: "123", password: "x")
        #expect(model.phoneError != nil)
        #expect(fake.signedInPhone == nil)
        #expect(model.state == .signedOut)
    }

    @Test func wrongPasswordStaysSignedOutWithMessage() async {
        let fake = FakeAuth(); fake.failure = .invalidCredentials
        let model = AuthModel(service: fake)
        await model.restore()
        await model.signIn(phone: "01001234567", password: "bad")
        #expect(model.state == .signedOut)
        #expect(model.errorMessage == "Wrong phone number or password.")
    }

    @Test func signOutClearsLocalSession() async {
        let fake = FakeAuth(); fake.hasSession = true
        let model = AuthModel(service: fake)
        await model.restore()
        await model.signOut()
        #expect(model.state == .signedOut)
        #expect(fake.signOutCalls == 1)
    }
}

struct PhoneNumberTests {
    @Test(arguments: [
        ("01001234567", "+201001234567"),
        ("+20 100 123 4567", "+201001234567"),
        ("00201001234567", "+201001234567"),
        ("201101234567", "+201101234567"),
    ])
    func normalizes(input: String, expected: String) {
        #expect(PhoneNumber.normalizedEgyptian(input) == expected)
    }

    @Test(arguments: ["", "123", "01301234567", "0100123456"])
    func rejects(input: String) {
        #expect(PhoneNumber.normalizedEgyptian(input) == nil)
    }
}
