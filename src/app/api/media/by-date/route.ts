import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  
  if (isDemoMode) {
    // In demo mode, return demo files from public/test-files
    // This is a simplified structure - ideally we'd query the demo SQLite db
    // but for now we'll return demo file references
    const demoFiles = {
      '2024-01': [],
      '2024-02': [],
      '2024-03': []
    };
    return NextResponse.json(demoFiles);
  }
  
  // In local mode, proxy to backend
  try {
    const url = new URL(req.url);
    const backendUrl = `http://127.0.0.1:8000/api/media/by-date${url.search}`;
    
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
    console.error('[media/by-date] Error proxying to backend:', error);
    return NextResponse.json(
      { error: 'Backend unavailable' },
      { status: 503 }
    );
  }
}
