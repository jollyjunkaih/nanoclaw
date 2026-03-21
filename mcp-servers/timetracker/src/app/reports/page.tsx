"use client";

import { useState, useCallback } from "react";
import type { DailyReport, WeeklyReport, MonthlyReport } from "@/db/queries";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ReportCharts } from "@/components/report-charts";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function thisMonthStr(): string {
  return new Date().toISOString().slice(0, 7);
}

function mondayOfWeek(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

type ReportData = DailyReport | WeeklyReport | MonthlyReport;

export default function ReportsPage() {
  const [tab, setTab] = useState("daily");
  const [dailyDate, setDailyDate] = useState(todayStr);
  const [weeklyDate, setWeeklyDate] = useState(todayStr);
  const [monthlyMonth, setMonthlyMonth] = useState(thisMonthStr);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchReport = useCallback(
    async (type: string) => {
      setLoading(true);
      try {
        let url = "/api/reports?type=";
        if (type === "daily") {
          url += `daily&date=${dailyDate}`;
        } else if (type === "weekly") {
          url += `weekly&start_date=${mondayOfWeek(weeklyDate)}`;
        } else {
          url += `monthly&month=${monthlyMonth}`;
        }
        const res = await fetch(url);
        const data = await res.json();
        setReportData(data);
      } finally {
        setLoading(false);
      }
    },
    [dailyDate, weeklyDate, monthlyMonth]
  );

  function handleTabChange(value: string | null) {
    if (!value) return;
    setTab(value);
    setReportData(null);
  }

  function totalHoursFromReport(): number {
    if (!reportData) return 0;
    if (tab === "daily") {
      return (reportData as DailyReport).totalHours;
    }
    if (tab === "weekly") {
      return (reportData as WeeklyReport).dailyTotals.reduce((s, d) => s + d.hours, 0);
    }
    return (reportData as MonthlyReport).weeklyAggregates.reduce((s, w) => s + w.hours, 0);
  }

  function topCategories(): { category: string; hours: number }[] {
    if (!reportData || tab !== "daily") return [];
    return (reportData as DailyReport).byCategory
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 5);
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="daily">Daily</TabsTrigger>
          <TabsTrigger value="weekly">Weekly</TabsTrigger>
          <TabsTrigger value="monthly">Monthly</TabsTrigger>
        </TabsList>

        <TabsContent value="daily">
          <div className="flex items-center gap-3 mb-4">
            <input
              type="date"
              value={dailyDate}
              onChange={(e) => setDailyDate(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            />
            <Button size="sm" onClick={() => fetchReport("daily")}>
              Load
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="weekly">
          <div className="flex items-center gap-3 mb-4">
            <label className="text-sm text-muted-foreground">Week of</label>
            <input
              type="date"
              value={weeklyDate}
              onChange={(e) => setWeeklyDate(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            />
            <Button size="sm" onClick={() => fetchReport("weekly")}>
              Load
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="monthly">
          <div className="flex items-center gap-3 mb-4">
            <input
              type="month"
              value={monthlyMonth}
              onChange={(e) => setMonthlyMonth(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            />
            <Button size="sm" onClick={() => fetchReport("monthly")}>
              Load
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {reportData && (
        <div className="flex gap-4 text-sm">
          <div className="border rounded-lg p-3">
            <div className="text-muted-foreground">Total Hours</div>
            <div className="text-2xl font-semibold">
              {totalHoursFromReport().toFixed(1)}h
            </div>
          </div>
          {topCategories().length > 0 && (
            <div className="border rounded-lg p-3">
              <div className="text-muted-foreground">Top Categories</div>
              <div className="space-y-0.5 mt-1">
                {topCategories().map((c) => (
                  <div key={c.category} className="text-xs">
                    {c.category}: {c.hours.toFixed(1)}h
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground text-sm py-8 text-center">Loading...</p>
      ) : (
        <ReportCharts
          reportData={reportData}
          reportType={tab as "daily" | "weekly" | "monthly"}
        />
      )}
    </div>
  );
}
