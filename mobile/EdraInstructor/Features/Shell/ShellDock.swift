import SwiftUI

/// Photos-style bottom controls: the destination pill at the leading edge and the separate
/// academy menu circle at the trailing edge.
struct ShellDock: View {
    @Binding var tab: ShellView.Tab
    let academies: AcademiesModel
    let onSignOut: () -> Void

    @ScaledMetric(relativeTo: .caption) private var iconSize = 24.0

    var body: some View {
        HStack(alignment: .center) {
            HStack(spacing: 2) {
                item(.sessions, "Sessions", icon: "tabler-calendar-clock")
                item(.assessments, "Assessments", icon: "tabler-file-pencil")
            }
            .padding(4)
            .glassBackground(in: .capsule)
            Spacer(minLength: 16)
            AcademySwitcher(model: academies, onSignOut: onSignOut)
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 4)
    }

    private func item(_ destination: ShellView.Tab, _ title: String, icon: String) -> some View {
        let selected = tab == destination
        return Button { tab = destination } label: {
            VStack(spacing: 2) {
                Image(icon).resizable().scaledToFit().frame(width: iconSize, height: iconSize)
                Text(title).font(.caption.weight(.semibold)).lineLimit(1)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 6)
            .foregroundStyle(selected ? Color.accentColor : .primary)
            .background(.fill.secondary.opacity(selected ? 1 : 0), in: .capsule)
            .contentShape(.capsule)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

extension View {
    /// Liquid Glass on iOS 26+, a translucent material before that.
    @ViewBuilder func glassBackground(in shape: some Shape) -> some View {
        if #available(iOS 26, *) {
            glassEffect(.regular.interactive(), in: shape)
        } else {
            background(.ultraThinMaterial, in: shape)
        }
    }
}
