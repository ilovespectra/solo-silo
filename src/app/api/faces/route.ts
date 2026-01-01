// Demo mode data
const DEMO_CLUSTERS = [
  { 
    cluster_id: 'person_1', 
    name: 'Luka', 
    count: 12, 
    sample_paths: ['/demo-silo/thumbnails/person_1_1.jpg', '/demo-silo/thumbnails/person_1_2.jpg'], 
    all_photo_ids: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
  },
  { 
    cluster_id: 'person_2', 
    name: '', 
    count: 8, 
    sample_paths: ['/demo-silo/thumbnails/person_2_1.jpg'], 
    all_photo_ids: [14, 15, 16, 17, 18, 19, 20, 21]
  }
];

function isDemoMode() {
  // Check if backend is unavailable (demo mode on Vercel)
  return process.env.NEXT_PUBLIC_DEMO_MODE === 'true' || 
         process.env.VERCEL === '1';
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  
  // Return demo data in demo mode or if backend is unavailable
  if (isDemoMode()) {
    if (url.pathname.includes('/clusters')) {
      return Response.json(DEMO_CLUSTERS);
    }
    return Response.json([]);
  }
  
  const backendUrl = `http://127.0.0.1:8000${url.pathname}${url.search}`;
  
  try {
    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(2000)
    });
    
    if (!response.ok) {
      // Fallback to demo data if backend fails
      if (url.pathname.includes('/clusters')) {
        return Response.json(DEMO_CLUSTERS);
      }
      return Response.json({ error: 'Backend request failed' }, { status: response.status });
    }
    
    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    console.error('[PROXY_ERROR] failed to fetch from backend:', error);
    // Return demo data as fallback
    if (url.pathname.includes('/clusters')) {
      return Response.json(DEMO_CLUSTERS);
    }
    return Response.json({ error: 'Backend unavailable' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const backendUrl = `http://127.0.0.1:8000${url.pathname}${url.search}`;
  
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  
  try {
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
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
