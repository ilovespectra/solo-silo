// Demo photos for each cluster
const DEMO_PHOTOS: Record<string, any[]> = {
  person_9: [
    { id: 'p9_1', image_path: '/demo/walken_1.jpg', thumbnail: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400', date_taken: Date.now(), similarity_score: 0.95, is_confirmed: true },
    { id: 'p9_2', image_path: '/demo/walken_2.jpg', thumbnail: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400', date_taken: Date.now(), similarity_score: 0.92, is_confirmed: true }
  ],
  person_1: [
    { id: 'p1_1', image_path: '/demo/luka_1.jpg', thumbnail: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400', date_taken: Date.now(), similarity_score: 0.91, is_confirmed: true }
  ],
  person_2: [
    { id: 'p2_1', image_path: '/demo/bowie_1.jpg', thumbnail: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400', date_taken: Date.now(), similarity_score: 0.89, is_confirmed: true }
  ],
  person_0: [
    { id: 'p0_1', image_path: '/demo/paula_1.jpg', thumbnail: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400', date_taken: Date.now(), similarity_score: 0.87, is_confirmed: true }
  ],
  person_8: [
    { id: 'p8_1', image_path: '/demo/tito_1.jpg', thumbnail: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400', date_taken: Date.now(), similarity_score: 0.85, is_confirmed: true }
  ]
};

function isDemoMode() {
  return process.env.VERCEL === '1';
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const { slug } = await params;
  const pathSuffix = slug.join('/');
  
  // Return demo photos for cluster
  if (isDemoMode()) {
    const clusterId = slug[0];
    if (clusterId && DEMO_PHOTOS[clusterId]) {
      console.log(`[Demo Mode] Returning photos for ${clusterId}`);
      return Response.json(DEMO_PHOTOS[clusterId]);
    }
    return Response.json([]);
  }

  const url = new URL(request.url);
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
