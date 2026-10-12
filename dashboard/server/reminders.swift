import EventKit
import Foundation

// Reads and writes ONE Reminders list. Never fetches every list's reminders.
struct RemindersGrocery {
  static func main() {
    let args = Array(CommandLine.arguments.dropFirst())
    let command = args.first ?? "list"
    let prefix = args.count > 1 ? args[1] : ""
    let extra = args.count > 2 ? args[2...].joined(separator: " ") : ""
    if prefix.isEmpty {
      emit(["ok": false, "error": "missingPrefix"], code: 1)
    }

    let store = EKEventStore()
    if !ensureAccess(store) {
      emit(["ok": false, "error": accessCode()], code: 1)
    }

    let calendars = store.calendars(for: .reminder)
    guard let calendar = calendars.first(where: { $0.title.hasPrefix(prefix) }) else {
      emit(["ok": false, "error": "noList"], code: 1)
    }

    if command == "add" {
      let title = extra.trimmingCharacters(in: .whitespacesAndNewlines)
      if title.isEmpty { emit(["ok": false, "error": "missingTitle"], code: 1) }
      let reminder = EKReminder(eventStore: store)
      reminder.title = title
      reminder.calendar = calendar
      do {
        try store.save(reminder, commit: true)
      } catch {
        emit(["ok": false, "error": error.localizedDescription], code: 1)
      }
    } else if command == "complete" {
      let wanted = extra.trimmingCharacters(in: .whitespacesAndNewlines)
      if wanted.isEmpty { emit(["ok": false, "error": "missingId"], code: 1) }
      var found: EKReminder?
      let pred = store.predicateForReminders(in: [calendar])
      let finished = wait(seconds: 7) { done in
        store.fetchReminders(matching: pred) { items in
          found = items?.first { item in
            item.calendarItemExternalIdentifier == wanted || item.calendarItemIdentifier == wanted
          }
          done()
        }
      }
      if !finished { emit(["ok": false, "error": "timeout"], code: 1) }
      guard let reminder = found else {
        emit(["ok": false, "error": "notFound"], code: 1)
      }
      reminder.isCompleted = true
      do {
        try store.save(reminder, commit: true)
      } catch {
        emit(["ok": false, "error": error.localizedDescription], code: 1)
      }
    } else if command == "history" {
      // history <prefix> [days]: titles of reminders COMPLETED in the last N days (default 90).
      let days = Double(args.count > 2 ? args[2] : "90") ?? 90
      let start = Date().addingTimeInterval(-days * 86400)
      let pred = store.predicateForCompletedReminders(withCompletionDateStarting: start, ending: Date(), calendars: [calendar])
      var rows: [[String: String]] = []
      let iso = ISO8601DateFormatter()
      let ok = wait(seconds: 10) { done in
        store.fetchReminders(matching: pred) { items in
          rows = (items ?? []).map { item in
            ["title": item.title ?? "", "completed": item.completionDate.map { iso.string(from: $0) } ?? ""]
          }
          done()
        }
      }
      if !ok { emit(["ok": false, "error": "timeout"], code: 1) }
      emit(["ok": true, "list": calendar.title, "history": rows], code: 0)
    } else if command == "setnotes" {
      // setnotes <prefix> <id> <base64 notes>: replaces ONLY the notes of one
      // incomplete reminder. Title, completion and dates are never touched.
      let wanted = args.count > 2 ? args[2] : ""
      let b64 = args.count > 3 ? args[3] : ""
      guard !wanted.isEmpty, let raw = Data(base64Encoded: b64), let notes = String(data: raw, encoding: .utf8) else {
        emit(["ok": false, "error": "badArgs"], code: 1)
      }
      var found: EKReminder?
      let pred = store.predicateForReminders(in: [calendar])
      let finished = wait(seconds: 7) { done in
        store.fetchReminders(matching: pred) { items in
          found = items?.first { item in
            item.calendarItemExternalIdentifier == wanted || item.calendarItemIdentifier == wanted
          }
          done()
        }
      }
      if !finished { emit(["ok": false, "error": "timeout"], code: 1) }
      guard let reminder = found else { emit(["ok": false, "error": "notFound"], code: 1) }
      if reminder.isCompleted { emit(["ok": false, "error": "completed"], code: 1) }
      reminder.notes = notes
      do {
        try store.save(reminder, commit: true)
      } catch {
        emit(["ok": false, "error": error.localizedDescription], code: 1)
      }
    } else if command != "list" {
      emit(["ok": false, "error": "unknownCommand"], code: 1)
    }

    var rows: [[String: String]] = []
    // Incomplete items in this list only. A nil due-date predicate has dropped
    // undated reminders on some macOS versions, so filter isCompleted instead.
    let openPred = store.predicateForReminders(in: [calendar])
    let listed = wait(seconds: 7) { done in
      store.fetchReminders(matching: openPred) { items in
        rows = (items ?? []).filter { !$0.isCompleted }.map { item in
          let external = item.calendarItemExternalIdentifier
          let id = (external?.isEmpty == false) ? external! : item.calendarItemIdentifier
          return ["id": id, "title": item.title ?? "", "notes": item.notes ?? ""]
        }
        done()
      }
    }
    if !listed { emit(["ok": false, "error": "timeout"], code: 1) }
    emit(["ok": true, "list": calendar.title, "items": rows], code: 0)
  }

  // Short status the server can show on /api/grocery. fullAccess and authorized
  // can read; anything else is returned as the error instead of waiting forever.
  static func accessCode() -> String {
    let status = EKEventStore.authorizationStatus(for: .reminder)
    if #available(macOS 14.0, *) {
      switch status {
      case .fullAccess: return "fullAccess"
      case .writeOnly: return "writeOnly"
      case .authorized: return "authorized"
      case .denied: return "denied"
      case .restricted: return "restricted"
      case .notDetermined: return "notDetermined"
      @unknown default: return "unknown"
      }
    } else {
      switch status {
      case .authorized: return "authorized"
      case .denied: return "denied"
      case .restricted: return "restricted"
      case .notDetermined: return "notDetermined"
      default: return "unknown"
      }
    }
  }

  static func canRead(_ code: String) -> Bool {
    return code == "fullAccess" || code == "authorized"
  }

  static func ensureAccess(_ store: EKEventStore) -> Bool {
    if canRead(accessCode()) { return true }
    let code = accessCode()
    if code == "denied" || code == "restricted" { return false }
    let finished = wait(seconds: 7) { done in
      if #available(macOS 14.0, *) {
        store.requestFullAccessToReminders { _, _ in done() }
      } else {
        store.requestAccess(to: .reminder) { _, _ in done() }
      }
    }
    if canRead(accessCode()) { return true }
    if !finished && accessCode() == "notDetermined" { return false }
    return false
  }

  // EventKit delivers callbacks on the main queue. Spin the run loop instead of
  // blocking it, or the permission prompt never returns. Give up after `seconds`
  // so the process prints JSON instead of sitting on a dialog.
  static func wait(seconds: TimeInterval, _ body: (@escaping () -> Void) -> Void) -> Bool {
    let group = DispatchGroup()
    group.enter()
    body { group.leave() }
    let deadline = Date().addingTimeInterval(seconds)
    while group.wait(timeout: .now()) == .timedOut {
      RunLoop.current.run(mode: .default, before: Date(timeIntervalSinceNow: 0.05))
      if Date() > deadline { return false }
    }
    return true
  }

  static func emit(_ obj: [String: Any], code: Int32) -> Never {
    let data = (try? JSONSerialization.data(withJSONObject: obj)) ?? Data("{\"ok\":false,\"error\":\"unknown\"}".utf8)
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data([0x0A]))
    exit(code)
  }
}

RemindersGrocery.main()
