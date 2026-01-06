import { NextRequest, NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/backendClient';

export async function GET(req: NextRequest) {
  // Check if demo mode is explicitly enabled
  const forceDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  
  // Check if running on Vercel (must be '1' or truthy non-zero value, not '0')
  const isVercel = !!(
    (process.env.VERCEL && process.env.VERCEL !== '0') || 
    process.env.VERCEL_ENV ||
    process.env.VERCEL_URL ||
    req.headers.get('x-vercel-deployment-url')
  );
  
  console.log('[mode api] environment:', {
    NEXT_PUBLIC_DEMO_MODE: process.env.NEXT_PUBLIC_DEMO_MODE,
    VERCEL: process.env.VERCEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    forceDemoMode,
    isVercel
  });
  
  // Enable demo mode if explicitly set OR if on Vercel
  if (forceDemoMode || isVercel) {
    console.log('[mode api] returning demo mode');
    return NextResponse.json({
      demo_mode: true,
      read_only: true,
      message: forceDemoMode ? 'demo mode (NEXT_PUBLIC_DEMO_MODE=true)' : 'demo mode (vercel deployment)'
    });
  }
  
  try {
    const response = await fetchBackend('/api/system/mode', {
      timeout: 15000,
      retries: 3,
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('[mode api] backend response:', data);
      return NextResponse.json(data);
    }
  } catch (error) {
    console.log('[mode api] backend not available yet');
  }
  
  console.log('[mode api] local mode - backend will initialize');
  return NextResponse.json({
    demo_mode: false,
    read_only: false,
    message: 'local mode - backend initializing'
  });
}
