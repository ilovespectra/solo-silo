import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(req: NextRequest) {
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true' || 
                     process.env.VERCEL || 
                     process.env.VERCEL_ENV;
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q') || '';
  const limit = parseInt(searchParams.get('limit') || '20');
  
  if (isDemoMode) {
    try {
      const mediaPath = path.join(process.cwd(), 'public/demo-media.json');
      const mediaData = JSON.parse(fs.readFileSync(mediaPath, 'utf-8'));
      
      const allItems: any[] = [];
      mediaData.forEach((day: any) => {
        if (day.items && Array.isArray(day.items)) {
          allItems.push(...day.items);
        }
      });
      
      const queryLower = query.toLowerCase();
      const results = allItems.filter(item => {
        const name = (item.name || '').toLowerCase();
        const path = (item.path || '').toLowerCase();
        return name.includes(queryLower) || path.includes(queryLower);
      }).slice(0, limit);
      
      return NextResponse.json({
        results: results,
        query: query,
        total: results.length
      });
    } catch (error) {
      console.error('[search] Error in demo mode:', error);
      return NextResponse.json({ results: [], query: query, total: 0 });
    }
  }
  
  try {
    const backendUrl = `http://127.0.0.1:8000/api/search?${searchParams.toString()}`;
    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: req.headers as HeadersInit,
      signal: AbortSignal.timeout(5000),
    });
    
    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }
    
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[search] Error proxying to backend:', error);
    return NextResponse.json(
      { error: 'Search failed' },
      { status: 500 }
    );
  }
}
