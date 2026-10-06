import SwiftUI

struct SignInView: View {
    let model: AuthModel

    @State private var phone = ""
    @State private var password = ""
    @FocusState private var focus: Field?

    private enum Field { case phone, password }

    private var isSigningIn: Bool { model.state == .signingIn }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Sign in").font(.largeTitle.bold())
                        .foregroundStyle(.secondary)
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("Phone number").font(.subheadline.weight(.medium))
                    TextField("01012345678", text: $phone)
                        .textContentType(.telephoneNumber)
                        .keyboardType(.phonePad)
                        .focused($focus, equals: .phone)
                        .padding(12)
                        .background(.fill.tertiary, in: .rect(cornerRadius: 10))
                    if let phoneError = model.phoneError {
                        Text(phoneError).font(.footnote).foregroundStyle(.red)
                    }
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("Password").font(.subheadline.weight(.medium))
                    SecureField("Password", text: $password)
                        .textContentType(.password)
                        .submitLabel(.go)
                        .focused($focus, equals: .password)
                        .onSubmit(submit)
                        .padding(12)
                        .background(.fill.tertiary, in: .rect(cornerRadius: 10))
                }

                if let message = model.errorMessage {
                    Text(message).font(.footnote).foregroundStyle(.red)
                        .accessibilityLabel("Error: \(message)")
                }

                Button(action: submit) {
                    Group {
                        if isSigningIn { ProgressView() } else { Text("Sign in") }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                }
                .buttonStyle(.borderedProminent)
                .disabled(isSigningIn)
            }
            .padding(24)
        }
        .scrollDismissesKeyboard(.interactively)
        .disabled(isSigningIn)
    }

    private func submit() {
        guard !isSigningIn else { return }
        focus = nil
        Task { await model.signIn(phone: phone, password: password) }
    }
}
