import Foundation

enum APIError: Error, Equatable {
    case unauthenticated
    case forbidden
    case network
    case server(String)
    /// A structured error response; only thrown to callers that ask for `structuredErrors`.
    case rejected(APIFailure)
    /// The calling task was cancelled. Not a failure to report: the work's owner has gone away.
    case cancelled
}

/// A backend error response: stable code, message, request id and optional `details` JSON.
struct APIFailure: Equatable, Sendable {
    let status: Int
    let code: String
    let message: String
    let requestID: String?
    let retryAfter: Int?
    /// The raw `error.details` object, decoded by the caller that understands it.
    let details: Data?

    func decodeDetails<T: Decodable>(_ type: T.Type) -> T? {
        details.flatMap { try? APIClient.decoder.decode(T.self, from: $0) }
    }
}

/// Bearer-only HTTP adapter for the Edra API. No cookies, current token per request,
/// one forced refresh + retry on 401. Cancellation surfaces as `.cancelled`, never as `.network`.
struct APIClient: Sendable {
    typealias TokenProvider = @Sendable (_ forceRefresh: Bool) async throws -> String
    /// Sends one request. Tests substitute a transport that completes requests in a chosen order.
    typealias Transport = @Sendable (URLRequest) async throws -> (Data, URLResponse)

    let origin: URL
    let token: TokenProvider
    private let transport: Transport

    init(origin: URL, token: @escaping TokenProvider, transport: Transport? = nil) {
        self.origin = origin
        self.token = token
        if let transport {
            self.transport = transport
        } else {
            let configuration = URLSessionConfiguration.ephemeral
            configuration.httpCookieStorage = nil
            configuration.httpShouldSetCookies = false
            configuration.timeoutIntervalForRequest = 20
            let session = URLSession(configuration: configuration)
            self.transport = { try await session.data(for: $0) }
        }
    }

    /// `structuredErrors`: other failures with an error body throw `.rejected` instead of `.server`.
    func get<T: Decodable & Sendable>(
        _ path: String, as type: T.Type = T.self, structuredErrors: Bool = false
    ) async throws(APIError) -> T {
        try await perform(path, method: "GET", body: nil, headers: [:], structured: structuredErrors)
    }

    /// POST with a JSON body. `idempotencyKey` must be created once per user action and reused on retries;
    /// read-only POSTs (lookups) send none.
    func post<B: Encodable, T: Decodable & Sendable>(
        _ path: String, body: B, idempotencyKey: String?, as type: T.Type = T.self, structuredErrors: Bool = false
    ) async throws(APIError) -> T {
        guard let data = try? JSONEncoder().encode(body) else { throw .server("Couldn't encode the request.") }
        let headers = idempotencyKey.map { ["Idempotency-Key": $0] } ?? [:]
        return try await perform(path, method: "POST", body: data, headers: headers, structured: structuredErrors)
    }

    /// PATCH with a JSON body; same idempotency rules as `post`.
    func patch<B: Encodable, T: Decodable & Sendable>(
        _ path: String, body: B, idempotencyKey: String, as type: T.Type = T.self, structuredErrors: Bool = false
    ) async throws(APIError) -> T {
        guard let data = try? JSONEncoder().encode(body) else { throw .server("Couldn't encode the request.") }
        return try await perform(path, method: "PATCH", body: data, headers: ["Idempotency-Key": idempotencyKey], structured: structuredErrors)
    }

    private func perform<T: Decodable>(
        _ path: String, method: String, body: Data?, headers: [String: String], structured: Bool
    ) async throws(APIError) -> T {
        do {
            do {
                return try await send(path, method: method, body: body, headers: headers, structured: structured, forceRefresh: false)
            } catch APIError.unauthenticated {
                return try await send(path, method: method, body: body, headers: headers, structured: structured, forceRefresh: true)
            }
        } catch let error as APIError {
            throw error
        } catch is CancellationError {
            throw .cancelled
        } catch {
            throw Task.isCancelled ? .cancelled : .network
        }
    }

    private func send<T: Decodable>(
        _ path: String, method: String, body: Data?, headers: [String: String], structured: Bool, forceRefresh: Bool
    ) async throws -> T {
        let bearer: String
        do { bearer = try await token(forceRefresh) } catch {
            // A cancelled token refresh is not evidence that the account is signed out.
            if error is CancellationError || Task.isCancelled { throw CancellationError() }
            throw APIError.unauthenticated
        }

        guard let url = URL(string: path, relativeTo: origin.appending(path: "/")) else { throw APIError.network }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.httpBody = body
        if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        for (name, value) in headers { request.setValue(value, forHTTPHeaderField: name) }
        request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(UUID().uuidString, forHTTPHeaderField: "X-Request-Id")

        let data: Data
        let response: URLResponse
        do { (data, response) = try await transport(request) }
        catch is CancellationError { throw CancellationError() }
        catch let error as URLError where error.code == .cancelled { throw CancellationError() }
        catch { throw APIError.network }

        guard let http = response as? HTTPURLResponse else { throw APIError.network }
        switch http.statusCode {
        case 200..<300:
            do { return try Self.decoder.decode(T.self, from: data) }
            catch { throw APIError.server("Unexpected response from the server.") }
        case 401: throw APIError.unauthenticated
        case 403: throw APIError.forbidden
        default:
            let envelope = try? JSONDecoder().decode(ErrorEnvelope.self, from: data)
            if structured, let body = envelope?.error, let code = body.code {
                throw APIError.rejected(APIFailure(
                    status: http.statusCode, code: code, message: body.message, requestID: body.requestId,
                    retryAfter: (http.value(forHTTPHeaderField: "Retry-After")).flatMap { Int($0) },
                    details: Self.details(in: data)
                ))
            }
            throw APIError.server(envelope?.error.message ?? "Server error (\(http.statusCode)).")
        }
    }

    /// Re-encodes `error.details` so its owner can decode it with the shared decoder.
    private static func details(in data: Data) -> Data? {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let error = object["error"] as? [String: Any], let details = error["details"],
              JSONSerialization.isValidJSONObject(details) else { return nil }
        return try? JSONSerialization.data(withJSONObject: details)
    }

    static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .custom { decoder in
            let raw = try decoder.singleValueContainer().decode(String.self)
            let withFraction = Date.ISO8601FormatStyle(includingFractionalSeconds: true)
            if let date = try? withFraction.parse(raw) ?? nil { return date }
            return try Date.ISO8601FormatStyle().parse(raw)
        }
        return decoder
    }()

    private struct ErrorEnvelope: Decodable {
        struct Body: Decodable {
            let message: String
            let code: String?
            let requestId: String?
            enum CodingKeys: String, CodingKey { case message, code, requestId = "request_id" }
        }
        let error: Body
    }
}
