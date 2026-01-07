import { fetchBackend } from '@/lib/backendClient';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const mediaId = id;
  const url = new URL(request.url);
  const siloName = url.searchParams.get('silo_name');

  let backendUrl = `/api/media/${mediaId}/favorite`;
  if (siloName) {
    backendUrl += `?silo_name=${encodeURIComponent(siloName)}`;
  }

  return fetchBackend(backendUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const mediaId = id;
  const url = new URL(request.url);
  const siloName = url.searchParams.get('silo_name');

  let backendUrl = `/api/media/${mediaId}/favorite`;
  if (siloName) {
    backendUrl += `?silo_name=${encodeURIComponent(siloName)}`;
  }

  return fetchBackend(backendUrl, {
    method: 'GET',
  });
}
