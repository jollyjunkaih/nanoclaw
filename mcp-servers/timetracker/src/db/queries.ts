import { getDb } from './connection';

export interface TimeEntry {
  id: number;
  date: string;
  start_time: string;
  end_time: string;
  activity: string;
  category_id: number | null;
  category_name: string | null;
  source: string;
  expected_activity: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimeEntryInput {
  date: string;
  start_time: string;
  end_time: string;
  activity: string;
  category_id?: number | null;
  source?: string;
  expected_activity?: string | null;
}

export interface Category {
  id: number;
  name: string;
  color: string | null;
}

export interface DailyReport {
  entries: TimeEntry[];
  totalHours: number;
  byCategory: { category: string; hours: number }[];
}

export interface WeeklyReport {
  dailyTotals: { date: string; hours: number }[];
}

export interface MonthlyReport {
  weeklyAggregates: { weekStart: string; weekEnd: string; hours: number }[];
}

function calcHours(start_time: string, end_time: string): number {
  const [sh, sm] = start_time.split(':').map(Number);
  const [eh, em] = end_time.split(':').map(Number);
  return ((eh * 60 + em) - (sh * 60 + sm)) / 60;
}

export function logTime(entry: TimeEntryInput): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO time_entries (date, start_time, end_time, activity, category_id, source, expected_activity)
    VALUES (@date, @start_time, @end_time, @activity, @category_id, @source, @expected_activity)
  `);
  const result = stmt.run({
    date: entry.date,
    start_time: entry.start_time,
    end_time: entry.end_time,
    activity: entry.activity,
    category_id: entry.category_id ?? null,
    source: entry.source ?? 'agent',
    expected_activity: entry.expected_activity ?? null,
  });
  return result.lastInsertRowid as number;
}

export function getTimesheet(date: string, endDate?: string): TimeEntry[] {
  const db = getDb();
  if (endDate) {
    return db.prepare(`
      SELECT te.*, c.name AS category_name
      FROM time_entries te
      LEFT JOIN categories c ON te.category_id = c.id
      WHERE te.date >= ? AND te.date <= ?
      ORDER BY te.date, te.start_time
    `).all(date, endDate) as TimeEntry[];
  }
  return db.prepare(`
    SELECT te.*, c.name AS category_name
    FROM time_entries te
    LEFT JOIN categories c ON te.category_id = c.id
    WHERE te.date = ?
    ORDER BY te.start_time
  `).all(date) as TimeEntry[];
}

const ALLOWED_COLUMNS = new Set(['activity', 'start_time', 'end_time', 'category_id', 'expected_activity']);

export function updateEntry(
  id: number,
  updates: Partial<Pick<TimeEntry, 'activity' | 'start_time' | 'end_time' | 'category_id' | 'expected_activity'>>
): boolean {
  const db = getDb();
  const setClauses: string[] = [];
  const values: (string | number | null)[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined && ALLOWED_COLUMNS.has(key)) {
      setClauses.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (setClauses.length === 0) return false;

  values.push(id);
  const result = db.prepare(`
    UPDATE time_entries
    SET ${setClauses.join(', ')}, updated_at = datetime('now')
    WHERE id = ?
  `).run(...values);

  return result.changes > 0;
}

export function deleteEntry(id: number): void {
  const db = getDb();
  db.prepare('DELETE FROM time_entries WHERE id = ?').run(id);
}

export function getDailyReport(date: string): DailyReport {
  const entries = getTimesheet(date);
  const totalHours = entries.reduce(
    (sum, e) => sum + calcHours(e.start_time, e.end_time),
    0
  );

  const byCategoryMap = new Map<string, number>();
  for (const e of entries) {
    const key = e.category_name ?? 'Uncategorized';
    byCategoryMap.set(key, (byCategoryMap.get(key) ?? 0) + calcHours(e.start_time, e.end_time));
  }
  const byCategory = Array.from(byCategoryMap.entries()).map(([category, hours]) => ({
    category,
    hours,
  }));

  return { entries, totalHours, byCategory };
}

export function getWeeklyReport(startDate: string): WeeklyReport {
  const db = getDb();
  // Generate 7 days from startDate
  const start = new Date(startDate);
  const dailyTotals: { date: string; hours: number }[] = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);

    const entries = db.prepare(`
      SELECT start_time, end_time FROM time_entries WHERE date = ?
    `).all(dateStr) as { start_time: string; end_time: string }[];

    const hours = entries.reduce(
      (sum, e) => sum + calcHours(e.start_time, e.end_time),
      0
    );
    dailyTotals.push({ date: dateStr, hours });
  }

  return { dailyTotals };
}

export function getMonthlyReport(month: string): MonthlyReport {
  // month is in format YYYY-MM
  const [year, mon] = month.split('-').map(Number);
  const firstDay = new Date(year, mon - 1, 1);
  const lastDay = new Date(year, mon, 0);

  const db = getDb();
  const weeklyAggregates: { weekStart: string; weekEnd: string; hours: number }[] = [];

  // Walk through weeks in the month
  let cursor = new Date(firstDay);
  while (cursor <= lastDay) {
    const weekStart = cursor.toISOString().slice(0, 10);
    // Week end is 6 days later or end of month, whichever comes first
    const weekEndDate = new Date(cursor);
    weekEndDate.setDate(cursor.getDate() + 6);
    const clampedEnd = weekEndDate > lastDay ? lastDay : weekEndDate;
    const weekEnd = clampedEnd.toISOString().slice(0, 10);

    const entries = db.prepare(`
      SELECT start_time, end_time FROM time_entries
      WHERE date >= ? AND date <= ?
    `).all(weekStart, weekEnd) as { start_time: string; end_time: string }[];

    const hours = entries.reduce(
      (sum, e) => sum + calcHours(e.start_time, e.end_time),
      0
    );
    weeklyAggregates.push({ weekStart, weekEnd, hours });

    // Advance by 7 days
    cursor.setDate(cursor.getDate() + 7);
  }

  return { weeklyAggregates };
}

export function getCategories(): Category[] {
  const db = getDb();
  return db.prepare('SELECT * FROM categories ORDER BY name').all() as Category[];
}

export function createCategory(name: string, color?: string): number {
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO categories (name, color) VALUES (?, ?)'
  ).run(name, color ?? null);
  return result.lastInsertRowid as number;
}
