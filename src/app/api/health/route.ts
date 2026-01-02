import { NextResponse } from 'next/server';

export async function GET() {
  // In demo mode, always return healthy
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  
  if (isDemoMode) {
    return NextResponse.json({ status: 'ok', mode: 'demo' });
  }
  
  // Check if we're on Vercel and should check Railway backend
  const isVercel = !!(process.env.VERCEL || process.env.VERCEL_ENV);
  let backendUrl = isVercel
    ? process.env.RAILWAY_BACKEND_URL || 'https://silo-backend-production.up.railway.app'
    : 'http://127.0.0.1:8000';
  
  // Ensure Railway URL has protocol
  if (isVercel && !backendUrl.startsWith('http')) {
    backendUrl = `https://${backendUrl}`;
  }
  
  // Check if backend is available
  try {
    const backendResponse = await fetch(`${backendUrl}/api/health`, {
      signal: AbortSignal.timeout(2000),
    });
    
    if (backendResponse.ok) {
      return NextResponse.json({ status: 'ok', mode: isVercel ? 'railway' : 'local' });
    }
  } catch (error) {
    console.error('[health] Backend not available:', error);
  }
  
  return NextResponse.json(
    { status: 'backend_unavailable', mode: isVercel ? 'railway' : 'local' },
    { status: 503 }
  );
}
