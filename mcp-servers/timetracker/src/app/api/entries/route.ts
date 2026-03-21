import { NextRequest } from 'next/server';
import { getTimesheet, logTime, updateEntry, deleteEntry } from '@/db/queries';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const date = searchParams.get('date');
  const endDate = searchParams.get('end_date');

  if (!date) {
    return Response.json({ error: 'date parameter is required' }, { status: 400 });
  }

  const entries = getTimesheet(date, endDate ?? undefined);
  return Response.json(entries);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { date, start_time, end_time, activity, category_id, expected_activity } = body;

  if (!date || !start_time || !end_time || !activity) {
    return Response.json({ error: 'date, start_time, end_time, and activity are required' }, { status: 400 });
  }

  const id = logTime({
    date,
    start_time,
    end_time,
    activity,
    category_id: category_id ?? null,
    source: 'manual',
    expected_activity: expected_activity ?? null,
  });

  return Response.json({ id }, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, ...updates } = body;

  if (!id) {
    return Response.json({ error: 'id is required' }, { status: 400 });
  }

  updateEntry(id, updates);
  return Response.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const id = searchParams.get('id');

  if (!id) {
    return Response.json({ error: 'id parameter is required' }, { status: 400 });
  }

  deleteEntry(Number(id));
  return Response.json({ ok: true });
}
