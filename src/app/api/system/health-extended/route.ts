import { NextResponse } from 'next/server';
import { isBackendReady } from '@/lib/backendClient';

export async function GET() {
  try {
    // Check backend health with improved timeout
    const backendHealthy = await isBackendReady();
    
    return NextResponse.json({
      status: backendHealthy ? 'healthy' : 'unhealthy',
      backend: {
        healthy: backendHealthy,
        url: 'http://127.0.0.1:8000',
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
