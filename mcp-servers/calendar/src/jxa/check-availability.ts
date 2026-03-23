const DEFAULT_CALENDARS = ['Home', 'Work'];

export function checkAvailabilityScript(
  date: string,
  startTime: string = '09:00',
  endTime: string = '17:00',
): string {
  const [startH, startM] = startTime.split(':').map((s) => parseInt(s, 10));
  const [endH, endM] = endTime.split(':').map((s) => parseInt(s, 10));
  const calList = DEFAULT_CALENDARS.map((n) => `"${n}"`).join(', ');

  return `
use scripting additions
tell application "Calendar" to activate
delay 0.5

set targetDate to current date
set year of targetDate to ${parseInt(date.slice(0, 4), 10)}
set month of targetDate to ${parseInt(date.slice(5, 7), 10)}
set day of targetDate to ${parseInt(date.slice(8, 10), 10)}
set time of targetDate to 0

set startDate to targetDate
set endDate to targetDate + 86399

set dayStartSecs to ${startH * 3600 + startM * 60}
set dayEndSecs to ${endH * 3600 + endM * 60}

set calNames to {${calList}}

-- Collect busy slots as "startSecs,endSecs" pairs
set busyPairs to {}

tell application "Calendar"
  repeat with calName in calNames
    try
      set theCal to first calendar whose name is calName
      set theEvents to (every event of theCal whose start date ≥ startDate and start date ≤ endDate)
      repeat with e in theEvents
        if not (allday event of e) then
          set eStart to start date of e
          set eEnd to end date of e
          set sSecs to (hours of eStart) * 3600 + (minutes of eStart) * 60
          set eSecs to (hours of eEnd) * 3600 + (minutes of eEnd) * 60
          set end of busyPairs to {sSecs, eSecs}
        end if
      end repeat
    end try
  end repeat
end tell

-- Sort busy pairs by start time (simple bubble sort, few events expected)
set n to count of busyPairs
repeat with i from 1 to n - 1
  repeat with j from 1 to n - i
    if item 1 of item j of busyPairs > item 1 of item (j + 1) of busyPairs then
      set tmp to item j of busyPairs
      set item j of busyPairs to item (j + 1) of busyPairs
      set item (j + 1) of busyPairs to tmp
    end if
  end repeat
end repeat

-- Compute free slots
set freeSlots to {}
set cursor to dayStartSecs

repeat with bp in busyPairs
  set bStart to item 1 of bp
  set bEnd to item 2 of bp
  if bStart > dayEndSecs then exit repeat
  set clampedStart to bStart
  if clampedStart < dayStartSecs then set clampedStart to dayStartSecs
  set clampedEnd to bEnd
  if clampedEnd > dayEndSecs then set clampedEnd to dayEndSecs
  if clampedStart > cursor then
    set end of freeSlots to {cursor, clampedStart}
  end if
  if clampedEnd > cursor then set cursor to clampedEnd
end repeat

if cursor < dayEndSecs then
  set end of freeSlots to {cursor, dayEndSecs}
end if

-- Build JSON
set datePrefix to "${date}T"
set q to "\\""
set jsonParts to {}
repeat with slot in freeSlots
  set sH to (item 1 of slot) div 3600
  set sM to ((item 1 of slot) mod 3600) div 60
  set eH to (item 2 of slot) div 3600
  set eM to ((item 2 of slot) mod 3600) div 60
  set sISO to datePrefix & my padTwo(sH) & ":" & my padTwo(sM) & ":00"
  set eISO to datePrefix & my padTwo(eH) & ":" & my padTwo(eM) & ":00"
  set end of jsonParts to "{" & q & "start" & q & ":" & q & sISO & q & "," & q & "end" & q & ":" & q & eISO & q & "}"
end repeat

if (count of jsonParts) = 0 then
  return "[]"
else
  set AppleScript's text item delimiters to ","
  return "[" & (jsonParts as text) & "]"
end if

on padTwo(n)
  if n < 10 then
    return "0" & n
  else
    return "" & n
  end if
end padTwo
`;
}
