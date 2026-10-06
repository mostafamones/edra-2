import SwiftUI

@main
struct EdraInstructorApp: App {
    private let configuration = AppConfiguration.load()

    var body: some Scene {
        WindowGroup {
            RootView(configuration: configuration)
        }
    }
}
