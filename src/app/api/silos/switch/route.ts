import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, password } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Silo name is required' },
        { status: 400 }
      );
    }

    // Proxy to backend
    const backendUrl = 'http://127.0.0.1:8000';
    const response = await fetch(`${backendUrl}/api/silos/switch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error switching silo:', error);
    return NextResponse.json(
      { error: 'Failed to switch silo' },
      { status: 500 }
    );
  }
}
