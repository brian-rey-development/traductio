import Foundation

/// Finds and runs the `traductio` command that the installer links into the user's PATH.
enum CLI {
    static let installCommand =
        "curl -fsSL https://raw.githubusercontent.com/brian-rey-development/traductio/main/scripts/install.sh | sh"

    private static let pathMarker = "__TRADUCTIO_PATH__"
    private static let home = FileManager.default.homeDirectoryForCurrentUser.path

    /// Apps opened from Finder get a bare PATH, so the user's login shell is asked for the real one,
    /// which is where Node, Homebrew and ~/.local/bin live.
    static func shellPath() async -> String {
        let fallback = "\(home)/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
        let shell = ProcessInfo.processInfo.environment["SHELL"] ?? "/bin/zsh"
        let script = "printf '\\n\(pathMarker)%s\\n' \"$PATH\""
        guard let output = try? await capture(URL(fileURLWithPath: shell), ["-lic", script], environment: [:]),
              let line = output.split(separator: "\n").last(where: { $0.hasPrefix(pathMarker) })
        else { return fallback }
        return String(line.dropFirst(pathMarker.count)) + ":" + fallback
    }

    static func locate(in path: String) -> URL? {
        let candidates = path.split(separator: ":").map { "\($0)/traductio" } + ["\(home)/.traductio/bin/traductio"]
        return candidates.first { FileManager.default.isExecutableFile(atPath: $0) }.map(URL.init(fileURLWithPath:))
    }

    /// Runs a command to completion and returns everything it printed.
    static func capture(_ executable: URL, _ arguments: [String], environment: [String: String]) async throws -> String {
        let collected = LineCollector()
        let job = Job(executable: executable, arguments: arguments, environment: environment) { collected.append($0) }
        _ = try await job.run()
        return collected.text
    }
}

/// One running command whose output arrives line by line, splitting on both newlines and carriage returns.
final class Job: @unchecked Sendable {
    private let process = Process()
    private let onLine: @Sendable (String) -> Void
    private let buffer = LineBuffer()

    init(executable: URL, arguments: [String], environment: [String: String], onLine: @escaping @Sendable (String) -> Void) {
        process.executableURL = executable
        process.arguments = arguments
        process.environment = ProcessInfo.processInfo.environment.merging(environment) { $1 }
        self.onLine = onLine
    }

    /// Resolves with the exit status once the command ends.
    func run() async throws -> Int32 {
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe
        pipe.fileHandleForReading.readabilityHandler = { [buffer, onLine] handle in
            buffer.feed(handle.availableData).forEach(onLine)
        }
        return try await withCheckedThrowingContinuation { continuation in
            process.terminationHandler = { [buffer, onLine] finished in
                pipe.fileHandleForReading.readabilityHandler = nil
                buffer.feed(pipe.fileHandleForReading.readDataToEndOfFile()).forEach(onLine)
                buffer.flush().forEach(onLine)
                continuation.resume(returning: finished.terminationStatus)
            }
            do { try process.run() } catch { continuation.resume(throwing: error) }
        }
    }

    /// Same as Ctrl-C in Terminal. Finished paragraphs are already cached, so the next run resumes.
    func stop() {
        if process.isRunning { process.interrupt() }
    }
}

private final class LineBuffer: @unchecked Sendable {
    private let lock = NSLock()
    private var pending = ""

    func feed(_ data: Data) -> [String] {
        lock.withLock {
            pending += String(decoding: data, as: UTF8.self)
            var parts = pending.components(separatedBy: CharacterSet(charactersIn: "\r\n"))
            pending = parts.removeLast()
            return parts.filter { !$0.isEmpty }
        }
    }

    func flush() -> [String] {
        lock.withLock {
            defer { pending = "" }
            return pending.isEmpty ? [] : [pending]
        }
    }
}

private final class LineCollector: @unchecked Sendable {
    private let lock = NSLock()
    private var lines: [String] = []

    func append(_ line: String) { lock.withLock { lines.append(line) } }
    var text: String { lock.withLock { lines.joined(separator: "\n") } }
}
