// Default calendars to query (avoids fetching thousands of events from subscribed calendars)
const DEFAULT_CALENDARS = ['Home', 'Work'];

export function getEventsScript(date: string, endDate?: string, calendarName?: string): string {
  const startIso = date;
  const endIso = endDate ?? date;
  const calNames = calendarName ? [calendarName] : DEFAULT_CALENDARS;

  const calList = calNames.map((n) => `"${n.replace(/"/g, '\\"')}"`).join(', ');

  return `
use scripting additions
tell application "Calendar" to activate
delay 0.5

set startDate to current date
set year of startDate to ${parseInt(startIso.slice(0, 4), 10)}
set month of startDate to ${parseInt(startIso.slice(5, 7), 10)}
set day of startDate to ${parseInt(startIso.slice(8, 10), 10)}
set time of startDate to 0

set endDate to current date
set year of endDate to ${parseInt(endIso.slice(0, 4), 10)}
set month of endDate to ${parseInt(endIso.slice(5, 7), 10)}
set day of endDate to ${parseInt(endIso.slice(8, 10), 10)}
set time of endDate to 86399

set calNames to {${calList}}
set q to "\\\""
set bs to "\\\\"

tell application "Calendar"
  set jsonParts to {}
  repeat with calName in calNames
    try
      set theCal to first calendar whose name is calName
      set theEvents to (every event of theCal whose start date \u2265 startDate and start date \u2264 endDate)
      repeat with e in theEvents
        set eUid to uid of e
        set eTitle to my escJ(summary of e, bs, q)
        set eStart to start date of e
        set eEnd to end date of e
        set eLoc to ""
        try
          set eLoc to location of e
        end try
        if eLoc is missing value then set eLoc to ""
        set eLoc to my escJ(eLoc, bs, q)
        set eNotes to ""
        try
          set eNotes to description of e
        end try
        if eNotes is missing value then set eNotes to ""
        set eNotes to my escJ(eNotes, bs, q)
        set eAllDay to allday event of e
        set eCalName to calName as text

        set startISO to my isoDate(eStart)
        set endISO to my isoDate(eEnd)

        if eAllDay then
          set allDayStr to "true"
        else
          set allDayStr to "false"
        end if

        set end of jsonParts to "{" & q & "id" & q & ":" & q & eUid & q & "," & q & "title" & q & ":" & q & eTitle & q & "," & q & "start" & q & ":" & q & startISO & q & "," & q & "end" & q & ":" & q & endISO & q & "," & q & "location" & q & ":" & q & eLoc & q & "," & q & "notes" & q & ":" & q & eNotes & q & "," & q & "calendar" & q & ":" & q & eCalName & q & "," & q & "allDay" & q & ":" & allDayStr & "}"
      end repeat
    end try
  end repeat
  if (count of jsonParts) = 0 then
    return "[]"
  else
    set AppleScript's text item delimiters to ","
    return "[" & (jsonParts as text) & "]"
  end if
end tell

on padTwo(n)
  if n < 10 then
    return "0" & (n as integer)
  else
    return "" & (n as integer)
  end if
end padTwo

on isoDate(d)
  set y to year of d
  set m to (month of d as integer)
  set dy to day of d
  set h to hours of d
  set mi to minutes of d
  return "" & y & "-" & my padTwo(m) & "-" & my padTwo(dy) & "T" & my padTwo(h) & ":" & my padTwo(mi) & ":00"
end isoDate

on escJ(str, bs, q)
  set o to ""
  repeat with ch in characters of str
    set c to ch as text
    if c is "\\\\" then
      set o to o & bs & bs
    else if c is "\\"" then
      set o to o & bs & q
    else if c is "\\n" then
      set o to o & bs & "n"
    else if c is return then
      set o to o & bs & "n"
    else if c is "\\t" then
      set o to o & bs & "t"
    else
      set o to o & c
    end if
  end repeat
  return o
end escJ
`;
}
