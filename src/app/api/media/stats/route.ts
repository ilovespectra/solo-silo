import { NextResponse } from 'next/server';
import { isDemoMode } from '@/lib/demoApi';

export async function GET(request: Request) {
  if (isDemoMode()) {
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
    console.error('[Stats] Failed to fetch from backend:', error);
    return NextResponse.json({
      total_files: 0,
      by_type: {},
      total_size_bytes: 0,
      with_people: 0,
      with_animals: 0
    }, { status: 503 });
  }
}
