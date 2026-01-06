import { NextRequest, NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/backendClient';

export async function GET(req: NextRequest) {
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  
  if (isDemoMode) {
    // In demo mode, return empty favorites
    return NextResponse.json([]);
  }
  
  // In local mode, proxy to backend
  try {
    const url = new URL(req.url);
    const backendResponse = await fetchBackend(`/api/favorites${url.search}`, {
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
    console.error('[favorites] Error proxying to backend:', error);
    return NextResponse.json(
      { error: 'Backend unavailable' },
      { status: 503 }
    );
  }
}

export async function POST(req: NextRequest) {
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  
  if (isDemoMode) {
    return NextResponse.json(
      { error: 'Favorites not available in demo mode' },
      { status: 403 }
    );
  }
  
  // In local mode, proxy to backend
  try {
    const body = await req.text();
    const url = new URL(req.url);
    const backendResponse = await fetchBackend(`/api/favorites${url.search}`, {
      method: 'POST',
      body,
      timeout: 10000,
      retries: 0,
    });
    
    if (!backendResponse.ok) {
      throw new Error(`Backend returned ${backendResponse.status}`);
    }
    
    const data = await backendResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[favorites] Error proxying to backend:', error);
    return NextResponse.json(
      { error: 'Backend unavailable' },
      { status: 503 }
    );
  }
}
