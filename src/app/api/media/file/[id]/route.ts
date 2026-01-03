import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const forceDemoMode = !!(
    process.env.VERCEL || 
    process.env.VERCEL_ENV ||
    process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
  );

  if (forceDemoMode) {
    // In demo mode, serve from public folder
    try {
      // Map known demo audio IDs to their paths
      if (id === '459') {
        const audioPath = path.join(process.cwd(), 'public/test-files/audio/Oliver.mp3');
        
        if (!fs.existsSync(audioPath)) {
          return NextResponse.json(
            { error: 'Audio file not found' },
            { status: 404 }
          );
        }

        const fileBuffer = fs.readFileSync(audioPath);
        
        return new NextResponse(fileBuffer, {
          headers: {
            'Content-Type': 'audio/mpeg',
            'Content-Length': fileBuffer.length.toString(),
            'Accept-Ranges': 'bytes',
          },
        });
      }
      
      return NextResponse.json(
        { error: 'File not found in demo' },
        { status: 404 }
      );
    } catch (error) {
      console.error('[media/file] Demo error:', error);
      return NextResponse.json(
        { error: 'Failed to serve demo file' },
        { status: 500 }
      );
    }
  }

  // In local mode, proxy to backend
  try {
    const url = new URL(request.url);
    const backendUrl = `http://127.0.0.1:8000/api/media/file/${id}${url.search}`;
    
    const backendResponse = await fetch(backendUrl, {
      method: 'GET',
      headers: request.headers as HeadersInit,
    });
    
    if (!backendResponse.ok) {
      throw new Error(`Backend returned ${backendResponse.status}`);
    }
    
    // Stream the audio file from backend
    const buffer = await backendResponse.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': backendResponse.headers.get('Content-Type') || 'audio/mpeg',
        'Content-Length': backendResponse.headers.get('Content-Length') || '',
        'Accept-Ranges': 'bytes',
      },
    });
  } catch (error) {
    console.error('[media/file] Error proxying to backend:', error);
    return NextResponse.json(
      { error: 'Backend unavailable' },
      { status: 503 }
    );
  }
}
