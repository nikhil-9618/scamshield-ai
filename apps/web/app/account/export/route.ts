import { NextResponse } from 'next/server';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: 'Sign in to export your data.' }, { status: 401 });

  const result = await apiFetch<unknown>('/users/me/export', { timeoutMs: 30_000 });
  if (!result.ok) {
    return NextResponse.json({ message: result.error.message }, { status: result.status });
  }

  const body = JSON.stringify(result.data, null, 2);
  return new NextResponse(body, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="scamshield-export-${new Date().toISOString().slice(0, 10)}.json"`,
      'cache-control': 'no-store',
    },
  });
}
