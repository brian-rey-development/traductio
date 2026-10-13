import Foundation

/// What the app understands from the CLI's plain-text output. The formats live in src/cli and src/translate.
struct Chapter: Identifiable, Hashable {
    let number: Int
    let title: String
    let segments: Int
    var id: Int { number }
}

struct BookInfo {
    let url: URL
    let language: String?
    let segments: Int
    let chapters: [Chapter]
}

struct Progress: Equatable {
    let stage: String
    let completed: Int
    let total: Int
    let eta: String

    var fraction: Double { total == 0 ? 0 : Double(completed) / Double(total) }
}

enum OutputLine: Equatable {
    case progress(Progress)
    case done(output: URL)
    case flagged(count: Int, report: URL)
    case error(String)
    case other
}

enum Output {
    static func parse(_ line: String) -> OutputLine {
        if let progress = progress(line) { return .progress(progress) }
        if let match = line.firstMatch(of: /^Done in .* → [\w-]+: (.+\.epub)$/) {
            return .done(output: URL(fileURLWithPath: String(match.1)))
        }
        if let match = line.firstMatch(of: /^(\d+) segments flagged for review: (.+)$/) {
            return .flagged(count: Int(match.1) ?? 0, report: URL(fileURLWithPath: String(match.2)))
        }
        if let match = line.firstMatch(of: /^traductio: (.+)$/) { return .error(String(match.1)) }
        return .other
    }

    private static func progress(_ line: String) -> Progress? {
        guard let match = line.firstMatch(of: /^(Translating|Reviewing) (\d+)\/(\d+) .*ETA (\S+)$/),
              let completed = Int(match.2), let total = Int(match.3)
        else { return nil }
        let stage = match.1 == "Reviewing" ? "Reviewing" : "Translating"
        return Progress(stage: stage, completed: completed, total: total, eta: String(match.4))
    }

    static func book(_ url: URL, from text: String) -> BookInfo {
        let lines = text.split(separator: "\n").map(String.init)
        let language = lines.lazy.compactMap { $0.firstMatch(of: /^Language:\s+(\S+)/) }.first.map { String($0.1) }
        let segments = lines.lazy.compactMap { $0.firstMatch(of: /^Segments:\s+(\d+)/) }.first.flatMap { Int($0.1) }
        return BookInfo(url: url, language: language, segments: segments ?? 0, chapters: lines.compactMap(chapter))
    }

    private static func chapter(_ line: String) -> Chapter? {
        guard let match = line.firstMatch(of: /^\s+(\d+)\. (.+) \((\d+) segments\)$/),
              let number = Int(match.1), let segments = Int(match.3), segments > 0
        else { return nil }
        return Chapter(number: number, title: String(match.2), segments: segments)
    }

    /// Lines such as "✗ No model server at ..." from `traductio doctor`.
    static func problems(inDoctor text: String) -> [String] {
        text.split(separator: "\n").filter { $0.hasPrefix("✗") }.map { String($0.dropFirst(2)) }
    }
}

struct Language: Identifiable, Hashable {
    let code: String
    let name: String
    var id: String { code }

    static let all: [Language] = [
        ("es", "Spanish"), ("fr", "French"), ("de", "German"), ("it", "Italian"), ("pt", "Portuguese"),
        ("nl", "Dutch"), ("ca", "Catalan"), ("pl", "Polish"), ("cs", "Czech"), ("sv", "Swedish"),
        ("el", "Greek"), ("tr", "Turkish"), ("ru", "Russian"), ("uk", "Ukrainian"),
        ("hi", "Hindi"), ("id", "Indonesian"), ("vi", "Vietnamese"), ("zh", "Chinese"), ("ja", "Japanese"),
        ("ko", "Korean"), ("en", "English"),
    ].map(Language.init)
}
