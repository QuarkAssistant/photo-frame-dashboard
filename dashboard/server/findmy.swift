// findmy-people: reads the People list from the Find My app via the macOS
// Accessibility API and writes whereabouts.json for /api/whereabouts.
// Needs: System Settings > Privacy & Security > Accessibility > enable
// "findmy-people" (server/bin/findmy-people). Output stays on this Mac
// (~/Library/Application Support/coelho-dashboard/whereabouts.json, never committed).
//   findmy-people            write whereabouts.json
//   findmy-people --dump     print the text it sees (debug, local only)
//   findmy-people --selftest run the pure parsing/selection checks (no Find My needed)
// Preferred device per person (optional, git-ignored .env):
//   FINDMY_DEVICE=lucas=<device name as shown in Find My>;jp=<...>
//   FINDMY_DEVICE_MAX_AGE_MIN=30   (default 30)
//   FINDMY_DEVICE_PRIMARY=jp       (device is main location for these ids; no max age)
// The device's row in the Devices tab is used when it is no older than the max age;
// otherwise the People-tab location is kept. Each person records "source":
// "people" or "device". Any Accessibility failure keeps the People result.
import AppKit
import ApplicationServices
import Foundation

let dump = CommandLine.arguments.contains("--dump")
// --stats: counts and sources only (no places), safe to paste in logs.
let stats = CommandLine.arguments.contains("--stats")
func stat(_ m: String) { if stats { FileHandle.standardError.write(("stats: " + m + "\n").data(using: .utf8)!) } }
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

var preferredDevice: [String: String] = [:]
var deviceMaxAgeMin = 30.0
// FINDMY_DEVICE_PRIMARY=gilmara;...  -> that person's device is their main location (no max age).
var primaryDevice: Set<String> = []
if let env = try? String(contentsOf: envURL, encoding: .utf8) {
  for line in env.split(separator: "\n") {
    let strip = CharacterSet(charactersIn: "\"' ")
    if line.hasPrefix("FINDMY_DEVICE=") {
      for pair in line.dropFirst("FINDMY_DEVICE=".count).trimmingCharacters(in: strip).split(separator: ";") {
        let kv = pair.split(separator: "=", maxSplits: 1).map { $0.trimmingCharacters(in: .whitespaces) }
        if kv.count == 2, !kv[1].isEmpty { preferredDevice[kv[0].lowercased()] = kv[1] }
      }
    } else if line.hasPrefix("FINDMY_DEVICE_PRIMARY=") {
      for id in line.dropFirst("FINDMY_DEVICE_PRIMARY=".count).trimmingCharacters(in: strip).split(whereSeparator: { $0 == ";" || $0 == "," }) {
        primaryDevice.insert(id.trimmingCharacters(in: .whitespaces).lowercased())
      }
    } else if line.hasPrefix("FINDMY_DEVICE_MAX_AGE_MIN="),
              let v = Double(line.dropFirst("FINDMY_DEVICE_MAX_AGE_MIN=".count).trimmingCharacters(in: strip)), v > 0 {
      deviceMaxAgeMin = v
    }
  }
}

// Pure helpers (covered by --selftest).
func minutesAgo(_ s: String) -> Double? {
  let l = s.lowercased()
  if l.contains("now") { return 0 }
  let n = Double(l.components(separatedBy: CharacterSet.decimalDigits.inverted).joined()) ?? 1
  if l.contains("min") { return n }
  if l.contains("hr") || l.contains("hour") { return n * 60 }
  if l.contains("day") || l.contains("yesterday") { return n * 1440 }
  if l.contains("yr") || l.contains("year") { return n * 525600 }
  return nil
}
let wsAll = CharacterSet.whitespaces.union(CharacterSet(charactersIn: "\u{00A0}\u{202F}"))
func isDistance(_ t: String) -> Bool {
  let l = t.lowercased()
  return [" m", " mi", " km", " ft"].contains { l.hasSuffix($0) } && l.first?.isNumber == true
}
// Devices-tab row: "Device Name, [Nearby,] [210 m,] Place, ST · 8 hr ago".
// Returns (place, minutes) or nil when the row has no location/time.
func parseDeviceRow(_ raw: String, name: String) -> (String, Double)? {
  let t = raw.replacingOccurrences(of: "\u{00A0}", with: " ")
  // Rows can carry extra "· <battery status>" segments after the time; use the first "·".
  guard t.lowercased().hasPrefix(name.lowercased() + ","), let dot = t.range(of: "·") else { return nil }
  guard let mins = t[dot.upperBound...].components(separatedBy: "·").lazy
    .compactMap({ minutesAgo($0.trimmingCharacters(in: wsAll)) }).first else { return nil }
  let body = String(t[t.index(t.startIndex, offsetBy: name.count + 1)..<dot.lowerBound])
  let parts = body.components(separatedBy: ",").map { $0.trimmingCharacters(in: wsAll) }
    .filter { !$0.isEmpty && $0.lowercased() != "nearby" && !isDistance($0) }
  guard !parts.isEmpty else { return nil }
  return (parts.joined(separator: ", "), mins)
}
func useDevice(minutes: Double?, maxAge: Double) -> Bool { minutes.map { $0 <= maxAge } ?? false }

if CommandLine.arguments.contains("--selftest") {
  var bad = 0
  func check(_ c: Bool, _ m: String) { if !c { bad += 1; print("FAIL", m) } }
  let r1 = parseDeviceRow("Watch X, 210 m, Springfield, IL \u{00B7} 8 hr ago", name: "Watch X")
  check(r1?.0 == "Springfield, IL" && r1?.1 == 480, "row with distance")
  let r2 = parseDeviceRow("Watch X, Nearby, Springfield, IL \u{00B7} Now", name: "Watch X")
  check(r2?.0 == "Springfield, IL" && r2?.1 == 0, "nearby now")
  check(parseDeviceRow("Watch X, No location found", name: "Watch X") == nil, "no location")
  check(parseDeviceRow("Phone Y, Springfield, IL \u{00B7} Now", name: "Watch X") == nil, "other device")
  check(parseDeviceRow("Watch X, Springfield, IL \u{00B7} 12 min ago", name: "watch x")?.1 == 12, "case-insensitive")
  check(useDevice(minutes: 30, maxAge: 30) && !useDevice(minutes: 31, maxAge: 30) && !useDevice(minutes: nil, maxAge: 30), "age rule")
  check(parseDeviceRow("Phone Y, Nearby, Springfield, IL \u{00B7} 1 hr ago \u{00B7} Battery Low", name: "Phone Y")?.1 == 60, "battery suffix")
  check(useDevice(minutes: 99999, maxAge: .infinity) && !useDevice(minutes: nil, maxAge: .infinity), "primary rule")
  print(bad == 0 ? "selftest ok" : "selftest failed \(bad)")
  exit(bad == 0 ? 0 : 1)
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
func clickCenter(_ e: AXUIElement) -> Bool {
  var p = CGPoint.zero; var sz = CGSize.zero
  guard let pv = attr(e, kAXPositionAttribute), let sv = attr(e, kAXSizeAttribute),
        AXValueGetValue(pv as! AXValue, .cgPoint, &p), AXValueGetValue(sv as! AXValue, .cgSize, &sz), sz.width > 0 else { return false }
  let c = CGPoint(x: p.x + sz.width / 2, y: p.y + sz.height / 2)
  for t in [CGEventType.leftMouseDown, .leftMouseUp] {
    CGEvent(mouseEventSource: nil, mouseType: t, mouseCursorPosition: c, mouseButton: .left)?.post(tap: .cghidEventTap)
    usleep(80_000)
  }
  return true
}
func findEl(_ e: AXUIElement, _ d: Int = 0, _ f: (AXUIElement) -> Bool) -> AXUIElement? {
  if d > 40 { return nil }
  if f(e) { return e }
  for c in children(e) { if let r = findEl(c, d + 1, f) { return r } }
  return nil
}
func findAll(_ e: AXUIElement, _ d: Int = 0, _ f: (AXUIElement) -> Bool) -> [AXUIElement] {
  if d > 40 { return [] }
  var r = f(e) ? [e] : []
  for c in children(e) { r += findAll(c, d + 1, f) }
  return r
}
func tab(_ title: String) -> Bool {
  guard let r = findEl(root, 0, { role($0) == "AXRadioButton" && text($0) == title }) else { return false }
  // A real click: AXPress flips the radio's value without switching the content.
  if (attr(r, kAXValueAttribute) as? NSNumber)?.intValue == 1, title != "People" || findEl(root, 0, { role($0) == "AXHeading" && text($0) == "People" }) != nil { return true }
  if !clickCenter(r) { return false }
  Thread.sleep(forTimeInterval: 2.5)
  return true
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
fm.activate()
Thread.sleep(forTimeInterval: 1)
if !tab("People") { _ = press(root, title: "People") }
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
stat("rows=\(rows.count)")

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
  people[id] = ["place": place.isEmpty ? "Unknown" : place, "at": sawTime ? iso.string(from: at) : "", "source": "people"]
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

stat("people-tab matched=\(people.keys.sorted()) preferred=\(preferredDevice.keys.sorted())")
// A point over the Devices side list (left column, mid-height of the Find My window).
func listPoint() -> CGPoint? {
  guard let w = (attr(root, "AXWindows") as? [AXUIElement])?.first,
        let pv = attr(w, kAXPositionAttribute), let sv = attr(w, kAXSizeAttribute) else { return nil }
  var p = CGPoint.zero; var sz = CGSize.zero
  AXValueGetValue(pv as! AXValue, .cgPoint, &p); AXValueGetValue(sv as! AXValue, .cgSize, &sz)
  return CGPoint(x: p.x + 150, y: p.y + sz.height / 2)
}
func scrollList(_ dy: Int32) {
  guard let pt = listPoint() else { return }
  CGWarpMouseCursorPosition(pt)
  CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 1, wheel1: dy, wheel2: 0, wheel3: 0)?.post(tap: .cghidEventTap)
}
// Preferred-device pass (Devices tab). Never throws away the People result.
if !preferredDevice.isEmpty {
  fm.activate()
  Thread.sleep(forTimeInterval: 1)
  let onDevices = tab("Devices")
  stat("devices-tab=\(onDevices)")
  if onDevices {
    for (id, name) in preferredDevice where family.contains(where: { $0.0 == id }) {
      var row: String? = nil
      var rowEl: AXUIElement? = nil
      // Start from the top of the (virtualised) list: earlier passes may have left it scrolled down.
      for _ in 0..<8 { scrollList(600); Thread.sleep(forTimeInterval: 0.2) }
      Thread.sleep(forTimeInterval: 0.6)
      for step in 0..<20 {
        let cands = findAll(root, 0, { ["AXStaticText", "AXButton"].contains(role($0)) && (text($0)?.lowercased().hasPrefix(name.lowercased() + ",") ?? false) })
        if let e = cands.first(where: { parseDeviceRow(text($0) ?? "", name: name) != nil }) ?? cands.first(where: { role($0) == "AXStaticText" }) {
          row = text(e); rowEl = e; break
        }
        // Scroll the side list (virtualised): down first, then back up.
        guard step < 19, listPoint() != nil else { break }
        scrollList(step < 9 ? -300 : 300)
        Thread.sleep(forTimeInterval: 0.8)
      }
      stat("device \(id) row=\(row != nil)")
      let parsed = row.flatMap { parseDeviceRow($0, name: name) }
      if dump { print("device \(id): \(parsed == nil ? "none" : "age=\(Int(parsed!.1))m")") }
      if let (place, mins) = parsed, useDevice(minutes: mins, maxAge: primaryDevice.contains(id) ? .infinity : deviceMaxAgeMin) {
        let short = (place.components(separatedBy: ",").first ?? place).trimmingCharacters(in: .whitespaces)
        var entry: [String: String] = ["place": place, "at": iso.string(from: Date().addingTimeInterval(-mins * 60)), "source": "device"]
        // Selecting the row shows a card "Name, Open Details, [dist,] <street or place>, Town, <time>".
        if let e = rowEl, clickCenter(e) {
          Thread.sleep(forTimeInterval: 2)
          if let card = findEl(root, 0, { role($0) == "AXButton" && (text($0)?.lowercased().hasPrefix(name.lowercased() + ", open details") ?? false) }),
             let ct = text(card) {
            let f = ct.replacingOccurrences(of: "\u{00A0}", with: " ").components(separatedBy: ", ").map { $0.trimmingCharacters(in: wsAll) }
              .dropFirst(2).filter { !isDistance($0) && $0.lowercased() != "nearby" }
            if let label = f.first, f.count >= 3 {
              let isHome = label.lowercased() == "home" || (!homeStreet.isEmpty && normStreet(label).hasPrefix(normStreet(homeStreet)))
              entry["place"] = isHome ? "Home" : (label == short ? place : "\(label), \(short)")
              entry["detail"] = isHome ? "home" : "findmy"
            }
          }
        }
        if short.lowercased() == "home" { entry["place"] = "Home"; entry["detail"] = "home" }
        people[id] = entry
      } else if people[id] != nil {
        people[id]?["source"] = "people"
        people[id]?["deviceStale"] = parsed == nil ? "unavailable" : "\(Int(parsed!.1))m"
      }
    }
  }
  stat("back-to-people=\(tab("People"))")
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
