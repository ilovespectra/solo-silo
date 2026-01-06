import { NextRequest, NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/backendClient';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, password, password_mode } = body;
    
    // Block in demo mode
    const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
    if (isDemoMode) {
      return NextResponse.json(
        { detail: 'Cannot create silos in demo mode' },
        { status: 403 }
      );
    }
    
    // Forward to backend
    const response = await fetchBackend('/api/silos/create', {
      method: 'POST',
      body: JSON.stringify({ name, password, password_mode }),
      timeout: 10000,
      retries: 0,
    });
    
    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(
        { detail: error.detail || 'Failed to create silo' },
        { status: response.status }
      );
    }
    
    const data = await response.json();
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('[silos/create] Error:', error);
    
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
