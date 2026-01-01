import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  // Check if running on Vercel or if DEMO_MODE env var is set
  const isVercel = process.env.VERCEL === '1';
  const forceDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  
  if (isVercel || forceDemoMode) {
    // Running on Vercel - return demo mode
    return NextResponse.json({
      demo_mode: true,
      read_only: true,
      message: 'Running in demo mode'
    });
  }
  
  // Try to proxy to backend if available
  try {
    const backendUrl = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8000';
    const response = await fetch(`${backendUrl}/api/system/mode`, {
      signal: AbortSignal.timeout(2000),
    });
    
    if (response.ok) {
      const data = await response.json();
      return NextResponse.json(data);
    }
  } catch (error) {
    console.log('Backend not available, defaulting to demo mode');
  }
  
  // Fallback to demo mode if backend is not available
  return NextResponse.json({
    demo_mode: true,
    read_only: true,
    message: 'Backend unavailable - running in demo mode'
  });
}
