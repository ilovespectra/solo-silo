export async function GET(request: Request) {
  const url = new URL(request.url);
  
  const backendUrl = `http://127.0.0.1:8000/api/animals${url.search}`;
  
  try {
    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });
    
    if (!response.ok) {
      return Response.json({ error: 'Backend request failed' }, { status: response.status });
    }
    
    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    console.error('[PROXY_ERROR] failed to fetch animals from backend:', error);
    return Response.json({ error: 'Backend unavailable' }, { status: 503 });
  }
}
