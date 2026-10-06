import SwiftUI

struct LateDeadlineSheet: View {
    let initialMinutes: Int
    let onSave: (Int) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var text: String
    @FocusState private var focused: Bool

    init(initialMinutes: Int, onSave: @escaping (Int) -> Void) {
        self.initialMinutes = initialMinutes
        self.onSave = onSave
        _text = State(initialValue: initialMinutes > 0 ? String(initialMinutes) : "")
    }

    private var minutes: Int? {
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty { return 0 }
        guard let value = Int(trimmed), (0...1440).contains(value) else { return nil }
        return value
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Minutes", text: $text)
                        .keyboardType(.numberPad)
                        .focused($focused)
                } header: {
                    Text("Late after")
                } footer: {
                    Text("Students whose first check-in is more than this many minutes after the session started are marked Late. Leave empty or 0 to never mark Late. Maximum 1440.")
                }
                if minutes == nil {
                    Text("Enter a whole number from 0 to 1440.").foregroundStyle(.red).font(.footnote)
                }
            }
            .navigationTitle("Late deadline")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        if let minutes { onSave(minutes); dismiss() }
                    }
                    .disabled(minutes == nil)
                }
            }
            .onAppear { focused = true }
        }
        .presentationDetents([.medium])
    }
}
