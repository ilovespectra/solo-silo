import { NextRequest, NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/backendClient';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Block in demo mode
    const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
    if (isDemoMode) {
      return NextResponse.json(
        { detail: 'Cannot save silos in demo mode' },
        { status: 403 }
      );
    }
    
    // Forward to backend
    const response = await fetchBackend('/api/silos/save-current', {
      method: 'POST',
      body: JSON.stringify(body),
      timeout: 10000,
      retries: 0,
    });
    
    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(
        { detail: error.detail || 'Failed to save silo' },
        { status: response.status }
      );
    }
    
    const data = await response.json();
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('[silos/save-current] Error:', error);
    
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { detail: 'Backend not responding' },
        { status: 503 }
      );
    }
    
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
