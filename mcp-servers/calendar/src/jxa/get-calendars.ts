export function getCalendarsScript(): string {
  return `
    var cal = Application('Calendar');
    cal.includeStandardAdditions = true;
    var calendars = cal.calendars();
    var result = calendars.map(function(c) {
      return { name: c.name(), id: c.uid() };
    });
    JSON.stringify(result);
  `;
}
