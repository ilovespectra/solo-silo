import { NextRequest, NextResponse } from 'next/server';
import { pipeline, env } from '@xenova/transformers';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

env.allowLocalModels = false;

let clipModelCache: any = null;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const isVercel = !!(process.env.VERCEL || process.env.VERCEL_ENV);
  
  if (isVercel) {
    try {
      const query = searchParams.get('q') || '';
      const limit = parseInt(searchParams.get('limit') || '20');
      
      console.log('[search] Vercel mode - query:', query);
      
      const embeddingsPath = path.join(process.cwd(), 'public/demo-embeddings.json');
      console.log('[search] Reading embeddings from:', embeddingsPath);
      const embeddings = JSON.parse(fs.readFileSync(embeddingsPath, 'utf-8'));
      console.log('[search] Loaded', embeddings.length, 'embeddings');
      
      console.log('[search] Loading CLIP model...');
      if (!clipModelCache) {
        clipModelCache = await pipeline('feature-extraction', 'Xenova/clip-vit-base-patch32', {
          quantized: true,
        });
      }
      console.log('[search] CLIP model ready');
      
      const queryEmbedding = await clipModelCache(query, { pooling: 'mean', normalize: true });
      const queryVector = Array.from(queryEmbedding.data) as number[];
      console.log('[search] Query embedding generated, dimensions:', queryVector.length);
      
      const results = embeddings.map((item: any) => {
        const similarity = cosineSimilarity(queryVector, item.embedding as number[]);
        return {
          id: item.id,
          path: item.path,
          score: similarity,
          similarity: similarity
        };
      })
      .sort((a: any, b: any) => b.similarity - a.similarity)
      .slice(0, limit);
      
      console.log('[search] Returning', results.length, 'results');
      return NextResponse.json({ results, total: results.length, offset: 0, limit, has_more: false });
    } catch (error: any) {
      console.error('[search] Error in Vercel mode:', error);
      console.error('[search] Error stack:', error.stack);
      return NextResponse.json({ 
        error: error.message || String(error),
        stack: error.stack 
      }, { status: 500 });
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
