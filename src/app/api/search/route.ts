import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { pipeline } from '@xenova/transformers';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const isVercel = !!(process.env.VERCEL || process.env.VERCEL_ENV);
  
  if (isVercel) {
    try {
      const query = searchParams.get('q') || '';
      const limit = parseInt(searchParams.get('limit') || '20');
      
      const embeddingsPath = path.join(process.cwd(), 'public/demo-embeddings.json');
      const embeddings = JSON.parse(fs.readFileSync(embeddingsPath, 'utf-8'));
      
      const clipModel = await pipeline('feature-extraction', 'Xenova/clip-vit-base-patch32');
      const queryEmbedding = await clipModel(query, { pooling: 'mean', normalize: true });
      const queryVector = Array.from(queryEmbedding.data);
      
      const results = embeddings.map((item: any) => {
        const similarity = cosineSimilarity(queryVector, item.embedding);
        return {
          id: item.id,
          path: item.path,
          score: similarity,
          similarity: similarity
        };
      })
      .sort((a: any, b: any) => b.similarity - a.similarity)
      .slice(0, limit);
      
      return NextResponse.json({ results, total: results.length, offset: 0, limit, has_more: false });
    } catch (error) {
      console.error('[search] Error in Vercel mode:', error);
      return NextResponse.json({ error: 'Search failed' }, { status: 500 });
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

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
