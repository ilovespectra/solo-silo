import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST() {
  try {
    const { exec } = await import('child_process');
    exec("pkill -f 'uvicorn main:app'");
    return NextResponse.json({ stopped: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
