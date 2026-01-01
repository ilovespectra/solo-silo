// Demo clusters from public/demo-silo/people.json
const DEMO_CLUSTERS = [
  {
    id: 'person_9',
    name: 'walken',
    primary_thumbnail: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400',
    photo_count: 22,
    confidence_score: 0.94,
    is_hidden: false,
    last_updated: Date.now()
  },
  {
    id: 'person_1',
    name: 'luka dončić',
    primary_thumbnail: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
    photo_count: 3,
    confidence_score: 0.91,
    is_hidden: true,
    last_updated: Date.now()
  },
  {
    id: 'person_2',
    name: 'bowie',
    primary_thumbnail: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400',
    photo_count: 1,
    confidence_score: 0.89,
    is_hidden: false,
    last_updated: Date.now()
  },
  {
    id: 'person_0',
    name: 'paula abdul',
    primary_thumbnail: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400',
    photo_count: 1,
    confidence_score: 0.87,
    is_hidden: false,
    last_updated: Date.now()
  },
  {
    id: 'person_8',
    name: 'tito',
    primary_thumbnail: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400',
    photo_count: 1,
    confidence_score: 0.85,
    is_hidden: false,
    last_updated: Date.now()
  }
];

function isDemoMode() {
  return process.env.VERCEL === '1';
}

export async function GET(request: Request) {
  // Return demo clusters on Vercel
  if (isDemoMode()) {
    console.log('[Demo Mode] Returning demo face clusters');
    return Response.json(DEMO_CLUSTERS);
  }

  const url = new URL(request.url);
  const backendUrl = `http://127.0.0.1:8000${url.pathname}${url.search}`;
  
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
