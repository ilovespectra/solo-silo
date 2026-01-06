import { NextRequest, NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/backendClient';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  
  try {
    const response = await fetchBackend(`/api/search?${searchParams.toString()}`, {
      method: 'GET',
      timeout: 30000,
      retries: 3,
    });
    
    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }
    
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[search] Error proxying to backend:', error);
    return NextResponse.json(
      { error: 'Search failed', message: String(error) },
      { status: 500 }
    );
  }
}
