/**
 * useIndexingStatus Hook - Fetches and monitors indexing status from backend
 */

import { useEffect, useRef } from 'react';
import { useAppStore } from '@/store/appStore';
import { useDemoMode } from './useDemoMode';

interface IndexingStatusResponse {
  progress: {
    status: string;
    processed: number;
    total: number;
    current_file: string | null;
    percentage: number;
    error: string | null;
    faces_found: number;
    animals_found: number;
  };
  entities: {
    faces: Array<{ label: string; count: number }>;
    animals: Array<{ label: string; count: number }>;
  };
}

export const useIndexingStatus = () => {
  const { setIndexingComplete, setIndexingProgress, setIsIndexing } = useAppStore();
  const { demoMode } = useDemoMode();
  const lastStateRef = useRef<{
    status: string;
    isComplete: boolean;
    isActive: boolean;
  } | null>(null);

  useEffect(() => {
    if (demoMode) {
      setIndexingComplete(true);
      setIsIndexing(false);
      setIndexingProgress({
        currentFile: '',
        processed: 458,
        total: 458,
        percentage: 100,
        status: 'complete',
      });
      return;
    }

    const checkIndexingStatus = async () => {
      try {
        const response = await fetch(`/api/indexing`, {
          signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) {
          console.error('[useIndexingStatus] failed to fetch status:', response.status);
          return;
        }

        const data: IndexingStatusResponse = await response.json();
        const { progress } = data;

        console.log('[useIndexingStatus] Status received:', progress.status);

        const newStatus = progress.status || 'idle';
        const newIsComplete = newStatus === 'complete' || newStatus === 'idle';
        const newIsActive = newStatus === 'running' || newStatus === 'processing';

        const stateChanged = !lastStateRef.current || 
          lastStateRef.current.status !== newStatus ||
          lastStateRef.current.isComplete !== newIsComplete ||
          lastStateRef.current.isActive !== newIsActive;

        if (stateChanged) {
          setIndexingProgress({
            currentFile: progress.current_file || '',
            processed: progress.processed,
            total: progress.total,
            percentage: progress.percentage,
            status: (newStatus) as 'idle' | 'scanning' | 'indexing' | 'analyzing' | 'complete' | 'error',
          });

          setIsIndexing(newIsActive);
          setIndexingComplete(newIsComplete);

          lastStateRef.current = {
            status: newStatus,
            isComplete: newIsComplete,
            isActive: newIsActive,
          };

          console.log('[useIndexingStatus] State changed - Updated store - Complete:', newIsComplete, 'Active:', newIsActive);
        } else {
          console.log('[useIndexingStatus] State unchanged - skipping store update');
        }
      } catch (error) {
        console.error('[useIndexingStatus] Error fetching status:', error);
        if (!lastStateRef.current) {
          setIndexingComplete(true);
          setIsIndexing(false);
          lastStateRef.current = {
            status: 'idle',
            isComplete: true,
            isActive: false,
          };
        }
      }
    };

    checkIndexingStatus();

    const interval = setInterval(checkIndexingStatus, 2000);

    return () => clearInterval(interval);
  }, [setIndexingComplete, setIndexingProgress, setIsIndexing, demoMode]);
};
