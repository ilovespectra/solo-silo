/**
 * SearchBar Component - Enhanced search input with history and suggestions
 */

import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '@/store/appStore';
import type { SearchHistoryItem } from '../hooks';

interface SearchBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  onSearch: (query: string) => void;
  history: SearchHistoryItem[];
  isOnline: boolean;
  syncStatus: 'idle' | 'syncing' | 'error';
  pendingCount: number;
  onSync?: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  query,
  onQueryChange,
  onSearch,
  history,
  isOnline,
  syncStatus,
  pendingCount,
  onSync,
  disabled = false,
  autoFocus = true,
}) => {
  const [showHistory, setShowHistory] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { theme } = useAppStore();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query);
      setShowHistory(false);
    }
  };

  const handleHistorySelect = (historyQuery: string) => {
    onQueryChange(historyQuery);
    onSearch(historyQuery);
    setShowHistory(false);
  };

  const handleClear = () => {
    onQueryChange('');
    inputRef.current?.focus();
  };

  const inputBgClass = theme === 'dark' ? 'bg-gray-800 text-white border-gray-600' : 'bg-white text-gray-900 border-gray-300';
  const inputDisabledClass = theme === 'dark' ? 'disabled:bg-gray-700' : 'disabled:bg-gray-100';
  const clearButtonClass = theme === 'dark' ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600';
  const historyDropdownClass = theme === 'dark' ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-300';
  const historyItemClass = theme === 'dark' ? 'hover:bg-orange-900 text-gray-100' : 'hover:bg-orange-50 text-gray-900';
  const historyLabelClass = theme === 'dark' ? 'text-gray-400' : 'text-gray-500';
  const resultCountClass = theme === 'dark' ? 'text-gray-500' : 'text-gray-400';
  const offlineClass = theme === 'dark' ? 'bg-yellow-900 border-yellow-700 text-yellow-200' : 'bg-yellow-50 border-yellow-200 text-yellow-700';
  const syncingClass = theme === 'dark' ? 'bg-orange-900 border-orange-700 text-orange-200' : 'bg-orange-50 border-orange-200 text-orange-700';
  const pendingClass = theme === 'dark' ? 'bg-red-900 border-red-700 text-red-200' : 'bg-red-50 border-red-200 text-red-700';

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div ref={containerRef} className="relative">
        {/* Input container */}
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            {/* Input */}
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                onQueryChange(e.target.value);
                setShowHistory(true);
              }}
              onFocus={() => query && setShowHistory(true)}
              placeholder="Search images by object, color, person, or scene..."
              disabled={disabled}
              autoFocus={autoFocus}
              className={`w-full px-4 py-3 pr-12 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:cursor-not-allowed transition-all duration-150 ${inputBgClass} ${inputDisabledClass}`}
            />

            {/* Clear button */}
            {query && !disabled && (
              <button
                type="button"
                onClick={handleClear}
                className={`absolute right-3 top-1/2 -translate-y-1/2 ${clearButtonClass} transition-colors`}
                title="Clear search"
              >
                <span className="text-xl">✕</span>
              </button>
            )}

            {/* History dropdown */}
            {showHistory && history.length > 0 && (
              <div className={`absolute top-full left-0 right-0 mt-1 ${historyDropdownClass} rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto`}>
                <div className="p-2">
                  <div className={`text-xs font-semibold ${historyLabelClass} px-2 py-2 uppercase`}>
                    Recent Searches
                  </div>
                  {history.slice(0, 8).map((item) => (
                    <button
                      key={`${item.query}-${item.timestamp}`}
                      type="button"
                      onClick={() => handleHistorySelect(item.query)}
                      className={`w-full text-left px-3 py-2 rounded transition-colors flex items-center justify-between text-sm ${historyItemClass}`}
                    >
                      <span>{item.query}</span>
                      <span className={resultCountClass}>{item.resultCount}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sync status indicator */}
          {!isOnline && (
            <div className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-semibold ${offlineClass}`}>
              <span>Offline</span>
            </div>
          )}

          {isOnline && syncStatus === 'syncing' && (
            <div className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-semibold ${syncingClass}`}>
              <div className={`w-4 h-4 border-2 ${theme === 'dark' ? 'border-orange-400 border-t-orange-200' : 'border-orange-300 border-t-orange-600'} rounded-full animate-spin`} />
              <span>Syncing...</span>
            </div>
          )}

          {isOnline && syncStatus === 'error' && pendingCount > 0 && (
            <div className="flex items-center gap-2">
              <div className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-semibold ${pendingClass}`}>
                <span>{pendingCount} pending</span>
              </div>
              {onSync && (
                <button
                  type="button"
                  onClick={onSync}
                  className={`px-3 py-2 ${theme === 'dark' ? 'bg-red-700 hover:bg-red-600' : 'bg-red-500 hover:bg-red-600'} text-white rounded-lg text-sm font-semibold transition-colors`}
                  title="Retry syncing feedback"
                >
                  Retry
                </button>
              )}
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={disabled || !query.trim()}
            className={`px-4 py-3 ${theme === 'dark' ? 'bg-orange-700 hover:bg-orange-600 disabled:bg-gray-600' : 'bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300'} disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-colors duration-150`}
          >
            search
          </button>
        </div>
      </div>
    </form>
  );
};
