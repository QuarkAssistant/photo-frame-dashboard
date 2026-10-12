// Fallback when swiftc is unavailable. Queries a single Reminders list.
function run(argv) {
  var cmd = String(argv[0] || 'list');
  var prefix = String(argv[1] || '');
  var extra = argv.slice(2).join(' ');
  function emit(obj) {
    return JSON.stringify(obj);
  }
  try {
    if (!prefix) return emit({ ok: false, error: 'missing list prefix' });
    var Reminders = Application('Reminders');
    var lists = Reminders.lists();
    var list = null;
    var listName = '';
    for (var i = 0; i < lists.length; i++) {
      var name = String(lists[i].name());
      if (name.indexOf(prefix) === 0) {
        list = lists[i];
        listName = name;
        break;
      }
    }
    if (!list) return emit({ ok: false, error: 'No Reminders list starting with ' + prefix });

    if (cmd === 'add') {
      var title = extra.replace(/^\s+|\s+$/g, '');
      if (!title) return emit({ ok: false, error: 'missing title' });
      list.reminders.push(Reminders.Reminder({ name: title }));
    } else if (cmd === 'complete') {
      var wanted = extra.replace(/^\s+|\s+$/g, '');
      if (!wanted) return emit({ ok: false, error: 'missing id' });
      var all = list.reminders();
      var hit = null;
      for (var j = 0; j < all.length; j++) {
        if (String(all[j].id()) === wanted) { hit = all[j]; break; }
      }
      if (!hit) return emit({ ok: false, error: 'reminder not found in ' + listName });
      hit.completed = true;
    } else if (cmd !== 'list') {
      return emit({ ok: false, error: 'unknown command' });
    }

    var open = list.reminders.whose({ completed: false })();
    var items = [];
    for (var k = 0; k < open.length; k++) {
      items.push({
        id: String(open[k].id()),
        title: String(open[k].name() || ''),
        notes: String(open[k].body() || ''),
      });
    }
    return emit({ ok: true, list: listName, items: items });
  } catch (err) {
    return emit({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}
