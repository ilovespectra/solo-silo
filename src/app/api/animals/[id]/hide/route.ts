export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const url = new URL(request.url);
  const body = await request.json();
  
  const backendUrl = `http://127.0.0.1:8000/api/animals/${params.id}/hide${url.search}`;
  
  try {
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    
    if (!response.ok) {
      return Response.json({ error: 'Backend request failed' }, { status: response.status });
    }
    
    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    console.error('[PROXY_ERROR] failed to hide animal:', error);
    return Response.json({ error: 'Backend unavailable' }, { status: 503 });
  }
}
