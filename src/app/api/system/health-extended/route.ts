import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Check backend health
    const backendUrl = 'http://127.0.0.1:8000/health';
    const backendResponse = await fetch(backendUrl, {
      signal: AbortSignal.timeout(3000),
    });
    
    const backendHealthy = backendResponse.ok;
    
    return NextResponse.json({
      status: backendHealthy ? 'healthy' : 'unhealthy',
      backend: {
        healthy: backendHealthy,
        url: backendUrl,
        status: backendResponse.status,
      },
      frontend: {
        healthy: true,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[health-extended] Error checking health:', error);
    return NextResponse.json(
      {
        status: 'unhealthy',
        backend: {
          healthy: false,
          error: String(error),
        },
        frontend: {
          healthy: true,
        },
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
