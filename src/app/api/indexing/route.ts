import { NextRequest, NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/backendClient';

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
  
  // In local mode, proxy to backend with retry logic
  try {
    const url = new URL(req.url);
    const backendResponse = await fetchBackend(`/api/indexing${url.search}`, {
      method: 'GET',
      timeout: 15000,
      retries: 3, // Retry up to 3 times for GET requests
    });
    
    if (!backendResponse.ok) {
      const errorText = await backendResponse.text();
      console.error('[indexing] Backend error:', backendResponse.status, errorText);
      throw new Error(`Backend returned ${backendResponse.status}`);
    }
    
    const data = await backendResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[indexing] Error proxying to backend:', error);
    
    // More specific error messages
    const isTimeout = (error as Error).name === 'AbortError';
    const isConnectionError = error instanceof TypeError;
    
    return NextResponse.json(
      { 
        error: isTimeout 
          ? 'Backend is loading (ML models take 60+ seconds)' 
          : isConnectionError
          ? 'Backend not started - run backend first'
          : 'Backend unavailable',
        details: (error as Error).message
      },
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
  
  // In local mode, proxy to backend (no retries for POST)
  try {
    const body = await req.text();
    const url = new URL(req.url);
    const backendResponse = await fetchBackend(`/api/indexing${url.search}`, {
      method: 'POST',
      body,
      timeout: 30000,
      retries: 0, // Don't retry POST requests
    });
    
    if (!backendResponse.ok) {
      const errorText = await backendResponse.text();
      console.error('[indexing] Backend error:', backendResponse.status, errorText);
      throw new Error(`Backend returned ${backendResponse.status}`);
    }
    
    const data = await backendResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[indexing] Error proxying to backend:', error);
    
    const isTimeout = (error as Error).name === 'AbortError';
    const isConnectionError = error instanceof TypeError;
    
    return NextResponse.json(
      { 
        error: isTimeout 
          ? 'Backend timeout (indexing takes time)' 
          : isConnectionError
          ? 'Backend not started - run backend first'
          : 'Backend unavailable',
        details: (error as Error).message
      },
      { status: 503 }
    );
  }
}
