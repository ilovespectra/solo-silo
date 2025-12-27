import { useState, useCallback } from 'react';
import { useSilos } from '@/hooks/useSilos';

export interface FaceCluster {
  id: string;
  name: string | null;
  primary_thumbnail: string;
  photo_count: number;
  confidence_score: number;
  is_hidden: boolean;
  last_updated: number;
  rotation_override?: number;
}

export interface ClusterPhoto {
  id: string;
  image_path: string;
  thumbnail: string;
  date_taken: number | null;
  similarity_score: number;
  is_confirmed: boolean;
}

export const useFaceClusters = () => {
  const { activeSilo } = useSilos();
  const [clusters, setClusters] = useState<FaceCluster[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchClusters = useCallback(async (includeHidden = false, forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      if (forceRefresh) {
        try {
          const siloParam = activeSilo?.name ? `?silo_name=${encodeURIComponent(activeSilo.name)}` : '';
          await fetch(`/api/cache/clear-face-clusters${siloParam}`, { 
            method: 'POST',
            cache: 'no-store',
          });
          console.log('[useFaceClusters] Backend cache cleared (forced refresh)');
        } catch (err) {
          console.warn('[useFaceClusters] Failed to clear backend cache (non-critical):', err);
        }
      }

      const siloParam = activeSilo?.name ? `&silo_name=${encodeURIComponent(activeSilo.name)}` : '';
      const response = await fetch(`/api/faces/clusters?_t=${Date.now()}${siloParam}`, {
        signal: AbortSignal.timeout(10000),
        cache: 'no-store',
      });
      
      if (!response.ok) throw new Error('failed to fetch clusters');
      
      const data: FaceCluster[] = await response.json();
      console.log('[useFaceClusters] Fetched clusters:', data.length);
      const filtered = includeHidden ? data : data.filter(c => !c.is_hidden);
      setClusters(filtered);
      return filtered;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      console.error('failed to fetch face clusters:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, [activeSilo?.name]);

  const getClusterPhotos = useCallback(async (clusterId: string): Promise<ClusterPhoto[]> => {
    try {
      const siloParam = activeSilo?.name ? `&silo_name=${encodeURIComponent(activeSilo.name)}` : '';
      const response = await fetch(`/api/faces/${clusterId}?_t=${Date.now()}${siloParam}`, {
        signal: AbortSignal.timeout(10000),
        cache: 'no-store',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error(`Failed to fetch cluster photos: ${response.status}`, errorData);
        throw new Error(`failed to fetch cluster photos: ${response.status}`);
      }
      const data = await response.json();
      console.log(`[getClusterPhotos] Loaded ${data.length} photos for cluster ${clusterId}`);
      return data;
    } catch (err) {
      console.error(`failed to fetch photos for cluster ${clusterId}:`, err);
      return [];
    }
  }, [activeSilo?.name]);

  const renameCluster = useCallback(async (clusterId: string, name: string) => {
    try {
      const siloParam = activeSilo?.name ? `?silo_name=${encodeURIComponent(activeSilo.name)}` : '';
      const response = await fetch(`/api/faces/${clusterId}/name${siloParam}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error('Failed to rename cluster');
      
      setClusters(prev =>
        prev.map(c => c.id === clusterId ? { ...c, name } : c)
      );
    } catch (err) {
      console.error('Failed to rename cluster:', err);
      throw err;
    }
  }, [activeSilo?.name]);

  const hideCluster = useCallback(async (clusterId: string, hidden: boolean) => {
    try {
      const siloParam = activeSilo?.name ? `?silo_name=${encodeURIComponent(activeSilo.name)}` : '';
      const response = await fetch(`/api/faces/${clusterId}/hide${siloParam}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hidden }),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error('Failed to hide cluster');
      
      setClusters(prev =>
        prev.map(c => c.id === clusterId ? { ...c, is_hidden: hidden } : c)
      );
    } catch (err) {
      console.error('Failed to hide cluster:', err);
      throw err;
    }
  }, [activeSilo?.name]);

  const removePhotoFromCluster = useCallback(async (clusterId: string, photoId: string) => {
    try {
      const siloParam = activeSilo?.name ? `&silo_name=${encodeURIComponent(activeSilo.name)}` : '';
      const response = await fetch(`/api/faces/${clusterId}/remove?media_id=${photoId}${siloParam}`, {
        method: 'POST',
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error('Failed to remove photo');
    } catch (err) {
      console.error('Failed to remove photo:', err);
      throw err;
    }
  }, [activeSilo?.name]);

  const addPhotoToCluster = useCallback(async (clusterId: string, photoId: string) => {
    try {
      const siloParam = activeSilo?.name ? `&silo_name=${encodeURIComponent(activeSilo.name)}` : '';
      const response = await fetch(`/api/faces/${clusterId}/add?media_id=${photoId}${siloParam}`, {
        method: 'POST',
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error('Failed to add photo');
    } catch (err) {
      console.error('Failed to add photo:', err);
      throw err;
    }
  }, [activeSilo?.name]);

  const mergeClusters = useCallback(async (clusterId1: string, clusterId2: string, nameToKeep?: string) => {
    try {
      const siloParam = activeSilo?.name ? `?silo_name=${encodeURIComponent(activeSilo.name)}` : '';
      const response = await fetch(`/api/faces/merge${siloParam}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cluster_id_1: clusterId1,
          cluster_id_2: clusterId2,
          name_to_keep: nameToKeep,
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error('Failed to merge clusters');
      
      setClusters(prev => prev.filter(c => c.id !== clusterId2));
    } catch (err) {
      console.error('Failed to merge clusters:', err);
      throw err;
    }
  }, [activeSilo?.name]);

  const rotateClusterThumbnail = useCallback(
    async (clusterId: string, rotation: number) => {
      try {
        const siloParam = activeSilo?.name ? `?silo_name=${encodeURIComponent(activeSilo.name)}` : '';
        const response = await fetch(`/api/faces/${clusterId}/rotate${siloParam}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rotation }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.detail || 'Failed to rotate cluster');
        }

        setClusters(prev =>
          prev.map(c =>
            c.id === clusterId
              ? { ...c, rotation_override: rotation }
              : c
          )
        );

        console.log(`[useFaceClusters] Rotated cluster ${clusterId} to ${rotation}°`);
      } catch (err) {
        console.error('Failed to rotate cluster:', err);
        throw err;
      }
    },
    [activeSilo?.name]
  );

  return {
    clusters,
    loading,
    error,
    fetchClusters,
    getClusterPhotos,
    renameCluster,
    hideCluster,
    removePhotoFromCluster,
    addPhotoToCluster,
    mergeClusters,
    rotateClusterThumbnail,
  };
};
