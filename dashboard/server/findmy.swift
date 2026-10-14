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
// The detail sheet's own "Close" button (not the window's red close button).
func closeDetail() {
  func find(_ e: AXUIElement, _ d: Int) -> AXUIElement? {
    if d > 12 { return nil }
    if role(e) == "AXButton", (attr(e, "AXSubrole") as? String) != "AXCloseButton",
       ((attr(e, kAXTitleAttribute) as? String)?.lowercased() == "close" || (attr(e, "AXIdentifier") as? String) == "Close") { return e }
    for c in children(e) { if let f = find(c, d + 1) { return f } }
    return nil
  }
  for w in (attr(root, kAXWindowsAttribute) as? [AXUIElement]) ?? [] {
    if let b = find(w, 0) { AXUIElementPerformAction(b, kAXPressAction as CFString); Thread.sleep(forTimeInterval: 1.2); return }
  }
}
// Tall window so the (virtualised) People list renders every person.
for w in (attr(root, kAXWindowsAttribute) as? [AXUIElement]) ?? [] {
  var size = CGSize(width: 1100, height: 900)
  if let v = AXValueCreate(.cgSize, &size) { AXUIElementSetAttributeValue(w, kAXSizeAttribute as CFString, v) }
}
closeDetail()
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

// Detail pass: selecting a person shows a card button
// "Full Name, <street or place>, Nearby, Town, ST, <time>" — the most specific label Find My has.
var homeStreet = ""
if let env = try? String(contentsOf: envURL, encoding: .utf8) {
  for line in env.split(separator: "\n") where line.hasPrefix("HOME_ADDRESS=") {
    let v = line.dropFirst("HOME_ADDRESS=".count).trimmingCharacters(in: CharacterSet(charactersIn: "\"' "))
    homeStreet = (v.components(separatedBy: ",").first ?? "").lowercased()
  }
}
func allTexts(_ e: AXUIElement, _ d: Int, _ acc: inout [(AXUIElement, String, String)]) {
  if d > 30 { return }
  if let t = text(e) { acc.append((e, role(e), t.replacingOccurrences(of: "\u{00A0}", with: " "))) }
  for c in children(e) { allTexts(c, d + 1, &acc) }
}
func starts(_ t: String, _ aliases: [String]) -> Bool {
  let l = t.lowercased()
  return aliases.contains { l.hasPrefix($0 + " ") || l.hasPrefix($0 + ",") }
}
func normStreet(_ s: String) -> String {
  s.lowercased().replacingOccurrences(of: " circle", with: " cir").replacingOccurrences(of: " street", with: " st")
    .replacingOccurrences(of: " avenue", with: " ave").replacingOccurrences(of: " drive", with: " dr").replacingOccurrences(of: " road", with: " rd")
}
if let win = (attr(root, kAXWindowsAttribute) as? [AXUIElement])?.first {
  for (id, aliases) in family where people[id] != nil {
    var acc: [(AXUIElement, String, String)] = []
    allTexts(win, 0, &acc)
    guard let row = acc.first(where: { x in x.1 == "AXStaticText" && starts(x.2, aliases) }) else { continue }
    AXUIElementPerformAction(row.0, kAXPressAction as CFString)
    Thread.sleep(forTimeInterval: 2)
    acc = []
    allTexts(win, 0, &acc)
    guard let card = acc.first(where: { x in x.1 == "AXButton" && starts(x.2, aliases) }) else { continue }
    // Open Details: the detail sheet's first comma line is the most specific label
    // (street / place, Town, ST).
    let before = Set(acc.map { $0.2 })
    AXUIElementPerformAction(card.0, kAXPressAction as CFString)
    Thread.sleep(forTimeInterval: 2)
    acc = []
    allTexts(win, 0, &acc)
    let town = people[id]?["place"] ?? ""
    let shortTown = (town.components(separatedBy: ",").first ?? town).trimmingCharacters(in: .whitespaces)
    let line = acc.first(where: { x in x.1 == "AXStaticText" && !before.contains(x.2) && x.2.contains(", ")
      && !starts(x.2, aliases) && (shortTown.isEmpty || x.2.contains(shortTown)) })?.2
    closeDetail()
    if dump { print("detail \(id): \(line == nil ? "none" : "found")") }
    guard let detail = line else { continue }
    let f = detail.components(separatedBy: ", ").map { $0.trimmingCharacters(in: .whitespaces) }
    let label = f[0]
    let isHome = label.lowercased() == "home" || (!homeStreet.isEmpty && normStreet(label).hasPrefix(normStreet(homeStreet)))
    people[id]?["place"] = isHome ? "Home" : (label == shortTown || shortTown.isEmpty ? detail : "\(label), \(shortTown)")
    people[id]?["detail"] = isHome ? "home" : "findmy"
  }
}

// The currently selected person sometimes drops out of the list read; carry their
// previous entry (with its original "at") instead of blanking them.
let prevFile = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/coelho-dashboard/whereabouts.json")
if let d = try? Data(contentsOf: prevFile), let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
   let prev = j["people"] as? [String: [String: String]] {
  for (id, v) in prev where people[id] == nil { people[id] = v }
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
