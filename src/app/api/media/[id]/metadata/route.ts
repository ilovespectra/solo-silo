import { NextRequest, NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/backendClient';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const silo_name = req.nextUrl.searchParams.get('silo_name') || 'default';

  try {
    const endpoint = `/api/media/${id}/metadata?silo_name=${encodeURIComponent(silo_name)}`;
    const response = await fetchBackend(endpoint, {
      method: 'GET'
    });

    if (!response.ok) {
      console.error(`[API] Backend metadata fetch failed: ${response.status}`);
      return NextResponse.json(
        { error: 'Failed to fetch metadata' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('[API] Error in metadata endpoint:', error);
    return NextResponse.json(
      { error: 'Failed to fetch metadata', details: String(error) },
      { status: 500 }
    );
  }
}
