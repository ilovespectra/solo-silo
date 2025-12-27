import { NextRequest, NextResponse } from 'next/server';

/**
 * File Upload API
 * Handles file uploads and adds them to the media library
 * This endpoint proxies to the Python backend which handles the actual file processing
 */

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'Only image files are supported' },
        { status: 400 }
      );
    }

    const buffer = await file.arrayBuffer();

    const backendFormData = new FormData();
    backendFormData.append('file', new Blob([buffer], { type: file.type }), file.name);

    const backendResponse = await fetch('http://127.0.0.1:8000/api/media/upload', {
      method: 'POST',
      body: backendFormData,
    });

    if (!backendResponse.ok) {
      const error = await backendResponse.text();
      console.error('Backend upload error:', error);
      return NextResponse.json(
        { error: 'Failed to upload file to backend' },
        { status: backendResponse.status }
      );
    }

    const result = await backendResponse.json();

    return NextResponse.json({
      success: true,
      media_id: result.media_id,
      file_path: result.file_path,
      thumbnail: result.thumbnail,
    });
  } catch (error) {
    console.error('Error in /api/files/upload:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
