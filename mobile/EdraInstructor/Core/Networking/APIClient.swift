import Foundation

enum APIError: Error, Equatable {
    case unauthenticated
    case forbidden
    case network
    case server(String)
}

/// Bearer-only HTTP adapter for the Edra API. No cookies, current token per request,
/// one forced refresh + retry on 401.
struct APIClient: Sendable {
    typealias TokenProvider = @Sendable (_ forceRefresh: Bool) async throws -> String

    let origin: URL
    let token: TokenProvider
    private let session: URLSession

    init(origin: URL, token: @escaping TokenProvider) {
        self.origin = origin
        self.token = token
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.timeoutIntervalForRequest = 20
        session = URLSession(configuration: configuration)
    }

    func get<T: Decodable & Sendable>(_ path: String, as type: T.Type = T.self) async throws(APIError) -> T {
        try await perform(path, method: "GET", body: nil, headers: [:])
    }

    /// POST with a JSON body. `idempotencyKey` must be created once per user action and reused on retries.
    func post<B: Encodable, T: Decodable & Sendable>(
        _ path: String, body: B, idempotencyKey: String, as type: T.Type = T.self
    ) async throws(APIError) -> T {
        guard let data = try? JSONEncoder().encode(body) else { throw .server("Couldn't encode the request.") }
        return try await perform(path, method: "POST", body: data, headers: ["Idempotency-Key": idempotencyKey])
    }

    /// PATCH with a JSON body; same idempotency rules as `post`.
    func patch<B: Encodable, T: Decodable & Sendable>(
        _ path: String, body: B, idempotencyKey: String, as type: T.Type = T.self
    ) async throws(APIError) -> T {
        guard let data = try? JSONEncoder().encode(body) else { throw .server("Couldn't encode the request.") }
        return try await perform(path, method: "PATCH", body: data, headers: ["Idempotency-Key": idempotencyKey])
    }

    private func perform<T: Decodable>(
        _ path: String, method: String, body: Data?, headers: [String: String]
    ) async throws(APIError) -> T {
        do {
            do {
                return try await send(path, method: method, body: body, headers: headers, forceRefresh: false)
            } catch APIError.unauthenticated {
                return try await send(path, method: method, body: body, headers: headers, forceRefresh: true)
            }
        } catch let error as APIError {
            throw error
        } catch {
            throw .network
        }
    }

    private func send<T: Decodable>(
        _ path: String, method: String, body: Data?, headers: [String: String], forceRefresh: Bool
    ) async throws -> T {
        let bearer: String
        do { bearer = try await token(forceRefresh) } catch { throw APIError.unauthenticated }

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
        do { (data, response) = try await session.data(for: request) }
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
            let message = (try? JSONDecoder().decode(ErrorEnvelope.self, from: data))?.error.message
            throw APIError.server(message ?? "Server error (\(http.statusCode)).")
        }
    }

    private static let decoder: JSONDecoder = {
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
        struct Body: Decodable { let message: String }
        let error: Body
    }
}
