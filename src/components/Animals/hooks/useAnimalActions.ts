/**
 * useAnimalActions Hook - Handle animal-specific actions (merge, suggestions, etc.)
 */

import { useState, useCallback } from 'react';
import type {
  AnimalCluster,
  AnimalSuggestion,
} from '@/components/Animals/types';

interface UseAnimalActionsReturn {
  loadingAction: boolean;
  errorAction: string | null;
  addPhotosToCluster: (
    clusterId: string,
    photoIds: string[]
  ) => Promise<void>;
  removePhotosFromCluster: (
    clusterId: string,
    photoIds: string[]
  ) => Promise<void>;
  mergeAnimalClusters: (
    sourceId: string,
    targetId: string,
    options?: { keepName?: string }
  ) => Promise<AnimalCluster | null>;
  getSuggestions: () => Promise<AnimalSuggestion[]>;
  acceptSuggestion: (
    clusterId: string,
    suggestedClusterId: string
  ) => Promise<void>;
  rejectSuggestion: (clusterId: string) => Promise<void>;
  splitCluster: (clusterId: string, photoIds: string[]) => Promise<void>;
}

export const useAnimalActions = (): UseAnimalActionsReturn => {
  const [loadingAction, setLoadingAction] = useState(false);
  const [errorAction, setErrorAction] = useState<string | null>(null);

  const addPhotosToCluster = useCallback(
    async (clusterId: string, photoIds: string[]) => {
      setLoadingAction(true);
      setErrorAction(null);

      try {
        const response = await fetch(`/api/animals/${clusterId}/add-photos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photo_ids: photoIds }),
        });

        if (!response.ok) throw new Error('Failed to add photos to cluster');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setErrorAction(message);
        throw err;
      } finally {
        setLoadingAction(false);
      }
    },
    []
  );

  const removePhotosFromCluster = useCallback(
    async (clusterId: string, photoIds: string[]) => {
      setLoadingAction(true);
      setErrorAction(null);

      try {
        const response = await fetch(`/api/animals/${clusterId}/remove-photos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photo_ids: photoIds }),
        });

        if (!response.ok) throw new Error('Failed to remove photos from cluster');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setErrorAction(message);
        throw err;
      } finally {
        setLoadingAction(false);
      }
    },
    []
  );

  const mergeAnimalClusters = useCallback(
    async (
      sourceId: string,
      targetId: string,
      options?: { keepName?: string }
    ): Promise<AnimalCluster | null> => {
      setLoadingAction(true);
      setErrorAction(null);

      try {
        const response = await fetch('/api/animals/merge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source_cluster_id: sourceId,
            target_cluster_id: targetId,
            ...options,
          }),
        });

        if (!response.ok) throw new Error('Failed to merge animals');

        const data = await response.json();
        return data.merged_cluster || null;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setErrorAction(message);
        return null;
      } finally {
        setLoadingAction(false);
      }
    },
    []
  );

  const getSuggestions = useCallback(
    async (): Promise<AnimalSuggestion[]> => {
      setLoadingAction(true);
      setErrorAction(null);

      try {
        const response = await fetch('/api/animals/suggestions');
        if (!response.ok) throw new Error('Failed to get suggestions');

        const data = await response.json();
        return data.suggestions || [];
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setErrorAction(message);
        return [];
      } finally {
        setLoadingAction(false);
      }
    },
    []
  );

  const acceptSuggestion = useCallback(
    async (clusterId: string, suggestedClusterId: string) => {
      setLoadingAction(true);
      setErrorAction(null);

      try {
        const response = await fetch(
          `/api/animals/${clusterId}/suggestions/accept`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              suggested_cluster_id: suggestedClusterId,
            }),
          }
        );

        if (!response.ok) throw new Error('Failed to accept suggestion');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setErrorAction(message);
        throw err;
      } finally {
        setLoadingAction(false);
      }
    },
    []
  );

  const rejectSuggestion = useCallback(async (clusterId: string) => {
    setLoadingAction(true);
    setErrorAction(null);

    try {
      const response = await fetch(
        `/api/animals/${clusterId}/suggestions/reject`,
        {
          method: 'POST',
        }
      );

      if (!response.ok) throw new Error('Failed to reject suggestion');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setErrorAction(message);
      throw err;
    } finally {
      setLoadingAction(false);
    }
  }, []);

  const splitCluster = useCallback(
    async (clusterId: string, photoIds: string[]) => {
      setLoadingAction(true);
      setErrorAction(null);

      try {
        const response = await fetch(`/api/animals/${clusterId}/split`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photo_ids: photoIds }),
        });

        if (!response.ok) throw new Error('Failed to split cluster');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setErrorAction(message);
        throw err;
      } finally {
        setLoadingAction(false);
      }
    },
    []
  );

  return {
    loadingAction,
    errorAction,
    addPhotosToCluster,
    removePhotosFromCluster,
    mergeAnimalClusters,
    getSuggestions,
    acceptSuggestion,
    rejectSuggestion,
    splitCluster,
  };
};
