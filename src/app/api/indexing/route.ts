import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  
  if (isDemoMode) {
    // In demo mode, return completed indexing status
    return NextResponse.json({
      indexing: false,
      progress: 1.0,
      message: 'Demo data pre-indexed',
      files_processed: 93,
      total_files: 93
    });
  }
  
  // In local mode, proxy to backend
  try {
    const url = new URL(req.url);
    const backendUrl = `http://127.0.0.1:8000/api/indexing${url.search}`;
    
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
    console.error('[indexing] Error proxying to backend:', error);
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
      { error: 'Indexing not available in demo mode' },
      { status: 403 }
    );
  }
  
  // In local mode, proxy to backend
  try {
    const body = await req.text();
    const url = new URL(req.url);
    const backendUrl = `http://127.0.0.1:8000/api/indexing${url.search}`;
    
    const backendResponse = await fetch(backendUrl, {
      method: 'POST',
      headers: req.headers as HeadersInit,
      body,
      signal: AbortSignal.timeout(30000),
    });
    
    if (!backendResponse.ok) {
      throw new Error(`Backend returned ${backendResponse.status}`);
    }
    
    const data = await backendResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[indexing] Error proxying to backend:', error);
    return NextResponse.json(
      { error: 'Backend unavailable' },
      { status: 503 }
    );
  }
}
