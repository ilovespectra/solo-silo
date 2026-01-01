import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true' || 
                     process.env.VERCEL || 
                     process.env.VERCEL_ENV;
  
  if (isDemoMode) {
    try {
      const mediaPath = path.join(process.cwd(), 'public', 'demo-media.json');
      const mediaData = JSON.parse(fs.readFileSync(mediaPath, 'utf-8'));
      
      let item: any = null;
      for (const dateGroup of mediaData) {
        const found = dateGroup.items?.find((i: any) => i.id === parseInt(id));
        if (found) {
          item = found;
          break;
        }
      }
      
      if (!item) {
        console.error('[thumbnail] Media not found:', id);
        return new NextResponse('Not found', { status: 404 });
      }
      
      const imagePath = path.join(process.cwd(), 'public', item.path);
      
      if (!fs.existsSync(imagePath)) {
        console.error('[thumbnail] Image file not found:', imagePath);
        return new NextResponse('Image not found', { status: 404 });
      }
      
      const imageBuffer = fs.readFileSync(imagePath);
      const ext = path.extname(item.path).toLowerCase();
      
      let contentType = 'image/jpeg';
      if (ext === '.png') contentType = 'image/png';
      else if (ext === '.gif') contentType = 'image/gif';
      else if (ext === '.webp') contentType = 'image/webp';
      else if (ext === '.svg') contentType = 'image/svg+xml';
      
      return new NextResponse(imageBuffer, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    } catch (error) {
      console.error('[thumbnail] Error serving demo thumbnail:', error);
      return new NextResponse('Error loading image', { status: 500 });
    }
  }
  
  try {
    const url = new URL(req.url);
    const backendUrl = `http://127.0.0.1:8000/api/media/thumbnail/${params.id}${url.search}`;
    
    const backendResponse = await fetch(backendUrl, {
      method: 'GET',
      headers: req.headers as HeadersInit,
      signal: AbortSignal.timeout(10000),
    });
    
    if (!backendResponse.ok) {
      throw new Error(`Backend returned ${backendResponse.status}`);
    }
    
    const imageBuffer = await backendResponse.arrayBuffer();
    const contentType = backendResponse.headers.get('content-type') || 'image/jpeg';
    
    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('[thumbnail] Error proxying to backend:', error);
    return new NextResponse('Backend unavailable', { status: 503 });
  }
}
