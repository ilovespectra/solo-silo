interface FileMetadata {
  id: number;
  path: string;
  viewedAt?: number;
  addedAt?: number;
  type?: string;
  date_taken?: number;
  size?: number;
  width?: number;
  height?: number;
  camera?: string;
  lens?: string;
  rotation?: number;
}

export async function cacheImage(id: number, blob: Blob): Promise<void> {
}

export async function getCachedImage(id: number): Promise<Blob | null> {
  return null;
}

export async function trackFileViewed(id: number, path: string): Promise<void> {
  try {
    // Track the view on the backend
    await fetch(`/api/media/${id}/track-view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[imageCache] Failed to track file view:', err);
  }
}

export async function trackFileAdded(id: number, path: string): Promise<void> {
}

export async function getRecentlyViewed(limit: number = 50): Promise<FileMetadata[]> {
  try {
    const response = await fetch(`/api/media/recently-viewed?limit=${limit}`);
    if (!response.ok) {
      console.error('[imageCache] Failed to get recently viewed:', response.status);
      return [];
    }
    const data = await response.json();
    return data || [];
  } catch (err) {
    console.error('[imageCache] Error getting recently viewed:', err);
    return [];
  }
}

export async function getRecentlyAdded(limit: number = 50): Promise<FileMetadata[]> {
  try {
    const response = await fetch(`/api/media/recently-added?limit=${limit}`);
    if (!response.ok) {
      console.error('[imageCache] Failed to get recently added:', response.status);
      return [];
    }
    const data = await response.json();
    return data || [];
  } catch (err) {
    console.error('[imageCache] Error getting recently added:', err);
    return [];
  }
}

export async function clearCache(): Promise<void> {
}
