"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from "recharts";
import type { DailyReport, WeeklyReport, MonthlyReport } from "@/db/queries";

const COLORS = [
  "#2563eb",
  "#16a34a",
  "#ea580c",
  "#9333ea",
  "#e11d48",
  "#0891b2",
  "#ca8a04",
  "#6366f1",
];

interface ReportChartsProps {
  reportData: DailyReport | WeeklyReport | MonthlyReport | null;
  reportType: "daily" | "weekly" | "monthly";
}

export function ReportCharts({ reportData, reportType }: ReportChartsProps) {
  if (!reportData) {
    return (
      <p className="text-muted-foreground text-sm py-8 text-center">
        Select a date range to view reports.
      </p>
    );
  }

  if (reportType === "daily") {
    const data = reportData as DailyReport;
    if (data.entries.length === 0) {
      return (
        <p className="text-muted-foreground text-sm py-8 text-center">
          No data for this date.
        </p>
      );
    }

    const activityData = data.entries.map((e) => {
      const [sh, sm] = e.start_time.split(":").map(Number);
      const [eh, em] = e.end_time.split(":").map(Number);
      const hours = ((eh * 60 + em) - (sh * 60 + sm)) / 60;
      return { name: e.activity, hours: Math.round(hours * 100) / 100 };
    });

    return (
      <div className="space-y-8">
        <div>
          <h3 className="text-sm font-medium mb-4">Hours by Activity</h3>
          <ResponsiveContainer width="100%" height={Math.max(200, activityData.length * 40)}>
            <BarChart data={activityData} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" unit="h" />
              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value) => [`${value}h`, "Hours"]} />
              <Bar dataKey="hours" fill="#2563eb" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {data.byCategory.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-4">Hours by Category</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={data.byCategory}
                  dataKey="hours"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ name, value }: { name?: string; value?: number }) =>
                    `${name ?? ""}: ${Math.round((value ?? 0) * 10) / 10}h`
                  }
                >
                  {data.byCategory.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [`${value}h`, "Hours"]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    );
  }

  if (reportType === "weekly") {
    const data = reportData as WeeklyReport;
    const chartData = data.dailyTotals.map((d) => ({
      date: d.date.slice(5), // MM-DD
      hours: Math.round(d.hours * 100) / 100,
    }));

    return (
      <div>
        <h3 className="text-sm font-medium mb-4">Hours by Day</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis unit="h" />
            <Tooltip formatter={(value) => [`${value}h`, "Hours"]} />
            <Bar dataKey="hours" fill="#2563eb" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (reportType === "monthly") {
    const data = reportData as MonthlyReport;
    const chartData = data.weeklyAggregates.map((w) => ({
      week: `${w.weekStart.slice(5)} - ${w.weekEnd.slice(5)}`,
      hours: Math.round(w.hours * 100) / 100,
    }));

    return (
      <div>
        <h3 className="text-sm font-medium mb-4">Hours by Week</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="week" />
            <YAxis unit="h" />
            <Tooltip formatter={(value) => [`${value}h`, "Hours"]} />
            <Bar dataKey="hours" fill="#2563eb" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return null;
}
