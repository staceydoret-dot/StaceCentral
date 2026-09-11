/**
 * JXA (JavaScript for Automation) program driving the Reminders app.
 *
 * It ships as a string rather than a separate asset so the compiled package has
 * no runtime file-resolution problems. The host writes it to a temp file and
 * runs `osascript -l JavaScript <file> <json-payload>`.
 *
 * Performance note: reading a property off a *collection* (`rs.name()`) costs a
 * single Apple Event and returns an array, whereas looping over reminders costs
 * one event each. Every read here is written in the bulk form, which keeps a
 * list of thousands of reminders to roughly ten events instead of thousands.
 *
 * Keep this ES5-flavoured and free of backticks: it runs in Apple's JXA engine,
 * and it lives inside a TypeScript template literal.
 */
export const JXA_SCRIPT = String.raw`
function run(argv) {
  var input;
  try {
    input = JSON.parse(argv[0]);
  } catch (e) {
    return JSON.stringify({ ok: false, error: 'Could not parse input payload.' });
  }

  try {
    return JSON.stringify({ ok: true, data: dispatch(input) });
  } catch (e) {
    return JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e) });
  }

  function dispatch(req) {
    var app = Application('Reminders');
    switch (req.op) {
      case 'ping': return pingOp(app);
      case 'lists': return listsOp(app);
      case 'query': return queryOp(app, req);
      case 'get': return getOp(app, req);
      case 'create': return createOp(app, req);
      case 'update': return updateOp(app, req);
      case 'delete': return deleteOp(app, req);
      default: throw new Error('Unknown operation: ' + req.op);
    }
  }

  // --- helpers -------------------------------------------------------------

  function iso(value) {
    if (!value) return null;
    try { return new Date(value).toISOString(); } catch (e) { return null; }
  }

  // Reads one property across a whole collection, falling back to a per-item
  // loop if the app refuses the bulk form for that property (older macOS
  // versions don't expose 'flagged' at all, for example).
  function bulk(collection, prop, count) {
    try {
      var values = collection[prop]();
      if (values && values.length === count) return values;
    } catch (e) { /* fall through */ }
    var out = [];
    for (var i = 0; i < count; i++) {
      try { out.push(collection[i][prop]()); } catch (e2) { out.push(null); }
    }
    return out;
  }

  function priorityToName(value) {
    if (!value) return 'none';
    if (value <= 4) return 'high';
    if (value === 5) return 'medium';
    return 'low';
  }

  function priorityToNumber(name) {
    if (name === 'high') return 1;
    if (name === 'medium') return 5;
    if (name === 'low') return 9;
    return 0;
  }

  function listsOf(app) {
    var lists = app.lists;
    var count = lists.length;
    var ids = bulk(lists, 'id', count);
    var names = bulk(lists, 'name', count);
    var out = [];
    for (var i = 0; i < count; i++) {
      out.push({ id: String(ids[i]), name: String(names[i]), ref: lists[i] });
    }
    return out;
  }

  // Resolves a user-supplied list name or id to a concrete list entry.
  function resolveList(app, wanted) {
    var lists = listsOf(app);
    if (!wanted) {
      var fallback = null;
      try { fallback = app.defaultList(); } catch (e) { fallback = null; }
      if (fallback) {
        return { id: String(fallback.id()), name: String(fallback.name()), ref: fallback };
      }
      if (!lists.length) throw new Error('No Reminders lists exist on this Mac.');
      return lists[0];
    }
    var needle = String(wanted).toLowerCase();
    for (var i = 0; i < lists.length; i++) {
      if (lists[i].id === wanted || lists[i].name.toLowerCase() === needle) return lists[i];
    }
    throw new Error('No Reminders list named "' + wanted + '".');
  }

  // Reads every reminder in one list. When openOnly is set we ask the app to
  // pre-filter, which matters because completed reminders accumulate for years
  // and we would otherwise haul the whole archive across for every query.
  function readList(entry, openOnly) {
    var collection = entry.ref.reminders;
    if (openOnly) {
      try {
        var filtered = entry.ref.reminders.whose({ completed: false });
        if (filtered.length >= 0) collection = filtered;
      } catch (e) { /* app refused the filter; read everything instead */ }
    }

    var count = collection.length;
    if (!count) return [];

    var ids = bulk(collection, 'id', count);
    var names = bulk(collection, 'name', count);
    var bodies = bulk(collection, 'body', count);
    var completed = bulk(collection, 'completed', count);
    var completionDates = bulk(collection, 'completionDate', count);
    var dueDates = bulk(collection, 'dueDate', count);
    var alldayDueDates = bulk(collection, 'alldayDueDate', count);
    var priorities = bulk(collection, 'priority', count);
    var flags = bulk(collection, 'flagged', count);
    var created = bulk(collection, 'creationDate', count);
    var modified = bulk(collection, 'modificationDate', count);

    var out = [];
    for (var i = 0; i < count; i++) {
      var allDayDue = iso(alldayDueDates[i]);
      var timedDue = iso(dueDates[i]);
      out.push({
        id: String(ids[i]),
        listId: entry.id,
        listName: entry.name,
        title: names[i] === null || names[i] === undefined ? '' : String(names[i]),
        notes: bodies[i] ? String(bodies[i]) : undefined,
        completed: !!completed[i],
        completedAt: iso(completionDates[i]) || undefined,
        dueAt: (allDayDue || timedDue) || undefined,
        allDay: allDayDue ? true : false,
        priority: priorityToName(priorities[i]),
        flagged: flags[i] === null || flags[i] === undefined ? undefined : !!flags[i],
        createdAt: iso(created[i]) || undefined,
        modifiedAt: iso(modified[i]) || undefined
      });
    }
    return out;
  }

  // Locates a reminder by id without a slow per-item scan: pull the id array
  // for each list and index straight into the match.
  function findReminder(app, id) {
    var lists = listsOf(app);
    for (var i = 0; i < lists.length; i++) {
      var collection = lists[i].ref.reminders;
      var count = collection.length;
      if (!count) continue;
      var ids = bulk(collection, 'id', count);
      for (var j = 0; j < count; j++) {
        if (String(ids[j]) === id) {
          return { ref: collection[j], list: lists[i] };
        }
      }
    }
    throw new Error('No reminder with id ' + id + '.');
  }

  function readOne(app, id) {
    var found = findReminder(app, id);
    var matches = readList(found.list, false);
    for (var i = 0; i < matches.length; i++) {
      if (matches[i].id === id) return matches[i];
    }
    throw new Error('No reminder with id ' + id + '.');
  }

  function applyDue(ref, dueAt, allDay) {
    if (dueAt === null) {
      try { ref.dueDate = null; } catch (e) { /* already clear */ }
      try { ref.alldayDueDate = null; } catch (e) { /* already clear */ }
      return;
    }
    if (dueAt === undefined) return;
    var when = new Date(dueAt);
    if (allDay) {
      // Clear the timed field first, or the app keeps showing the old time.
      try { ref.dueDate = null; } catch (e) { /* ignore */ }
      ref.alldayDueDate = when;
    } else {
      try { ref.alldayDueDate = null; } catch (e) { /* ignore */ }
      ref.dueDate = when;
    }
  }

  // --- operations ----------------------------------------------------------

  function pingOp(app) {
    return { lists: app.lists.length };
  }

  function listsOp(app) {
    var lists = listsOf(app);
    var out = [];
    for (var i = 0; i < lists.length; i++) {
      out.push({ id: lists[i].id, name: lists[i].name });
    }
    return out;
  }

  function queryOp(app, req) {
    var lists = listsOf(app);
    var out = [];
    for (var i = 0; i < lists.length; i++) {
      if (req.list && lists[i].id !== req.list &&
          lists[i].name.toLowerCase() !== String(req.list).toLowerCase()) {
        continue;
      }
      out = out.concat(readList(lists[i], !!req.openOnly));
    }
    return out;
  }

  function getOp(app, req) {
    return readOne(app, req.id);
  }

  function createOp(app, req) {
    var entry = resolveList(app, req.list);
    var reminder = app.Reminder({
      name: req.title,
      body: req.notes === undefined ? '' : req.notes,
      priority: priorityToNumber(req.priority)
    });
    entry.ref.reminders.push(reminder);

    applyDue(reminder, req.dueAt === undefined ? undefined : req.dueAt, !!req.allDay);
    if (req.flagged !== undefined) {
      try { reminder.flagged = !!req.flagged; } catch (e) { /* unsupported here */ }
    }
    return readOne(app, String(reminder.id()));
  }

  function updateOp(app, req) {
    var found = findReminder(app, req.id);
    var ref = found.ref;
    var patch = req.patch || {};

    if (patch.title !== undefined) ref.name = patch.title;
    if (patch.notes !== undefined) ref.body = patch.notes === null ? '' : patch.notes;
    if (patch.priority !== undefined) ref.priority = priorityToNumber(patch.priority);
    if (patch.completed !== undefined) ref.completed = !!patch.completed;
    if (patch.flagged !== undefined) {
      try { ref.flagged = !!patch.flagged; } catch (e) { /* unsupported here */ }
    }
    if (patch.dueAt !== undefined) {
      applyDue(ref, patch.dueAt, !!patch.allDay);
    }
    return readOne(app, req.id);
  }

  function deleteOp(app, req) {
    var found = findReminder(app, req.id);
    app.delete(found.ref);
    return { deleted: req.id };
  }
}
`;
