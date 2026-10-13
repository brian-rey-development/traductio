import SwiftUI

@main
struct TraductioApp: App {
    @State private var model = AppModel()

    var body: some Scene {
        Window("Traductio", id: "main") {
            ContentView(model: model)
        }
        .windowResizability(.contentSize)
    }
}
