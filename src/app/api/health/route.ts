import { NextResponse } from 'next/server';

export async function GET() {
  // In demo mode, always return healthy
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  
  if (isDemoMode) {
    return NextResponse.json({ status: 'ok', mode: 'demo' });
  }
  
  // In local mode, check if backend is available
  try {
    const backendResponse = await fetch('http://127.0.0.1:8000/api/health', {
      signal: AbortSignal.timeout(2000),
    });
    
    if (backendResponse.ok) {
      return NextResponse.json({ status: 'ok', mode: 'local' });
    }
  } catch (error) {
    console.error('[health] Backend not available:', error);
  }
  
  return NextResponse.json(
    { status: 'backend_unavailable', mode: 'local' },
    { status: 503 }
  );
}
