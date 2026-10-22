import AppKit
import Foundation

// NSWorkspace only: no screen capture, accessibility or keystroke monitoring.
func emitActivity() {
    let apps = NSWorkspace.shared.runningApplications
        .filter { $0.activationPolicy == .regular }
        .map { ["id": $0.bundleIdentifier ?? "", "name": $0.localizedName ?? "应用"] }
    let current = NSWorkspace.shared.frontmostApplication
    let data: [String: Any] = [
        "id": current?.bundleIdentifier ?? "",
        "name": current?.localizedName ?? "桌面",
        "pid": current?.processIdentifier ?? 0,
        "apps": apps
    ]
    if let encoded = try? JSONSerialization.data(withJSONObject: data),
       let line = String(data: encoded, encoding: .utf8) {
        print(line)
        fflush(stdout)
    }
}
emitActivity()
let timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in emitActivity() }
NSWorkspace.shared.notificationCenter.addObserver(
    forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main
) { _ in emitActivity() }
RunLoop.main.run()
