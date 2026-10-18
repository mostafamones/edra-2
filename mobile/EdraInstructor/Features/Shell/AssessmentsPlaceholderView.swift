import SwiftUI

/// Assessments root until assignment marking (EDRA-79) replaces this content. Loads nothing.
struct AssessmentsPlaceholderView: View {
    let academy: Academy

    var body: some View {
        VStack(spacing: 0) {
            PageHeader(academy: academy, title: "Assessments") { EmptyView() }
            UnavailableView(title: "Marking isn't available yet",
                            message: "Assignment marking will appear here in a later update.")
        }
    }
}
