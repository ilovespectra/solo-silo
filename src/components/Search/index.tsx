/**
 * Search Component - Main search interface with feedback integration
 */

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import SearchPhotoModal from '@/components/PhotoModal/SearchPhotoModal';
import { useAppStore } from '@/store/appStore';
import { SearchBar, SearchResults } from './components';
import { useSearch, useFeedbackSync, useSearchHistory } from './hooks';

interface SearchComponentProps {
  devMode?: boolean;
  columns?: number;
}

export const Search: React.FC<SearchComponentProps> = ({
  devMode = false,
  columns = 4,
}) => {
  const {
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
    confidence,
    setConfidence,
    loadMore,
    hasMore,
    isLoadingMore,
    fileTypeFilter,
    setFileTypeFilter,
  } = useSearch();

  const { isOnline, syncStatus: feedbackSyncStatus, manualSync } = useFeedbackSync();

  const { history, addToHistory, clearHistory } = useSearchHistory();
  
  const { theme } = useAppStore();

  const [selectedMediaId, setSelectedMediaId] = useState<number | null>(null);
  
  const [folderPlacementModal, setFolderPlacementModal] = useState<{
    isOpen: boolean;
    fileCount: number;
    folderName: string;
  }>({
    isOpen: false,
    fileCount: 0,
    folderName: '',
  });

  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [fileTypeCategories, setFileTypeCategories] = useState<Record<string, string[]>>({});

  useEffect(() => {
    fetch(`/api/search/file-types`, { mode: 'cors' })
      .then(r => r.json())
      .then(data => {
        if (data.categories) {
          setFileTypeCategories(data.categories);
        }
      })
      .catch(err => console.error('[Search] Failed to fetch file types:', err));
  }, []);

  const handleFileTypeToggle = useCallback((fileType: string) => {
    const lowerFileType = fileType.toLowerCase();
    setFileTypeFilter((prev: Set<string>) => {
      const newFilter = new Set(prev);
      if (newFilter.has(lowerFileType)) {
        newFilter.delete(lowerFileType);
      } else {
        newFilter.add(lowerFileType);
      }
      return newFilter;
    });
  }, [setFileTypeFilter]);

  const handleCategoryToggle = useCallback((category: string) => {
    const categoryTypes = (fileTypeCategories[category] || []).map(t => t.toLowerCase());
    setFileTypeFilter(prev => {
      const newFilter = new Set(prev);
      const allSelected = categoryTypes.every(type => newFilter.has(type));
      
      if (allSelected) {
        categoryTypes.forEach(type => newFilter.delete(type));
      } else {
        categoryTypes.forEach(type => newFilter.add(type));
      }
      return newFilter;
    });
  }, [fileTypeCategories, setFileTypeFilter]);

  const handleSearch = useCallback(
    (searchQuery: string) => {
      if (searchQuery.trim()) {
        setQuery(searchQuery);
        search(searchQuery);
        addToHistory(searchQuery, 0);
      }
    },
    [search, setQuery, addToHistory]
  );

  useEffect(() => {
    if (!loading && query && results.length > 0) {
      const nonRemovedCount = results.filter((r) => !r.removed).length;
      addToHistory(query, nonRemovedCount);
    }
  }, [loading, query, results, addToHistory]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
        searchInput?.focus();
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'c') {
        e.preventDefault();
        clearHistory();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearHistory]);

  const handleResultClick = useCallback((mediaId: number) => {
    setSelectedMediaId(mediaId);
  }, []);

  const bgClass = theme === 'dark' ? 'bg-gray-900' : 'bg-white';
  const headerBgClass = theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200';
  const textClass = theme === 'dark' ? 'text-white' : 'text-gray-900';
  const secondaryTextClass = theme === 'dark' ? 'text-gray-400' : 'text-gray-600';
  const borderClass = theme === 'dark' ? 'border-gray-700' : 'border-gray-200';
  const labelClass = theme === 'dark' ? 'text-gray-300' : 'text-gray-700';
  const sliderBgClass = theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200';
  const buttonBgClass = theme === 'dark' ? 'bg-orange-700 hover:bg-orange-600' : 'bg-orange-600 hover:bg-orange-700';
  const devModeBgClass = theme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-400' : 'bg-gray-50 border-gray-200 text-gray-600';

  return (
    <div className={`w-full h-full flex flex-col ${bgClass}`}>
      {/* Header */}
      <div className={`border-b ${borderClass} p-6 ${headerBgClass}`}>
        <h1 className={`text-3xl font-bold ${textClass} mb-2`}>search</h1>
        <p className={`${secondaryTextClass} mb-4`}>
          describe what you&apos;re looking for: confirm relevant results to improve future searches.
        </p>

        {/* Search bar */}
        <SearchBar
          query={query}
          onQueryChange={setQuery}
          onSearch={handleSearch}
          history={history}
          isOnline={isOnline}
          syncStatus={feedbackSyncStatus}
          pendingCount={pendingFeedback}
          onSync={manualSync}
          disabled={loading}
        />

        {/* File Type Filter Grid */}
        <div className="mt-4">
          <button
            onClick={() => setShowFilterDropdown(!showFilterDropdown)}
            className={`w-full px-4 py-2 rounded-lg border ${borderClass} ${theme === 'dark' ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-white text-gray-900 hover:bg-gray-50'} transition-colors flex items-center justify-between`}
          >
            <span className="text-sm font-medium">
              filters {fileTypeFilter.size > 0 && `(${fileTypeFilter.size})`}
            </span>
            <span className={`text-lg transition-transform ${showFilterDropdown ? 'rotate-180' : ''}`}>▼</span>
          </button>

          {showFilterDropdown && (
            <div className={`mt-2 p-4 rounded-lg border ${borderClass} ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-50'}`}>
              {/* Confidence Slider inside filter panel */}
              <div className="mb-6 pb-4 border-b border-gray-500">
                <div className="flex items-center justify-between mb-2">
                  <label className={`text-sm font-medium ${labelClass}`}>
                    confidence threshold
                  </label>
                  <span className={`text-sm font-semibold ${theme === 'dark' ? 'text-orange-400' : 'text-orange-600'}`}>
                    {Math.round(confidence * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={Math.round(confidence * 100)}
                  onChange={(e) => setConfidence(parseInt(e.target.value) / 100)}
                  className={`w-full h-2 ${sliderBgClass} rounded-lg appearance-none cursor-pointer accent-orange-600`}
                  title="Lower values show more results with lower confidence. Higher values are more selective."
                />
                <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} mt-1`}>
                  {confidence < 0.3 && 'very loose - shows many results'}
                  {confidence >= 0.3 && confidence < 0.6 && 'loose - shows more results'}
                  {confidence >= 0.6 && confidence < 0.8 && 'moderate - balanced results'}
                  {confidence >= 0.8 && 'strict - only highest confidence matches'}
                </p>
              </div>

              {/* File type categories grid */}
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {Object.entries(fileTypeCategories).map(([category, types]) => (
                  <div key={category}>
                    <label className={`flex items-center gap-2 mb-3 cursor-pointer ${labelClass} font-medium capitalize`}>
                      <input
                        type="checkbox"
                        checked={types.every(type => fileTypeFilter.has(type.toLowerCase()))}
                        onChange={() => handleCategoryToggle(category)}
                        className="rounded w-4 h-4"
                      />
                      <span>{category}</span>
                    </label>
                    <div className="ml-4 grid grid-cols-3 gap-2">
                      {types.map(type => (
                        <label
                          key={type}
                          className={`flex items-center gap-2 px-3 py-2 rounded cursor-pointer text-xs ${
                            fileTypeFilter.has(type.toLowerCase())
                              ? theme === 'dark'
                                ? 'bg-orange-600 text-white'
                                : 'bg-orange-100 text-orange-900'
                              : theme === 'dark'
                              ? 'bg-gray-600 text-gray-200 hover:bg-gray-500'
                              : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                          } transition-colors`}
                        >
                          <input
                            type="checkbox"
                            checked={fileTypeFilter.has(type.toLowerCase())}
                            onChange={() => handleFileTypeToggle(type.toLowerCase())}
                            className="rounded w-3 h-3"
                          />
                          <span className="font-mono">{type.toLowerCase()}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => {
                    const allTypes = new Set<string>();
                    Object.values(fileTypeCategories).forEach(types => {
                      types.forEach(type => allTypes.add(type.toLowerCase()));
                    });
                    setFileTypeFilter(allTypes);
                  }}
                  className={`flex-1 py-2 px-3 text-xs rounded font-medium transition-colors ${theme === 'dark' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-blue-300 hover:bg-blue-400'}`}
                >
                  Select All
                </button>
                
                <button
                  onClick={() => setFileTypeFilter(new Set())}
                  className={`flex-1 py-2 px-3 text-xs rounded font-medium transition-colors ${theme === 'dark' ? 'bg-gray-600 hover:bg-gray-500' : 'bg-gray-300 hover:bg-gray-400'}`}
                >
                  Clear All
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Results container */}
      <div className="flex-1 overflow-auto p-6 flex flex-col">
        <div className="flex-1">
          <SearchResults
            results={results}
            loading={loading}
            error={error}
            query={query}
            onConfirm={handleConfirm}
            onRemove={handleRemove}
            onUndo={handleUndo}
            devMode={devMode}
            columns={columns}
            onResultClick={handleResultClick}
            onFolderPlacementSuccess={(fileCount, folderName) => {
              setFolderPlacementModal({
                isOpen: true,
                fileCount,
                folderName,
              });
              setTimeout(() => {
                setFolderPlacementModal(prev => ({ ...prev, isOpen: false }));
              }, 3000);
            }}
          />
        </div>
        
        {/* Load More Button */}
        {hasMore && results.length > 0 && (
          <div className="mt-6 text-center">
            <button
              onClick={loadMore}
              disabled={isLoadingMore}
              className={`px-6 py-3 ${buttonBgClass} text-white font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
            >
              {isLoadingMore ? 'Loading more...' : 'Load More Results'}
            </button>
          </div>
        )}
      </div>

      {/* Dev mode info */}
      {devMode && (
        <div className={`border-t ${borderClass} ${devModeBgClass} p-4 text-xs font-mono`}>
          <div>Query: {query || 'None'}</div>
          <div>Results: {results.length}</div>
          <div>Pending feedback: {pendingFeedback}</div>
          <div>Online: {isOnline ? 'Yes' : 'No'}</div>
          <div>Sync status: {feedbackSyncStatus}</div>
        </div>
      )}

      {/* Full-size image modal */}
      {selectedMediaId !== null && selectedMediaId !== undefined && (() => {
        const result = results.find(r => r.id === selectedMediaId);
        const mediaObj = result ? {
          id: selectedMediaId.toString(),
          image_path: result.path || '',
          thumbnail: '',
          name: result.path?.split('/').pop() || '',
          rotation: result.rotation || 0
        } : null;

        return (
          <SearchPhotoModal
            isOpen={true}
            media={mediaObj}
            onClose={() => setSelectedMediaId(null)}
            onAssignKeywords={async (mediaId, keywords) => {
              try {
                await fetch(`/api/media/${mediaId}/keywords`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ keywords })
                });
              } catch (error) {
                console.error('Failed to assign keywords:', error);
              }
            }}
            theme={theme}
          />
        );
      })()}

      {/* Folder placement success modal */}
      {folderPlacementModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} rounded-lg p-8 max-w-sm w-full mx-4 shadow-xl`}>
            <div className="text-center">
              <div className="text-5xl mb-4">✅</div>
              <p className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mb-2`}>
                Success!
              </p>
              <p className={`${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                Placed {folderPlacementModal.fileCount} {folderPlacementModal.fileCount === 1 ? 'file' : 'files'} into <span className="font-semibold">{folderPlacementModal.folderName}</span>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};



export default Search;
