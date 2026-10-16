/// One signed-in account's lifetime. Work started under a scope must not change state, persist a
/// selection, navigate or sign out once that scope has ended (sign-out, or a different account
/// signing in). Cancellation is best effort; this is the correctness check.
@MainActor
final class AccountScope {
    private(set) var isActive = true

    func end() { isActive = false }
}
