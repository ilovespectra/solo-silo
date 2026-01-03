import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const forceDemoMode = !!(
    process.env.VERCEL || 
    process.env.VERCEL_ENV ||
    process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
  );

  if (forceDemoMode) {
    console.log('[Audio API] Returning demo audio');
    // Return the audio file from demo-media.json
    return NextResponse.json([
      {
        id: 459,
        path: '/test-files/audio/Oliver.mp3',
        name: 'Oliver.mp3',
        type: 'audio',
        size: 7296813,
        date_taken: 1735689600
      }
    ]);
  }

  // In local mode, proxy to backend
  try {
    const url = new URL(request.url);
    const backendUrl = `http://127.0.0.1:8000/api/media/audio${url.search}`;
    
    const backendResponse = await fetch(backendUrl, {
      method: 'GET',
      headers: request.headers as HeadersInit,
      signal: AbortSignal.timeout(5000),
    });
    
    if (!backendResponse.ok) {
      throw new Error(`Backend returned ${backendResponse.status}`);
    }
    
    const data = await backendResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[audio] Error proxying to backend:', error);
    return NextResponse.json(
      { error: 'Backend unavailable' },
      { status: 503 }
    );
  }
}
