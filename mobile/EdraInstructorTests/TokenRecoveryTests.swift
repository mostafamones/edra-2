import Foundation
import Supabase
import Testing
@testable import EdraInstructor

/// Token provider and transport that answer from scripts and record what they were asked.
private final class Script: @unchecked Sendable {
    private let lock = NSLock()
    private var tokens: [Result<String, AuthFailure>]
    private var statuses: [Int]
    private(set) var refreshFlags: [Bool] = []
    private(set) var requests: [URLRequest] = []

    init(tokens: [Result<String, AuthFailure>], statuses: [Int] = []) {
        self.tokens = tokens
        self.statuses = statuses
    }

    func client() -> APIClient {
        APIClient(origin: URL(string: "https://api.example.test")!, token: { force in
            try self.lock.withLock {
                self.refreshFlags.append(force)
                return try self.tokens.removeFirst().get()
            }
        }, transport: { request in
            let status = self.lock.withLock {
                self.requests.append(request)
                return self.statuses.removeFirst()
            }
            let body = status == 200 ? #"{"ok":true}"# : Fixture.error(status == 401 ? "UNAUTHENTICATED" : "ERROR")
            return (Data(body.utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
        })
    }
}

private struct OK: Decodable, Sendable { let ok: Bool }
private struct Body: Encodable { let value: Int }

struct TokenRecoveryTests {
    @Test func unavailableTokenIsANetworkFailureNotSignedOut() async {
        let script = Script(tokens: [.failure(.unavailable)])
        await #expect(throws: APIError.network) { try await script.client().get("x", as: OK.self) }
        #expect(script.requests.isEmpty)
    }

    @Test func failedForcedRefreshAfter401IsANetworkFailure() async {
        let script = Script(tokens: [.success("old"), .failure(.unavailable)], statuses: [401])
        await #expect(throws: APIError.network) { try await script.client().get("x", as: OK.self) }
        #expect(script.refreshFlags == [false, true])
    }

    @Test func rejectedSessionIsUnauthenticatedWithoutARetry() async {
        let script = Script(tokens: [.failure(.signedOut)])
        await #expect(throws: APIError.unauthenticated) { try await script.client().get("x", as: OK.self) }
        #expect(script.refreshFlags == [false])
    }

    @Test func discardedRefreshIsCancellation() async {
        let script = Script(tokens: [.success("old"), .failure(.cancelled)], statuses: [401])
        await #expect(throws: APIError.cancelled) { try await script.client().get("x", as: OK.self) }
    }

    @Test func a401IsRetriedOnceWithTheRefreshedTokenAndTheSameMutation() async throws {
        let script = Script(tokens: [.success("old"), .success("new")], statuses: [401, 200])
        let result = try await script.client().post("x", body: Body(value: 7), idempotencyKey: "key-1", as: OK.self)
        #expect(result.ok)
        #expect(script.refreshFlags == [false, true])
        let (first, retry) = (script.requests[0], script.requests[1])
        #expect(first.value(forHTTPHeaderField: "Authorization") == "Bearer old")
        #expect(retry.value(forHTTPHeaderField: "Authorization") == "Bearer new")
        #expect(retry.httpMethod == "POST")
        #expect(retry.httpBody == first.httpBody)
        #expect(retry.value(forHTTPHeaderField: "Idempotency-Key") == "key-1")
    }

    @Test func aSecondDefinitive401IsUnauthenticated() async {
        let script = Script(tokens: [.success("old"), .success("new")], statuses: [401, 401])
        await #expect(throws: APIError.unauthenticated) { try await script.client().get("x", as: OK.self) }
        #expect(script.requests.count == 2)
    }
}

/// Classification of the pinned SDK's errors by type and server response.
struct AuthFailureClassificationTests {
    private func api(_ status: Int, _ code: ErrorCode) -> AuthError {
        .api(
            message: "m", errorCode: code, underlyingData: Data(),
            underlyingResponse: HTTPURLResponse(url: URL(string: "https://x.test")!, statusCode: status, httpVersion: nil, headerFields: nil)!
        )
    }

    @Test func missingSessionIsSignedOut() {
        #expect(SupabaseAuthService.classify(AuthError.sessionMissing) == .signedOut)
    }

    @Test func discardedRefreshIsCancelled() {
        #expect(SupabaseAuthService.classify(AuthError.refreshDiscarded) == .cancelled)
        #expect(SupabaseAuthService.classify(CancellationError()) == .cancelled)
        #expect(SupabaseAuthService.classify(URLError(.cancelled)) == .cancelled)
    }

    @Test func networkFailuresAreRecoverable() {
        for code: URLError.Code in [.notConnectedToInternet, .timedOut, .networkConnectionLost, .cannotFindHost] {
            #expect(SupabaseAuthService.classify(URLError(code)) == .unavailable)
        }
    }

    @Test func rateLimitsAndServerErrorsAreRecoverable() {
        #expect(SupabaseAuthService.classify(api(429, .overRequestRateLimit)) == .unavailable)
        #expect(SupabaseAuthService.classify(api(500, .unexpectedFailure)) == .unavailable)
        #expect(SupabaseAuthService.classify(api(503, .sessionNotFound)) == .unavailable)
        #expect(SupabaseAuthService.classify(api(400, .validationFailed)) == .unavailable)
    }

    @Test func definitiveRejectionsAreSignedOut() {
        #expect(SupabaseAuthService.classify(api(400, .refreshTokenNotFound)) == .signedOut)
        #expect(SupabaseAuthService.classify(api(403, .userBanned)) == .signedOut)
        #expect(SupabaseAuthService.classify(api(401, .badJWT)) == .signedOut)
    }
}
