/**
 * SearchResults Component - Main grid layout with results
 */

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/store/appStore';
import { SearchResult } from '../types';
import { SearchResultItem } from './SearchResultItem';
import { AddToFolderContextMenu } from './';

interface SearchResultsProps {
  results: SearchResult[];
  loading: boolean;
  error: string | null;
  query: string;
  onConfirm: (imageId: number, imagePath: string) => void;
  onRemove: (imageId: number, imagePath: string) => void;
  onUndo: (imageId: number) => void;
  devMode?: boolean;
  columns?: number;
  onResultClick?: (mediaId: number) => void;
  onFolderPlacementSuccess?: (fileCount: number, folderName: string) => void;
}

export const SearchResults: React.FC<SearchResultsProps> = ({
  results,
  loading,
  error,
  query,
  onConfirm,
  onRemove,
  onUndo,
  devMode = false,
  onResultClick = undefined,
  onFolderPlacementSuccess = undefined,
}) => {
  const { theme } = useAppStore();
  const [selectedResultIds, setSelectedResultIds] = useState<Set<number>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; resultId: number } | null>(null);
  const [sortBy, setSortBy] = useState<'relevance' | 'date-newest' | 'date-oldest' | 'size-largest' | 'size-smallest'>('relevance');

  const emptyStateClass = theme === 'dark' ? 'text-gray-400' : 'text-gray-400';

  const textSecondaryLightClass = theme === 'dark' ? 'text-gray-500' : 'text-gray-600';
  const borderClass = theme === 'dark' ? 'border-gray-700' : 'border-gray-200';
  const textHighlightClass = theme === 'dark' ? 'text-gray-300' : 'text-gray-700';

  const displayResults = useMemo(
    () => results.filter((r) => !r.removed),
    [results]
  );

  const sortedResults = useMemo(() => {
    const sorted = [...displayResults];
    
    switch (sortBy) {
      case 'date-newest':
        return sorted.sort((a, b) => {
          // Unknown dates (0 or null) go to the end
          if (!a.date_taken && !b.date_taken) return 0;
          if (!a.date_taken) return 1;
          if (!b.date_taken) return -1;
          return (b.date_taken || 0) - (a.date_taken || 0);
        });
      
      case 'date-oldest':
        return sorted.sort((a, b) => {
          // Unknown dates (0 or null) go to the end
          if (!a.date_taken && !b.date_taken) return 0;
          if (!a.date_taken) return 1;
          if (!b.date_taken) return -1;
          return (a.date_taken || 0) - (b.date_taken || 0);
        });
      
      case 'size-largest':
        return sorted.sort((a, b) => (b.size || 0) - (a.size || 0));
      
      case 'size-smallest':
        return sorted.sort((a, b) => (a.size || 0) - (b.size || 0));
      
      case 'relevance':
      default:
        return sorted;
    }
  }, [displayResults, sortBy]);

  const removedCount = useMemo(() => results.filter((r) => r.removed).length, [results]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, resultId: number) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('Context menu requested for result:', resultId, 'Current selections:', Array.from(selectedResultIds));
      setContextMenu({ x: e.clientX, y: e.clientY, resultId });
      if (!selectedResultIds.has(resultId)) {
        setSelectedResultIds(new Set([resultId]));
      }
    },
    [selectedResultIds]
  );

  useEffect(() => {
    const handleClickOutside = () => {
      setContextMenu(null);
    };
    if (contextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu]);

  if (!query.trim()) {
    return (
      <div className={`flex items-center justify-center h-64 ${emptyStateClass}`}>
        <div className="text-center">
          <div className="text-lg font-semibold mb-2">enter a search query</div>
          <div className="text-sm">try seraching by object, color, person, or scene</div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className={`w-8 h-8 border-4 ${theme === 'dark' ? 'border-orange-900 border-t-orange-500' : 'border-orange-200 border-t-orange-500'} rounded-full animate-spin`} />
          <div className={textSecondaryLightClass}>Searching...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center justify-center h-64 ${theme === 'dark' ? 'text-red-400' : 'text-red-600'}`}>
        <div className="text-center">
          <div className="text-lg font-semibold mb-2">search error</div>
          <div className="text-sm">{error}</div>
        </div>
      </div>
    );
  }

  if (displayResults.length === 0) {
    return (
      <div className={`flex items-center justify-center h-64 ${emptyStateClass}`}>
        <div className="text-center">
          <div className="text-lg font-semibold mb-2">
            {removedCount > 0
              ? 'all results removed'
              : 'no results'}
          </div>
          <div className="text-sm">
            {removedCount > 0
              ? `${removedCount} results were marked as irrelevant.`
              : 'try a different search query'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Sort Controls */}
      <div className="flex items-center justify-between mb-4 px-2">
        <div className="text-sm text-gray-500">
          {displayResults.length} result{displayResults.length !== 1 ? 's' : ''}
          {removedCount > 0 && ` (${removedCount} removed)`}
        </div>
        
        <div className="flex items-center gap-2">
          <label className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            Sort by:
          </label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className={`text-sm px-3 py-1 rounded border ${
              theme === 'dark'
                ? 'bg-gray-800 border-gray-700 text-gray-200'
                : 'bg-white border-gray-300 text-gray-900'
            } cursor-pointer transition`}
          >
            <option value="relevance">Relevance</option>
            <option value="date-newest">Date (Newest)</option>
            <option value="date-oldest">Date (Oldest)</option>
            <option value="size-largest">File Size (Largest)</option>
            <option value="size-smallest">File Size (Smallest)</option>
          </select>
        </div>
      </div>

      <div
        className={`grid gap-4 py-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 relative`}
      >
        {sortedResults.map((result) => {
          const isSelected = selectedResultIds.has(result.id);
          return (
            <div
              key={result.id}
              data-item-id={result.id}
              data-selectable="true"
              className={`relative transition-all rounded-lg overflow-hidden cursor-pointer ${
                isSelected
                  ? theme === 'dark'
                    ? 'ring-2 ring-orange-500'
                    : 'ring-2 ring-orange-400'
                  : ''
              }`}
              onContextMenu={(e) => handleContextMenu(e, result.id)}
            >
              <SearchResultItem
                result={result}
                onConfirm={onConfirm}
                onRemove={onRemove}
                onUndo={onUndo}
                devMode={devMode}
                onResultClick={onResultClick}
              />
            </div>
          );
        })}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <AddToFolderContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          selectedResultIds={
            selectedResultIds.size === 0 && contextMenu.resultId
              ? [contextMenu.resultId]
              : Array.from(selectedResultIds)
          }
          onClose={() => setContextMenu(null)}
          onFolderPlacementSuccess={onFolderPlacementSuccess}
        />
      )}

      {/* Results summary */}
      <div className={`mt-8 pt-4 border-t ${borderClass}`}>
        <div className={`text-sm ${textSecondaryLightClass}`}>
          <span className="font-semibold">{displayResults.length}</span>
          {' results '}
          {removedCount > 0 && (
            <>
              (<span className={theme === 'dark' ? 'text-red-400' : 'text-red-600'}>{removedCount} removed</span>)
            </>
          )}
          {' for '}
          <span className={`font-mono ${textHighlightClass}`}>&quot;{query}&quot;</span>
          {selectedResultIds.size > 0 && (
            <>
              {' — '}
              <span className="font-semibold text-orange-500">{selectedResultIds.size} selected</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
