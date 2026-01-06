import { NextRequest, NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/backendClient';

export async function POST(req: NextRequest) {
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  
  if (isDemoMode) {
    // In demo mode, return mock file count
    return NextResponse.json({
      total_count: 93,
      message: 'Demo file count'
    });
  }
  
  // In local mode, proxy to backend
  try {
    const body = await req.text();
    const url = new URL(req.url);
    const backendResponse = await fetchBackend(`/api/indexing/count-files${url.search}`, {
      method: 'POST',
      body,
      timeout: 30000,
      retries: 0,
    });
    
    if (!backendResponse.ok) {
      const errorText = await backendResponse.text();
      console.error('[count-files] Backend error:', errorText);
      throw new Error(`Backend returned ${backendResponse.status}`);
    }
    
    const data = await backendResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[count-files] Error proxying to backend:', error);
    return NextResponse.json(
      { error: 'Backend unavailable', details: String(error) },
      { status: 503 }
    );
  }
}
