import { NextRequest, NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/backendClient';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const silo_name = req.nextUrl.searchParams.get('silo_name') || 'default';

  try {
    const body = await req.json();
    const { rotation } = body;

    console.log(`[API] Proxying rotate request for media_id=${id}, rotation=${rotation}, silo=${silo_name}`);

    const endpoint = `/api/media/${id}/rotate?silo_name=${encodeURIComponent(silo_name)}`;
    
    const response = await fetchBackend(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rotation })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`[API] Backend rotate failed: ${response.status}`, data);
      return NextResponse.json(data, { status: response.status });
    }

    console.log(`[API] Rotation saved successfully for media ${id}`);
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('[API] Error in rotate endpoint:', error);
    return NextResponse.json(
      { error: 'Failed to rotate image', details: String(error) },
      { status: 500 }
    );
  }
}
