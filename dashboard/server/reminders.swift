import EventKit
import Foundation

// Reads and writes ONE Reminders list. Never fetches every list's reminders.
@main
struct RemindersGrocery {
  static func main() {
    let args = Array(CommandLine.arguments.dropFirst())
    let command = args.first ?? "list"
    let prefix = args.count > 1 ? args[1] : ""
    let extra = args.count > 2 ? args[2...].joined(separator: " ") : ""
    if prefix.isEmpty {
      emit(["ok": false, "error": "missing list prefix"], code: 1)
    }

    let store = EKEventStore()
    var granted = false
    var accessError = ""
    wait { done in
      if #available(macOS 14.0, *) {
        store.requestFullAccessToReminders { ok, err in
          granted = ok
          accessError = err?.localizedDescription ?? ""
          done()
        }
      } else {
        store.requestAccess(to: .reminder) { ok, err in
          granted = ok
          accessError = err?.localizedDescription ?? ""
          done()
        }
      }
    }
    if !granted {
      let why = accessError.isEmpty ? "Reminders permission denied" : accessError
      emit(["ok": false, "error": why], code: 1)
    }

    let calendars = store.calendars(for: .reminder)
    guard let calendar = calendars.first(where: { $0.title.hasPrefix(prefix) }) else {
      emit(["ok": false, "error": "No Reminders list starting with \(prefix)"], code: 1)
    }

    if command == "add" {
      let title = extra.trimmingCharacters(in: .whitespacesAndNewlines)
      if title.isEmpty { emit(["ok": false, "error": "missing title"], code: 1) }
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
      if wanted.isEmpty { emit(["ok": false, "error": "missing id"], code: 1) }
      var found: EKReminder?
      let pred = store.predicate(forRemindersIn: [calendar])
      wait { done in
        store.fetchReminders(matching: pred) { items in
          found = items?.first { item in
            item.calendarItemExternalIdentifier == wanted || item.calendarItemIdentifier == wanted
          }
          done()
        }
      }
      guard let reminder = found else {
        emit(["ok": false, "error": "reminder not found in \(calendar.title)"], code: 1)
      }
      reminder.isCompleted = true
      do {
        try store.save(reminder, commit: true)
      } catch {
        emit(["ok": false, "error": error.localizedDescription], code: 1)
      }
    } else if command != "list" {
      emit(["ok": false, "error": "unknown command"], code: 1)
    }

    var rows: [[String: String]] = []
    // Incomplete items in this list only. A nil due-date predicate has dropped
    // undated reminders on some macOS versions, so filter isCompleted instead.
    let openPred = store.predicate(forRemindersIn: [calendar])
    wait { done in
      store.fetchReminders(matching: openPred) { items in
        rows = (items ?? []).filter { !$0.isCompleted }.map { item in
          let external = item.calendarItemExternalIdentifier
          let id = external.isEmpty ? item.calendarItemIdentifier : external
          return ["id": id, "title": item.title ?? "", "notes": item.notes ?? ""]
        }
        done()
      }
    }
    emit(["ok": true, "list": calendar.title, "items": rows], code: 0)
  }

  // EventKit delivers callbacks on the main queue. Spin the run loop instead of
  // blocking it, or the permission prompt never returns.
  static func wait(_ body: (@escaping () -> Void) -> Void) {
    let group = DispatchGroup()
    group.enter()
    body { group.leave() }
    let deadline = Date().addingTimeInterval(25)
    while group.wait(timeout: .now()) == .timedOut {
      RunLoop.current.run(mode: .default, before: Date(timeIntervalSinceNow: 0.05))
      if Date() > deadline { break }
    }
  }

  static func emit(_ obj: [String: Any], code: Int32) -> Never {
    let data = (try? JSONSerialization.data(withJSONObject: obj)) ?? Data("{\"ok\":false}".utf8)
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data([0x0A]))
    exit(code)
  }
}
