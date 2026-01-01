import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  
  if (isDemoMode) {
    // In demo mode, return empty array (expected by MediaGallery)
    // MediaGallery expects: [{ date_taken: string, items: string }]
    return NextResponse.json([]);
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
