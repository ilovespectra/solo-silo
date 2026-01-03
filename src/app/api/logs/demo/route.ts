import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  const forceDemoMode = !!(
    (process.env.VERCEL && process.env.VERCEL !== '0') || 
    process.env.VERCEL_ENV ||
    process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
  );

  if (forceDemoMode) {
    try {
      const logsPath = path.join(process.cwd(), 'public', 'demo-logs.json');
      console.log('[Logs API] Reading demo logs from:', logsPath);
      const logs = JSON.parse(fs.readFileSync(logsPath, 'utf-8'));
      console.log('[Logs API] Loaded demo logs:', {
        indexingLogs: logs.indexingLogs?.length || 0,
        faceDetectionLogs: logs.faceDetectionLogs?.length || 0,
        clusteringLogs: logs.clusteringLogs?.length || 0
      });
      return NextResponse.json(logs);
    } catch (error) {
      console.error('[Demo Mode] Failed to read demo logs:', error);
      return NextResponse.json({
        indexingLogs: [],
        faceDetectionLogs: [],
        clusteringLogs: [],
        generatedAt: Date.now(),
        source: '/test-files',
        error: 'Failed to load demo logs'
      });
    }
  }

  try {
    const response = await fetch('http://127.0.0.1:8000/api/logs/demo', {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[Logs] Backend unavailable, returning demo logs:', error);
    try {
      const logsPath = path.join(process.cwd(), 'public', 'demo-logs.json');
      const logs = JSON.parse(fs.readFileSync(logsPath, 'utf-8'));
      console.log('[Logs API] Fallback: Loaded demo logs');
      return NextResponse.json(logs);
    } catch (readError) {
      console.error('[Logs] Failed to read demo logs file:', readError);
      return NextResponse.json({
        indexingLogs: [],
        faceDetectionLogs: [],
        clusteringLogs: [],
        error: 'Failed to load logs'
      });
    }
  }
}
