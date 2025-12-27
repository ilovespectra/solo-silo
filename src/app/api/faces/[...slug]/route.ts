export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const { slug } = await params;
  const url = new URL(request.url);
  const pathSuffix = slug.join('/');
  const backendUrl = `http://127.0.0.1:8000/api/faces/${pathSuffix}${url.search}`;
  
  try {
    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
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
  const backendUrl = `http://127.0.0.1:8000/api/faces/${pathSuffix}${url.search}`;
  
  let body;
  const contentType = request.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    body = await request.json();
  } else {
    body = await request.text();
  }
  
  try {
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
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
