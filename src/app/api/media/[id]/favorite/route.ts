import { fetchBackend } from '@/lib/backendClient';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const mediaId = params.id;
  const url = new URL(request.url);
  const siloName = url.searchParams.get('silo_name');

  return fetchBackend(`/api/media/${mediaId}/favorite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, siloName);
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const mediaId = params.id;
  const url = new URL(request.url);
  const siloName = url.searchParams.get('silo_name');

  return fetchBackend(`/api/media/${mediaId}/favorite`, {
    method: 'GET',
  }, siloName);
}
