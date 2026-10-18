import SwiftUI
import UIKit

struct ScannerView: View {
    let model: ScannerModel
    let academyName: String
    let sessionTitle: String

    @Environment(\.dismiss) private var dismiss
    @State private var access: CameraAccess?
    @State private var camera = CameraController()
    @State private var pinchBase: CGFloat?

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(sessionTitle).font(.title3.bold())
                    Text(academyName).foregroundStyle(.secondary)
                }
                .padding(.horizontal, 16)

                cameraBox.padding(.horizontal, 16)

                cardArea.padding(.horizontal, 16)
                Spacer(minLength: 0)
            }
            .padding(.top, 8)
            .navigationTitle("Scanner")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
            }
        }
        .task { access = await CameraPermission.request() }
    }

    @ViewBuilder private var cameraBox: some View {
        Group {
            if let reason = model.blockedReason {
                message(reason)
            } else {
                switch access {
                case .granted:
                    CameraPreview(controller: camera) { model.recognized($0) }
                        .gesture(
                            MagnifyGesture()
                                .onChanged { value in
                                    let base = pinchBase ?? camera.zoom
                                    pinchBase = base
                                    camera.setZoom(base * value.magnification)
                                }
                                .onEnded { _ in pinchBase = nil }
                        )
                        .overlay(alignment: .bottom) { CameraControls(camera: camera) }
                case .denied:
                    VStack(spacing: 12) {
                        message("Camera access is off. Allow it in Settings to scan student cards.")
                        Button("Open Settings") {
                            if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                        }
                        .buttonStyle(.borderedProminent)
                    }
                case nil:
                    ProgressView()
                }
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: 300)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(.rect(cornerRadius: 20))
        .overlay(alignment: .top) {
            if let notice = model.notice {
                Text(notice.text)
                    .font(.subheadline.weight(.medium))
                    .padding(.horizontal, 14).padding(.vertical, 8)
                    .background(notice.isError ? Color.red : Color.accentColor, in: .capsule)
                    .foregroundStyle(.white)
                    .padding(10)
                    .transition(.opacity)
            }
        }
        .animation(.default, value: model.notice)
    }

    private func message(_ text: String) -> some View {
        Text(text).multilineTextAlignment(.center).foregroundStyle(.secondary).padding(24)
    }

    @ViewBuilder private var cardArea: some View {
        switch model.state {
        case .scanning:
            if model.blockedReason == nil {
                Text("Point the camera at a student card.").foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
            }
        case .awaitingDecision(let card):
            decisionCard(card, status: nil, canConfirm: true)
        case .submitting(let card):
            decisionCard(card, status: nil, canConfirm: false, busy: true)
        case .uncertain(let card, let text):
            decisionCard(card, status: text, canConfirm: true)
        case .rejected(let card, let text):
            decisionCard(card, status: text, canConfirm: false)
        }
    }

    private func decisionCard(_ card: ScannerModel.Card, status: String?, canConfirm: Bool, busy: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            StudentCard(entry: card.entry)
            if let status { Text(status).font(.footnote).foregroundStyle(.red) }
            HStack(spacing: 12) {
                Button { model.dismiss() } label: {
                    Text("✕ Dismiss").frame(maxWidth: .infinity, minHeight: 52)
                }
                .buttonStyle(.bordered)
                .disabled(busy)

                Button { Task { await model.confirm() } } label: {
                    Group { if busy { ProgressView() } else { Text("✓ Confirm") } }
                        .frame(maxWidth: .infinity, minHeight: 52)
                }
                .buttonStyle(.borderedProminent)
                .disabled(!canConfirm || busy)
            }
            .controlSize(.large)
        }
    }
}

/// Torch and zoom over a camera preview, in native Liquid Glass. Shared by the attendance and
/// assignment scanners.
struct CameraControls: View {
    let camera: CameraController

    var body: some View {
        HStack(spacing: 10) {
            if camera.hasTorch {
                Button { camera.toggleTorch() } label: {
                    Image(camera.torchOn ? "tabler-bolt" : "tabler-bolt-off")
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
