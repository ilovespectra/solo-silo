import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const forceDemoMode = !!(
    (process.env.VERCEL && process.env.VERCEL !== '0') || 
    process.env.VERCEL_ENV ||
    process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
  );

  if (forceDemoMode) {
    console.log('[Stats API] Returning demo stats (forced demo mode)');
    return NextResponse.json({
      total_files: 93,
      by_type: {
        image: 93
      },
      total_size_bytes: 12500000,
      with_people: 45,
      with_animals: 8
    });
  }

  try {
    const { searchParams } = new URL(request.url);
    const siloName = searchParams.get('silo_name');
    
    const url = siloName 
      ? `http://127.0.0.1:8000/api/media/stats?silo_name=${encodeURIComponent(siloName)}`
      : 'http://127.0.0.1:8000/api/media/stats';
    
    const response = await fetch(url, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[Stats] Backend unavailable, returning demo stats:', error);
    return NextResponse.json({
      total_files: 93,
      by_type: {
        image: 93
      },
      total_size_bytes: 12500000,
      with_people: 45,
      with_animals: 8
    });
  }
}
