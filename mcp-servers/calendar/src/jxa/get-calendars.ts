export function getCalendarsScript(): string {
  return `
    var cal = Application('Calendar');
    cal.includeStandardAdditions = true;
    var calendars = cal.calendars();
    var result = [];
    for (var i = 0; i < calendars.length; i++) {
      result.push({ name: calendars[i].name() });
    }
    JSON.stringify(result);
  `;
}
