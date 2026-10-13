// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "Traductio",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(name: "Traductio", path: "Sources/Traductio")
    ]
)
