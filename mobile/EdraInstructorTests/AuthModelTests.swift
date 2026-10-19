import Foundation
import Testing
@testable import EdraInstructor

private final class FakeAuth: AuthService, @unchecked Sendable {
    var hasSession = false
    /// Thrown by `restoreSession` instead of the `hasSession` answer; cleared after `failuresLeft` uses.
    var restoreFailure: AuthFailure?
    var failuresLeft = Int.max
    /// When set, restoration waits until the test resumes it.
    var holdRestore = false
    private var held: CheckedContinuation<Void, Never>?
    var restoreCalls = 0
    var failure: SignInFailure?
    var signedInPhone: String?
    var signOutCalls = 0

    func restoreSession() async throws(AuthFailure) {
        restoreCalls += 1
        if holdRestore { await withCheckedContinuation { held = $0 } }
        if let restoreFailure, failuresLeft > 0 {
            failuresLeft -= 1
            throw restoreFailure
        }
        if !hasSession { throw .signedOut }
    }
    func signIn(phone: String, password: String) async throws(SignInFailure) {
        if let failure { throw failure }
        signedInPhone = phone
    }
    func accessToken(forceRefresh: Bool) async throws(AuthFailure) -> String { "token" }
    func signOut() async { signOutCalls += 1 }

    func waitUntilHeld() async {
        for _ in 0..<2000 where held == nil { try? await Task.sleep(for: .milliseconds(1)) }
    }
    func release() { held?.resume(); held = nil }
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
        #expect(model.scope != nil)
    }

    @Test func unavailableRestoreKeepsCredentialsAndRetrySucceeds() async {
        let fake = FakeAuth(); fake.hasSession = true
        fake.restoreFailure = .unavailable; fake.failuresLeft = 1
        let model = AuthModel(service: fake)
        await model.restore()
        #expect(model.state == .restoreFailed)
        #expect(model.scope == nil) // nothing academy-scoped may load
        #expect(fake.signOutCalls == 0)

        await model.retryRestore()
        #expect(model.state == .authenticated)
        #expect(fake.signOutCalls == 0)
    }

    @Test func retryThatStillFailsStaysRecoverable() async {
        let fake = FakeAuth(); fake.hasSession = true; fake.restoreFailure = .unavailable
        let model = AuthModel(service: fake)
        await model.restore()
        await model.retryRestore()
        #expect(model.state == .restoreFailed)
        #expect(fake.restoreCalls == 2)
        #expect(fake.signOutCalls == 0)
    }

    @Test func rejectedSessionClearsCredentialsAndSignsOut() async {
        let fake = FakeAuth(); fake.hasSession = true; fake.restoreFailure = .signedOut
        let model = AuthModel(service: fake)
        await model.restore()
        #expect(model.state == .signedOut)
        #expect(fake.signOutCalls == 1)
    }

    @Test func discardedRefreshIsRetryableAndNeverSignsOut() async {
        let fake = FakeAuth(); fake.hasSession = true
        fake.restoreFailure = .cancelled; fake.failuresLeft = 1
        let model = AuthModel(service: fake)
        await model.restore()
        #expect(model.state == .restoreFailed)
        #expect(fake.signOutCalls == 0)
        await model.retryRestore()
        #expect(model.state == .authenticated)
    }

    @Test func concurrentRestoreCallsShareOneAttempt() async {
        let fake = FakeAuth(); fake.hasSession = true; fake.holdRestore = true
        let model = AuthModel(service: fake)
        let first = Task { await model.restore() }
        await fake.waitUntilHeld()
        await model.restore() // returns immediately: an attempt is already running
        fake.release()
        await first.value
        #expect(fake.restoreCalls == 1)
        #expect(model.state == .authenticated)
    }

    @Test func signOutDuringRestoreIsNotUndoneByItsLateCompletion() async {
        let fake = FakeAuth(); fake.hasSession = true; fake.holdRestore = true
        let model = AuthModel(service: fake)
        let restore = Task { await model.restore() }
        await fake.waitUntilHeld()
        await model.signOut()
        fake.release()
        await restore.value
        #expect(model.state == .signedOut)
        #expect(model.scope == nil)
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
