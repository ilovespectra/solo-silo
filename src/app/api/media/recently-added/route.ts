import { NextRequest, NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/backendClient';

export async function GET(req: NextRequest) {
  const limit = req.nextUrl.searchParams.get('limit') || '50';
  const silo_name = req.nextUrl.searchParams.get('silo_name') || 'default';

  try {
    const endpoint = `/api/media/recently-added?limit=${limit}&silo_name=${encodeURIComponent(silo_name)}`;
    
    const response = await fetchBackend(endpoint);

    if (!response.ok) {
      console.error(`[API] Backend request failed: ${response.status}`);
      return NextResponse.json([], { status: 200 }); // Return empty array on failure
    }

    const data = await response.json();
    return NextResponse.json(data || [], { status: 200 });
  } catch (error) {
    console.error('[API] Error fetching recently added:', error);
    return NextResponse.json([], { status: 200 }); // Return empty array on error
  }
}
