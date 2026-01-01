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
    name: 'luka dončić',
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

interface DemoPhoto {
  id: string;
  image_path: string;
  thumbnail: string;
  date_taken: number;
  similarity_score: number;
  is_confirmed: boolean;
}

const DEMO_PHOTOS: Record<string, DemoPhoto[]> = {
  person_9: [
    { id: '440', image_path: '/test-files/images/walken/download.jpeg', thumbnail: '/test-files/images/walken/download.jpeg', date_taken: 1522262442, similarity_score: 0.95, is_confirmed: true },
    { id: '441', image_path: '/test-files/images/walken/download (1).jpeg', thumbnail: '/test-files/images/walken/download (1).jpeg', date_taken: 1522262442, similarity_score: 0.94, is_confirmed: true },
    { id: '442', image_path: '/test-files/images/walken/download (2).jpeg', thumbnail: '/test-files/images/walken/download (2).jpeg', date_taken: 1522262442, similarity_score: 0.93, is_confirmed: true },
    { id: '443', image_path: '/test-files/images/walken/download (3).jpeg', thumbnail: '/test-files/images/walken/download (3).jpeg', date_taken: 1522262442, similarity_score: 0.92, is_confirmed: true },
    { id: '444', image_path: '/test-files/images/walken/download (4).jpeg', thumbnail: '/test-files/images/walken/download (4).jpeg', date_taken: 1522262442, similarity_score: 0.91, is_confirmed: true },
    { id: '445', image_path: '/test-files/images/walken/download (5).jpeg', thumbnail: '/test-files/images/walken/download (5).jpeg', date_taken: 1522262442, similarity_score: 0.90, is_confirmed: true },
    { id: '446', image_path: '/test-files/images/walken/download (6).jpeg', thumbnail: '/test-files/images/walken/download (6).jpeg', date_taken: 1522262442, similarity_score: 0.89, is_confirmed: false },
    { id: '447', image_path: '/test-files/images/walken/download (7).jpeg', thumbnail: '/test-files/images/walken/download (7).jpeg', date_taken: 1522262442, similarity_score: 0.88, is_confirmed: false },
    { id: '448', image_path: '/test-files/images/walken/download (8).jpeg', thumbnail: '/test-files/images/walken/download (8).jpeg', date_taken: 1522262442, similarity_score: 0.87, is_confirmed: false },
    { id: '449', image_path: '/test-files/images/walken/download (9).jpeg', thumbnail: '/test-files/images/walken/download (9).jpeg', date_taken: 1522262442, similarity_score: 0.86, is_confirmed: false }
  ],
  person_1: [
    { id: '407', image_path: '/test-files/images/luka/download (5).jpeg', thumbnail: '/test-files/images/luka/download (5).jpeg', date_taken: 1767258236, similarity_score: 0.91, is_confirmed: true },
    { id: '439', image_path: '/test-files/images/luka/download (10).jpeg', thumbnail: '/test-files/images/luka/download (10).jpeg', date_taken: 1767258236, similarity_score: 0.90, is_confirmed: true },
    { id: '411', image_path: '/test-files/images/luka/download (8).jpeg', thumbnail: '/test-files/images/luka/download (8).jpeg', date_taken: 1767258236, similarity_score: 0.89, is_confirmed: true }
  ],
  person_2: [
    { id: '14', image_path: '/test-files/images/bowie/download.jpeg', thumbnail: '/test-files/images/bowie/download.jpeg', date_taken: 1767258236, similarity_score: 0.96, is_confirmed: true },
    { id: '15', image_path: '/test-files/images/bowie/download (1).jpeg', thumbnail: '/test-files/images/bowie/download (1).jpeg', date_taken: 1767258236, similarity_score: 0.95, is_confirmed: true },
    { id: '16', image_path: '/test-files/images/bowie/download (2).jpeg', thumbnail: '/test-files/images/bowie/download (2).jpeg', date_taken: 1767258236, similarity_score: 0.94, is_confirmed: true },
    { id: '17', image_path: '/test-files/images/bowie/download (3).jpeg', thumbnail: '/test-files/images/bowie/download (3).jpeg', date_taken: 1767258236, similarity_score: 0.93, is_confirmed: true },
    { id: '18', image_path: '/test-files/images/bowie/download (4).jpeg', thumbnail: '/test-files/images/bowie/download (4).jpeg', date_taken: 1767258236, similarity_score: 0.92, is_confirmed: true },
    { id: '19', image_path: '/test-files/images/bowie/download (5).jpeg', thumbnail: '/test-files/images/bowie/download (5).jpeg', date_taken: 1767258236, similarity_score: 0.91, is_confirmed: false },
    { id: '20', image_path: '/test-files/images/bowie/download (6).jpeg', thumbnail: '/test-files/images/bowie/download (6).jpeg', date_taken: 1767258236, similarity_score: 0.90, is_confirmed: false },
    { id: '21', image_path: '/test-files/images/bowie/download (7).jpeg', thumbnail: '/test-files/images/bowie/download (7).jpeg', date_taken: 1767258236, similarity_score: 0.89, is_confirmed: false },
    { id: '22', image_path: '/test-files/images/bowie/download (8).jpeg', thumbnail: '/test-files/images/bowie/download (8).jpeg', date_taken: 1767258236, similarity_score: 0.88, is_confirmed: false },
    { id: '23', image_path: '/test-files/images/bowie/download (9).jpeg', thumbnail: '/test-files/images/bowie/download (9).jpeg', date_taken: 1767258236, similarity_score: 0.87, is_confirmed: false },
    { id: '24', image_path: '/test-files/images/bowie/download (10).jpeg', thumbnail: '/test-files/images/bowie/download (10).jpeg', date_taken: 1767258236, similarity_score: 0.86, is_confirmed: false }
  ],
  person_0: [
    { id: '2', image_path: '/test-files/images/abdul/download (5).jpeg', thumbnail: '/test-files/images/abdul/download (5).jpeg', date_taken: 1767258236, similarity_score: 0.98, is_confirmed: true },
    { id: '3', image_path: '/test-files/images/abdul/download.jpeg', thumbnail: '/test-files/images/abdul/download.jpeg', date_taken: 1767258236, similarity_score: 0.96, is_confirmed: true },
    { id: '4', image_path: '/test-files/images/abdul/download (1).jpeg', thumbnail: '/test-files/images/abdul/download (1).jpeg', date_taken: 1767258236, similarity_score: 0.95, is_confirmed: false },
    { id: '5', image_path: '/test-files/images/abdul/download (2).jpeg', thumbnail: '/test-files/images/abdul/download (2).jpeg', date_taken: 1767258236, similarity_score: 0.94, is_confirmed: false },
    { id: '6', image_path: '/test-files/images/abdul/download (3).jpeg', thumbnail: '/test-files/images/abdul/download (3).jpeg', date_taken: 1767258236, similarity_score: 0.93, is_confirmed: false },
    { id: '7', image_path: '/test-files/images/abdul/download (4).jpeg', thumbnail: '/test-files/images/abdul/download (4).jpeg', date_taken: 1767258236, similarity_score: 0.92, is_confirmed: false },
    { id: '8', image_path: '/test-files/images/abdul/download (6).jpeg', thumbnail: '/test-files/images/abdul/download (6).jpeg', date_taken: 1767258236, similarity_score: 0.91, is_confirmed: false },
    { id: '9', image_path: '/test-files/images/abdul/download (7).jpeg', thumbnail: '/test-files/images/abdul/download (7).jpeg', date_taken: 1767258236, similarity_score: 0.90, is_confirmed: false },
    { id: '10', image_path: '/test-files/images/abdul/download (8).jpeg', thumbnail: '/test-files/images/abdul/download (8).jpeg', date_taken: 1767258236, similarity_score: 0.89, is_confirmed: false },
    { id: '11', image_path: '/test-files/images/abdul/download (9).jpeg', thumbnail: '/test-files/images/abdul/download (9).jpeg', date_taken: 1767258236, similarity_score: 0.88, is_confirmed: false },
    { id: '12', image_path: '/test-files/images/abdul/download (12).jpeg', thumbnail: '/test-files/images/abdul/download (12).jpeg', date_taken: 1767258236, similarity_score: 0.87, is_confirmed: false },
    { id: '13', image_path: '/test-files/images/abdul/download (1).jpeg', thumbnail: '/test-files/images/abdul/download (1).jpeg', date_taken: 1767258236, similarity_score: 0.86, is_confirmed: false }
  ],
  person_8: [
    { id: '428', image_path: '/test-files/images/tito/download.jpeg', thumbnail: '/test-files/images/tito/download.jpeg', date_taken: 1767258236, similarity_score: 0.97, is_confirmed: true },
    { id: '429', image_path: '/test-files/images/tito/download (1).jpeg', thumbnail: '/test-files/images/tito/download (1).jpeg', date_taken: 1767258236, similarity_score: 0.96, is_confirmed: false },
    { id: '430', image_path: '/test-files/images/tito/download (2).jpeg', thumbnail: '/test-files/images/tito/download (2).jpeg', date_taken: 1767258236, similarity_score: 0.95, is_confirmed: false },
    { id: '431', image_path: '/test-files/images/tito/download (3).jpeg', thumbnail: '/test-files/images/tito/download (3).jpeg', date_taken: 1767258236, similarity_score: 0.94, is_confirmed: false },
    { id: '432', image_path: '/test-files/images/tito/download (4).jpeg', thumbnail: '/test-files/images/tito/download (4).jpeg', date_taken: 1767258236, similarity_score: 0.93, is_confirmed: false },
    { id: '433', image_path: '/test-files/images/tito/download (5).jpeg', thumbnail: '/test-files/images/tito/download (5).jpeg', date_taken: 1767258236, similarity_score: 0.92, is_confirmed: false },
    { id: '434', image_path: '/test-files/images/tito/download (6).jpeg', thumbnail: '/test-files/images/tito/download (6).jpeg', date_taken: 1767258236, similarity_score: 0.91, is_confirmed: false },
    { id: '435', image_path: '/test-files/images/tito/download (7).jpeg', thumbnail: '/test-files/images/tito/download (7).jpeg', date_taken: 1767258236, similarity_score: 0.90, is_confirmed: false },
    { id: '436', image_path: '/test-files/images/tito/download (8).jpeg', thumbnail: '/test-files/images/tito/download (8).jpeg', date_taken: 1767258236, similarity_score: 0.89, is_confirmed: false },
    { id: '437', image_path: '/test-files/images/tito/download (9).jpeg', thumbnail: '/test-files/images/tito/download (9).jpeg', date_taken: 1767258236, similarity_score: 0.88, is_confirmed: false },
    { id: '438', image_path: '/test-files/images/tito/download (10).jpeg', thumbnail: '/test-files/images/tito/download (10).jpeg', date_taken: 1767258236, similarity_score: 0.87, is_confirmed: false }
  ],
  person_3: [
    { id: '397', image_path: '/test-files/images/luka/download (5).jpeg', thumbnail: '/test-files/images/luka/download (5).jpeg', date_taken: 1767258236, similarity_score: 0.99, is_confirmed: true },
    { id: '398', image_path: '/test-files/images/luka/download (6).jpeg', thumbnail: '/test-files/images/luka/download (6).jpeg', date_taken: 1767258236, similarity_score: 0.98, is_confirmed: false },
    { id: '399', image_path: '/test-files/images/luka/download (7).jpeg', thumbnail: '/test-files/images/luka/download (7).jpeg', date_taken: 1767258236, similarity_score: 0.97, is_confirmed: true },
    { id: '400', image_path: '/test-files/images/luka/download (8).jpeg', thumbnail: '/test-files/images/luka/download (8).jpeg', date_taken: 1767258236, similarity_score: 0.96, is_confirmed: true },
    { id: '401', image_path: '/test-files/images/luka/download (9).jpeg', thumbnail: '/test-files/images/luka/download (9).jpeg', date_taken: 1767258236, similarity_score: 0.95, is_confirmed: true },
    { id: '403', image_path: '/test-files/images/luka/download (11).jpeg', thumbnail: '/test-files/images/luka/download (11).jpeg', date_taken: 1767258236, similarity_score: 0.94, is_confirmed: false },
    { id: '404', image_path: '/test-files/images/luka/download (12).jpeg', thumbnail: '/test-files/images/luka/download (12).jpeg', date_taken: 1767258236, similarity_score: 0.93, is_confirmed: true },
    { id: '405', image_path: '/test-files/images/luka/download (13).jpeg', thumbnail: '/test-files/images/luka/download (13).jpeg', date_taken: 1767258236, similarity_score: 0.92, is_confirmed: true },
    { id: '406', image_path: '/test-files/images/luka/download (14).jpeg', thumbnail: '/test-files/images/luka/download (14).jpeg', date_taken: 1767258236, similarity_score: 0.91, is_confirmed: false },
    { id: '407', image_path: '/test-files/images/luka/download (15).jpeg', thumbnail: '/test-files/images/luka/download (15).jpeg', date_taken: 1767258236, similarity_score: 0.90, is_confirmed: false },
    { id: '408', image_path: '/test-files/images/luka/download (16).jpeg', thumbnail: '/test-files/images/luka/download (16).jpeg', date_taken: 1767258236, similarity_score: 0.89, is_confirmed: true },
    { id: '409', image_path: '/test-files/images/luka/download (17).jpeg', thumbnail: '/test-files/images/luka/download (17).jpeg', date_taken: 1767258236, similarity_score: 0.88, is_confirmed: false },
    { id: '412', image_path: '/test-files/images/luka/download (18).jpeg', thumbnail: '/test-files/images/luka/download (18).jpeg', date_taken: 1767258236, similarity_score: 0.87, is_confirmed: true },
    { id: '414', image_path: '/test-files/images/luka/download (19).jpeg', thumbnail: '/test-files/images/luka/download (19).jpeg', date_taken: 1767258236, similarity_score: 0.86, is_confirmed: true }
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
  
  if (isDemoMode()) {
    if (pathSuffix === 'clusters') {
      console.log('[Demo Mode] Returning demo face clusters');
      return Response.json(DEMO_CLUSTERS);
    }
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
