export function checkAvailabilityScript(
  date: string,
  startTime: string = '09:00',
  endTime: string = '17:00',
): string {
  const dateJson = JSON.stringify(date);
  const startTimeJson = JSON.stringify(startTime);
  const endTimeJson = JSON.stringify(endTime);

  return `
    var cal = Application('Calendar');
    cal.includeStandardAdditions = true;

    var dateStr = ${dateJson};
    var startTimeStr = ${startTimeJson};
    var endTimeStr = ${endTimeJson};

    function parseTime(dateStr, timeStr) {
      var d = new Date(dateStr);
      var parts = timeStr.split(':');
      d.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), 0, 0);
      return d;
    }

    var dayStart = parseTime(dateStr, startTimeStr);
    var dayEnd = parseTime(dateStr, endTimeStr);

    var rangeStart = new Date(dateStr);
    rangeStart.setHours(0, 0, 0, 0);
    var rangeEnd = new Date(dateStr);
    rangeEnd.setHours(23, 59, 59, 999);

    var calendars = cal.calendars();
    var busySlots = [];

    for (var i = 0; i < calendars.length; i++) {
      var events = calendars[i].events.whose({
        _and: [
          { startDate: { _greaterThanEquals: rangeStart } },
          { startDate: { _lessThanEquals: rangeEnd } }
        ]
      })();
      for (var j = 0; j < events.length; j++) {
        try {
          var e = events[j];
          if (!e.alldayEvent()) {
            busySlots.push({ start: e.startDate().getTime(), end: e.endDate().getTime() });
          }
        } catch(err) {}
      }
    }

    // Sort by start time
    busySlots.sort(function(a, b) { return a.start - b.start; });

    // Compute free slots within [dayStart, dayEnd]
    var freeSlots = [];
    var cursor = dayStart.getTime();
    var dayEndMs = dayEnd.getTime();

    for (var k = 0; k < busySlots.length; k++) {
      var busy = busySlots[k];
      var busyStart = Math.max(busy.start, dayStart.getTime());
      var busyEnd = Math.min(busy.end, dayEndMs);

      if (busyStart > cursor) {
        freeSlots.push({
          start: new Date(cursor).toISOString(),
          end: new Date(busyStart).toISOString()
        });
      }
      if (busyEnd > cursor) {
        cursor = busyEnd;
      }
    }

    if (cursor < dayEndMs) {
      freeSlots.push({
        start: new Date(cursor).toISOString(),
        end: new Date(dayEndMs).toISOString()
      });
    }

    JSON.stringify(freeSlots);
  `;
}
