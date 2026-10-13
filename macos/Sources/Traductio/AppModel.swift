import AppKit
import Observation

enum Screen {
    case checking
    case setup(problems: [String])
    case empty
    case ready(BookInfo)
    case running(BookInfo, Progress?)
    case finished(BookInfo, output: URL, flagged: Int, report: URL?)
    case failed(BookInfo?, message: String)
}

@MainActor
@Observable
final class AppModel {
    var screen: Screen = .checking
    var language = UserDefaults.standard.string(forKey: "language") ?? "es" {
        didSet { UserDefaults.standard.set(language, forKey: "language") }
    }
    var chapter: Int?
    var review = false

    private var cli: URL?
    private var path = ""
    private var job: Job?
    private var outcome = Outcome()

    private struct Outcome {
        var output: URL?
        var flagged = 0
        var report: URL?
        var error: String?
    }

    func checkSetup() async {
        screen = .checking
        path = await CLI.shellPath()
        guard let cli = CLI.locate(in: path) else {
            screen = .setup(problems: ["The traductio command is not installed yet."])
            return
        }
        self.cli = cli
        let report = (try? await run(["doctor"])) ?? "✗ traductio doctor could not run"
        let problems = Output.problems(inDoctor: report).filter { !$0.contains("optional") }
        screen = problems.isEmpty ? .empty : .setup(problems: problems)
    }

    func open(_ url: URL) async {
        guard url.pathExtension.lowercased() == "epub" else {
            screen = .failed(nil, message: "Traductio reads EPUB files. Convert other formats with Calibre first.")
            return
        }
        chapter = nil
        let text = (try? await run(["inspect", url.path])) ?? ""
        let book = Output.book(url, from: text)
        screen = book.segments > 0 ? .ready(book) : .failed(nil, message: "This EPUB has no readable text. It may be DRM-protected.")
    }

    func translate(_ book: BookInfo) {
        guard let cli else { return }
        outcome = Outcome()
        screen = .running(book, nil)
        let job = Job(executable: cli, arguments: arguments(for: book), environment: environment) { [weak self] line in
            Task { @MainActor in self?.handle(line, book: book) }
        }
        self.job = job
        Task {
            let status = (try? await job.run()) ?? -1
            // Lets output lines that were queued just before exit land before the result is read.
            await Task.yield()
            finish(book, status: status)
        }
    }

    func stop() { job?.stop() }

    func reset() { screen = .empty }

    private var environment: [String: String] { ["PATH": path, "TRADUCTIO_PROGRESS_EVERY": "1"] }

    private func arguments(for book: BookInfo) -> [String] {
        var arguments = ["translate", book.url.path, "--to", language]
        if let chapter { arguments += ["--chapters", String(chapter)] }
        if review { arguments.append("--review") }
        return arguments
    }

    private func handle(_ line: String, book: BookInfo) {
        switch Output.parse(line) {
        case .progress(let progress): screen = .running(book, progress)
        case .done(let output): outcome.output = output
        case .flagged(let count, let report): (outcome.flagged, outcome.report) = (count, report)
        case .error(let message): outcome.error = message
        case .other: break
        }
    }

    private func finish(_ book: BookInfo, status: Int32) {
        job = nil
        if let output = outcome.output, status == 0 {
            screen = .finished(book, output: output, flagged: outcome.flagged, report: outcome.report)
        } else if status == SIGINT || status == 130 {
            screen = .ready(book)
        } else {
            screen = .failed(book, message: outcome.error ?? "The translation stopped unexpectedly (exit code \(status)).")
        }
    }

    private func run(_ arguments: [String]) async throws -> String {
        guard let cli else { return "" }
        return try await CLI.capture(cli, arguments, environment: environment)
    }
}
