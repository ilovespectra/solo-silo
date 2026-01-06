import { NextRequest, NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/backendClient';

export async function GET(req: NextRequest) {
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  
  if (isDemoMode) {
    // In demo mode, return a single demo silo
    return NextResponse.json([
      {
        name: 'demo',
        created_at: new Date().toISOString(),
        has_password: false,
        is_active: true
      }
    ]);
  }
  
  // In local mode, proxy to backend
  try {
    const backendResponse = await fetchBackend('/api/silos/list', {
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
    console.error('[silos/list] Error proxying to backend:', error);
    return NextResponse.json(
      { error: 'Backend unavailable' },
      { status: 503 }
    );
  }
}
