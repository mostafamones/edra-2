import Foundation

/// Public, build-time configuration read from the bundle (values come from xcconfig).
/// Only public values are allowed here: the bundle is readable by anyone with the binary.
struct AppConfiguration: Equatable {
    let supabaseURL: URL
    let supabasePublishableKey: String
    let apiOrigin: URL

    enum Issue: Equatable, Hashable {
        case missing(String)
        case invalid(String)

        var message: String {
            switch self {
            case .missing(let key): "\(key) is not set"
            case .invalid(let key): "\(key) is not a valid URL"
            }
        }
    }

    struct LoadError: Error, Equatable {
        let issues: [Issue]
    }

    /// Reads configuration from an Info.plist-style dictionary.
    static func load(from info: [String: Any]? = Bundle.main.infoDictionary) -> Result<AppConfiguration, LoadError> {
        let info = info ?? [:]
        var issues: [Issue] = []

        func string(_ key: String) -> String? {
            let value = (info[key] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
            guard let value, !value.isEmpty, !value.hasPrefix("$(") else {
                issues.append(.missing(key))
                return nil
            }
            return value
        }

        func url(_ key: String, allowHTTP: Bool = false) -> URL? {
            guard let raw = string(key) else { return nil }
            guard let url = URL(string: raw), (url.scheme == "https" || (allowHTTP && url.scheme == "http")), url.host?.isEmpty == false else {
                issues.append(.invalid(key))
                return nil
            }
            return url
        }

        let supabaseURL = url("EdraSupabaseURL")
        let key = string("EdraSupabasePublishableKey")
        let origin = url("EdraAPIOrigin", allowHTTP: true)

        guard issues.isEmpty, let supabaseURL, let key, let origin else { return .failure(LoadError(issues: issues)) }
        return .success(AppConfiguration(supabaseURL: supabaseURL, supabasePublishableKey: key, apiOrigin: origin))
    }
}
