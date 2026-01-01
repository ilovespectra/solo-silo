const DEMO_CLUSTERS = [
  {
    id: 'person_2',
    name: 'bowie',
    primary_thumbnail: '/test-files/images/bowie/download.jpeg',
    photo_count: 11,
    confidence_score: 0.996,
    is_hidden: false,
    last_updated: 1767258236
  },
  {
    id: 'person_0',
    name: 'paula abdul',
    primary_thumbnail: '/test-files/images/abdul/download (5).jpeg',
    photo_count: 13,
    confidence_score: 0.98,
    is_hidden: false,
    last_updated: 1767258236
  },
  {
    id: 'person_8',
    name: 'tito',
    primary_thumbnail: '/test-files/images/tito/download.jpeg',
    photo_count: 11,
    confidence_score: 0.997,
    is_hidden: false,
    last_updated: 1767258236
  },
  {
    id: 'person_9',
    name: 'walken',
    primary_thumbnail: '/test-files/images/walken/download.jpeg',
    photo_count: 10,
    confidence_score: 0.993,
    is_hidden: false,
    last_updated: 1522262442
  },
  {
    id: 'person_3',
    name: 'unknown',
    primary_thumbnail: '/test-files/images/luka/download (5).jpeg',
    photo_count: 14,
    confidence_score: 0.99,
    is_hidden: false,
    last_updated: 1767258236
  },
  {
    id: 'person_1',
    name: 'luka dončić',
    primary_thumbnail: '/test-files/images/luka/download (5).jpeg',
    photo_count: 3,
    confidence_score: 0.91,
    is_hidden: true,
    last_updated: 1767258236
  }
];

function isDemoMode() {
  return process.env.VERCEL === '1';
}

export async function GET(request: Request) {
  if (isDemoMode()) {
    console.log('[demo mode] returning demo face clusters');
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
      return Response.json({ error: 'backend request failed' }, { status: response.status });
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
