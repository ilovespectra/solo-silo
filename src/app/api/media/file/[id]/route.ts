import { NextRequest, NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/backendClient';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const silo_name = req.nextUrl.searchParams.get('silo_name') || 'default';

  try {
    const endpoint = `/api/media/file/${id}?silo_name=${encodeURIComponent(silo_name)}`;
    
    const response = await fetchBackend(endpoint, {
      method: 'GET'
    });

    if (!response.ok) {
      console.error(`[API] Backend file fetch failed: ${response.status}`);
      return new NextResponse('Not found', { status: response.status });
    }

    // Get the image buffer
    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600'
      }
    });
  } catch (error) {
    console.error('[API] Error in media file endpoint:', error);
    return new NextResponse('Error fetching file', { status: 500 });
  }
}
