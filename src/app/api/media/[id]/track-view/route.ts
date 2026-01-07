import { NextRequest, NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/backendClient';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const silo_name = req.nextUrl.searchParams.get('silo_name') || 'default';

  try {
    const endpoint = `/api/media/${id}/track-view?silo_name=${encodeURIComponent(silo_name)}`;
    
    const response = await fetchBackend(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    // Don't require a specific response - just ensure it was called
    if (response.ok) {
      return NextResponse.json({ success: true }, { status: 200 });
    }
    
    // Even if backend doesn't have this endpoint, don't fail the image load
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('[API] Error tracking file view:', error);
    // Don't fail on track-view errors
    return NextResponse.json({ success: true }, { status: 200 });
  }
}
