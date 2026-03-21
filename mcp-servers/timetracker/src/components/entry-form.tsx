"use client";

import { useState } from "react";
import type { Category } from "@/db/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface EntryFormProps {
  date: string;
  categories: Category[];
  onAdd: (entry: {
    date: string;
    start_time: string;
    end_time: string;
    activity: string;
    category_id?: number;
    expected_activity?: string;
  }) => Promise<void>;
  onCategoryCreate: (name: string) => Promise<void>;
}

export function EntryForm({ date, categories, onAdd, onCategoryCreate }: EntryFormProps) {
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [activity, setActivity] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [expectedActivity, setExpectedActivity] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!startTime || !endTime || !activity) return;

    setSubmitting(true);
    try {
      await onAdd({
        date,
        start_time: startTime,
        end_time: endTime,
        activity,
        category_id: categoryId ? Number(categoryId) : undefined,
        expected_activity: expectedActivity || undefined,
      });
      setStartTime("");
      setEndTime("");
      setActivity("");
      setCategoryId("");
      setExpectedActivity("");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateCategory() {
    if (!newCategory.trim()) return;
    await onCategoryCreate(newCategory.trim());
    setNewCategory("");
    setShowNewCategory(false);
  }

  return (
    <form onSubmit={handleSubmit} className="border rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-medium">Add Entry</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div>
          <label className="text-xs text-muted-foreground">Start</label>
          <Input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">End</label>
          <Input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            required
          />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground">Activity</label>
          <Input
            value={activity}
            onChange={(e) => setActivity(e.target.value)}
            placeholder="What did you work on?"
            required
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground">Expected Activity</label>
          <Input
            value={expectedActivity}
            onChange={(e) => setExpectedActivity(e.target.value)}
            placeholder="What were you supposed to do?"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Category</label>
          {showNewCategory ? (
            <div className="flex gap-1">
              <Input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Category name"
              />
              <Button type="button" size="sm" onClick={handleCreateCategory}>
                Add
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowNewCategory(false)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex gap-1">
              <Select value={categoryId} onValueChange={(val) => setCategoryId(val ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowNewCategory(true)}
              >
                New
              </Button>
            </div>
          )}
        </div>
      </div>
      <Button type="submit" disabled={submitting || !startTime || !endTime || !activity}>
        {submitting ? "Adding..." : "Add Entry"}
      </Button>
    </form>
  );
}
