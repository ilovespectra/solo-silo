import { NextRequest, NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/backendClient';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ silo_name: string }> }
) {
  try {
    const params = await context.params;
    const body = await req.json();
    const { paths } = body;
    const siloName = params.silo_name;

    console.log(`[api/silos/${siloName}/media-paths] Setting paths:`, paths);

    // Forward to backend
    const response = await fetchBackend(`/api/silos/${siloName}/media-paths`, {
      method: 'POST',
      body: JSON.stringify({ paths }),
      timeout: 10000,
      retries: 0,
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(
        { detail: error.detail || 'Failed to set media paths' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('[silos/media-paths] Error:', error);

    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { detail: 'Backend not responding. Make sure the backend is running.' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { detail: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ silo_name: string }> }
) {
  try {
    const params = await context.params;
    const siloName = params.silo_name;

    console.log(`[api/silos/${siloName}/media-paths] Getting paths`);

    // Forward to backend
    const response = await fetchBackend(`/api/silos/${siloName}/media-paths`, {
      method: 'GET',
      timeout: 10000,
      retries: 0,
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(
        { detail: error.detail || 'Failed to get media paths' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('[silos/media-paths] Error:', error);

    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { detail: 'Backend not responding. Make sure the backend is running.' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { detail: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
