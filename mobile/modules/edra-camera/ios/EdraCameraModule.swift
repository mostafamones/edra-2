import ExpoModulesCore

public final class EdraCameraModule: Module {
    public func definition() -> ModuleDefinition {
        Name("EdraCamera")
        View(EdraCameraView.self) {
            Events("onCodes", "onStatus")
        }
    }
}
