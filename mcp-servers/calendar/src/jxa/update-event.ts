export function updateEventScript(
  eventId: string,
  title?: string,
  start?: string,
  end?: string,
  location?: string,
  notes?: string,
): string {
  const eventIdJson = JSON.stringify(eventId);
  const titleJson = JSON.stringify(title ?? null);
  const startJson = JSON.stringify(start ?? null);
  const endJson = JSON.stringify(end ?? null);
  const locationJson = JSON.stringify(location ?? null);
  const notesJson = JSON.stringify(notes ?? null);

  return `
    var cal = Application('Calendar');
    cal.includeStandardAdditions = true;

    var targetId = ${eventIdJson};
    var newTitle = ${titleJson};
    var newStart = ${startJson};
    var newEnd = ${endJson};
    var newLocation = ${locationJson};
    var newNotes = ${notesJson};

    var calendars = cal.calendars();
    var found = false;

    for (var i = 0; i < calendars.length; i++) {
      var events = calendars[i].events.whose({ uid: targetId })();
      if (events.length > 0) {
        var e = events[0];
        if (newTitle !== null) e.summary = newTitle;
        if (newStart !== null) e.startDate = new Date(newStart);
        if (newEnd !== null) e.endDate = new Date(newEnd);
        if (newLocation !== null) e.location = newLocation;
        if (newNotes !== null) e.description = newNotes;

        found = true;
        break;
      }
    }

    JSON.stringify({ success: found });
  `;
}
