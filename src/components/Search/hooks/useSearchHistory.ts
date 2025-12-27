/**
 * useSearchHistory Hook - Manage search history with persistence
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useSilos } from '@/hooks/useSilos';

export interface SearchHistoryItem {
  query: string;
  timestamp: number;
  resultCount: number;
}

interface UseSearchHistoryReturn {
  history: SearchHistoryItem[];
  addToHistory: (query: string, resultCount: number) => void;
  clearHistory: () => void;
  removeFromHistory: (query: string) => void;
}

const HISTORY_KEY_PREFIX = 'dudlefotos_search_history';
const MAX_HISTORY = 50;

function getHistoryKey(siloName?: string): string {
  return siloName ? `${HISTORY_KEY_PREFIX}-${siloName}` : HISTORY_KEY_PREFIX;
}

export const useSearchHistory = (): UseSearchHistoryReturn => {
  const { activeSilo } = useSilos();
  
  const loadedHistory = useMemo(() => {
    try {
      const key = getHistoryKey(activeSilo?.name);
      const stored = localStorage.getItem(key);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load search history:', error);
    }
    return [];
  }, [activeSilo?.name]);

  const [history, setHistory] = useState<SearchHistoryItem[]>(loadedHistory);

  useEffect(() => {
    setHistory(loadedHistory);
  }, [loadedHistory]);

  const addToHistory = useCallback((query: string, resultCount: number) => {
    setHistory((prev) => {
      const filtered = prev.filter((item) => item.query !== query);

      const updated = [
        {
          query,
          timestamp: Date.now(),
          resultCount,
        },
        ...filtered,
      ].slice(0, MAX_HISTORY);

      try {
        const key = getHistoryKey(activeSilo?.name);
        localStorage.setItem(key, JSON.stringify(updated));
      } catch (error) {
        console.error('Failed to save search history:', error);
      }

      return updated;
    });
  }, [activeSilo]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    try {
      const key = getHistoryKey(activeSilo?.name);
      localStorage.removeItem(key);
    } catch (error) {
      console.error('Failed to clear search history:', error);
    }
  }, [activeSilo]);

  const removeFromHistory = useCallback((query: string) => {
    setHistory((prev) => {
      const updated = prev.filter((item) => item.query !== query);
      try {
        const key = getHistoryKey(activeSilo?.name);
        localStorage.setItem(key, JSON.stringify(updated));
      } catch (error) {
        console.error('Failed to update search history:', error);
      }
      return updated;
    });
  }, [activeSilo]);

  return {
    history,
    addToHistory,
    clearHistory,
    removeFromHistory,
  };
};
