import SwiftUI

/// Academy menu circle in the shell dock, mirroring the web sidebar switcher's menu.
struct AcademySwitcher: View {
    let model: AcademiesModel
    let onSignOut: () -> Void

    @ScaledMetric(relativeTo: .caption) private var diameter = 60.0

    var body: some View {
        Menu {
            Section("Your academies") {
                ForEach(model.academies) { academy in
                    Button { model.select(academy) } label: {
                        Label {
                            Text(academy.name)
                        } icon: {
                            Image(academy.id == model.selectedID ? "tabler-check" : academy.iconAsset)
                        }
                    }
                }
            }
            Section {
                Button(role: .destructive, action: onSignOut) {
                    Label { Text("Sign out") } icon: { Image("tabler-logout") }
                }
            }
        } label: {
            // Same height as the tab pill beside it.
            Image(model.selected?.iconAsset ?? "tabler-building-community")
                .resizable()
                .scaledToFit()
                .frame(width: diameter * 0.42, height: diameter * 0.42)
                .frame(width: diameter, height: diameter)
                .foregroundStyle(.primary)
                .glassBackground(in: .circle)
                .contentShape(.circle)
        }
        .accessibilityLabel(model.selected.map { "Switch academy, current: \($0.name)" } ?? "Switch academy")
    }
}
