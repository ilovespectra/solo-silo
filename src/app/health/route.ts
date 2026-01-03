import { NextResponse } from 'next/server';

export async function GET() {
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  
  if (isDemoMode) {
    return NextResponse.json({ status: 'ok', mode: 'demo' });
  }
  
  try {
    const backendResponse = await fetch('http://localhost:8000/health', {
      signal: AbortSignal.timeout(2000),
    });
    
    if (!backendResponse.ok) {
      return NextResponse.json(
        { status: 'error', message: 'Backend unreachable' },
        { status: 503 }
      );
    }
    
    const data = await backendResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[HEALTH] Backend check failed:', error);
    return NextResponse.json(
      { status: 'error', message: 'Backend unavailable' },
      { status: 503 }
    );
  }
}
