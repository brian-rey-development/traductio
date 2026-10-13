import AppKit
import SwiftUI
import UniformTypeIdentifiers

enum Brand {
    static let ink = Color(red: 0x0F / 255, green: 0x17 / 255, blue: 0x2A / 255)
    static let slate = Color(red: 0x47 / 255, green: 0x55 / 255, blue: 0x69 / 255)
    static let mist = Color(red: 0xE2 / 255, green: 0xE8 / 255, blue: 0xF0 / 255)
    static let paper = Color(red: 0xF8 / 255, green: 0xFA / 255, blue: 0xFC / 255)
    static let blue = Color(red: 0x25 / 255, green: 0x63 / 255, blue: 0xEB / 255)
}

struct ContentView: View {
    @Bindable var model: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            Header()
            content.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        }
        .padding(32)
        .frame(width: 560, height: 600)
        .background(Brand.paper)
        .foregroundStyle(Brand.ink)
        .task { await model.checkSetup() }
        .onOpenURL { url in Task { await model.open(url) } }
    }

    @ViewBuilder private var content: some View {
        switch model.screen {
        case .checking: ProgressView("Checking your setup…").frame(maxWidth: .infinity)
        case .setup(let problems): SetupView(problems: problems) { Task { await model.checkSetup() } }
        case .empty: DropZone { url in Task { await model.open(url) } }
        case .ready(let book): BookOptions(model: model, book: book)
        case .running(let book, let progress): RunningView(book: book, progress: progress, stop: model.stop)
        case .finished(let book, let output, let flagged, let report):
            FinishedView(book: book, output: output, flagged: flagged, report: report, again: model.reset)
        case .failed(_, let message): FailedView(message: message, again: model.reset)
        }
    }
}

private struct Header: View {
    var body: some View {
        HStack(spacing: 12) {
            BookMark().frame(width: 34, height: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text("Traductio").font(.system(size: 22, weight: .semibold))
                Text("Read any book in your own language").font(.callout).foregroundStyle(Brand.slate)
            }
        }
    }
}

/// The two-page logo mark, drawn from the same curves as assets/mark.svg.
struct BookMark: View {
    var body: some View {
        Canvas { context, size in
            let scale = CGAffineTransform(scaleX: size.width / 120, y: size.height / 100)
            context.fill(Self.left.applying(scale), with: .color(Color(white: 0.8)))
            context.fill(Self.right.applying(scale), with: .color(Brand.ink))
        }
    }

    private static let left = Path { path in
        path.move(to: CGPoint(x: 8, y: 10))
        path.addCurve(to: CGPoint(x: 57.5, y: 27), control1: CGPoint(x: 24, y: 9), control2: CGPoint(x: 40, y: 15))
        path.addLine(to: CGPoint(x: 57.5, y: 95))
        path.addCurve(to: CGPoint(x: 8, y: 78), control1: CGPoint(x: 43, y: 84), control2: CGPoint(x: 26, y: 78))
        path.closeSubpath()
    }

    private static let right = Path { path in
        path.move(to: CGPoint(x: 112, y: 6))
        path.addCurve(to: CGPoint(x: 62.5, y: 25), control1: CGPoint(x: 96, y: 5), control2: CGPoint(x: 79, y: 12))
        path.addLine(to: CGPoint(x: 62.5, y: 95))
        path.addCurve(to: CGPoint(x: 112, y: 75), control1: CGPoint(x: 77, y: 82), control2: CGPoint(x: 94, y: 75))
        path.closeSubpath()
    }
}

private struct Card<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 16) { content }
            .padding(24)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.white, in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Brand.mist))
    }
}

private struct DropZone: View {
    let open: (URL) -> Void
    @State private var targeted = false
    @State private var choosing = false

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "book.pages").font(.system(size: 40, weight: .light)).foregroundStyle(Brand.blue)
            Text("Drop an EPUB here").font(.title3.weight(.semibold))
            Text("DRM-free books only. Your book never leaves this Mac.").font(.callout).foregroundStyle(Brand.slate)
            Button("Choose a book…") { choosing = true }.buttonStyle(.borderedProminent).tint(Brand.blue)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(targeted ? Brand.blue.opacity(0.06) : .white, in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(targeted ? Brand.blue : Brand.mist, style: StrokeStyle(lineWidth: 1.5, dash: [7, 5])))
        .dropDestination(for: URL.self) { urls, _ in
            guard let url = urls.first else { return false }
            open(url)
            return true
        } isTargeted: { targeted = $0 }
        .fileImporter(isPresented: $choosing, allowedContentTypes: [.epub]) { result in
            if case .success(let url) = result { open(url) }
        }
    }
}

private struct BookOptions: View {
    @Bindable var model: AppModel
    let book: BookInfo

    var body: some View {
        Card {
            Label(book.url.deletingPathExtension().lastPathComponent, systemImage: "book.closed")
                .font(.headline).lineLimit(2)
            Text("\(book.segments) paragraphs, \(book.chapters.count) chapters").foregroundStyle(Brand.slate)
            Divider()
            Picker("Translate into", selection: $model.language) {
                ForEach(Language.all) { Text($0.name).tag($0.code) }
            }
            Picker("What to translate", selection: $model.chapter) {
                Text("The whole book").tag(Int?.none)
                ForEach(book.chapters) { Text("\($0.number). \($0.title)").tag(Int?.some($0.number)) }
            }
            Toggle("Polish with a second review pass (slower)", isOn: $model.review)
        }
        Text(estimate).font(.callout).foregroundStyle(Brand.slate)
        HStack {
            Button("Choose another book", action: model.reset)
            Spacer()
            Button("Translate") { model.translate(book) }
                .buttonStyle(.borderedProminent).tint(Brand.blue).keyboardShortcut(.defaultAction)
        }
    }

    /// About 13 paragraphs a minute on an M5 Pro with the default model, measured on a 500-page book.
    private var estimate: String {
        let paragraphs = model.chapter.flatMap { number in book.chapters.first { $0.number == number }?.segments } ?? book.segments
        let minutes = max(1, paragraphs / 13) * (model.review ? 2 : 1)
        let time = minutes < 90 ? "\(minutes) minutes" : "\(minutes / 60) hours"
        return "Roughly \(time) on Apple Silicon. You can stop at any time and continue later."
    }
}

private struct RunningView: View {
    let book: BookInfo
    let progress: Progress?
    let stop: () -> Void

    var body: some View {
        Card {
            Text(book.url.deletingPathExtension().lastPathComponent).font(.headline).lineLimit(2)
            if let progress {
                ProgressView(value: progress.fraction).tint(Brand.blue)
                HStack {
                    Text("\(progress.stage) \(progress.completed) of \(progress.total) paragraphs")
                    Spacer()
                    Text(progress.eta == "--" ? "Estimating time…" : "About \(progress.eta) left")
                }
                .font(.callout).foregroundStyle(Brand.slate).monospacedDigit()
            } else {
                ProgressView("Loading the model…")
            }
        }
        Text("Every finished paragraph is saved, so stopping now loses nothing.").font(.callout).foregroundStyle(Brand.slate)
        HStack {
            Spacer()
            Button("Stop", role: .cancel, action: stop)
        }
    }
}

private struct FinishedView: View {
    let book: BookInfo
    let output: URL
    let flagged: Int
    let report: URL?
    let again: () -> Void

    var body: some View {
        Card {
            Label("Your book is ready", systemImage: "checkmark.circle.fill").font(.headline).foregroundStyle(Brand.blue)
            Text(output.lastPathComponent).foregroundStyle(Brand.slate).lineLimit(2)
            if let report, flagged > 0 {
                Divider()
                Text("\(flagged) paragraphs are worth a second look.").foregroundStyle(Brand.slate)
                Button("Open the review list") { NSWorkspace.shared.open(report) }
            }
        }
        HStack {
            Button("Translate another book", action: again)
            Spacer()
            Button("Show in Finder") { NSWorkspace.shared.activateFileViewerSelecting([output]) }
            Button("Open in Books") { openInBooks(output) }.buttonStyle(.borderedProminent).tint(Brand.blue)
        }
    }

    private func openInBooks(_ url: URL) {
        guard let books = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.apple.iBooksX") else {
            NSWorkspace.shared.open(url)
            return
        }
        NSWorkspace.shared.open([url], withApplicationAt: books, configuration: NSWorkspace.OpenConfiguration())
    }
}

private struct SetupView: View {
    let problems: [String]
    let retry: () -> Void

    var body: some View {
        Card {
            Label("One more step", systemImage: "wrench.and.screwdriver").font(.headline)
            ForEach(problems, id: \.self) { Text($0).foregroundStyle(Brand.slate) }
            Text("Paste this into Terminal. It installs everything Traductio needs, including about 18 GB of models.")
            Text(CLI.installCommand)
                .font(.system(.caption, design: .monospaced)).textSelection(.enabled)
                .padding(12).frame(maxWidth: .infinity, alignment: .leading)
                .background(Brand.paper, in: RoundedRectangle(cornerRadius: 8))
            HStack {
                Button("Copy command") {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(CLI.installCommand, forType: .string)
                }
                Spacer()
                Button("Check again", action: retry).buttonStyle(.borderedProminent).tint(Brand.blue)
            }
        }
    }
}

private struct FailedView: View {
    let message: String
    let again: () -> Void

    var body: some View {
        Card {
            Label("Something went wrong", systemImage: "exclamationmark.triangle").font(.headline)
            Text(message).foregroundStyle(Brand.slate).textSelection(.enabled)
        }
        HStack {
            Spacer()
            Button("Start over", action: again).buttonStyle(.borderedProminent).tint(Brand.blue)
        }
    }
}
