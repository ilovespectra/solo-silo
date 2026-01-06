import { NextRequest, NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/backendClient';

export async function GET(req: NextRequest) {
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  
  if (isDemoMode) {
    // In demo mode, return empty folders array
    return NextResponse.json([]);
  }
  
  // In local mode, proxy to backend
  try {
    const url = new URL(req.url);
    const backendResponse = await fetchBackend(`/api/folders${url.search}`, {
      method: 'GET',
      timeout: 15000,
      retries: 3,
    });
    
    if (!backendResponse.ok) {
      throw new Error(`Backend returned ${backendResponse.status}`);
    }
    
    const data = await backendResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[folders] Error proxying to backend:', error);
    return NextResponse.json(
      { error: 'Backend unavailable' },
      { status: 503 }
    );
  }
}
