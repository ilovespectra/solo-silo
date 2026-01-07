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

    // Extract silo_name from query parameters
    const url = new URL(req.url);
    const siloName = url.searchParams.get('silo_name');
    
    let backendUrl = 'http://127.0.0.1:8000/api/media/upload';
    if (siloName) {
      backendUrl += `?silo_name=${encodeURIComponent(siloName)}`;
    }

    console.log(`[upload] Uploading file: ${file.name}, size: ${buffer.byteLength}, type: ${file.type}, silo: ${siloName}, backend: ${backendUrl}`);

    const backendResponse = await fetch(backendUrl, {
      method: 'POST',
      body: backendFormData,
    });

    console.log(`[upload] Backend response status: ${backendResponse.status}`);

    if (!backendResponse.ok) {
      const error = await backendResponse.text();
      console.error(`[upload] Backend upload error (${backendResponse.status}):`, error);
      return NextResponse.json(
        { error: `Failed to upload file to backend: ${error}` },
        { status: backendResponse.status }
      );
    }

    const result = await backendResponse.json();
    console.log(`[upload] Backend response:`, result);

    return NextResponse.json({
      success: true,
      media_id: result.media_id,
      file_path: result.file_path,
      thumbnail: result.thumbnail,
    });
  } catch (error) {
    console.error('[upload] Error in /api/files/upload:', error);
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
