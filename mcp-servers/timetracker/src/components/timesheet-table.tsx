"use client";

import { useState } from "react";
import type { TimeEntry } from "@/db/queries";
import type { Category } from "@/db/queries";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil, Trash2 } from "lucide-react";

interface TimesheetTableProps {
  entries: TimeEntry[];
  categories: Category[];
  onUpdate: (id: number, updates: Partial<TimeEntry>) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

export function TimesheetTable({
  entries,
  categories,
  onUpdate,
  onDelete,
}: TimesheetTableProps) {
  const [editEntry, setEditEntry] = useState<TimeEntry | null>(null);
  const [editForm, setEditForm] = useState({
    start_time: "",
    end_time: "",
    activity: "",
    expected_activity: "",
    category_id: "",
  });
  const [deleteId, setDeleteId] = useState<number | null>(null);

  function openEdit(entry: TimeEntry) {
    setEditEntry(entry);
    setEditForm({
      start_time: entry.start_time,
      end_time: entry.end_time,
      activity: entry.activity,
      expected_activity: entry.expected_activity ?? "",
      category_id: entry.category_id?.toString() ?? "",
    });
  }

  async function handleSave() {
    if (!editEntry) return;
    await onUpdate(editEntry.id, {
      start_time: editForm.start_time,
      end_time: editForm.end_time,
      activity: editForm.activity,
      expected_activity: editForm.expected_activity || null,
      category_id: editForm.category_id ? Number(editForm.category_id) : null,
    } as Partial<TimeEntry>);
    setEditEntry(null);
  }

  async function handleDelete() {
    if (deleteId === null) return;
    await onDelete(deleteId);
    setDeleteId(null);
  }

  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground text-sm py-8 text-center">
        No entries for this date.
      </p>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Activity</TableHead>
            <TableHead>Expected</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Source</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="font-mono text-xs">
                {entry.start_time} - {entry.end_time}
              </TableCell>
              <TableCell>{entry.activity}</TableCell>
              <TableCell className="text-muted-foreground">
                {entry.expected_activity ?? "-"}
              </TableCell>
              <TableCell>{entry.category_name ?? "-"}</TableCell>
              <TableCell>
                <Badge variant={entry.source === "agent" ? "default" : "outline"}>
                  {entry.source}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => openEdit(entry)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setDeleteId(entry.id)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Edit Dialog */}
      <Dialog open={editEntry !== null} onOpenChange={(open) => !open && setEditEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Entry</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Start</label>
                <Input
                  type="time"
                  value={editForm.start_time}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, start_time: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">End</label>
                <Input
                  type="time"
                  value={editForm.end_time}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, end_time: e.target.value }))
                  }
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Activity</label>
              <Input
                value={editForm.activity}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, activity: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Expected Activity</label>
              <Input
                value={editForm.expected_activity}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, expected_activity: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Category</label>
              <Select
                value={editForm.category_id}
                onValueChange={(val) =>
                  setEditForm((f) => ({ ...f, category_id: val as string }))
                }
              >
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
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button onClick={handleSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Entry</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this time entry? This action cannot be
            undone.
          </p>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
