interface FileMetadata {
  id: number;
  path: string;
  viewedAt?: number;
  addedAt: number;
}

export async function cacheImage(id: number, blob: Blob): Promise<void> {
}

export async function getCachedImage(id: number): Promise<Blob | null> {
  return null;
}

export async function trackFileViewed(id: number, path: string): Promise<void> {
}

export async function trackFileAdded(id: number, path: string): Promise<void> {
}

export async function getRecentlyViewed(limit: number = 50): Promise<FileMetadata[]> {
  return [];
}

export async function getRecentlyAdded(limit: number = 50): Promise<FileMetadata[]> {
  return [];
}

export async function clearCache(): Promise<void> {
}
