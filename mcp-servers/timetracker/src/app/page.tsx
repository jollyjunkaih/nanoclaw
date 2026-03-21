"use client";

import { useState, useEffect, useCallback } from "react";
import type { TimeEntry, Category } from "@/db/queries";
import { TimesheetTable } from "@/components/timesheet-table";
import { EntryForm } from "@/components/entry-form";

function todayStr(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function calcHours(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return ((eh * 60 + em) - (sh * 60 + sm)) / 60;
}

export default function TimesheetPage() {
  const [date, setDate] = useState(todayStr);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/entries?date=${date}`);
      const data = await res.json();
      setEntries(data);
    } finally {
      setLoading(false);
    }
  }, [date]);

  const fetchCategories = useCallback(async () => {
    const res = await fetch("/api/categories");
    const data = await res.json();
    setCategories(data);
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const totalHours = entries.reduce(
    (sum, e) => sum + calcHours(e.start_time, e.end_time),
    0
  );

  async function handleAdd(entry: {
    date: string;
    start_time: string;
    end_time: string;
    activity: string;
    category_id?: number;
    expected_activity?: string;
  }) {
    await fetch("/api/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
    await fetchEntries();
  }

  async function handleUpdate(id: number, updates: Partial<TimeEntry>) {
    await fetch("/api/entries", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    });
    await fetchEntries();
  }

  async function handleDelete(id: number) {
    await fetch(`/api/entries?id=${id}`, { method: "DELETE" });
    await fetchEntries();
  }

  async function handleCategoryCreate(name: string) {
    await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    await fetchCategories();
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          />
        </div>
        <div className="text-sm text-muted-foreground">
          Total: <span className="font-semibold text-foreground">{totalHours.toFixed(1)}h</span>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm py-8 text-center">Loading...</p>
      ) : (
        <TimesheetTable
          entries={entries}
          categories={categories}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      )}

      <EntryForm
        date={date}
        categories={categories}
        onAdd={handleAdd}
        onCategoryCreate={handleCategoryCreate}
      />
    </div>
  );
}
