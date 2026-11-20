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
        case insecure(String)

        var message: String {
            switch self {
            case .missing(let key): "\(key) is not set"
            case .invalid(let key): "\(key) is not a valid URL"
            case .insecure(let key): "\(key) must use https in this build"
            }
        }
    }

    struct LoadError: Error, Equatable {
        let issues: [Issue]
    }

    /// Which API origins may use plain HTTP. Decided by the build configuration, never by a bundle value.
    enum TransportPolicy: Equatable {
        /// Release builds: every origin must be HTTPS.
        case httpsOnly
        /// Debug builds: plain HTTP only to these exact hosts (the Debug plist's ATS exceptions).
        case developmentHTTP(hosts: Set<String>)

        static func current(info: [String: Any]) -> TransportPolicy {
            #if DEBUG
            return .developmentHTTP(hosts: insecureHosts(in: info))
            #else
            return .httpsOnly
            #endif
        }

        /// Hosts the bundle's App Transport Security exceptions allow over plain HTTP.
        static func insecureHosts(in info: [String: Any]) -> Set<String> {
            let ats = info["NSAppTransportSecurity"] as? [String: Any]
            let domains = ats?["NSExceptionDomains"] as? [String: Any] ?? [:]
            return Set(domains.compactMap { host, settings in
                let allowsHTTP = (settings as? [String: Any])?["NSExceptionAllowsInsecureHTTPLoads"] as? Bool
                return allowsHTTP == true ? host.lowercased() : nil
            })
        }

        func allowsHTTP(to host: String) -> Bool {
            switch self {
            case .httpsOnly: false
            case .developmentHTTP(let hosts): hosts.contains(host.lowercased())
            }
        }
    }

    /// Reads configuration from an Info.plist-style dictionary. `policy` defaults to the build's own.
    static func load(
        from info: [String: Any]? = Bundle.main.infoDictionary, policy: TransportPolicy? = nil
    ) -> Result<AppConfiguration, LoadError> {
        let info = info ?? [:]
        let policy = policy ?? .current(info: info)
        var issues: [Issue] = []

        func string(_ key: String) -> String? {
            let value = (info[key] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
            guard let value, !value.isEmpty, !value.hasPrefix("$(") else {
                issues.append(.missing(key))
                return nil
            }
            return value
        }

        func url(_ key: String, allowsHTTP: Bool = false) -> URL? {
            guard let raw = string(key) else { return nil }
            guard let url = URL(string: raw), let scheme = url.scheme?.lowercased(), ["https", "http"].contains(scheme),
                  let host = url.host, !host.isEmpty else {
                issues.append(.invalid(key))
                return nil
            }
            guard scheme == "https" || (allowsHTTP && policy.allowsHTTP(to: host)) else {
                issues.append(.insecure(key))
                return nil
            }
            return url
        }

        let supabaseURL = url("EdraSupabaseURL")
        let key = string("EdraSupabasePublishableKey")
        let origin = url("EdraAPIOrigin", allowsHTTP: true)

        guard issues.isEmpty, let supabaseURL, let key, let origin else { return .failure(LoadError(issues: issues)) }
        return .success(AppConfiguration(supabaseURL: supabaseURL, supabasePublishableKey: key, apiOrigin: origin))
    }
}
