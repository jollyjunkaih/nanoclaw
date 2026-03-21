import { NextRequest } from 'next/server';
import { getCategories, createCategory } from '@/db/queries';

export async function GET() {
  const categories = getCategories();
  return Response.json(categories);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, color } = body;

  if (!name) {
    return Response.json({ error: 'name is required' }, { status: 400 });
  }

  const id = createCategory(name, color);
  return Response.json({ id }, { status: 201 });
}
