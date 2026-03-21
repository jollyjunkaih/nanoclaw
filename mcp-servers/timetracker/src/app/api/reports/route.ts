import { NextRequest } from 'next/server';
import { getDailyReport, getWeeklyReport, getMonthlyReport } from '@/db/queries';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const type = searchParams.get('type');

  if (type === 'daily') {
    const date = searchParams.get('date');
    if (!date) {
      return Response.json({ error: 'date parameter is required for daily report' }, { status: 400 });
    }
    return Response.json(getDailyReport(date));
  }

  if (type === 'weekly') {
    const startDate = searchParams.get('start_date');
    if (!startDate) {
      return Response.json({ error: 'start_date parameter is required for weekly report' }, { status: 400 });
    }
    return Response.json(getWeeklyReport(startDate));
  }

  if (type === 'monthly') {
    const month = searchParams.get('month');
    if (!month) {
      return Response.json({ error: 'month parameter is required for monthly report' }, { status: 400 });
    }
    return Response.json(getMonthlyReport(month));
  }

  return Response.json({ error: 'type must be daily, weekly, or monthly' }, { status: 400 });
}
