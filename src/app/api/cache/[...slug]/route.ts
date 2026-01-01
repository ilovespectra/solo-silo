function isDemoMode() {
  return process.env.NEXT_PUBLIC_DEMO_MODE === 'true' || 
         process.env.VERCEL === '1';
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const { slug } = await params;
  const url = new URL(request.url);
  const pathSuffix = slug.join('/');
  
  // In demo mode, return success for cache operations (no-op)
  if (isDemoMode()) {
    return Response.json({ success: true, demo: true });
  }
  
  const backendUrl = `http://127.0.0.1:8000/api/cache/${pathSuffix}${url.search}`;
  
  try {
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(2000)
    });
    
    if (!response.ok) {
      return Response.json({ error: 'Backend request failed' }, { status: response.status });
    }
    
    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    console.error('[PROXY_ERROR] Failed to POST to backend:', error);
    // Return success as fallback in case of error
    return Response.json({ success: true, fallback: true });
  }
}
