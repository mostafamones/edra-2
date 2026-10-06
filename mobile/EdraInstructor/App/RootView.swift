import SwiftUI

/// Authenticated-root boundary. Sign-in and academy selection plug in here in later work.
struct RootView: View {
    let configuration: Result<AppConfiguration, AppConfiguration.LoadError>

    var body: some View {
        NavigationStack {
            switch configuration {
            case .success(let config):
                AuthenticatedRoot(config: config)
            case .failure(let error):
                NotConfiguredView(issues: error.issues)
            }
        }
    }
}

private struct AuthenticatedRoot: View {
    let config: AppConfiguration
    @State private var model: AuthModel

    init(config: AppConfiguration) {
        self.config = config
        _model = State(initialValue: AuthModel(service: SupabaseAuthService(configuration: config)))
    }

    var body: some View {
        Group {
            switch model.state {
            case .restoring:
                ProgressView("Loading…")
            case .signedOut, .signingIn:
                SignInView(model: model)
            case .authenticated:
                SignedInRoot(config: config, auth: model)
            }
        }
        .task { await model.restore() }
    }
}

private struct SignedInRoot: View {
    let auth: AuthModel
    @State private var academies: AcademiesModel
    @State private var sessions: SessionsModel
    private let api: APIClient

    init(config: AppConfiguration, auth: AuthModel) {
        self.auth = auth
        let service = auth.service
        let api = APIClient(origin: config.apiOrigin) { try await service.accessToken(forceRefresh: $0) }
        self.api = api
        let academies = AcademiesModel(api: api) { await auth.signOut() }
        _academies = State(initialValue: academies)
        _sessions = State(initialValue: SessionsModel(
            api: api,
            onUnauthenticated: { await auth.signOut() },
            onForbidden: { await academies.load() }
        ))
    }

    var body: some View {
        MainView(model: academies, sessions: sessions, makeSessionModel: { session in
            SessionDetailModel(session: session, api: api) { await auth.signOut() }
        }) { Task { await auth.signOut() } }
    }
}

private struct NotConfiguredView: View {
    let issues: [AppConfiguration.Issue]

    var body: some View {
        List {
            Section {
                Text("Copy Configuration/Development.xcconfig.example to Configuration/Local.xcconfig, fill it in, and rebuild.")
            } header: {
                Text("App is not configured")
            }
            Section("Problems") {
                ForEach(issues, id: \.self) { issue in
                    Text(issue.message)
                }
            }
        }
        .navigationTitle("Setup needed")
    }
}
