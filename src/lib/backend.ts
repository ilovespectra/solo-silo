import { MediaFile } from '@/types/backend';
import { isDemoMode } from './demoApi';

const API_BASE = '';

let backendReady: Promise<void> | null = null;
let clipModel: any = null;
let demoEmbeddings: any[] | null = null;

async function loadDemoEmbeddings() {
  if (demoEmbeddings) return demoEmbeddings;
  const response = await fetch('/demo-embeddings.json');
  demoEmbeddings = await response.json();
  return demoEmbeddings;
}

async function loadCLIPModel() {
  if (clipModel) return clipModel;
  const { pipeline } = await import('@xenova/transformers');
  clipModel = await pipeline('feature-extraction', 'Xenova/clip-vit-base-patch32');
  return clipModel;
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

let backendReady: Promise<void> | null = null;

async function ensureBackendRunning(): Promise<void> {
  if (backendReady) return backendReady;
  backendReady = (async () => {
    try {
      const res = await fetch(`/api/health`, { 
        method: 'GET', 
        signal: AbortSignal.timeout(3000) 
      });
      if (res.ok) return;
    } catch (error) {
      console.error('[backend] Health check failed:', error);
    }
  })();
  return backendReady;
}

async function request(path: string, init?: RequestInit, siloName?: string) {
  await ensureBackendRunning();
  
  const separator = path.includes('?') ? '&' : '?';
  const finalPath = siloName ? `${path}${separator}silo_name=${encodeURIComponent(siloName)}` : path;
  const fullUrl = `${API_BASE}${finalPath}`;
  
  const res = await fetch(fullUrl, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Request failed');
  }
  return res.json();
}

export async function fetchMediaByDate(siloName?: string) {
  return request('/api/media/by-date', undefined, siloName);
}

export async function fetchSearch(
  query: string, 
  limit: number = 20, 
  siloName?: string,
  fileTypes?: string,
  confidence?: number,
  offset?: number
) {
  if (isDemoMode()) {
    try {
      const embeddings = await loadDemoEmbeddings();
      const model = await loadCLIPModel();
      
      const queryEmbedding = await model(query, { pooling: 'mean', normalize: true });
      const queryVector = Array.from(queryEmbedding.data) as number[];
      
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
      .slice(offset || 0, (offset || 0) + limit);
      
      return { results, total: results.length, offset: offset || 0, limit, has_more: false };
    } catch (error) {
      console.error('[fetchSearch] Client-side search error:', error);
      throw error;
    }
  }
  
  const cappedLimit = Math.max(1, Math.min(limit, 100));
  let searchUrl = `/api/search?q=${encodeURIComponent(query)}&limit=${cappedLimit}`;
  
  if (fileTypes) {
    searchUrl += `&file_types=${encodeURIComponent(fileTypes)}`;
  }
  
  if (confidence !== undefined) {
    searchUrl += `&confidence=${confidence}`;
  }
  
  if (offset !== undefined) {
    searchUrl += `&offset=${offset}`;
  }
  
  return request(searchUrl, undefined, siloName);
}

export async function fetchPeople(siloName?: string) {
  return request('/api/people', undefined, siloName);
}

export async function namePerson(id: string, name: string, siloName?: string) {
  return request(`/api/people/${id}/name`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  }, siloName);
}

export async function hidePerson(id: string, hidden: boolean, siloName?: string) {
  return request(`/api/people/${id}/hide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hidden }),
  }, siloName);
}

export async function fetchUncertainDetections(
  detectionType?: string,
  reviewed?: boolean,
  limit: number = 50,
  offset: number = 0,
  siloName?: string
) {
  let path = `/api/uncertain-detections?limit=${limit}&offset=${offset}`;
  if (detectionType) path += `&detection_type=${detectionType}`;
  if (reviewed !== undefined) path += `&reviewed=${reviewed}`;
  
  return request(path, undefined, siloName);
}

export async function countUncertainDetections(siloName?: string) {
  return request('/api/uncertain-detections/count', undefined, siloName);
}

export async function reviewDetection(
  detectionId: number,
  approved: boolean,
  userLabel?: string,
  siloName?: string
) {
  return request(`/api/uncertain-detections/${detectionId}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approved, user_label: userLabel }),
  }, siloName);
}

export async function batchReviewDetections(detections: Array<{
  id: number;
  approved: boolean;
  user_label?: string;
}>, siloName?: string) {
  return request('/api/uncertain-detections/batch-review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(detections),
  }, siloName);
}

export async function getUserConfig(siloName?: string) {
  return request('/api/config', undefined, siloName);
}

export async function updateUserConfig(settings: Record<string, unknown>, siloName?: string) {
  return request('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  }, siloName);
}

export async function setFaceLabel(
  personId: string,
  name: string,
  aliases?: string[],
  siloName?: string
) {
  return request(`/api/labels/face/${personId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, aliases }),
  }, siloName);
}

export async function getFaceLabel(personId: string, siloName?: string) {
  return request(`/api/labels/face/${personId}`, undefined, siloName);
}

export async function searchFaceLabels(query: string, siloName?: string) {
  return request(`/api/labels/face?q=${encodeURIComponent(query)}`, undefined, siloName);
}

export async function setAnimalLabel(
  animalId: string,
  species: string,
  name?: string,
  breed?: string,
  siloName?: string
) {
  return request(`/api/labels/animal/${animalId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ species, name, breed }),
  }, siloName);
}

export async function searchAnimalLabels(query: string, siloName?: string) {
  return request(`/api/labels/animal?q=${encodeURIComponent(query)}`, undefined, siloName);
}

export async function advancedSearch(filters: Record<string, unknown>, siloName?: string) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.append(key, String(value));
    }
  });

  return request(`/api/media/search?${params}`, undefined, siloName);
}

export async function getFilterOptions(siloName?: string) {
  return request('/api/media/filter-options', undefined, siloName);
}

export async function moveFile(mediaId: number, destination: string, siloName?: string) {
  return request(`/api/media/${mediaId}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ destination }),
  }, siloName);
}

export async function deleteFile(mediaId: number, siloName?: string) {
  return request(`/api/media/${mediaId}`, {
    method: 'DELETE',
  }, siloName);
}

export async function getMediaStats(siloName?: string) {
  return request('/api/media/stats', undefined, siloName);
}

export async function submitSearchFeedback(
  mediaId: number,
  query: string,
  feedback: 'confirmed' | 'denied' | 'uncertain',
  label?: string,
  siloName?: string
) {
  return request('/api/search/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_id: mediaId, query, feedback, label }),
  }, siloName);
}

export async function fetchAnimals(siloName?: string) {
  return request('/api/animals', undefined, siloName);
}

export async function nameAnimal(id: string, name: string, siloName?: string) {
  return request(`/api/animals/${id}/name`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  }, siloName);
}

export async function hideAnimal(id: string, hidden: boolean, siloName?: string) {
  return request(`/api/animals/${id}/hide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hidden }),
  }, siloName);
}

export async function getPersonPhotos(personId: string, siloName?: string) {
  return request(`/api/people/${personId}/photos`, undefined, siloName);
}

export async function setPhotoFaceMatch(
  mediaId: number,
  personId: string,
  include: boolean,
  siloName?: string
) {
  return request(`/api/media/${mediaId}/face-match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ person_id: personId, include }),
  }, siloName);
}

export async function confirmPerson(personId: string, siloName?: string) {
  return request(`/api/people/${personId}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, siloName);
}

export async function rejectPerson(personId: string, siloName?: string) {
  return request(`/api/people/${personId}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, siloName);
}

export async function approveSearchResult(searchId: string, fileId: number, siloName?: string) {
  return request(`/api/search/${searchId}/approve?file_id=${fileId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, siloName);
}

export async function rejectSearchResult(searchId: string, fileId: number, siloName?: string) {
  return request(`/api/search/${searchId}/reject?file_id=${fileId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, siloName);
}

export async function retrainEmbeddings(siloName?: string) {
  return request('/api/retrain-embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, siloName);
}

export async function toggleFavorite(mediaId: number, siloName?: string): Promise<{success: boolean; media_id: number; is_favorite: boolean}> {
  return request(`/api/media/${mediaId}/favorite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, siloName);
}

export async function getFavoriteStatus(mediaId: number, siloName?: string): Promise<{media_id: number; is_favorite: boolean}> {
  return request(`/api/media/${mediaId}/favorite`, {
    method: 'GET',
  }, siloName);
}

export async function getAllFavorites(siloName?: string): Promise<{favorites: number[]; count: number}> {
  return request('/api/favorites', {
    method: 'GET',
  }, siloName);
}

export async function batchUpdateFavorites(mediaIds: number[], isFavorite: boolean, siloName?: string): Promise<{success: boolean; updated_count: number; is_favorite: boolean}> {
  return request('/api/favorites/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_ids: mediaIds, is_favorite: isFavorite }),
  }, siloName);
}

export async function reclusterFaces(siloName?: string): Promise<{success: boolean; clusters_created: number; clusters_with_3plus: number; faces_clustered: number; total_photos: number; logs: string[]}> {
  return request('/api/faces/recluster', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, siloName);
}

export async function getReclusterStatus(siloName?: string): Promise<{is_running: boolean; progress: number; status: string; logs: string[]}> {
  return request('/api/faces/recluster/status', {
    method: 'GET',
  }, siloName);
}

export { API_BASE };
export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalizedPath}`;
}
