export async function POST(
  request: Request,
  { params }: { params: Promise<{ personId: string }> }
) {
  const { personId } = await params;
  const url = new URL(request.url);
  const pathname = url.pathname;
  
  const pathParts = pathname.split('/');
  const action = pathParts[pathParts.length - 1];
  
  const backendUrl = `http://127.0.0.1:8000/api/faces/${personId}/${action}${url.search}`;
  
  const body = await request.json();
  
  try {
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
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
