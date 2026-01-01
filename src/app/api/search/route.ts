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
      const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 0);
      
      const semanticMap: Record<string, string[]> = {
        'person': ['bowie', 'abdul', 'tito', 'walken', 'luka', 'portrait', 'face'],
        'people': ['bowie', 'abdul', 'tito', 'walken', 'luka', 'portrait', 'face'],
        'face': ['bowie', 'abdul', 'tito', 'walken', 'luka', 'portrait'],
        'document': ['docs', 'bible', 'declaration', 'text', 'pdf'],
        'text': ['docs', 'bible', 'declaration', 'document'],
      };
      
      const results = allItems
        .map(item => {
          const name = (item.name || '').toLowerCase();
          const itemPath = (item.path || '').toLowerCase();
          const fullText = `${name} ${itemPath}`;
          
          let score = 0;
          
          queryTerms.forEach(term => {
            if (name.includes(term)) score += 5;
            if (itemPath.includes(term)) score += 3;
          });
          
          queryTerms.forEach(term => {
            const synonyms = semanticMap[term] || [];
            synonyms.forEach(syn => {
              if (fullText.includes(syn)) score += 2;
            });
          });
          
          if (queryLower.match(/person|people|face|portrait|man|woman/)) {
            if (itemPath.includes('/images/')) score += 10;
          }
          
          if (queryLower.match(/document|text|bible|declaration|paper/)) {
            if (itemPath.includes('/docs/')) score += 10;
          }
          
          return { ...item, score };
        })
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
      
      return NextResponse.json(results);
    } catch (error) {
      console.error('[search] Error in demo mode:', error);
      return NextResponse.json([]);
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
