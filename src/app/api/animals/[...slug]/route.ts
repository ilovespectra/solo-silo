import { NextRequest, NextResponse } from 'next/server';

/**
 * Animals API Proxy
 * Forwards all animal-related requests to the Python backend
 */

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const { slug } = await params;
  const url = new URL(request.url);
  const pathSuffix = slug.join('/');
  const backendUrl = `http://127.0.0.1:8000/api/animals${pathSuffix ? '/' + pathSuffix : ''}${url.search}`;

  try {
    const response = await fetch(backendUrl, {
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      return Response.json({ error: 'Backend request failed' }, { status: response.status });
    }

    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    console.error('[PROXY_ERROR] failed to fetch from backend:', error);
    return Response.json({ error: 'Backend unavailable' }, { status: 503 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const { slug } = await params;
  const url = new URL(request.url);
  const pathSuffix = slug.join('/');
  const backendUrl = `http://127.0.0.1:8000/api/animals${pathSuffix ? '/' + pathSuffix : ''}${url.search}`;

  let body;
  const contentType = request.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    try {
      body = await request.json();
    } catch {
      // Empty or invalid JSON body, no problem
      body = undefined;
    }
  } else {
    body = await request.text();
  }

  try {
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      return Response.json({ error: 'Backend request failed' }, { status: response.status });
    }

    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    console.error('[PROXY_ERROR] Failed to POST to backend:', error);
    return Response.json({ error: 'Backend unavailable' }, { status: 503 });
  }
}
