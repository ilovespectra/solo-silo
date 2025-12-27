

import { NextResponse } from 'next/server';


export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function isBackendUp() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 500);
    const res = await fetch('http://127.0.0.1:8000/health', { signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

async function checkBackend() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 500);
    const res = await fetch('http://127.0.0.1:8000/health', { signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

export async function GET() {
  const isRunning = await checkBackend();
  return NextResponse.json({ status: isRunning ? 'running' : 'offline' });
}

export async function POST() {
  try {
    const isUp = await isBackendUp();
    if (isUp) {
      return NextResponse.json({ status: 'running' });
    }

    let spawnLog = '';
    let spawnError = null;
    try {
      const res = await fetch('http://127.0.0.1:3000/api/system/backend/spawn', { method: 'POST' });
      const data = await res.json();
      if (data?.log) spawnLog = data.log;
      if (data?.error) spawnError = data.error;
    } catch (err) {
      spawnError = err instanceof Error ? err.message : String(err);
    }

    let ready = false;
    let attempts = 0;
    const maxAttempts = 30;
    while (!ready && attempts < maxAttempts) {
      ready = await isBackendUp();
      if (ready) break;
      await new Promise((r) => setTimeout(r, 1000));
      attempts++;
    }

    if (ready) {
      return NextResponse.json({ status: 'running', log: spawnLog });
    } else {
      return NextResponse.json({ status: 'failed', error: spawnError || 'Backend did not start in time', log: spawnLog }, { status: 500 });
    }
  } catch (error) {
    return NextResponse.json(
      { status: 'failed', error: (error as Error).message },
      { status: 500 }
    );
  }
}
