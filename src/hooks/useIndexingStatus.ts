/**
 * useIndexingStatus Hook - Fetches and monitors indexing status from backend
 */

import { useEffect, useRef } from 'react';
import { useAppStore } from '@/store/appStore';
import { useDemoMode } from './useDemoMode';

interface IndexingStatusResponse {
  progress: {
    status: string;
    phase?: string;
    processed: number;
    total: number;
    current_file: string | null;
    percentage: number;
    error: string | null;
    faces_found: number;
    animals_found: number;
    message?: string;
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
    phase?: string;
    isComplete: boolean;
    isActive: boolean;
  } | null>(null);
  const hasTriggeredRefreshRef = useRef(false);
  const hasTriggeredClusteringCompleteRef = useRef(false);

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

    const abortController = new AbortController();
    let retryCount = 0;
    let currentInterval = 2000;
    let timeoutId: NodeJS.Timeout | null = null;

    const checkIndexingStatus = async () => {
      try {
        const response = await fetch(`/api/indexing`, {
          signal: abortController.signal,
        });

        if (!response.ok) {
          if (response.status === 503) {
            console.warn(`[useIndexingStatus] Backend temporarily unavailable (503) - backing off...`);
            retryCount++;
            currentInterval = Math.min(2000 * Math.pow(2, retryCount - 1), 16000);
            scheduleNextCheck();
            return;
          }
          
          console.error('[useIndexingStatus] failed to fetch status:', response.status);
          currentInterval = 2000;
          scheduleNextCheck();
          return;
        }

        retryCount = 0;
        currentInterval = 2000;

        const data: IndexingStatusResponse = await response.json();
        const { progress } = data;

        console.log('[useIndexingStatus] Status received:', progress.status, 'Phase:', progress.phase);

        const newStatus = progress.status || 'idle';
        const newPhase = progress.phase || '';
        const newIsComplete = newStatus === 'complete' || newStatus === 'idle';
        const newIsActive = newStatus === 'running' || newStatus === 'processing';

        const wasIndexing = lastStateRef.current?.isActive;
        const justCompleted = wasIndexing && newIsComplete && !newIsActive;

        const wasDetecting = lastStateRef.current?.phase === 'detecting';
        const clusteringJustCompleted = wasDetecting && newPhase !== 'detecting' && newPhase !== '';

        const stateChanged = !lastStateRef.current || 
          lastStateRef.current.status !== newStatus ||
          lastStateRef.current.phase !== newPhase ||
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
            phase: newPhase,
            isComplete: newIsComplete,
            isActive: newIsActive,
          };

          console.log('[useIndexingStatus] State changed - Updated store - Complete:', newIsComplete, 'Active:', newIsActive);

          if (justCompleted && !hasTriggeredRefreshRef.current) {
            console.log('[useIndexingStatus] 🔄 Indexing completed! Triggering data refresh...');
            hasTriggeredRefreshRef.current = true;
            
            window.dispatchEvent(new CustomEvent('indexing-complete', {
              detail: { 
                processed: progress.processed,
                total: progress.total,
                faces_found: progress.faces_found,
                animals_found: progress.animals_found
              }
            }));
            
            setTimeout(() => {
              hasTriggeredRefreshRef.current = false;
            }, 5000);
          }

          if (clusteringJustCompleted && !hasTriggeredClusteringCompleteRef.current) {
            console.log('[useIndexingStatus] 🎭 Clustering completed! Refreshing people pane...');
            hasTriggeredClusteringCompleteRef.current = true;
            
            window.dispatchEvent(new CustomEvent('clustering-complete', {
              detail: { 
                processed: progress.processed,
                total: progress.total,
                faces_found: progress.faces_found,
              }
            }));
            
            setTimeout(() => {
              hasTriggeredClusteringCompleteRef.current = false;
            }, 5000);
          }
        } else {
          console.log('[useIndexingStatus] State unchanged - skipping store update');
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return;
        }
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
        scheduleNextCheck();
      }
    };

    const scheduleNextCheck = () => {
      if (abortController.signal.aborted) return;
      
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(checkIndexingStatus, currentInterval);
    };

    checkIndexingStatus();

    return () => {
      abortController.abort();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [setIndexingComplete, setIndexingProgress, setIsIndexing, demoMode]);
};
