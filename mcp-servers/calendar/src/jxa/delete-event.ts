export function deleteEventScript(eventId: string): string {
  const eventIdJson = JSON.stringify(eventId);

  return `
    var cal = Application('Calendar');
    cal.includeStandardAdditions = true;

    var targetId = ${eventIdJson};
    var calendars = cal.calendars();
    var found = false;

    for (var i = 0; i < calendars.length; i++) {
      var events = calendars[i].events.whose({ uid: targetId })();
      if (events.length > 0) {
        cal.delete(events[0]);

        found = true;
        break;
      }
    }

    JSON.stringify({ success: found });
  `;
}
