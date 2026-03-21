export function createEventScript(
  title: string,
  start: string,
  end: string,
  calendar?: string,
  location?: string,
  notes?: string,
): string {
  const titleJson = JSON.stringify(title);
  const startJson = JSON.stringify(start);
  const endJson = JSON.stringify(end);
  const calJson = JSON.stringify(calendar ?? null);
  const locationJson = JSON.stringify(location ?? '');
  const notesJson = JSON.stringify(notes ?? '');

  return `
    var cal = Application('Calendar');
    cal.includeStandardAdditions = true;

    var calName = ${calJson};
    var targetCal;
    if (calName) {
      var matched = cal.calendars.whose({ name: calName })();
      targetCal = matched.length > 0 ? matched[0] : cal.calendars()[0];
    } else {
      targetCal = cal.calendars()[0];
    }

    var startDate = new Date(${startJson});
    var endDate = new Date(${endJson});

    var props = {
      summary: ${titleJson},
      startDate: startDate,
      endDate: endDate,
      location: ${locationJson},
      description: ${notesJson}
    };

    var newEvent = cal.Event(props);
    targetCal.events.push(newEvent);

    JSON.stringify({ id: newEvent.uid(), success: true });
  `;
}
