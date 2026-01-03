import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(req: NextRequest) {
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true' || 
                     (process.env.VERCEL && process.env.VERCEL !== '0') || 
                     process.env.VERCEL_ENV;
  
  if (isDemoMode) {
    try {
      const mediaPath = path.join(process.cwd(), 'public', 'demo-media.json');
      console.log('[media/by-date] Reading demo media from:', mediaPath);
      const media = JSON.parse(fs.readFileSync(mediaPath, 'utf-8'));
      console.log('[media/by-date] Loaded demo media:', {
        dates: media.length,
        totalItems: media.reduce((acc: number, day: any) => acc + (day.items?.length || 0), 0)
      });
      return NextResponse.json(media);
    } catch (error) {
      console.error('[Demo Mode] Failed to read demo media:', error);
      return NextResponse.json([]);
    }
  }
  
  try {
    const url = new URL(req.url);
    const backendUrl = `http://127.0.0.1:8000/api/media/by-date${url.search}`;
    
    const backendResponse = await fetch(backendUrl, {
      method: 'GET',
      headers: req.headers as HeadersInit,
      signal: AbortSignal.timeout(5000),
    });
    
    if (!backendResponse.ok) {
      throw new Error(`Backend returned ${backendResponse.status}`);
    }
    
    const data = await backendResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[media/by-date] Error proxying to backend:', error);
    return NextResponse.json(
      { error: 'Backend unavailable' },
      { status: 503 }
    );
  }
}
