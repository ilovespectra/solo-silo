import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const isVercel = !!(
    process.env.VERCEL || 
    process.env.VERCEL_ENV ||
    process.env.VERCEL_URL ||
    req.headers.get('x-vercel-deployment-url')
  );
  const forceDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  
  console.log('[mode api] environment:', {
    VERCEL: process.env.VERCEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_URL: process.env.VERCEL_URL,
    'x-vercel-deployment-url': req.headers.get('x-vercel-deployment-url'),
    isVercel,
    forceDemoMode
  });
  
  if (isVercel || forceDemoMode) {
    console.log('[mode api] returning demo mode (vercel deployment)');
    return NextResponse.json({
      demo_mode: true,
      read_only: true,
      message: 'running in demo mode on vercel'
    });
  }
  
  try {
    const backendUrl = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8000';
    const response = await fetch(`${backendUrl}/api/system/mode`, {
      signal: AbortSignal.timeout(2000),
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('[mode api] backend response:', data);
      return NextResponse.json(data);
    }
  } catch (error) {
    console.log('[mode api] backend not available, defaulting to demo mode');
  }
  
  console.log('[mode api] fallback to demo mode');
  return NextResponse.json({
    demo_mode: true,
    read_only: true,
    message: 'backend unavailable - running in demo mode'
  });
}
