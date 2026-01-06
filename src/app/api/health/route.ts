import { NextResponse } from 'next/server';
import { isBackendReady } from '@/lib/backendClient';

export async function GET() {
  // In demo mode, always return healthy
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  
  if (isDemoMode) {
    return NextResponse.json({ status: 'ok', mode: 'demo' });
  }
  
  // Check if we're on Vercel and should check Railway backend
  const isVercel = !!((process.env.VERCEL && process.env.VERCEL !== '0') || process.env.VERCEL_ENV);
  
  // For local mode, check if backend is ready with improved timeout
  if (!isVercel) {
    const ready = await isBackendReady();
    if (ready) {
      return NextResponse.json({ status: 'ok', mode: 'local' });
    }
    return NextResponse.json(
      { status: 'backend_unavailable', mode: 'local', message: 'Backend not ready (may be loading ML models)' },
      { status: 503 }
    );
  }
  
  // Vercel/Railway logic
  let backendUrl = process.env.RAILWAY_BACKEND_URL || 'https://silo-backend-production.up.railway.app';
  
  // Ensure Railway URL has protocol
  if (!backendUrl.startsWith('http')) {
    backendUrl = `https://${backendUrl}`;
  }
  
  // Check if backend is available
  try {
    const backendResponse = await fetch(`${backendUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    
    if (backendResponse.ok) {
      return NextResponse.json({ status: 'ok', mode: 'railway' });
    }
  } catch (error) {
    console.error('[health] Railway backend not available:', error);
  }
  
  return NextResponse.json(
    { status: 'backend_unavailable', mode: 'railway' },
    { status: 503 }
  );
}
