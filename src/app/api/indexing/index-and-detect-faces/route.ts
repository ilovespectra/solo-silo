import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const backendUrl = `http://127.0.0.1:8000/api/indexing/index-and-detect-faces${url.search}`;
  
  try {
    const backendResponse = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text();
      console.error('[index-and-detect-faces] Backend error:', backendResponse.status, errorText);
      return NextResponse.json(
        { error: errorText || 'Failed to start indexing and face detection' },
        { status: backendResponse.status }
      );
    }

    const data = await backendResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[index-and-detect-faces] Error proxying to backend:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error 
          ? error.message 
          : 'Backend connection failed. Please ensure the backend is running.' 
      },
      { status: 503 }
    );
  }
}
