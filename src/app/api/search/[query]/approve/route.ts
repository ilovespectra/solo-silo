import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ query: string }> }
) {
  const { query } = await params;
  try {
    const { searchParams } = request.nextUrl;
    const fileId = searchParams.get('file_id');
    const siloName = searchParams.get('silo_name') || 'default';

    if (!fileId) {
      return NextResponse.json(
        { error: 'file_id is required' },
        { status: 400 }
      );
    }

    const backendUrl = `http://localhost:8000/api/search/${encodeURIComponent(query)}/approve?file_id=${fileId}&silo_name=${encodeURIComponent(siloName)}`;

    const response = await fetch(backendUrl, {
      method: 'POST',
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Backend error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[API] Error proxying approve request:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}
