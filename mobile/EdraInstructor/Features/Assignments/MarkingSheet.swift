import SwiftUI

/// Full-height marking sheet for one student: part, By question / Fast mark, entry, feedback, Save.
/// Save and the Written Work shortcuts live in a bottom bar, which stays above the keyboard.
struct MarkingSheet: View {
    let model: MarkingModel
    let onClose: () -> Void

    @Environment(\.scenePhase) private var scenePhase
    @FocusState private var focus: String?
    private static let fastField = "fast"
    @State private var confirmLeave = false
    @State private var confirmReplace = false
    /// Feedback stays out of the way until asked for, or when the student already has some.
    @State private var showFeedback = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    header
                    if model.isConflict { conflict }
                    if model.assignment.parts.count > 1 { partChips }
                    if model.modes.count > 1 {
                        Picker("Entry", selection: Binding(get: { model.mode }, set: { model.selectMode($0) })) {
                            ForEach(model.modes) { Text($0.rawValue).tag($0) }
                        }
                        .pickerStyle(.segmented)
                    }
                    if model.mode == .byQuestion, model.part?.takesAnswers == true { questions } else if model.part?.takesTotal == true { fastMark }
                    if showFeedback {
                        card("Feedback") {
                            TextField("Feedback", text: Binding(get: { model.feedback }, set: { model.feedback = $0 }), axis: .vertical)
                                .lineLimit(2...6)
                                .disabled(!model.canEdit)
                        }
                    } else if model.canEdit {
                        Button("Add feedback") { showFeedback = true }.font(.subheadline)
                    }
                    status
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            }
            .scrollDismissesKeyboard(.interactively)
            .onAppear { showFeedback = !model.feedback.isEmpty }
            .background(Color(.systemGroupedBackground))
            .safeAreaInset(edge: .bottom, spacing: 0) { if showsQuickBar { quickBar } }
            .navigationTitle(model.assignment.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { if model.hasChanges || model.isUncertain { confirmLeave = true } else { onClose() } } label: {
                        icon("tabler-x")
                    }
                    .disabled(model.isSaving)
                    .accessibilityLabel("Close")
                }
                ToolbarItem(placement: .confirmationAction) {
                    if model.isSaving {
                        ProgressView()
                    } else if model.hasChanges || model.isUncertain {
                        Button(model.isUncertain ? "Retry" : "Save") { requestSave() }
                            .fontWeight(.semibold)
                            .disabled(!model.canSave && !model.isUncertain)
                    } else {
                        // Nothing unsaved: finish with this student.
                        Button("Done") { onClose() }.fontWeight(.semibold)
                    }
                }
            }
            .interactiveDismissDisabled(model.hasChanges || model.isSaving || model.isUncertain)
            .confirmationDialog("Save changes for \(model.student.fullName)?", isPresented: $confirmLeave, titleVisibility: .visible) {
                Button("Save") { requestSave() }.disabled(!model.canSave && !model.isUncertain)
                Button("Discard", role: .destructive) { model.discard(); onClose() }
                Button("Keep editing", role: .cancel) {}
            }
            .confirmationDialog("Replace saved marks?", isPresented: $confirmReplace, titleVisibility: .visible) {
                Button("Replace and save") { Task { await model.save() } }
                Button("Keep editing", role: .cancel) {}
            } message: {
                Text("Saving replaces the saved \(model.replacements.joined(separator: ", ")) marks entered the other way.")
            }
            // Back in the foreground: settle an unacknowledged save before anything else.
            .onChange(of: scenePhase) { _, phase in
                if phase == .active, model.isUncertain { Task { await model.save() } }
            }
            .onChange(of: model.questionIndex) { _, _ in
                if focus != nil, let question = model.currentQuestion, model.part?.kind == .writtenWork { focus = question.id }
            }
        }
    }

    private func requestSave() {
        if !model.isUncertain && !model.replacements.isEmpty { confirmReplace = true } else { Task { await model.save() } }
    }

    // MARK: - Building blocks

    private func card<Content: View>(_ title: String? = nil, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if let title { Text(title).font(.footnote.weight(.semibold)).foregroundStyle(.secondary) }
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 14))
    }

    private func icon(_ name: String, size: CGFloat = 20) -> some View {
        Image(name).resizable().scaledToFit().frame(width: size, height: size)
    }

    /// `verdict`: true/false colours a selected chip accent/red from the answer key; nil is neutral grey.
    private func chip(_ title: String, selected: Bool, verdict: Bool? = nil, label: String, action: @escaping () -> Void) -> some View {
        // No answer key sent: a neutral selection that doesn't imply right or wrong.
        let fill: Color = !selected ? Color(.tertiarySystemFill) : verdict == nil ? Color(.systemGray) : verdict == true ? .accentColor : .red
        return Button(action: action) {
            Text(title)
                .font(.body.weight(.semibold))
                .frame(minWidth: 40, minHeight: 40)
                .padding(.horizontal, title.count > 1 ? 8 : 0)
                .background(fill, in: .rect(cornerRadius: 10))
                .foregroundStyle(selected ? Color.white : Color.primary)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    // MARK: - Sections

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(model.student.fullName).font(.title2.bold())
            let details = [model.student.studentCode, model.student.groupName].compactMap { $0 }
            if !details.isEmpty { Text(details.joined(separator: " · ")).font(.subheadline).foregroundStyle(.secondary) }
            HStack {
                Text(model.student.status)
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 10).padding(.vertical, 4)
                    .background(Color.accentColor.opacity(0.15), in: .capsule)
                Spacer()
                Text("\(Score.display(model.student.total)) / \(Score.display(model.assignment.maxScore))")
                    .font(.title3.weight(.semibold).monospacedDigit())
            }
            if let official = model.student.publication, model.student.publicationState == "pending_correction" {
                Text("Official result \(Score.display(official.total)) until the correction is announced")
                    .font(.footnote).foregroundStyle(.orange)
            }
        }
    }

    private var conflict: some View {
        card("Changed on another device") {
            if case .conflict(let current) = model.saveState {
                LabeledContent("Current total", value: "\(Score.display(current.total)) / \(Score.display(model.assignment.maxScore))")
                LabeledContent("Current status", value: current.status)
                ForEach(model.assignment.parts) { part in
                    LabeledContent(part.title, value: current.mark(for: part.id).map { Score.display($0.score) } ?? "Not marked")
                }
                HStack {
                    Button("Use current work") { model.useLatest() }.buttonStyle(.bordered)
                    Button("Keep my changes") { model.reapply() }.buttonStyle(.borderedProminent)
                }
                Text("Your entries are kept until you choose.").font(.footnote).foregroundStyle(.secondary)
            }
        }
    }

    private var partChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(model.assignment.parts) { part in
                    let selected = part.id == model.partID
                    Button { model.selectPart(part.id) } label: {
                        VStack(spacing: 1) {
                            Text(part.title).font(.subheadline.weight(.semibold)).lineLimit(1)
                            Text("\(model.student.mark(for: part.id).map { Score.display($0.score) } ?? "–") / \(Score.display(part.maxScore))")
                                .font(.caption.monospacedDigit())
                                .opacity(0.8)
                        }
                        .padding(.horizontal, 14).padding(.vertical, 8)
                        .background(selected ? Color.accentColor : Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 12))
                        .foregroundStyle(selected ? Color.white : Color.primary)
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(selected ? .isSelected : [])
                }
            }
        }
    }

    @ViewBuilder private var questions: some View {
        card {
            HStack {
                let first = model.page * MarkingModel.pageSize
                Text("Questions \(first + 1)–\(first + model.pageQuestions.count) of \(model.questions.count)")
                    .font(.footnote.weight(.semibold)).foregroundStyle(.secondary)
                Spacer()
                Text(entered).font(.footnote.monospacedDigit()).foregroundStyle(.secondary)
            }
            ForEach(Array(model.pageQuestions.enumerated()), id: \.element.id) { offset, question in
                if offset > 0 { Divider() }
                if model.part?.kind == .writtenWork { writtenRow(question) } else { choiceRow(question) }
            }
            if model.pageCount > 1 {
                HStack {
                    Button("Previous page") { model.goToPage(model.page - 1) }.disabled(model.page == 0)
                    Spacer()
                    Text("Page \(model.page + 1) of \(model.pageCount)").font(.footnote).foregroundStyle(.secondary)
                    Spacer()
                    Button("Next page") { model.goToPage(model.page + 1) }.disabled(model.page >= model.pageCount - 1)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
        }
    }

    private func choiceRow(_ question: AssignmentDetail.Question) -> some View {
        let entry = model.entry(question.id)
        // Only a key the server sent can mark an answer right or wrong.
        let hasKey = question.choices.contains { $0.isCorrect == true }
        // Tapping the selected chip again returns the question to not entered.
        func pick(_ target: MarkingModel.Entry) { model.setEntry(question.id, entry == target ? .notEntered : target) }
        // Wraps only when the choices don't fit one line (many letters, large text).
        return HStack(alignment: .top, spacing: 10) {
            Text("\(question.position)")
                .font(.headline.monospacedDigit())
                .frame(width: 26, height: 40, alignment: .trailing)
            WrapLayout(spacing: 6) {
                ForEach(question.choices) { choice in
                    chip(choice.letter, selected: entry == .choice(choice.id), verdict: hasKey ? choice.isCorrect == true : nil,
                         label: "Question \(question.position), choice \(choice.letter)") { pick(.choice(choice.id)) }
                }
                chip("—", selected: entry == .choice(nil), label: "Question \(question.position), blank") { pick(.choice(nil)) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .disabled(!model.canEdit)
    }

    private func writtenRow(_ question: AssignmentDetail.Question) -> some View {
        let index = model.questions.firstIndex { $0.id == question.id } ?? 0
        let current = model.questionIndex == index
        let text = Binding<String>(
            get: { if case .score(let value) = model.entry(question.id) { value } else { "" } },
            set: { model.setEntry(question.id, $0.isEmpty ? .notEntered : .score($0)) }
        )
        return HStack(spacing: 12) {
            Text("\(question.position)").font(.headline.monospacedDigit()).frame(width: 30, alignment: .trailing)
            TextField("Mark", text: text)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .focused($focus, equals: question.id)
                .onChange(of: focus) { _, new in if new == question.id { model.goToQuestion(index) } }
                .padding(.horizontal, 12).frame(minHeight: 40)
                .background(Color(.tertiarySystemFill), in: .rect(cornerRadius: 10))
                .overlay { RoundedRectangle(cornerRadius: 10).stroke(Color.accentColor, lineWidth: current ? 2 : 0) }
                .accessibilityLabel("Question \(question.position) mark")
            Text("/ \(Score.display(question.maxScore))").foregroundStyle(.secondary).monospacedDigit()
                .frame(minWidth: 44, alignment: .leading)
        }
        .disabled(!model.canEdit)
    }

    private var fastMark: some View {
        card("Part mark") {
            let total = model.total
            HStack {
                TextField("Mark", text: Binding(get: { total.text }, set: { var t = model.total; t.text = $0; model.setTotal(t) }))
                    .keyboardType(.decimalPad)
                    .font(.title3.monospacedDigit())
                    .focused($focus, equals: Self.fastField)
                    .padding(.horizontal, 12).frame(minHeight: 44)
                    .background(Color(.tertiarySystemFill), in: .rect(cornerRadius: 10))
                    .accessibilityLabel("\(model.part?.title ?? "Part") mark")
                Text("/ \(Score.display(model.part?.maxScore))").foregroundStyle(.secondary).monospacedDigit()
            }
            Toggle("Excused", isOn: Binding(get: { total.excused }, set: { var t = model.total; t.excused = $0; model.setTotal(t) }))
            if total.excused {
                TextField("Reason", text: Binding(get: { total.reason }, set: { var t = model.total; t.reason = $0; model.setTotal(t) }), axis: .vertical)
                    .padding(.horizontal, 12).frame(minHeight: 44)
                    .background(Color(.tertiarySystemFill), in: .rect(cornerRadius: 10))
            }
        }
        .disabled(!model.canEdit)
    }

    @ViewBuilder private var status: some View {
        let problems = model.problems
        let message: String? = switch model.saveState {
        case .uncertain(let text), .failed(let text): text
        default: nil
        }
        if !problems.isEmpty || message != nil {
            VStack(alignment: .leading, spacing: 4) {
                ForEach(problems, id: \.self) { Text($0) }
                if let message { Text(message) }
            }
            .font(.footnote)
            .foregroundStyle(.red)
        }
    }

    // MARK: - Shortcuts

    private var entered: String {
        let count = "\(model.enteredCount) of \(model.questions.count) entered"
        return model.draftWrittenTotal.map { "\(count) · \($0) / \(Score.display(model.part?.maxScore))" } ?? count
    }

    private var showsQuickBar: Bool {
        guard focus != nil else { return false }
        return model.mode == .fast || (model.part?.kind == .writtenWork && model.mode == .byQuestion)
    }

    /// ‹ › | ✕ ½ ✓ — floating chips above the keyboard. They change the current question (or the
    /// total) and never move on their own.
    private var quickBar: some View {
        HStack(spacing: 8) {
            if model.mode == .byQuestion {
                quick("tabler-chevron-left", "Previous question", disabled: model.questionIndex == 0) { model.goToQuestion(model.questionIndex - 1) }
                quick("tabler-chevron-right", "Next question", disabled: model.questionIndex >= model.questions.count - 1) {
                    model.goToQuestion(model.questionIndex + 1)
                }
                Divider().frame(height: 20)
            }
            quick("tabler-x", "Zero", disabled: model.quickValue(.zero) == nil) { model.applyQuick(.zero) }
            quick(nil, "Half marks", text: "½", disabled: model.quickValue(.half) == nil) { model.applyQuick(.half) }
            quick("tabler-check", "Full marks", disabled: model.quickValue(.full) == nil) { model.applyQuick(.full) }
        }
        .frame(maxWidth: .infinity)
        .padding(.bottom, 6)
    }

    private func quick(_ asset: String?, _ label: String, text: String? = nil, disabled: Bool, action: @escaping () -> Void) -> some View {
        let off = disabled || !model.canEdit
        return Button(action: action) {
            Group {
                if let asset { icon(asset, size: 18) } else { Text(text ?? "").font(.body.weight(.semibold)) }
            }
            .frame(width: 52, height: 36)
            .background(.regularMaterial, in: .capsule)
            .opacity(off ? 0.4 : 1)
        }
        .buttonStyle(.plain)
        .disabled(off)
        .accessibilityLabel(label)
    }
}

/// Lays children out in rows, wrapping to the next row when one is full (large text, many choices).
struct WrapLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = rows(for: subviews, width: proposal.width ?? .infinity)
        let height = rows.reduce(0) { $0 + $1.height } + spacing * CGFloat(max(rows.count - 1, 0))
        let width = rows.map(\.width).max() ?? 0
        return CGSize(width: proposal.width ?? width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in rows(for: subviews, width: bounds.width) {
            var x = bounds.minX
            for index in row.indices {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
                x += size.width + spacing
            }
            y += row.height + spacing
        }
    }

    private struct Row { var indices: [Int] = []; var width: CGFloat = 0; var height: CGFloat = 0 }

    private func rows(for subviews: Subviews, width: CGFloat) -> [Row] {
        var rows: [Row] = [Row()]
        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            if !rows[rows.count - 1].indices.isEmpty, rows[rows.count - 1].width + spacing + size.width > width { rows.append(Row()) }
            var row = rows[rows.count - 1]
            row.width += (row.indices.isEmpty ? 0 : spacing) + size.width
            row.height = max(row.height, size.height)
            row.indices.append(index)
            rows[rows.count - 1] = row
        }
        return rows
    }
}
