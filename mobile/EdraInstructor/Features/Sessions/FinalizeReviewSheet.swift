import SwiftUI

/// Reviews the draft values captured when the sheet opened and finalizes exactly that revision. A save
/// that lands meanwhile disables Finalize until staff review the latest values.
struct FinalizeReviewSheet: View {
    let model: SessionDetailModel

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                if let sheet = model.sheet {
                    Section {
                        LabeledContent("Official", value: officialLabel(sheet.official))
                        if let at = sheet.lastPublishedAt {
                            LabeledContent("Last finalized", value: at.formatted(date: .abbreviated, time: .shortened))
                        }
                        if sheet.official == .correctionsPending {
                            LabeledContent("Corrections", value: "\(sheet.entries.filter(\.differsFromOfficial).count)")
                        }
                    }
                    Section("Draft") {
                        LabeledContent("Present", value: "\(sheet.counts.present)")
                        LabeledContent("Late", value: "\(sheet.counts.late)")
                        LabeledContent("Absent", value: "\(sheet.counts.absent)")
                        LabeledContent("Excused", value: "\(sheet.counts.excused)")
                        LabeledContent("Unknown", value: "\(sheet.counts.unknown)")
                    }
                    if model.publishCommand != nil, let message = model.publishMessage {
                        Section { Text(message).foregroundStyle(.red) }
                    }
                    if model.finalizeReviewIsStale {
                        Section {
                            Text("Attendance changed while you were reviewing. The values above are the latest.")
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .navigationTitle(model.sheet?.publicationCount ?? 0 > 0 ? "Finalize corrections" : "Finalize attendance")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(model.isPublishing) }
                ToolbarItem(placement: .confirmationAction) {
                    if model.finalizeReviewIsStale {
                        Button("Review latest") { model.beginFinalizeReview() }
                    } else if model.isPublishing {
                        ProgressView()
                    } else {
                        Button(model.publishCommand == nil ? "Finalize" : "Retry") {
                            Task {
                                await model.publish()
                                if model.publishCommand == nil { dismiss() }
                            }
                        }
                        .disabled(!model.canPublish)
                    }
                }
            }
        }
        .interactiveDismissDisabled(model.isPublishing)
        .onAppear { model.beginFinalizeReview() }
        .onDisappear { model.endFinalizeReview() }
    }

    private func officialLabel(_ official: AttendanceSheet.Official) -> String {
        switch official {
        case .notFinalized: "Not finalized"
        case .finalized: "Finalized"
        case .correctionsPending: "Corrections pending"
        }
    }
}
