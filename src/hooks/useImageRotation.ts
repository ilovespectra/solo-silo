import { useState, useEffect } from 'react';

export interface ImageMetadata {
  rotation: number;
  width: number;
  height: number;
  is_bookmarked: boolean;
  search_keywords: string;
}

export function useImageRotation(mediaId: string | number) {
  const [metadata, setMetadata] = useState<ImageMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mediaId) {
      setLoading(false);
      return;
    }

    const fetchMetadata = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `http://127.0.0.1:8000/api/media/${mediaId}/metadata`
        );

        if (!response.ok) {
          throw new Error('failed to fetch image metadata');
        }

        const data = await response.json();
        setMetadata(data);
        setError(null);
      } catch (err) {
        console.error('[useImageRotation] Error:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        setMetadata({
          rotation: 0,
          width: 1000,
          height: 1000,
          is_bookmarked: false,
          search_keywords: '',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchMetadata();
  }, [mediaId]);

  const getRotationStyle = (rotation: number = metadata?.rotation || 0) => {
    return {
      transform: `rotate(${rotation}deg)`,
      transformOrigin: 'center',
    };
  };

  const getRotationClass = (rotation: number = metadata?.rotation || 0) => {
    const normalized = rotation % 360;
    if (normalized === 0) return '';
    if (normalized === 90) return 'rotate-90';
    if (normalized === 180) return 'rotate-180';
    if (normalized === 270) return '-rotate-90';
    return '';
  };

  return {
    metadata,
    loading,
    error,
    rotation: metadata?.rotation || 0,
    getRotationStyle,
    getRotationClass,
  };
}
