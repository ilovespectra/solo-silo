import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const isVercel = process.env.VERCEL === '1';
  const forceDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  
  if (isVercel || forceDemoMode) {
    return NextResponse.json({
      demo_mode: true,
      read_only: true,
      message: 'Running in demo mode'
    });
  }
  
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
  
  return NextResponse.json({
    demo_mode: true,
    read_only: true,
    message: 'Backend unavailable - running in demo mode'
  });
}
