import SwiftUI
import UIKit

/// Camera identification for one assignment: one recognized code opens that student's marking sheet.
/// Recognition pauses while a lookup or sheet is open; a handled code stays ignored until it leaves view.
@MainActor
@Observable
final class AssignmentScanModel {
    /// Codes ignored until they leave the camera view. Kept while a sheet covers the camera.
    private(set) var suppressed: Set<String> = []

    /// Called with every code currently visible (empty when none). Returns the code to look up, if any.
    func recognized(_ codes: [String], paused: Bool) -> String? {
        let visible = Set(codes.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty && $0.count <= 40 })
        suppressed.formIntersection(visible)
        guard !paused, let code = visible.subtracting(suppressed).sorted().first else { return nil }
        suppressed.insert(code)
        return code
    }
}

/// The Scan tab of a workspace. The scan model is owned by the workspace so a handled code stays
/// suppressed even when the camera is torn down and recreated.
struct AssignmentScanView: View {
    let workspace: WorkspaceModel
    let scan: AssignmentScanModel

    @State private var access: CameraAccess?
    @State private var camera = CameraController()
    @State private var pinchBase: CGFloat?

    var body: some View {
        VStack(spacing: 12) {
            cameraBox
            Group {
                if workspace.isLookingUp {
                    ProgressView()
                } else if let error = workspace.lookupError {
                    Text(error).foregroundStyle(.red)
                }
            }
            .frame(maxWidth: .infinity)
        }
        // Air between the preview and the tab bar.
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .task { access = await CameraPermission.request() }
    }

    @ViewBuilder private var cameraBox: some View {
        Group {
            switch access {
            case .granted:
                CameraPreview(controller: camera) { codes in
                    let paused = workspace.marking != nil || workspace.isLookingUp
                    guard let code = scan.recognized(codes, paused: paused) else { return }
                    Feedback.recognized.play()
                    Task {
                        let opened = await workspace.lookUp(code: code, from: .camera)
                        if !opened, workspace.lookupError != nil { Feedback.failure.play() }
                    }
                }
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
                    Text("Camera access is off").foregroundStyle(.secondary)
                    Button("Open Settings") {
                        if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                    }
                    .buttonStyle(.borderedProminent)
                }
            case nil:
                ProgressView()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(.rect(cornerRadius: 20))
    }
}
