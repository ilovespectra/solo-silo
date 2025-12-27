/**
 * SearchResults Component - Main grid layout with results
 */

import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '@/store/appStore';
import { SearchResult } from '../types';
import { SearchResultItem } from './SearchResultItem';
import { useDragSelection } from '@/hooks/useDragSelection';
import { SelectionRectangle } from '@/components/SelectionRectangle/SelectionRectangle';
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
  const gridRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const emptyStateClass = theme === 'dark' ? 'text-gray-400' : 'text-gray-400';

  const textSecondaryLightClass = theme === 'dark' ? 'text-gray-500' : 'text-gray-600';
  const borderClass = theme === 'dark' ? 'border-gray-700' : 'border-gray-200';
  const textHighlightClass = theme === 'dark' ? 'text-gray-300' : 'text-gray-700';

  const displayResults = useMemo(
    () => results.filter((r) => !r.removed),
    [results]
  );

  const removedCount = useMemo(() => results.filter((r) => r.removed).length, [results]);

  const { isSelecting, selectionRect, selectedItems, handleMouseDown } = useDragSelection(
    gridRef as React.RefObject<HTMLElement>,
    (items) => {
      const itemIds = new Set(
        items
          .map(id => {
            const resultId = parseInt(id);
            return !isNaN(resultId) ? resultId : null;
          })
          .filter((id): id is number => id !== null)
      );
      setSelectedResultIds(itemIds);
    }
  );

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

  useEffect(() => {
    const handleDocumentMouseMove = () => {
      if (isSelecting) {
        isDraggingRef.current = true;
      }
    };

    const handleDocumentMouseUp = () => {
      isDraggingRef.current = false;
    };

    document.addEventListener('mousemove', handleDocumentMouseMove);
    document.addEventListener('mouseup', handleDocumentMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleDocumentMouseMove);
      document.removeEventListener('mouseup', handleDocumentMouseUp);
    };
  }, [isSelecting]);

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
      <div
        ref={gridRef}
        className={`grid gap-4 py-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 relative ${
          isSelecting ? 'select-none' : ''
        }`}
        onMouseDown={handleMouseDown}
        onClick={(e: React.MouseEvent<HTMLDivElement>) => {
          const target = e.target as HTMLElement;
          const resultDiv = target.closest('[data-item-id]');
          
          if (isDraggingRef.current) {
            return;
          }
          
          if (resultDiv && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            e.stopPropagation();
            const resultId = parseInt(resultDiv.getAttribute('data-item-id') || '0');
            
            const newSelection = new Set(selectedResultIds);
            if (newSelection.has(resultId)) {
              newSelection.delete(resultId);
            } else {
              newSelection.add(resultId);
            }
            setSelectedResultIds(newSelection);
          } else if (resultDiv && e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            const resultId = parseInt(resultDiv.getAttribute('data-item-id') || '0');
            
            const selectedArray = Array.from(selectedResultIds);
            const lastSelected = selectedArray[selectedArray.length - 1];
            if (lastSelected !== undefined) {
              const firstIndex = displayResults.findIndex(r => r.id === lastSelected);
              const secondIndex = displayResults.findIndex(r => r.id === resultId);
              const start = Math.min(firstIndex, secondIndex);
              const end = Math.max(firstIndex, secondIndex);
              const newSelection = new Set(selectedResultIds);
              for (let i = start; i <= end; i++) {
                newSelection.add(displayResults[i].id);
              }
              setSelectedResultIds(newSelection);
            } else {
              setSelectedResultIds(new Set([resultId]));
            }
          } else if (resultDiv && !isDraggingRef.current) {
            const resultId = parseInt(resultDiv.getAttribute('data-item-id') || '0');
            setSelectedResultIds(new Set([resultId]));
          } else if (e.target === e.currentTarget) {
            setSelectedResultIds(new Set());
          }
        }}
        style={{ position: 'relative' }}
      >
        {displayResults.map((result) => {
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

        {/* Selection Rectangle - inside grid for proper positioning */}
        {isSelecting && selectionRect && (
          <SelectionRectangle
            isActive={true}
            bounds={{
              left: Math.min(selectionRect.start.x, selectionRect.current.x),
              top: Math.min(selectionRect.start.y, selectionRect.current.y),
              width: Math.abs(selectionRect.current.x - selectionRect.start.x),
              height: Math.abs(selectionRect.current.y - selectionRect.start.y),
            }}
            itemCount={selectedItems.length}
          />
        )}
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
