import SwiftUI

/// Academy switcher header, mirroring the web sidebar switcher.
struct AcademySwitcher: View {
    let model: AcademiesModel
    let onSignOut: () -> Void

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
            HStack(spacing: 14) {
                Image(model.selected?.iconAsset ?? "tabler-building-community")
                    .resizable()
                    .scaledToFit()
                    .padding(11)
                    .frame(width: 52, height: 52)
                    .foregroundStyle(.white)
                    .background(Color.accentColor, in: .rect(cornerRadius: 14))
                Text(title)
                    .font(.title3.weight(.semibold))
                    .lineLimit(1)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Image("tabler-selector").foregroundStyle(.white.opacity(0.6))
            }
            .padding(12)
            .glassBackground(cornerRadius: 28)
        }
        .accessibilityLabel(model.selected.map { "Switch academy, current: \($0.name)" } ?? "Switch academy")
    }

    private var title: String {
        if let selected = model.selected { return selected.name }
        return model.state == .loading ? "Loading academies" : "No academy"
    }
}

private extension View {
    /// Liquid Glass on iOS 26+, a translucent material before that.
    @ViewBuilder func glassBackground(cornerRadius: CGFloat) -> some View {
        if #available(iOS 26, *) {
            glassEffect(.regular.interactive(), in: .rect(cornerRadius: cornerRadius))
        } else {
            background(.ultraThinMaterial, in: .rect(cornerRadius: cornerRadius))
        }
    }
}
