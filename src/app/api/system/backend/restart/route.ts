import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST() {
  try {
    await fetch('http://localhost:3000/api/system/backend/stop', { method: 'POST' });
    await new Promise(r => setTimeout(r, 1000));
    await fetch('http://localhost:3000/api/system/backend/start', { method: 'POST' });
    return NextResponse.json({ restarted: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
