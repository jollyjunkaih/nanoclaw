# Structured App — Shortcuts Actions Discovery

**Date:** 2026-03-21
**App version:** Structured 4.4.6 (build 1823)
**Bundle ID:** com.leomehlig.today
**Location:** /Applications/Structured.app

---

## Summary

Structured is installed and exposes **17 AppIntents** (Apple's Shortcuts-compatible action framework). The actions are registered via the `Metadata.appintents/extract.actionsdata` bundle inside the app. They appear in the Shortcuts app composer UI and can be used when building automations, but they **cannot be invoked directly from the `shortcuts` CLI** (`shortcuts run` only runs user-named shortcuts, not AppIntents by identifier).

No pre-built shortcuts named "Structured" or similar appeared in `shortcuts list`. The 9 "App Shortcuts" (auto-shortcuts with Siri phrases) are registered by `StructuredAppShortcutsProvider` but require either the Shortcuts UI or Siri to invoke.

---

## Available AppIntents

Source: `/Applications/Structured.app/Contents/Resources/Metadata.appintents/extract.actionsdata`

### Read/Query Actions

#### `DayScheduleIntent` — "Today's Schedule" / "Tomorrow's Schedule"
Get the schedule for a given day.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `day` | enum (RelativeDayEntity) | optional | yesterday / today / tomorrow / other |
| `otherDate` | Date | optional | Specific date when day=other |

- **Returns:** Task list (structured result, no plain-text output format confirmed)
- **Siri phrases:** "Check today's schedule in Structured", "Summarize today in Structured", "What's on my Structured schedule today?"

#### `GetCurrentTaskIntent` — "Current Task"
Returns the currently running task.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `includeCompleted` | Bool | yes | Include already-completed tasks that are currently running |

- **Siri phrases:** "Get current Structured task", "Get running task from Structured"

#### `ShowInboxIntent` — "Show Inbox"
Returns inbox tasks.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `includeCompleted` | Bool | yes | Include completed tasks |
| `limitToggle` | Bool | yes | Enable a task count limit |
| `limit` | URL | optional | How many tasks to return |

- **Siri phrases:** "Show Structured Inbox", "What's in my Structured inbox?"

#### `ShowTaskIntent`
Show specific tasks (used as a "find tasks" result display step in automations).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tasks` | TaskEntity[] | yes | Tasks to show |
| `prompt` | String[] | yes | Dialog/context text |

### Write Actions

#### `AddTaskIntent` — "New Task"
Create a new task.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | String | yes | Task name |
| `taskType` | enum (TaskTypeEntity) | yes | timed / allDay / inbox |
| `day` | Date | optional | Day for the task |
| `startDate` | Date | optional | Start time (timed tasks) |
| `duration` | Measurement (minutes) | optional | Duration |
| `symbol` | SymbolEntity | optional | SF Symbol icon |
| `notes` | String | optional | Notes body |
| `hexString` | String[] | optional | Custom color hex code |
| `theme` | enum (ThemeType) | optional | Preset color theme |
| `subtasks` | SubtaskEntity[] | optional | Subtask list |
| `recurrence` | enum (TaskRecurranceType) | optional | once / daily / weekly / monthly (Pro) |
| `energyLevel` | enum (EnergyLevelEntity) | optional | relax / neutral / low / medium / high |

- **Siri phrases:** "Create Structured task", "Add task to Structured", "New task in Structured"

#### `EditIntent`
Edit properties of existing tasks.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tasks` | TaskEntity[] | yes | Tasks to edit |
| `detail` | enum (EditableTaskProperty) | yes | Which property to change |
| `title` | Any | optional | New title |
| `notes` | String[] | optional | New notes |
| `subtasks` | SubtaskEntity[] | optional | New subtasks |
| `status` | enum (TaskCompletionStateType) | optional | completed / incomplete |
| `theme` | enum (ThemeType) | optional | Color theme |
| `hex` | String | optional | Custom hex color |
| `duration` | Measurement | optional | New duration |
| `day` | Date | optional | New day |
| `startTime` | Date | optional | New start time |
| `endTime` | Date | optional | New end time |
| `energyLevel` | enum (EnergyLevelEntity) | optional | New energy level |
| `symbol` | SymbolEntity | optional | New icon |
| `recurringEditType` | enum (RecurringEditType) | optional | onlyThis / allFuture / all |
| `taskType` | enum (TaskTypeEntity) | optional | New task type |

#### `DeleteTaskIntent`
Delete tasks.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tasks` | TaskEntity[] | yes | Tasks to delete |
| `recurringDelete` | enum (RecurringDeleteType) | optional | onlyThis / allFuture / all |

#### `DuplicateTaskIntent`
Duplicate a task.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `task` | TaskEntity | yes | Task to duplicate |

#### `ToggleTaskIntent`
Mark task complete/incomplete by ID.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | String[] | yes | Task identifiers |
| `intendedCompletionState` | Bool | yes | true=complete, false=incomplete |

#### `ToggleSubtaskIntent`
Mark a subtask complete/incomplete.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `task` | String | yes | Parent task ID |
| `subtask` | Any | yes | Subtask reference |
| `intendedCompletionState` | Bool | yes | Completion state |

### Navigation Actions

#### `OpenDayIntent` — "Go to Day"
Open a specific day in Structured.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `date` | Date | yes | Day to open |

#### `OpenTaskIntent` — "Open Task"
Open a specific task in the app.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `task` | TaskEntity | yes | Task to open |

#### `OpenInboxIntent` — "Open Inbox"
Open the Structured inbox screen. No parameters.

#### `OpenFocusTimerIntent`
Open the focus timer screen. No parameters.

#### `ControlOpenScreenIntent`
Navigate to a specific screen.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `screen` | enum (Screen) | yes | new / inbox / allDay / ai / aiCameraActive / aiMicrophoneActive |

#### `FocusTimerIntent` — "Focus Now"
Start the focus timer.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `task` | TaskEntity | optional | Task to focus on (must be currently running) |
| `isSilent` | Bool | yes | Suppress error if no running task |

#### `ToggleFocusTimerIntent`
Toggle the focus timer on/off.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `value` | Bool | yes | true=start, false=stop |

---

## TaskEntity Properties

The `TaskEntity` returned by query actions exposes these properties:

| Property | Type | Notes |
|----------|------|-------|
| `taskType` | enum (TaskTypeEntity) | timed / allDay / inbox |
| `title` | String | Task name |
| `startDate` | Decimal (timestamp) | Optional |
| `endDate` | Decimal (timestamp) | Optional |
| `duration` | Measurement (minutes) | Optional |
| `isCompleted` | Bool | |
| `isRecurring` | Bool | |
| `symbol` | SymbolEntity | SF Symbol icon |
| `theme` | enum (ThemeType) | Color preset |
| `hexString` | String | Custom hex color, optional |
| `hasSubtasks` | Bool | |
| `notes` | String | Optional |
| `hasNotes` | Bool | |
| `source` | enum (TaskSourceEntity) | app / calendar / reminders |
| `url` | URL | Deep link: `structured://task/<id>` |
| `energyLevel` | enum (EnergyLevelEntity) | relax / neutral / low / medium / high |
| `energyPoints` | Int | Numeric energy value |

**Note:** Task IDs are exposed indirectly via the `url` property (`structured://task/<uuid>`). The `ToggleTaskIntent` accepts `id` as String[] directly.

---

## Enum Values

| Enum | Values |
|------|--------|
| `TaskTypeEntity` | timed, allDay, inbox |
| `TaskCompletionStateType` | completed, incomplete |
| `EditableTaskProperty` | taskType, title, day, startTime, endTime, duration, isCompleted, energyLevel, symbol, color, subtasks, notes |
| `RecurringEditType` | onlyThis, allFuture, all |
| `RecurringDeleteType` | onlyThis, allFuture, all |
| `TaskRecurranceType` | once, daily, weekly, monthly |
| `EnergyLevelEntity` | relax, neutral, low, medium, high |
| `TaskSourceEntity` | app, calendar, reminders |
| `ThemeType` | day, dawn, sunshine, nature, night, forest, twilight, midnight, classic, pride, custom |
| `RelativeDayEntity` | yesterday, today, tomorrow, other |
| `Screen` | new, inbox, allDay, ai, aiCameraActive, aiMicrophoneActive |

---

## TaskQuery Filters

The `TaskQuery` (used in Shortcuts "Find Tasks" step) supports filtering on:

- `taskType` (is / is not TaskTypeEntity)
- `title` (contains / does not contain String)
- `startDate` (is before / is after Date)
- `endDate` (is before / is after Date)
- `duration` (less than / greater than Measurement)
- `theme` (is / is not ThemeType)
- `hexString` (contains / does not contain String)
- `hasNotes` (is Bool)
- `hasSubtasks` (is Bool)
- `isCompleted` (is Bool)
- `source` (is / is not TaskSourceEntity)
- `isRecurring` (is Bool)
- `energyLevel` (is / is not EnergyLevelEntity)

Sorting is supported by: `startDate`, `duration`, and likely other properties.

---

## Limitations

1. **No direct CLI invocation.** `shortcuts run` only works with named user shortcuts, not AppIntents by identifier. The Structured AppIntents cannot be called directly from the command line without first creating a named Shortcut in the Shortcuts app that wraps them.

2. **Output is structured, not plain text.** Return values are typed `TaskEntity` objects. When called from the CLI via a wrapper shortcut, output would need to be serialized (e.g., to JSON via a "Get Dictionary" step in the Shortcut).

3. **No task IDs exposed directly.** Task IDs are only accessible via the `url` property (`structured://task/<uuid>`). The UUID must be parsed from the URL. `ToggleTaskIntent` does accept `id` as a string array.

4. **App must be running (or launchable).** AppIntents require the host app to be available; Structured will be launched automatically by the system when an intent is invoked.

5. **Some features require Structured Pro.** Recurrence (`TaskRecurranceType`) is labeled as requiring a Pro subscription.

6. **Calendar/Reminders tasks are read-only.** `source` can be `calendar` or `reminders`, but those tasks originate from other apps. Creating/editing them via Structured Shortcuts may not be fully supported.

7. **Focus timer intents open the UI.** `OpenFocusTimerIntent` and `ControlOpenScreenIntent` bring Structured to the foreground rather than operating silently.

---

## MCP Tool Recommendations

Based on this discovery, the following MCP tools are feasible via wrapper Shortcuts:

| MCP Tool | Underlying Intent | Approach |
|----------|------------------|----------|
| `get_todays_schedule` | `DayScheduleIntent` | Wrapper shortcut → JSON output |
| `get_current_task` | `GetCurrentTaskIntent` | Wrapper shortcut → JSON output |
| `get_inbox` | `ShowInboxIntent` | Wrapper shortcut → JSON output |
| `add_task` | `AddTaskIntent` | Wrapper shortcut with input params |
| `complete_task` | `ToggleTaskIntent` | Wrapper shortcut with task ID |
| `delete_task` | `DeleteTaskIntent` | Wrapper shortcut with task reference |

The recommended implementation pattern is:
1. Create named Shortcuts in the Shortcuts app that wrap each intent and output JSON
2. Call those shortcuts from the MCP server via `shortcuts run <name> --output-path -`
3. Parse the JSON in the MCP server

This avoids any need for direct AppIntents invocation and works reliably from the CLI.
