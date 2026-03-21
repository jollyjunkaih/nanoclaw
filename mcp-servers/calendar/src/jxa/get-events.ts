export function getEventsScript(date: string, endDate?: string, calendarName?: string): string {
  const startIso = JSON.stringify(date);
  const endIso = JSON.stringify(endDate ?? date);
  const calName = JSON.stringify(calendarName ?? null);

  return `
    var cal = Application('Calendar');
    cal.includeStandardAdditions = true;

    var startDate = new Date(${startIso});
    startDate.setHours(0, 0, 0, 0);

    var endDate = new Date(${endIso});
    endDate.setHours(23, 59, 59, 999);

    var filterCalName = ${calName};
    var calendars = cal.calendars();
    if (filterCalName) {
      calendars = calendars.filter(function(c) { return c.name() === filterCalName; });
    }

    var results = [];
    for (var i = 0; i < calendars.length; i++) {
      var c = calendars[i];
      var events = c.events.whose({
        _and: [
          { startDate: { _greaterThanEquals: startDate } },
          { startDate: { _lessThanEquals: endDate } }
        ]
      })();
      for (var j = 0; j < events.length; j++) {
        var e = events[j];
        try {
          results.push({
            id: e.uid(),
            title: e.summary(),
            start: e.startDate().toISOString(),
            end: e.endDate().toISOString(),
            location: e.location() || '',
            notes: e.description() || '',
            calendar: c.name(),
            allDay: e.alldayEvent()
          });
        } catch(err) {}
      }
    }

    JSON.stringify(results);
  `;
}
