import SwiftUI

/// Full-height marking sheet for one student: part, By question / Fast mark, entry, feedback, Save.
struct MarkingSheet: View {
    let model: MarkingModel
    let onClose: () -> Void

    @Environment(\.scenePhase) private var scenePhase
    @FocusState private var focus: String?
    @State private var confirmLeave = false
    @State private var confirmReplace = false

    var body: some View {
        NavigationStack {
            Form {
                identity
                if model.isConflict { conflict }
                if model.assignment.parts.count > 1 { partPicker }
                if model.modes.count > 1 {
                    Picker("Entry", selection: Binding(get: { model.mode }, set: { model.selectMode($0) })) {
                        ForEach(model.modes) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                }
                if model.mode == .byQuestion, model.part?.takesAnswers == true { questions } else if model.part?.takesTotal == true { fastMark }
                Section("Feedback") {
                    TextField("Feedback", text: Binding(get: { model.feedback }, set: { model.feedback = $0 }), axis: .vertical)
                        .lineLimit(2...6)
                        .disabled(!model.canEdit)
                }
                status
            }
            .navigationTitle(model.student.fullName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { toolbar }
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

    // MARK: - Sections

    private var identity: some View {
        Section {
            VStack(alignment: .leading, spacing: 4) {
                Text(model.student.fullName).font(.title3.bold())
                let details = [model.student.studentCode, model.student.groupName].compactMap { $0 }
                if !details.isEmpty { Text(details.joined(separator: " · ")).foregroundStyle(.secondary) }
                HStack {
                    Text(model.student.status)
                    Spacer()
                    Text("\(Score.display(model.student.total)) / \(Score.display(model.assignment.maxScore))").monospacedDigit()
                }
                .font(.subheadline)
                if let official = model.student.publication, model.student.publicationState == "pending_correction" {
                    Text("Official result \(Score.display(official.total)) until the correction is announced")
                        .font(.footnote).foregroundStyle(.orange)
                }
            }
        }
    }

    private var conflict: some View {
        Section {
            if case .conflict(let current) = model.saveState {
                Text("Changed on another device").font(.headline)
                LabeledContent("Current total", value: "\(Score.display(current.total)) / \(Score.display(model.assignment.maxScore))")
                LabeledContent("Current status", value: current.status)
                ForEach(model.assignment.parts) { part in
                    LabeledContent(part.title, value: current.mark(for: part.id).map { Score.display($0.score) } ?? "Not marked")
                }
                Button("Use current work") { model.useLatest() }
                Button("Keep my changes") { model.reapply() }
            }
        } footer: {
            Text("Your entries are kept until you choose.")
        }
    }

    private var partPicker: some View {
        Picker("Part", selection: Binding(get: { model.partID }, set: { model.selectPart($0) })) {
            ForEach(model.assignment.parts) { part in Text(part.title).tag(part.id) }
        }
    }

    @ViewBuilder private var questions: some View {
        Section {
            ForEach(model.pageQuestions) { question in
                if model.part?.kind == .writtenWork { writtenRow(question) } else { choiceRow(question) }
            }
        } header: {
            HStack {
                Text("Questions \(model.page * MarkingModel.pageSize + 1)–\(model.page * MarkingModel.pageSize + model.pageQuestions.count) of \(model.questions.count)")
                Spacer()
                Text("\(model.enteredCount) entered")
            }
        } footer: {
            if model.pageCount > 1 {
                HStack {
                    Button("Previous page") { model.goToPage(model.page - 1) }.disabled(model.page == 0)
                    Spacer()
                    Button("Next page") { model.goToPage(model.page + 1) }.disabled(model.page >= model.pageCount - 1)
                }
                .font(.body)
                .padding(.top, 4)
            }
        }
        Section {
            if let draft = model.draftWrittenTotal {
                LabeledContent("Part total", value: "\(draft) / \(Score.display(model.part?.maxScore))")
            } else {
                LabeledContent("Saved part mark", value: "\(model.savedPartScore ?? "–") / \(Score.display(model.part?.maxScore))")
            }
        }
    }

    private func choiceRow(_ question: AssignmentDetail.Question) -> some View {
        let entry = model.entry(question.id)
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("\(question.position)").font(.headline.monospacedDigit())
                Spacer()
                Text(entryLabel(entry)).font(.footnote).foregroundStyle(.secondary)
            }
            WrapLayout(spacing: 8) {
                ForEach(question.choices) { choice in
                    choiceButton(choice.letter, selected: entry == .choice(choice.id),
                                 label: "Question \(question.position), choice \(choice.letter)") {
                        model.setEntry(question.id, .choice(choice.id))
                    }
                }
                choiceButton("Blank", selected: entry == .choice(nil), label: "Question \(question.position), blank") {
                    model.setEntry(question.id, .choice(nil))
                }
                choiceButton("Clear", selected: false, label: "Question \(question.position), clear") {
                    model.setEntry(question.id, .notEntered)
                }
                .disabled(entry == .notEntered)
            }
        }
        .padding(.vertical, 4)
        .disabled(!model.canEdit)
    }

    private func choiceButton(_ title: String, selected: Bool, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(.body.weight(.semibold)).frame(minWidth: 44, minHeight: 44).padding(.horizontal, title.count > 1 ? 8 : 0)
        }
        .buttonStyle(.bordered)
        .tint(selected ? .accentColor : .secondary)
        .background(selected ? Color.accentColor.opacity(0.2) : .clear, in: .rect(cornerRadius: 8))
        .accessibilityLabel(label)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func entryLabel(_ entry: MarkingModel.Entry) -> String {
        switch entry {
        case .notEntered: "Not entered"
        case .choice(nil): "Blank"
        case .choice: "Entered"
        case .score: "Entered"
        }
    }

    private func writtenRow(_ question: AssignmentDetail.Question) -> some View {
        let index = model.questions.firstIndex { $0.id == question.id } ?? 0
        let text = Binding<String>(
            get: { if case .score(let value) = model.entry(question.id) { value } else { "" } },
            set: { model.setEntry(question.id, $0.isEmpty ? .notEntered : .score($0)) }
        )
        return HStack {
            Text("\(question.position)").font(.headline.monospacedDigit()).frame(minWidth: 28, alignment: .leading)
            TextField("Mark", text: text)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .focused($focus, equals: question.id)
                .onChange(of: focus) { _, new in if new == question.id { model.goToQuestion(index) } }
                .accessibilityLabel("Question \(question.position) mark")
            Text("/ \(Score.display(question.maxScore))").foregroundStyle(.secondary).monospacedDigit()
        }
        .listRowBackground(model.questionIndex == index ? Color.accentColor.opacity(0.08) : nil)
        .disabled(!model.canEdit)
    }

    private var fastMark: some View {
        Section("Part mark") {
            let total = model.total
            HStack {
                TextField("Mark", text: Binding(get: { total.text }, set: { var t = model.total; t.text = $0; model.setTotal(t) }))
                    .keyboardType(.decimalPad)
                    .accessibilityLabel("\(model.part?.title ?? "Part") mark")
                Text("/ \(Score.display(model.part?.maxScore))").foregroundStyle(.secondary).monospacedDigit()
            }
            Toggle("Excused", isOn: Binding(get: { total.excused }, set: { var t = model.total; t.excused = $0; model.setTotal(t) }))
            if total.excused {
                TextField("Reason", text: Binding(get: { total.reason }, set: { var t = model.total; t.reason = $0; model.setTotal(t) }), axis: .vertical)
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
            Section {
                ForEach(problems, id: \.self) { Text($0) }
                if let message { Text(message) }
            }
            .foregroundStyle(.red)
        }
    }

    // MARK: - Toolbar

    @ToolbarContentBuilder private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .cancellationAction) {
            Button("Close") { if model.hasChanges || model.isUncertain { confirmLeave = true } else { onClose() } }
                .disabled(model.isSaving)
        }
        ToolbarItem(placement: .confirmationAction) {
            if model.isSaving {
                ProgressView()
            } else {
                Button(model.isUncertain ? "Retry" : "Save") { requestSave() }
                    .disabled(!model.canSave && !model.isUncertain)
            }
        }
        // Written Work quick toolbar: actions stay on the current question; navigation is explicit.
        ToolbarItemGroup(placement: .keyboard) {
            if model.part?.kind == .writtenWork, model.mode == .byQuestion, focus != nil {
                Button("Previous") { model.goToQuestion(model.questionIndex - 1) }.disabled(model.questionIndex == 0)
                Button("Next") { model.goToQuestion(model.questionIndex + 1) }.disabled(model.questionIndex >= model.questions.count - 1)
                Spacer()
                Button("Zero") { model.setCurrentScore(zero: true) }
                Button("Full marks") { model.setCurrentScore(zero: false) }
                Button("Clear") { model.clearCurrent() }
            }
        }
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
