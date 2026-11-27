import SwiftUI

// Copied from EdraInstructor/Features/Scanner/ScannerView.swift. The flash icons are the app asset catalog's
// `hugeicons-flash` / `hugeicons-flash-off` (main bundle).
/// Torch and zoom over a camera preview, in native Liquid Glass. Shared by the attendance and
/// assignment scanners.
struct CameraControls: View {
    let camera: CameraController

    var body: some View {
        HStack(spacing: 10) {
            if camera.hasTorch {
                Button { camera.toggleTorch() } label: {
                    Image(camera.torchOn ? "hugeicons-flash" : "hugeicons-flash-off")
                        .frame(width: 44, height: 44)
                }
                .controlSize(.large)
                .tint(camera.torchOn ? .yellow : nil)
                .modifier(GlassCircle())
                .accessibilityLabel(camera.torchOn ? "Turn torch off" : "Turn torch on")
            }
            Spacer(minLength: 0)
            if camera.maxZoom > 1 {
                HStack(spacing: 4) {
                    ForEach([1, 2, 4].map { CGFloat($0) }.filter { $0 <= camera.maxZoom }, id: \.self) { factor in
                        Button { camera.setZoom(factor) } label: {
                            Text("\(Int(factor))×")
                                .font(.subheadline.weight(.semibold))
                                .frame(width: 40, height: 36)
                                .foregroundStyle(abs(camera.zoom - factor) < 0.25 ? Color.yellow : .white)
                        }
                    }
                }
                .padding(4)
                .modifier(GlassCapsule())
            }
        }
        .padding(12)
    }

}

private struct GlassCircle: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26, *) {
            content.buttonStyle(.plain).glassEffect(.regular.interactive(), in: .circle)
        } else {
            content.buttonStyle(.plain).background(.ultraThinMaterial, in: .circle)
        }
    }
}

/// Liquid Glass capsule (material before iOS 26). `interactive` for tappable controls.
struct GlassCapsule: ViewModifier {
    var interactive = false

    func body(content: Content) -> some View {
        if #available(iOS 26, *) {
            content.glassEffect(interactive ? .regular.interactive() : .regular, in: .capsule)
        } else {
            content.background(.ultraThinMaterial, in: .capsule)
        }
    }
}
