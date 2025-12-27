export async function POST(request: Request) {
  const body = await request.json();
  const backendUrl = `http://127.0.0.1:8000/api/faces/add-to-multiple-clusters`;
  
  try {
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      return Response.json(
        { error: errorData.detail || 'Backend request failed' },
        { status: response.status }
      );
    }
    
    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    console.error('[PROXY_ERROR] Failed to POST to backend:', error);
    return Response.json({ error: 'Backend unavailable' }, { status: 503 });
  }
}
