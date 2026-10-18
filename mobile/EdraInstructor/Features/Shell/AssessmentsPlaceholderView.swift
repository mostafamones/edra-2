import SwiftUI

/// Assessments root until assignment marking (EDRA-79) replaces this content. Loads nothing.
struct AssessmentsPlaceholderView: View {
    var body: some View {
        UnavailableView(title: "Marking isn't available yet",
                        message: "Assignment marking will appear here in a later update.")
    }
}
