// findmy-people: reads the People list from the Find My app via the macOS
// Accessibility API and writes whereabouts.json for /api/whereabouts.
// Needs: System Settings > Privacy & Security > Accessibility > enable
// "findmy-people" (server/bin/findmy-people). Output stays on this Mac
// (~/Library/Application Support/coelho-dashboard/whereabouts.json, never committed).
//   findmy-people            write whereabouts.json
//   findmy-people --dump     print the text it sees (debug, local only)
import AppKit
import ApplicationServices
import Foundation

let dump = CommandLine.arguments.contains("--dump")
// Family id -> name prefixes as they may appear in Find My (contact names).
// Extra aliases (e.g. an Apple ID email shown instead of a contact name) come from
// FINDMY_MAP in the git-ignored dashboard/.env: FINDMY_MAP=thiago=a@b.com;jp=João Pedro
var family: [(String, [String])] = [
  ("thiago", ["thiago", "me"]), ("gilmara", ["gilmara"]),
  ("jp", ["jp", "joão", "joao"]), ("lucas", ["lucas"]),
]
let envURL = URL(fileURLWithPath: CommandLine.arguments[0]).resolvingSymlinksInPath()
  .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent(".env")
if let env = try? String(contentsOf: envURL, encoding: .utf8) {
  for line in env.split(separator: "\n") where line.hasPrefix("FINDMY_MAP=") {
    for pair in line.dropFirst("FINDMY_MAP=".count).trimmingCharacters(in: CharacterSet(charactersIn: "\"' ")).split(separator: ";") {
      let kv = pair.split(separator: "=", maxSplits: 1).map { $0.trimmingCharacters(in: .whitespaces).lowercased() }
      if kv.count == 2, let i = family.firstIndex(where: { $0.0 == kv[0] }) { family[i].1.append(kv[1]) }
    }
  }
}

func fail(_ msg: String, _ code: Int32) -> Never {
  FileHandle.standardError.write((msg + "\n").data(using: .utf8)!)
  exit(code)
}

let opts = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
if !AXIsProcessTrustedWithOptions(opts) {
  fail("not-trusted: grant Accessibility to \(CommandLine.arguments[0])", 3)
}

func app() -> NSRunningApplication? {
  NSRunningApplication.runningApplications(withBundleIdentifier: "com.apple.findmy").first
}
if app() == nil {
  NSWorkspace.shared.open(URL(fileURLWithPath: "/System/Applications/FindMy.app"))
  for _ in 0..<20 { if app() != nil { break }; Thread.sleep(forTimeInterval: 0.5) }
  Thread.sleep(forTimeInterval: 4)
}
guard let fm = app() else { fail("findmy-not-running", 4) }
let root = AXUIElementCreateApplication(fm.processIdentifier)

func attr(_ e: AXUIElement, _ a: String) -> AnyObject? {
  var v: AnyObject?
  return AXUIElementCopyAttributeValue(e, a as CFString, &v) == .success ? v : nil
}
func children(_ e: AXUIElement) -> [AXUIElement] { (attr(e, kAXChildrenAttribute) as? [AXUIElement]) ?? [] }
func role(_ e: AXUIElement) -> String { (attr(e, kAXRoleAttribute) as? String) ?? "" }
func text(_ e: AXUIElement) -> String? {
  for a in [kAXValueAttribute, kAXTitleAttribute, kAXDescriptionAttribute] {
    if let s = attr(e, a) as? String, !s.trimmingCharacters(in: .whitespaces).isEmpty { return s }
  }
  return nil
}

// Select the People tab if a control with that title exists.
func press(_ e: AXUIElement, title: String, depth: Int = 0) -> Bool {
  if depth > 12 { return false }
  if let t = text(e), t == title, ["AXButton", "AXRadioButton", "AXTab", "AXCell", "AXStaticText"].contains(role(e)) {
    AXUIElementPerformAction(e, kAXPressAction as CFString)
    return true
  }
  for c in children(e) where press(c, title: title, depth: depth + 1) { return true }
  return false
}
_ = press(root, title: "People")
Thread.sleep(forTimeInterval: 2)

// Rows: each person's row contains name, place, and a time ("Now", "5 min. ago").
var rows: [[String]] = []
func walk(_ e: AXUIElement, depth: Int) {
  if depth > 25 { return }
  let r = role(e)
  if r == "AXRow" || r == "AXCell" || r == "AXGroup" {
    var texts: [String] = []
    func collect(_ x: AXUIElement, _ d: Int) {
      if d > 6 { return }
      if role(x) == "AXStaticText", let t = text(x) { texts.append(t) }
      for c in children(x) { collect(c, d + 1) }
    }
    collect(e, 0)
    if texts.count >= 2 && texts.count <= 6 { rows.append(texts) }
  }
  for c in children(e) { walk(c, depth: depth + 1) }
}
for w in (attr(root, kAXWindowsAttribute) as? [AXUIElement]) ?? [] { walk(w, depth: 0) }
if dump { for r in rows { print(r.joined(separator: " | ")) } }

func minutesAgo(_ s: String) -> Double? {
  let l = s.lowercased()
  if l.contains("now") { return 0 }
  let n = Double(l.components(separatedBy: CharacterSet.decimalDigits.inverted).joined()) ?? 1
  if l.contains("min") { return n }
  if l.contains("hr") || l.contains("hour") { return n * 60 }
  if l.contains("day") || l.contains("yesterday") { return n * 1440 }
  return nil
}

let iso = ISO8601DateFormatter()
var people: [String: [String: String]] = [:]
// Each text is one person: "Name, Nearby, Town, ST · 2 min ago".
var entries: [[String]] = []
for t in Set(rows.flatMap { $0 }) {
  let head = t.replacingOccurrences(of: "\u{00A0}", with: " ").components(separatedBy: ", ")
  if head.count >= 2 { entries.append([head[0], head.dropFirst().joined(separator: ", ")]) }
}
for r in entries {
  let first = r[0].lowercased()
  guard let (id, _) = family.first(where: { f in f.1.contains { first == $0 || first.hasPrefix($0 + " ") } }), people[id] == nil else { continue }
  var place = ""; var at = Date(); var sawTime = false
  // Find My uses non-breaking spaces around "·".
  let ws = CharacterSet.whitespaces.union(CharacterSet(charactersIn: "\u{00A0}\u{202F}"))
  let bits = r.dropFirst().flatMap { $0.components(separatedBy: "·") }
    .map { $0.trimmingCharacters(in: ws) }
    .map { $0.hasPrefix("Nearby,") ? String($0.dropFirst("Nearby,".count)).trimmingCharacters(in: ws) : $0 }
  for t in bits where t.lowercased() != "nearby" {
    if let m = minutesAgo(t) { at = Date().addingTimeInterval(-m * 60); sawTime = true }
    else if place.isEmpty && !t.lowercased().hasSuffix(" mi") && !t.lowercased().hasSuffix(" km") { place = t }
  }
  people[id] = ["place": place.isEmpty ? "Unknown" : place, "at": sawTime ? iso.string(from: at) : ""]
}

let out: [String: Any] = ["updatedAt": iso.string(from: Date()), "source": "findmy-ax", "people": people]
let dir = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/coelho-dashboard")
try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
let file = dir.appendingPathComponent("whereabouts.json")
let data = try JSONSerialization.data(withJSONObject: out, options: [.prettyPrinted])
if people.isEmpty { fail("no-people-found (rows=\(rows.count)); not overwriting", 5) }
try data.write(to: file, options: .atomic)
try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
print("ok people=\(people.count)")
