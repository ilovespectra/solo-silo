import { NextResponse } from 'next/server';
import { isDemoMode } from '@/lib/demoApi';
import fs from 'fs';
import path from 'path';

export async function GET() {
  if (isDemoMode()) {
    try {
      const logsPath = path.join(process.cwd(), 'public', 'demo-logs.json');
      const logs = JSON.parse(fs.readFileSync(logsPath, 'utf-8'));
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
    console.error('[Settings] Failed to fetch logs from backend:', error);
    return NextResponse.json({
      indexingLogs: [],
      faceDetectionLogs: [],
      clusteringLogs: [],
      error: 'Backend unavailable'
    }, { status: 503 });
  }
}
