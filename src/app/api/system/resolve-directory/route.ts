import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { folderName, sampleFiles } = await req.json();
    
    // In demo mode, this endpoint shouldn't be called, but return error gracefully
    const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
    if (isDemoMode) {
      return NextResponse.json(
        { detail: 'Directory selection not available in demo mode' },
        { status: 403 }
      );
    }
    
    // Forward to backend to resolve the directory path
    const backendUrl = 'http://127.0.0.1:8000';
    const response = await fetch(`${backendUrl}/api/system/resolve-directory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderName, sampleFiles }),
      signal: AbortSignal.timeout(5000),
    });
    
    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(
        { detail: error.detail || 'Failed to resolve directory' },
        { status: response.status }
      );
    }
    
    const data = await response.json();
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('[resolve-directory] Error:', error);
    
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { detail: 'Backend not responding. Make sure the backend is running.' },
        { status: 503 }
      );
    }
    
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
