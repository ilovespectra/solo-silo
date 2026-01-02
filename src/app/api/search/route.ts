import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  
  const isVercel = !!(process.env.VERCEL || process.env.VERCEL_ENV);
  const backendUrl = isVercel 
    ? process.env.RAILWAY_BACKEND_URL || 'https://silo-backend-production.up.railway.app'
    : 'http://127.0.0.1:8000';
  
  try {
    const searchUrl = `${backendUrl}/api/search?${searchParams.toString()}`;
    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: req.headers as HeadersInit,
      signal: AbortSignal.timeout(30000),
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
