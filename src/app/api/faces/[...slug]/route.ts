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
  return process.env.NEXT_PUBLIC_DEMO_MODE === 'true' || 
         process.env.VERCEL === '1';
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const { slug } = await params;
  const url = new URL(request.url);
  const pathSuffix = slug.join('/');
  
  // Return demo data for clusters endpoint
  if (isDemoMode() && pathSuffix === 'clusters') {
    return Response.json(DEMO_CLUSTERS);
  }
  
  const backendUrl = `http://127.0.0.1:8000/api/faces/${pathSuffix}${url.search}`;
  
  try {
    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(2000)
    });
    
    if (!response.ok) {
      // Fallback to demo data for clusters
      if (pathSuffix === 'clusters') {
        return Response.json(DEMO_CLUSTERS);
      }
      return Response.json({ error: 'Backend request failed' }, { status: response.status });
    }
    
    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    console.error('[PROXY_ERROR] failed to fetch from backend:', error);
    // Fallback to demo data for clusters
    if (pathSuffix === 'clusters') {
      return Response.json(DEMO_CLUSTERS);
    }
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
