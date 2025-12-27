// Proxy for /api/people list endpoint to new /api/faces/clusters backend endpoint
export async function GET(request: Request) {
  const url = new URL(request.url);
  
  // Forward query parameters like include_hidden if present
  const backendUrl = `http://127.0.0.1:8000/api/faces/clusters${url.search}`;
  
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
    console.error('[PROXY_ERROR] failed to fetch from backend:', error);
    return Response.json({ error: 'Backend unavailable' }, { status: 503 });
  }
}
