// Demo mode data - matches FaceCluster interface
const DEMO_CLUSTERS = [
  { 
    id: 'person_1', 
    name: 'Luka', 
    primary_thumbnail: '/demo-silo/thumbnails/person_1_1.jpg',
    photo_count: 12, 
    confidence_score: 0.95,
    is_hidden: false,
    last_updated: Date.now()
  },
  { 
    id: 'person_2', 
    name: '', 
    primary_thumbnail: '/demo-silo/thumbnails/person_2_1.jpg',
    photo_count: 8,
    confidence_score: 0.89,
    is_hidden: false,
    last_updated: Date.now()
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
