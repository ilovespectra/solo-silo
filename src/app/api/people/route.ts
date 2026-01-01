import fs from 'fs';
import path from 'path';

export async function GET(request: Request) {
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  
  if (isDemoMode) {
    try {
      const peoplePath = path.join(process.cwd(), 'public/demo-silo/people.json');
      const peopleData = JSON.parse(fs.readFileSync(peoplePath, 'utf-8'));
      return Response.json(peopleData);
    } catch (error) {
      console.error('[people] Error reading demo people:', error);
      return Response.json({});
    }
  }
  
  const url = new URL(request.url);
  
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
