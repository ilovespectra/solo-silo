import { apiUrl } from '@/lib/api';
/**
 * useSearch Hook - Main search logic with feedback integration
 */

import { useState, useCallback, useEffect } from 'react';
import { SearchResult } from '../types';
import { feedbackQueue } from '../FeedbackQueueManager';
import { useSilos } from '@/hooks/useSilos';

interface UseSearchReturn {
  results: SearchResult[];
  loading: boolean;
  error: string | null;
  query: string;
  setQuery: (query: string) => void;
  search: (query: string) => Promise<void>;
  handleConfirm: (imageId: number, imagePath: string) => void;
  handleRemove: (imageId: number, imagePath: string) => void;
  handleUndo: (imageId: number) => void;
  pendingFeedback: number;
  syncStatus: 'idle' | 'syncing' | 'error';
  confidence: number;
  setConfidence: (conf: number) => void;
  loadMore: () => Promise<void>;
  hasMore: boolean;
  isLoadingMore: boolean;
  fileTypeFilter: Set<string>;
  setFileTypeFilter: (types: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
}

export const useSearch = (): UseSearchReturn => {
  const { activeSilo } = useSilos();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [pendingFeedback, setPendingFeedback] = useState(0);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle');

  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [currentQuery, setCurrentQuery] = useState('');
  
  const [fileTypeFilter, setFileTypeFilter] = useState<Set<string>>(new Set());

  useEffect(() => {
    feedbackQueue.init().catch(console.error);

    fetch(apiUrl('/api/health'), { method: 'GET', mode: 'cors' })
      .then(r => {
        if (r.ok) {
          console.log('[useSearch] Backend is healthy');
        } else {
          console.error('[useSearch] Backend health check failed:', r.status);
        }
      })
      .catch(err => {
        console.error('[useSearch] Backend unreachable via proxy:', err);
        setError('Backend server is not running. Make sure to start the backend on port 8000.');
      });

    const handleOnline = () => {
      setSyncStatus('syncing');
      feedbackQueue.trySync();
    };

    const handleOffline = () => {
      setSyncStatus('idle');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const unsubscribe = feedbackQueue.onQueueUpdated((queue) => {
      setPendingFeedback(queue.length);
      setSyncStatus(feedbackQueue.getSyncStatus());
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribe();
    };
  }, []);

  const [confidence, setConfidence] = useState(0.15);

  const search = useCallback(
    async (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setResults([]);
        setOffset(0);
        setCurrentQuery('');
        return;
      }

      setLoading(true);
      setError(null);
      setOffset(0);
      setCurrentQuery(searchQuery);

      try {
        const { fetchSearch } = await import('@/lib/backend');
        const siloName = activeSilo?.name;
        
        const fileTypesParam = fileTypeFilter.size > 0 
          ? Array.from(fileTypeFilter).join(',')
          : undefined;
        
        console.log('[useSearch] Searching via proxy with silo:', siloName, 'fileTypes:', fileTypesParam);
        
        const data = await fetchSearch(searchQuery, 50, siloName, fileTypesParam, confidence, 0);
        console.log('[useSearch] Raw data from backend:', data);
        
        let searchResults: SearchResult[] = Array.isArray(data) 
          ? data 
          : (data.results || []);
        
        console.log('[useSearch] Parsed results count:', searchResults.length);
        
        searchResults = searchResults.map((r) => ({ 
          ...r, 
          similarity: r.similarity !== undefined ? r.similarity : (r.score || 0),
          camera: r.camera || 'Unknown',
          type: r.type || 'image',
        }));

        const enhancedResults = searchResults.map((result) => {
          const isConfirmedForQuery = result.confirmed_for_query === true;
          
          const feedback = feedbackQueue.getQueue().find((f) => f.imageId === result.id && f.query === currentQuery);
          
          if (feedback?.action === 'confirm') {
            return { ...result, confirmed: true, boosted: true };
          } else if (feedback?.action === 'remove') {
            return { ...result, removed: true };
          }
          
          if (isConfirmedForQuery) {
            return { ...result, confirmed: true, boosted: true };
          }
          
          return result;
        });

        enhancedResults.sort((a, b) => {
          if (a.boosted && !b.boosted) return -1;
          if (!a.boosted && b.boosted) return 1;
          if (a.removed && !b.removed) return 1;
          if (!a.removed && b.removed) return -1;
          return (b.similarity || 0) - (a.similarity || 0);
        });

        console.log('[useSearch] Enhanced results count:', enhancedResults.length);
        setResults(enhancedResults);
        
        setHasMore(data.has_more || false);
        setOffset(50);
      } catch (err) {
        let errorMessage = 'Unknown error occurred';
        
        if (err instanceof TypeError) {
          errorMessage = `Network error: ${err.message}. Make sure the backend is running on port 8000`;
        } else if (err instanceof Error) {
          if (err.name === 'AbortError') {
            errorMessage = 'Search timed out after 30 seconds. Backend may be slow or unresponsive.';
          } else {
            errorMessage = err.message;
          }
        }
        
        console.error('[useSearch] Search failed:', errorMessage, err);
        setError(errorMessage);
        setResults([]);
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    },
    [confidence, fileTypeFilter, activeSilo?.name]
  );

  const loadMore = useCallback(async () => {
    if (!currentQuery.trim() || !hasMore || isLoadingMore) {
      return;
    }

    setIsLoadingMore(true);
    
    try {
      const { fetchSearch } = await import('@/lib/backend');
      const siloName = activeSilo?.name;
      
      const relaxedConfidence = Math.max(0.1, confidence - 0.1);
      
      const fileTypesParam = fileTypeFilter.size > 0 
        ? Array.from(fileTypeFilter).join(',')
        : undefined;
      
      console.log('[useSearch] Loading more results with silo:', siloName, 'relaxedConfidence:', relaxedConfidence, 'offset:', offset);
      
      const data = await fetchSearch(currentQuery, 50, siloName, fileTypesParam, relaxedConfidence, offset);
      let newResults: SearchResult[] = Array.isArray(data) ? data : (data.results || []);
      
      newResults = newResults.map((r) => ({
        ...r,
        similarity: r.similarity !== undefined ? r.similarity : (r.score || 0),
        camera: r.camera || 'Unknown',
        type: r.type || 'image',
      }));
      
      setResults((prev) => [...prev, ...newResults]);
      setHasMore(data.has_more || false);
      setOffset(offset + 50);
      
      console.log('[useSearch] Loaded', newResults.length, 'more results');
    } catch (err) {
      console.error('[useSearch] Load more failed:', err);
      setError('Failed to load more results');
    } finally {
      setIsLoadingMore(false);
    }
  }, [currentQuery, offset, hasMore, isLoadingMore, confidence, fileTypeFilter, activeSilo?.name]);

  const handleConfirm = useCallback(
    (imageId: number, imagePath: string) => {
      setResults((prev) => {
        const confirmed = prev.find((r) => r.id === imageId);
        if (!confirmed) return prev;

        return [
          { ...confirmed, confirmed: true, boosted: true, removed: false },
          ...prev.filter((r) => r.id !== imageId),
        ];
      });

      const siloName = activeSilo?.name;
      const approveUrl = `/api/search/${encodeURIComponent(query)}/approve?file_id=${imageId}${siloName ? `&silo_name=${encodeURIComponent(siloName)}` : ''}`;
      console.log('[useSearch] Approving result:', approveUrl);
      
      fetch(approveUrl, { method: 'POST' })
        .then((r) => {
          if (r.ok) {
            console.log('[useSearch] Result approved:', imageId);
          } else {
            console.error('[useSearch] Failed to approve result:', r.status);
          }
        })
        .catch((err) => console.error('[useSearch] Failed to send approve feedback:', err));

      feedbackQueue.add('confirm', imageId, imagePath, query);
    },
    [query, activeSilo?.name]
  );

  const handleRemove = useCallback(
    (imageId: number, imagePath: string) => {
      setResults((prev) =>
        prev.map((r) => (r.id === imageId ? { ...r, removed: true, confirmed: false } : r))
      );

      const siloName = activeSilo?.name;
      const rejectUrl = `/api/search/${encodeURIComponent(query)}/reject?file_id=${imageId}${siloName ? `&silo_name=${encodeURIComponent(siloName)}` : ''}`;
      console.log('[useSearch] Rejecting result:', rejectUrl);
      
      fetch(rejectUrl, { method: 'POST' })
        .then((r) => {
          if (r.ok) {
            console.log('[useSearch] Result rejected:', imageId);
          } else {
            console.error('[useSearch] Failed to reject result:', r.status);
          }
        })
        .catch((err) => console.error('[useSearch] Failed to send reject feedback:', err));

      feedbackQueue.add('remove', imageId, imagePath, query);
    },
    [query, activeSilo?.name]
  );

  const handleUndo = useCallback((imageId: number) => {
    setResults((prev) =>
      prev.map((r) =>
        r.id === imageId
          ? { ...r, confirmed: false, removed: false, boosted: false }
          : r
      )
    );
  }, []);

  return {
    results,
    loading,
    error,
    query,
    setQuery,
    search,
    handleConfirm,
    handleRemove,
    handleUndo,
    pendingFeedback,
    syncStatus,
    confidence,
    setConfidence,
    loadMore,
    hasMore,
    isLoadingMore,
    fileTypeFilter,
    setFileTypeFilter,
  };
};
