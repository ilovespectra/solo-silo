/**
 * useFeedbackSync Hook - Handle feedback queue sync and offline state
 */

import { useEffect, useRef, useState } from 'react';
import { feedbackQueue } from '../FeedbackQueueManager';
import type { FeedbackItem } from '../types';

interface UseFeedbackSyncReturn {
  isOnline: boolean;
  syncStatus: 'idle' | 'syncing' | 'error';
  pendingCount: number;
  manualSync: () => Promise<void>;
}

export const useFeedbackSync = (): UseFeedbackSyncReturn => {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle');
  const [pendingCount, setPendingCount] = useState(0);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    feedbackQueue.init().catch(console.error);

    const unsubscribe = feedbackQueue.onQueueUpdated((queue: FeedbackItem[]) => {
      setPendingCount(queue.length);
      setSyncStatus(feedbackQueue.getSyncStatus());
    });

    const handleOnline = () => {
      setIsOnline(true);
      setSyncStatus('syncing');
      feedbackQueue.trySync().finally(() => {
        const status = feedbackQueue.getSyncStatus();
        setSyncStatus(status);
      });
    };

    const handleOffline = () => {
      setIsOnline(false);
      setSyncStatus('idle');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribe();
    };
  }, []);

  const manualSync = async () => {
    setSyncStatus('syncing');
    try {
      await feedbackQueue.trySync();
      const status = feedbackQueue.getSyncStatus();
      setSyncStatus(status);
    } catch (error) {
      console.error('Manual sync failed:', error);
      setSyncStatus('error');
    }
  };

  return {
    isOnline,
    syncStatus,
    pendingCount,
    manualSync,
  };
};
