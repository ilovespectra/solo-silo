import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  
  if (isDemoMode) {
    // In demo mode, return a single demo silo
    return NextResponse.json([
      {
        name: 'demo',
        created_at: new Date().toISOString(),
        has_password: false,
        is_active: true
      }
    ]);
  }
  
  // In local mode, proxy to backend
  try {
    const backendUrl = 'http://127.0.0.1:8000/api/silos/list';
    const backendResponse = await fetch(backendUrl, {
      method: 'GET',
      headers: req.headers as HeadersInit,
      signal: AbortSignal.timeout(5000),
    });
    
    if (!backendResponse.ok) {
      throw new Error(`Backend returned ${backendResponse.status}`);
    }
    
    const data = await backendResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[silos/list] Error proxying to backend:', error);
    return NextResponse.json(
      { error: 'Backend unavailable' },
      { status: 503 }
    );
  }
}
