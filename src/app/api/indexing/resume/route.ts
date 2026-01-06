import { NextRequest, NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/backendClient';

export async function POST(req: NextRequest) {
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  
  if (isDemoMode) {
    return NextResponse.json(
      { error: 'Indexing not available in demo mode' },
      { status: 403 }
    );
  }
  
  // In local mode, proxy to backend
  try {
    const body = await req.text();
    const url = new URL(req.url);
    const backendResponse = await fetchBackend(`/api/indexing/resume${url.search}`, {
      method: 'POST',
      body,
      timeout: 30000,
      retries: 0,
    });
    
    if (!backendResponse.ok) {
      const errorText = await backendResponse.text();
      console.error('[resume] Backend error:', errorText);
      throw new Error(`Backend returned ${backendResponse.status}`);
    }
    
    const data = await backendResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[resume] Error proxying to backend:', error);
    return NextResponse.json(
      { error: 'Backend unavailable', details: String(error) },
      { status: 503 }
    );
  }
}
